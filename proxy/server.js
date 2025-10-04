const express = require('express');
const { transform } = require('esbuild');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process'); // Import spawn
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const port = 3001;

// --- Middleware for Live Transpilation ---
// FIX: Replaced the generic app.use with an explicit .get handler for .ts/.tsx files.
// This is more robust and prevents the static middleware from incorrectly handling these files
// with the wrong MIME type.
app.get(/\.(ts|tsx)$/, async (req, res) => {
    try {
        const filePath = path.join(__dirname, '..', req.path); // Use req.path for safety
        
        if (!await fs.pathExists(filePath)) {
            return res.status(404).send('// File not found');
        }
        
        const source = await fs.readFile(filePath, 'utf8');
        const result = await transform(source, {
            loader: req.path.endsWith('.ts') ? 'ts' : 'tsx',
            target: 'esnext',
        });
        res.setHeader('Content-Type', 'application/javascript');
        res.send(result.code);
    } catch (e) {
        console.error('ESBuild transpilation failed:', e);
        res.status(500).send(`// Transpilation Error: ${e.message}`);
    }
});


// --- Static File Serving ---
// This will serve files like index.html, env.js, and any other static assets.
app.use(express.static(path.join(__dirname, '..')));

// Helper to run shell commands
const runCommand = (command, cwd = process.cwd()) => {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Command error: ${stderr}`);
                return reject(new Error(stderr));
            }
            resolve(stdout.trim());
        });
    });
};

// --- Updater API Endpoints ---
const projectRoot = path.join(__dirname, '..');

const sendSse = (res, data) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/api/update-status', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        sendSse(res, { log: '>>> Checking Git remote URL...' });
        const remoteUrl = await runCommand('git config --get remote.origin.url', projectRoot);
        sendSse(res, { log: `Remote URL: ${remoteUrl}` });
        if (!remoteUrl.startsWith('git@')) {
             throw new Error(`Git remote is not configured for SSH. Current URL is ${remoteUrl}. Please use SSH (e.g., git@github.com:user/repo.git) for updates.`);
        }
        
        sendSse(res, { log: '\n>>> Fetching latest data from remote repository...' });
        await runCommand('git fetch origin', projectRoot);
        sendSse(res, { log: 'Fetch complete.' });

        sendSse(res, { log: '\n>>> Comparing local and remote versions...' });
        const local = await runCommand('git rev-parse HEAD', projectRoot);
        const remote = await runCommand('git rev-parse @{u}', projectRoot);
        
        if (local === remote) {
            sendSse(res, { status: 'uptodate', message: 'Your panel is up-to-date.', local });
        } else {
            sendSse(res, { status: 'available', message: 'An update is available.', local, remote });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Update check failed:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
    } finally {
        sendSse(res, { status: 'finished' }); // Signal to the client that we are done
        res.end();
    }
});

const restartApp = (res, serviceName = 'mikrotik-manager mikrotik-api-backend') => {
    sendSse(res, { log: `\n>>> Restarting application with pm2: ${serviceName}...` });
    // Restart both servers by their names for reliability
    exec(`pm2 restart ${serviceName}`, (err, stdout, stderr) => {
        if (err) {
            console.error('PM2 restart failed:', stderr);
            sendSse(res, { status: 'error', message: `Failed to restart server: ${stderr}` });
        } else {
            console.log('PM2 restart successful:', stdout);
            sendSse(res, { log: 'Restart command issued successfully.' });
        }
        res.end();
    });
};

app.get('/api/update-app', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const backupDir = path.join(projectRoot, 'backups');
    const backupFileName = `backup-update-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
    const backupFilePath = path.join(backupDir, backupFileName);

    try {
        // 1. Create Backup
        sendSse(res, { log: `>>> Creating backup at ${backupFilePath}` });
        await fs.ensureDir(backupDir);
        
        const archive = archiver('tar', { gzip: true });
        const output = fs.createWriteStream(backupFilePath);
        archive.pipe(output);
        archive.glob('**/*', {
            cwd: projectRoot,
            ignore: ['backups/**', 'node_modules/**', '.git/**'],
        });
        await archive.finalize();
        sendSse(res, { log: 'Backup created successfully.' });

        // 2. Git Pull
        sendSse(res, { log: '\n>>> Pulling latest changes from Git...' });
        const pullOutput = await runCommand('git pull origin main', projectRoot); // Assuming 'main' branch
        sendSse(res, { log: pullOutput });
        sendSse(res, { log: 'Git pull complete.' });
        
        // 3. NPM Install
        sendSse(res, { log: '\n>>> Installing dependencies for UI server...' });
        const proxyInstall = await runCommand('npm install', path.join(projectRoot, 'proxy'));
        sendSse(res, { log: proxyInstall });
        
        sendSse(res, { log: '\n>>> Installing dependencies for API backend...' });
        const apiInstall = await runCommand('npm install', path.join(projectRoot, 'api-backend'));
        sendSse(res, { log: apiInstall });
        sendSse(res, { log: 'Dependencies installed.' });
        
        // 4. Restart
        sendSse(res, { status: 'restarting' });
        restartApp(res);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Update process failed:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
        res.end();
    }
});


app.get('/api/list-backups', async (req, res) => {
    try {
        const backupDir = path.join(projectRoot, 'backups');
        await fs.ensureDir(backupDir);
        const files = await fs.readdir(backupDir);
        res.json(files.filter(f => f.endsWith('.tar.gz')).sort().reverse());
    } catch (error) {
        res.status(500).json({ message: 'Could not list backups.' });
    }
});

app.get('/api/rollback', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { backupFile } = req.query;
    if (!backupFile || typeof backupFile !== 'string') {
        sendSse(res, { status: 'error', message: 'Invalid backup file specified.' });
        return res.end();
    }

    const backupFilePath = path.join(projectRoot, 'backups', backupFile);

    try {
        sendSse(res, { log: `>>> Starting rollback from ${backupFile}` });
        if (!await fs.pathExists(backupFilePath)) {
            throw new Error('Backup file not found.');
        }

        // FIX: Replaced the JavaScript-based tar extraction with a more reliable call
        // to the system's native `tar` command. This prevents the server from crashing
        // when trying to overwrite its own running files.
        await runCommand(`tar -xzf "${backupFilePath}" -C "${projectRoot}"`);
        
        sendSse(res, { log: 'Files restored successfully.' });
        
        sendSse(res, { status: 'restarting' });
        restartApp(res);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Rollback failed:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
        res.end();
    }
});

// --- ZeroTier Panel Management API Endpoints ---
app.get('/api/zt/status', async (req, res) => {
    try {
        const networksJson = await runCommand('zerotier-cli -j listnetworks');
        const networks = JSON.parse(networksJson);
        const infoJson = await runCommand('zerotier-cli -j info');
        const info = JSON.parse(infoJson);
        res.status(200).json({ info, networks });
    } catch (error) {
        const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
        console.error('ZeroTier status check failed:', errorMessage);

        // Fix: Use a more general check for missing command errors.
        if (errorMessage.includes('not found')) {
            return res.status(404).json({ 
                code: 'ZEROTIER_NOT_INSTALLED',
                message: 'zerotier-cli was not found. The ZeroTier One service is likely not installed on the host system.'
            });
        }
        if (errorMessage.includes('cannot connect')) {
            return res.status(503).json({
                code: 'ZEROTIER_SERVICE_DOWN',
                message: 'Could not connect to the ZeroTier One service. It may be stopped or malfunctioning.'
            });
        }
        res.status(500).json({ 
            code: 'UNKNOWN_ERROR',
            message: 'Failed to get ZeroTier status.', 
            error: errorMessage 
        });
    }
});

app.get('/api/zt/install', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    sendSse(res, { log: '>>> Starting ZeroTier installation...' });
    sendSse(res, { log: '>>> This may take a few minutes. Please do not close this window.' });
    
    // Using 'bash -c' to handle the pipe. This command requires passwordless sudo for the user running the server.
    const installProcess = spawn('sudo', ['bash', '-c', 'curl -s https://install.zerotier.com | bash']);

    installProcess.stdout.on('data', (data) => {
        sendSse(res, { log: data.toString() });
    });

    installProcess.stderr.on('data', (data) => {
        // Official installer script sometimes uses stderr for progress messages, so we log them normally.
        sendSse(res, { log: data.toString() });
    });

    installProcess.on('close', (code) => {
        if (code === 0) {
            sendSse(res, { status: 'success', log: '\n>>> Installation completed successfully!' });
        } else {
            sendSse(res, { status: 'error', message: `Installation process exited with code ${code}. Please check the log for details.` });
        }
        sendSse(res, { status: 'finished' });
        res.end();
    });

    installProcess.on('error', (err) => {
        sendSse(res, { status: 'error', message: `Failed to start installation process: ${err.message}` });
        sendSse(res, { status: 'finished' });
        res.end();
    });
});


app.post('/api/zt/join', express.json(), async (req, res) => {
    const { networkId } = req.body;
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId)) {
        return res.status(400).json({ message: 'A valid 16-digit Network ID is required.' });
    }
    try {
        const stdout = await runCommand(`zerotier-cli join ${networkId}`);
        res.status(200).json({ message: `Successfully sent join request for network ${networkId}.`, detail: stdout });
    } catch (error) {
        console.error(`ZeroTier join failed for ${networkId}:`, error);
        res.status(500).json({ message: `Failed to join network ${networkId}.`, error: error.message });
    }
});

app.post('/api/zt/leave', express.json(), async (req, res) => {
    const { networkId } = req.body;
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId)) {
        return res.status(400).json({ message: 'A valid 16-digit Network ID is required.' });
    }
    try {
        const stdout = await runCommand(`zerotier-cli leave ${networkId}`);
        res.status(200).json({ message: `Successfully left network ${networkId}.`, detail: stdout });
    } catch (error) {
        console.error(`ZeroTier leave failed for ${networkId}:`, error);
        res.status(500).json({ message: `Failed to leave network ${networkId}.`, error: error.message });
    }
});

app.post('/api/zt/set', express.json(), async (req, res) => {
    const { networkId, setting, value } = req.body;
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId) || !setting || typeof value !== 'boolean') {
        return res.status(400).json({ message: 'Invalid request. networkId, setting, and a boolean value are required.' });
    }
    const allowedSettings = ['allowManaged', 'allowGlobal', 'allowDefault'];
    if(!allowedSettings.includes(setting)) {
        return res.status(400).json({ message: `Invalid setting. Allowed settings are: ${allowedSettings.join(', ')}` });
    }
    try {
        const stdout = await runCommand(`zerotier-cli set ${networkId} ${setting}=${value}`);
        res.status(200).json({ message: `Set ${setting} to ${value} for network ${networkId}.`, detail: stdout });
    } catch (error) {
        console.error(`ZeroTier set failed for ${networkId}:`, error);
        res.status(500).json({ message: `Failed to set ${setting} for network ${networkId}.`, error: error.message });
    }
});

// --- AI Fixer API Endpoints ---
const ALLOWED_FILE = 'api-backend/server.js';
const TARGET_FILE_PATH = path.join(projectRoot, ALLOWED_FILE);

app.get('/api/fixer/file-content', async (req, res) => {
    try {
        const content = await fs.readFile(TARGET_FILE_PATH, 'utf-8');
        res.setHeader('Content-Type', 'text/plain');
        res.send(content);
    } catch (error) {
        console.error('AI Fixer failed to read file:', error);
        res.status(500).json({ message: `Could not read the backend file: ${error.message}` });
    }
});

app.post('/api/fixer/apply-fix', express.text({ type: 'text/plain' }), async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const newCode = req.body;
    if (!newCode || typeof newCode !== 'string') {
        sendSse(res, { status: 'error', message: 'No code provided to apply.' });
        return res.end();
    }

    const backupDir = path.join(projectRoot, 'backups');
    const backupFileName = `backup-aifix-${new Date().toISOString().replace(/:/g, '-')}.js.bak`;
    const backupFilePath = path.join(backupDir, backupFileName);

    try {
        sendSse(res, { log: `>>> Backing up current backend server file to ${backupFileName}...` });
        await fs.ensureDir(backupDir);
        await fs.copy(TARGET_FILE_PATH, backupFilePath);
        sendSse(res, { log: 'Backup complete.' });

        sendSse(res, { log: '\n>>> Applying new code...' });
        await fs.writeFile(TARGET_FILE_PATH, newCode, 'utf-8');
        sendSse(res, { log: 'File updated successfully.' });

        sendSse(res, { status: 'restarting' });
        restartApp(res, 'mikrotik-api-backend'); // Only restart the backend

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('AI Fixer failed to apply fix:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
        res.end();
    }
});

// --- AI Help & Report Generation API ---
app.post('/api/generate-report', express.json(), async (req, res) => {
    const { view, routerName, geminiAnalysis } = req.body;
    
    let ztStatus = 'ZeroTier status could not be retrieved.';
    try {
        const ztInfo = await runCommand('zerotier-cli -j info');
        const ztNetworks = await runCommand('zerotier-cli -j listnetworks');
        ztStatus = `--- ZeroTier Info ---\n${JSON.stringify(JSON.parse(ztInfo), null, 2)}\n\n--- ZeroTier Networks ---\n${JSON.stringify(JSON.parse(ztNetworks), null, 2)}`;
    } catch (e) {
        ztStatus = `Could not get ZeroTier status. Error: ${e.message}`;
    }

    let backendCode = 'Backend code could not be read.';
    try {
        backendCode = await fs.readFile(TARGET_FILE_PATH, 'utf-8');
    } catch (e) {
        backendCode = `Could not read backend code. Error: ${e.message}`;
    }

    const report = `
=========================================
      AI SYSTEM DIAGNOSTIC REPORT
=========================================
Report Generated: ${new Date().toISOString()}

--- CONTEXT ---
- Current Page: ${view}
- Selected Router: ${routerName || 'None'}

--- AI ANALYSIS ---
${geminiAnalysis}

=========================================
      RAW SYSTEM DATA
=========================================

--- PANEL HOST ZEROTIER STATUS ---
${ztStatus}

--- BACKEND SERVER CODE (api-backend/server.js) ---
${backendCode}
`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=system-report.txt');
    res.send(report);
});



app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(port, () => {
  console.log(`MikroTik Manager UI server running. Access it at http://<your_ip_address>:${port}`);
});