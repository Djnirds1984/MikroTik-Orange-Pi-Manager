require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const esbuild = require('esbuild');
const { spawn, exec } = require('child_process');
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Setup Backup Directory ---
const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

// Middleware to transpile TSX/TS files on the fly for development
app.get(/\.(tsx|ts)$/, async (req, res, next) => {
    try {
        const filePath = path.join(__dirname, '..', req.path);
        const fileContent = await fsp.readFile(filePath, 'utf-8');
        
        const result = await esbuild.transform(fileContent, {
            loader: req.path.endsWith('.tsx') ? 'tsx' : 'ts',
            jsx: 'automatic',
            target: 'esnext'
        });

        res.set('Content-Type', 'application/javascript; charset=utf-8');
        res.send(result.code);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return next();
        }
        console.error(`Error transpiling ${req.path}:`, error);
        res.status(500).send('Error during server-side transpilation');
    }
});

// Helper function to create an Axios instance for a specific router
const createApiClient = ({ host, user, password, port, useSsl = false }) => {
    if (!host || !user) {
        throw new Error("Router configuration (host, user) is missing.");
    }
    const protocol = useSsl ? 'https' : 'http';
    const apiPort = port || (useSsl ? 443 : 80);

    return axios.create({
        baseURL: `${protocol}://${host}:${apiPort}/rest`,
        auth: { username: user, password: password || '' },
        timeout: 10000,
        httpsAgent: useSsl ? new https.Agent({ rejectUnauthorized: false }) : undefined,
    });
};

// Generic request handler
const handleRequest = async (req, res, callback) => {
    try {
        const apiClient = createApiClient({ ...req.body, useSsl: false });
        const data = await callback(apiClient);
        res.json(data);
    } catch (err) {
        let errorMessage = 'An unknown error occurred.';
        if (axios.isAxiosError(err)) {
            if (err.response) {
                const detail = err.response.data?.detail || err.response.statusText;
                errorMessage = `Router API error: ${err.response.status} - ${detail}`;
            } else if (err.request) {
                errorMessage = `Could not connect to the MikroTik router. Check connection details and ensure the router's WWW service is enabled at ${req.body.host}.`;
            } else {
                errorMessage = err.message;
            }
        } else {
             errorMessage = err.message;
        }
        console.error("Error during API request processing:", errorMessage);
        res.status(500).json({ error: errorMessage });
    }
};

// SSE Helper for streaming command output
const streamCommand = (req, res, command, args, cwd, name) => {
    return new Promise((resolve, reject) => {
        const sendEvent = (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                res.write(`data: ${line}\n\n`);
            }
        };

        sendEvent(`--- Running ${name} ---`);
        const child = spawn(command, args, { cwd });

        child.stdout.on('data', sendEvent);
        child.stderr.on('data', (data) => sendEvent(`ERROR: ${data.toString().trim()}`));

        child.on('close', (code) => {
            if (code === 0) {
                sendEvent(`--- ${name} completed successfully ---\n`);
                resolve();
            } else {
                sendEvent(`--- ${name} failed with code ${code} ---\n`);
                reject(new Error(`Command failed: ${name}`));
            }
        });
         child.on('error', (err) => {
            sendEvent(`--- Failed to start ${name}: ${err.message} ---\n`);
            reject(err);
        });
    });
};


// --- API Endpoints ---

const execPromise = (command, options) => {
    return new Promise((resolve, reject) => {
        exec(command, options, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout.trim());
        });
    });
};

app.get('/api/update-status', async (req, res) => {
    try {
        const projectRoot = path.join(__dirname, '..');
        const packageJsonPath = path.join(__dirname, 'package.json');
        const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf-8'));
        
        const currentCommit = await execPromise('git rev-parse HEAD', { cwd: projectRoot }).catch(() => 'N/A');
        
        // Fetch latest data from remote without merging
        await execPromise('git remote update', { cwd: projectRoot });

        // Check status
        const statusOutput = await execPromise('git status -uno', { cwd: projectRoot });
        const updateAvailable = statusOutput.includes('Your branch is behind');

        let latestCommitInfo = null;
        if (updateAvailable) {
            const branch = await execPromise('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot });
            // Format: sha|message|author|isodate
            const logOutput = await execPromise(`git log -1 origin/${branch} --pretty=format:"%H|%s|%an|%cI"`, { cwd: projectRoot });
            const [sha, message, author, date] = logOutput.split('|');
            latestCommitInfo = { sha, message, author, date };
        }
        
        res.json({
            version: packageJson.version,
            currentCommit,
            updateAvailable,
            latestCommitInfo
        });

    } catch (error) {
        console.error("Could not check for updates via git:", error);
        res.status(500).json({ error: "Could not determine update status. Is this a git repository?" });
    }
});


app.get('/api/list-backups', async (req, res) => {
    try {
        const files = await fsp.readdir(backupsDir);
        const sortedFiles = files
            .filter(file => file.endsWith('.tar.gz'))
            .sort((a, b) => b.localeCompare(a)); // Newest first
        res.json(sortedFiles);
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ error: 'Could not list backups.' });
    }
});

const sseSetup = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    return (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            res.write(`data: ${line}\n\n`);
        }
    };
};

app.get('/api/update-app', (req, res) => {
    const sendEvent = sseSetup(res);

    (async () => {
        try {
            const projectRoot = path.join(__dirname, '..');
            const packageJson = JSON.parse(await fsp.readFile(path.join(__dirname, 'package.json'), 'utf-8'));
            const commit = await new Promise(r => exec('git rev-parse --short HEAD', (e,s) => r((s || '').trim())));
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `backup-v${packageJson.version}-${commit}-${timestamp}.tar.gz`;
            const backupFilePath = path.join(backupsDir, backupFileName);

            sendEvent(`--- Creating backup: ${backupFileName} ---`);
            await new Promise((resolve, reject) => {
                const output = fs.createWriteStream(backupFilePath);
                const archive = archiver('tar', { gzip: true });
                output.on('close', () => { sendEvent('Backup created successfully.\n'); resolve(); });
                archive.on('warning', err => sendEvent(`BACKUP WARNING: ${err.message}`));
                archive.on('error', err => reject(new Error(`Backup failed: ${err.message}`)));
                archive.pipe(output);
                archive.directory(projectRoot, false, { filter: (filePath) => !filePath.startsWith(backupsDir) });
                archive.finalize();
            });

            await streamCommand(req, res, 'git', ['pull'], projectRoot, 'git pull');
            await streamCommand(req, res, 'npm', ['install'], __dirname, 'npm install');
            
            sendEvent('--- Restarting application ---');
            sendEvent('UPDATE_COMPLETE: Please refresh your browser in a few seconds.');
            
            spawn('pm2', ['restart', 'mikrotik-manager'], { detached: true, stdio: 'ignore' }).unref();
            res.end();
        } catch (error) {
            sendEvent(`\n--- UPDATE FAILED ---`);
            sendEvent(error.message);
            res.end();
        }
    })();
});

app.post('/api/rollback', (req, res) => {
    const sendEvent = sseSetup(res);
    const { filename } = req.body;

    (async () => {
        try {
            if (!filename || filename.includes('..') || !filename.endsWith('.tar.gz')) {
                throw new Error('Invalid backup filename.');
            }
            const backupFilePath = path.join(backupsDir, filename);
            await fsp.access(backupFilePath); // Check if file exists

            const projectRoot = path.join(__dirname, '..');

            sendEvent(`--- Starting rollback from ${filename} ---`);
            sendEvent('Extracting backup files (this will overwrite current files)...');
            
            await tar.x({ file: backupFilePath, cwd: projectRoot });

            sendEvent('Backup extracted successfully.\n');

            await streamCommand(req, res, 'npm', ['install'], __dirname, 'npm install dependencies');
            
            sendEvent('--- Restarting application ---');
            sendEvent('UPDATE_COMPLETE: Rollback complete. Please refresh your browser in a few seconds.');
            
            spawn('pm2', ['restart', 'mikrotik-manager'], { detached: true, stdio: 'ignore' }).unref();
            res.end();
        } catch (error) {
            sendEvent(`\n--- ROLLBACK FAILED ---`);
            sendEvent(error.message);
            res.end();
        }
    })();
});

app.post('/api/test-connection', async (req, res) => {
    try {
        const apiClient = createApiClient({ ...req.body, useSsl: false });
        await apiClient.get('/system/resource');
        res.json({ success: true, message: 'Connection successful!' });
    } catch (err) {
        let errorMessage = 'Failed to connect.';
         if (axios.isAxiosError(err)) {
             if (err.response) {
                 errorMessage = `Connection failed: ${err.response.status} ${err.response.data?.title || err.response.statusText}. Check credentials.`;
             } else if (err.request) {
                 errorMessage = `Connection failed. No response from ${req.body.host}. Check host, port, and firewall.`;
             } else {
                 errorMessage = `Connection setup error: ${err.message}`;
             }
         } else {
            errorMessage = err.message;
         }
        res.json({ success: false, message: errorMessage });
    }
});


app.post('/api/system-info', (req, res) => {
    handleRequest(req, res, async (client) => {
        const [resourceRes, routerboardRes] = await Promise.all([
            client.get('/system/resource'),
            client.get('/system/routerboard')
        ]);
        const sysInfo = resourceRes.data;
        const boardInfo = routerboardRes.data;
        if (!sysInfo || !boardInfo) throw new Error("Incomplete system information received.");
        const totalMemory = parseInt(sysInfo['total-memory'], 10);
        const freeMemory = parseInt(sysInfo['free-memory'], 10);
        const memoryUsage = totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0;
        return {
            boardName: boardInfo['board-name'], version: sysInfo.version,
            cpuLoad: parseInt(sysInfo['cpu-load'], 10), uptime: sysInfo.uptime,
            memoryUsage: memoryUsage, totalMemory: `${Math.round(totalMemory / 1024 / 1024)}MiB`,
        };
    });
});

app.post('/api/interfaces', (req, res) => {
    handleRequest(req, res, async (client) => {
        const proplist = ['.id', 'name', 'type', 'rx-byte', 'tx-byte'].join(',');
        const initialStatsRes = await client.get('/interface', { params: { '.proplist': proplist } });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const finalStatsRes = await client.get('/interface', { params: { '.proplist': proplist } });
        const finalStatsMap = new Map(finalStatsRes.data.map(item => [item['.id'], item]));
        return initialStatsRes.data.map(initialIface => {
            const finalIface = finalStatsMap.get(initialIface['.id']);
            if (!finalIface) return { name: initialIface.name, type: initialIface.type, rxRate: 0, txRate: 0 };
            const rxRate = (parseInt(finalIface['rx-byte'], 10) - parseInt(initialIface['rx-byte'], 10)) * 8;
            const txRate = (parseInt(finalIface['tx-byte'], 10) - parseInt(initialIface['tx-byte'], 10)) * 8;
            return { name: initialIface.name, type: initialIface.type, rxRate: Math.max(0, rxRate), txRate: Math.max(0, txRate) };
        });
    });
});

app.post('/api/hotspot-clients', (req, res) => {
    handleRequest(req, res, async (client) => {
        try {
            const response = await client.get('/ip/hotspot/active');
            return response.data.map(client => ({
                macAddress: client['mac-address'], uptime: client.uptime, signal: client['signal-strength'] || 'N/A',
            }));
        } catch (err) {
            if (axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.data?.detail?.includes("no such item"))) {
                 console.warn("Could not fetch hotspot clients. This is normal if hotspot is not configured.");
                 return [];
            }
            throw err;
        }
    });
});

// --- Frontend Serving ---
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));
app.get('*', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));

app.listen(PORT, () => {
    console.log(`MikroTik Manager server running. Access it at http://localhost:${PORT}`);
});