const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const https = require('https');
const axios = require('axios');
const esbuild = require('esbuild');
const archiver = require('archiver');
const fs = require('fs-extra');
const tar = require('tar');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// --- MikroTik API Helper ---
const createRouterApi = (config) => {
    const protocol = config.port === 443 || config.port === 8729 ? 'https' : 'http';
    const baseURL = `${protocol}://${config.host}:${config.port}/rest`;
    const agent = new https.Agent({
        rejectUnauthorized: false // Allow self-signed certificates
    });
    const auth = {
        username: config.user,
        password: config.password || '',
    };
    const api = axios.create({
        baseURL,
        auth,
        httpsAgent: protocol === 'https' ? agent : undefined,
    });
    
    // Updated apiCall to use a generic writer for POST/PATCH
    const write = async (path, data, method = 'patch') => {
        try {
            const response = await api({ url: path, method, data });
            return response.data;
        } catch (error) {
            let errorMessage = `MikroTik API Error: ${error.message}`;
            if (error.response) {
                const apiError = error.response.data.detail || error.response.data.error || JSON.stringify(error.response.data);
                errorMessage = `MikroTik API Error: ${apiError}`;
            } else if (error.request) {
                errorMessage = `MikroTik API Error: No response received from ${config.host}`;
            }
            throw new Error(errorMessage);
        }
    };
    
    const get = async (path) => {
        try {
            // Use URL parameters for GET requests
            const url = new URL(baseURL + path);
            const response = await api.get(url.toString());
            return response.data;
        } catch (error) {
             let errorMessage = `MikroTik API Error: ${error.message}`;
            if (error.response) {
                const apiError = error.response.data.detail || error.response.data.error || JSON.stringify(error.response.data);
                errorMessage = `MikroTik API Error: ${apiError}`;
            } else if (error.request) {
                errorMessage = `MikroTik API Error: No response received from ${config.host}`;
            }
            throw new Error(errorMessage);
        }
    }


    return {
        get,
        post: (path, data) => write(path, data, 'post'),
        patch: (path, data) => write(path, data, 'patch'),
        delete: (path) => api.delete(path),
    };
};

// --- Middleware for ESBuild ---
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx')) {
        try {
            const filePath = path.join(__dirname, '..', req.path);
            const result = await esbuild.build({
                entryPoints: [filePath],
                bundle: true,
                write: false,
                format: 'esm',
                external: ['react', 'react-dom/client', '@google/genai', 'recharts'],
                loader: { '.tsx': 'tsx', '.ts': 'ts' },
            });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(result.outputFiles[0].text);
        } catch (error) {
            console.error(error);
            res.status(500).send(`ESBuild transpilation failed: ${error.message}`);
        }
    } else {
        next();
    }
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

// --- API Routes ---

app.post('/api/test-connection', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const data = await api.get('/system/resource');
        if (data) {
            res.json({ success: true, message: 'Connection successful!' });
        } else {
            throw new Error('Received empty response from router.');
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/system-info', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const [resource, routerboard] = await Promise.all([
            api.get('/system/resource'),
            api.get('/system/routerboard'),
        ]);
        const memoryUsage = resource['total-memory'] ? ((resource['total-memory'] - resource['free-memory']) / resource['total-memory']) * 100 : 0;
        res.json({
            boardName: resource?.['board-name'] || routerboard?.model || 'N/A',
            version: resource?.version || 'N/A',
            cpuLoad: resource?.['cpu-load'] || 0,
            uptime: resource?.uptime || 'N/A',
            memoryUsage: Math.round(memoryUsage) || 0,
            totalMemory: resource['total-memory'] ? `${Math.round(resource['total-memory'] / 1024 / 1024)} MB` : 'N/A',
        });
    } catch (error) {
        res.status(500).json({ message: `API Error fetching system info: ${error.message}` });
    }
});

app.post('/api/interfaces', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const interfaces = await api.get('/interface');
        const monitorData = await api.post('/interface/monitor', {
            "numbers": interfaces.map(i => i['.id']).join(','),
            "once": true,
        });

        const merged = interfaces.map(iface => {
            const traffic = monitorData.find(m => m.name === iface.name);
            return {
                id: iface['.id'],
                name: iface.name,
                type: iface.type,
                rxRate: traffic ? traffic['rx-bits-per-second'] : 0,
                txRate: traffic ? traffic['tx-bits-per-second'] : 0,
            };
        });
        res.json(merged);
    } catch (error) {
        res.status(500).json({ message: `API Error fetching interfaces: ${error.message}` });
    }
});


app.post('/api/hotspot-clients', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        try {
            const clients = await api.get('/ip/hotspot/active');
            res.json(clients.map(c => ({
                macAddress: c['mac-address'],
                uptime: c.uptime,
                signal: c['signal-strength'] || 'N/A',
            })));
        } catch (innerError) {
             res.json([]);
        }
    } catch (error) {
        res.status(500).json({ message: `API Error fetching hotspot clients: ${error.message}` });
    }
});

// PPPoE Profiles
app.post('/api/ppp/profiles', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const profiles = await api.get('/ppp/profile');
        res.json(profiles.map(p => ({
            id: p['.id'],
            name: p.name,
            localAddress: p['local-address'],
            remoteAddress: p['remote-address'],
            rateLimit: p['rate-limit'],
        })));
    } catch (error) {
        res.status(500).json({ message: `API Error fetching PPP profiles: ${error.message}` });
    }
});

app.post('/api/ppp/profiles/add', async (req, res) => {
    try {
        const { routerConfig, profileData } = req.body;
        const api = createRouterApi(routerConfig);
        const payload = {
            "name": profileData.name,
            "local-address": profileData.localAddress || undefined,
            "remote-address": profileData.remoteAddress || undefined,
            "rate-limit": profileData.rateLimit || undefined,
        };
        await api.post('/ppp/profile', payload);
        res.status(201).json({ message: 'Profile added successfully' });
    } catch (error) {
        res.status(500).json({ message: `Error adding profile: ${error.message}` });
    }
});

app.post('/api/ppp/profiles/update', async (req, res) => {
    try {
        const { routerConfig, profileData } = req.body;
        const api = createRouterApi(routerConfig);
         const payload = {
            "name": profileData.name,
            "local-address": profileData.localAddress || undefined,
            "remote-address": profileData.remoteAddress || undefined,
            "rate-limit": profileData.rateLimit || undefined,
        };
        await api.patch(`/ppp/profile/${profileData.id}`, payload);
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ message: `Error updating profile: ${error.message}` });
    }
});

app.post('/api/ppp/profiles/delete', async (req, res) => {
    try {
        const { routerConfig, profileId } = req.body;
        const api = createRouterApi(routerConfig);
        await api.delete(`/ppp/profile/${profileId}`);
        res.json({ message: 'Profile deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: `Error deleting profile: ${error.message}` });
    }
});

// IP Pools
app.post('/api/ip/pools', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const pools = await api.get('/ip/pool');
        res.json(pools.map(p => ({
            id: p['.id'],
            name: p.name,
        })));
    } catch (error) {
        res.status(500).json({ message: `API Error fetching IP pools: ${error.message}` });
    }
});

// PPPoE Secrets
app.post('/api/ppp/secrets', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const secrets = await api.get('/ppp/secret');
        res.json(secrets.map(s => ({
            id: s['.id'],
            name: s.name,
            service: s.service,
            profile: s.profile,
            comment: s.comment,
        })));
    } catch (error) {
        res.status(500).json({ message: `Error fetching secrets: ${error.message}` });
    }
});

app.post('/api/ppp/active', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const active = await api.get('/ppp/active');
        res.json(active.map(a => ({
            id: a['.id'],
            name: a.name,
            uptime: a.uptime,
        })));
    } catch (error) {
         res.json([]);
    }
});

app.post('/api/ppp/secrets/add', async (req, res) => {
    try {
        const { routerConfig, secretData } = req.body;
        const api = createRouterApi(routerConfig);
        await api.post('/ppp/secret', secretData);
        res.status(201).json({ message: 'User added successfully' });
    } catch (error) {
        res.status(500).json({ message: `Error adding user: ${error.message}` });
    }
});

app.post('/api/ppp/secrets/update', async (req, res) => {
    try {
        const { routerConfig, secretData } = req.body;
        const api = createRouterApi(routerConfig);
        const secretId = secretData.id;
        const payload = {...secretData};
        delete payload.id;
        if (!payload.password) {
            delete payload.password;
        }
        await api.patch(`/ppp/secret/${secretId}`, payload);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ message: `Error updating user: ${error.message}` });
    }
});

app.post('/api/ppp/secrets/delete', async (req, res) => {
    try {
        const { routerConfig, secretId } = req.body;
        const api = createRouterApi(routerConfig);
        await api.delete(`/ppp/secret/${secretId}`);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: `Error deleting user: ${error.message}` });
    }
});

function parseComment(comment) {
    if (!comment) return {};
    try {
        return JSON.parse(comment);
    } catch (e) {
        return {};
    }
}

app.post('/api/ppp/process-payment', async (req, res) => {
    const { routerConfig, secret, plan, nonPaymentProfile, paymentDate, discountDays } = req.body;
    const api = createRouterApi(routerConfig);

    try {
        const commentData = parseComment(secret.comment);
        const startDate = commentData.dueDate && new Date(commentData.dueDate) > new Date(paymentDate)
            ? new Date(commentData.dueDate)
            : new Date(paymentDate);
        
        const newDueDate = new Date(startDate);
        newDueDate.setDate(newDueDate.getDate() + 30);
        const dueDateString = newDueDate.toISOString().split('T')[0];

        const newComment = JSON.stringify({ ...commentData, plan: plan.name, dueDate: dueDateString });
        await api.patch(`/ppp/secret/${secret.id}`, { comment: newComment });

        const schedulerName = `ppp-expire-${secret.name}`;
        const scriptName = `ppp-script-${secret.name}`;
        const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;

        const existingSchedulers = await api.get(`/system/scheduler?name=${schedulerName}`);
        if (existingSchedulers.length > 0) {
            await Promise.all(existingSchedulers.map(s => api.delete(`/system/scheduler/${s['.id']}`)));
        }
        const existingScripts = await api.get(`/system/script?name=${scriptName}`);
        if (existingScripts.length > 0) {
             await Promise.all(existingScripts.map(s => api.delete(`/system/script/${s['.id']}`)));
        }

        await api.post('/system/script', { name: scriptName, source: scriptSource });
        const [month, day, year] = new Date(dueDateString).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).replace(',', '').split(' ');
        const startDateForScheduler = `${month.toLowerCase()}/${day}/${year}`;
        
        await api.post('/system/scheduler', {
            name: schedulerName,
            'start-date': startDateForScheduler,
            'start-time': '00:00:01',
            'on-event': scriptName,
            interval: 0,
        });

        res.json({ message: 'Payment processed successfully' });
    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({ message: `Payment processing error: ${error.message}` });
    }
});


// --- Updater Routes ---
const sendEvent = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

const runCommand = (command, args) => {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd: path.join(__dirname, '..'), shell: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());
        proc.on('close', (code) => {
            if (code !== 0) return reject(new Error(stderr || stdout));
            resolve(stdout);
        });
    });
};

app.get('/api/update-status', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const remoteUrl = await runCommand('git', ['config', '--get', 'remote.origin.url']);
        sendEvent(res, { log: `Git remote found: ${remoteUrl.trim()}` });
        if (!remoteUrl.startsWith('git@')) {
             sendEvent(res, { status: 'error', message: `Git remote is not configured for SSH. Current URL: ${remoteUrl.trim()}` });
             return;
        }
        sendEvent(res, { log: 'Testing SSH connection to GitHub...' });
        await runCommand('ssh', ['-T', 'git@github.com', '-o', 'StrictHostKeyChecking=no']);
        
    } catch (error) {
        if (error.message && error.message.includes('successfully authenticated')) {
            sendEvent(res, { log: `SSH connection successful.` });
        } else {
            sendEvent(res, { status: 'error', message: `SSH connection to GitHub failed. Ensure SSH keys are configured correctly. Error: ${error.message}`});
            return;
        }
    }
    
    try {
        sendEvent(res, { log: 'Fetching latest version info from remote...' });
        await runCommand('git', ['fetch']);
        const local = (await runCommand('git', ['rev-parse', 'HEAD'])).trim();
        const remote = (await runCommand('git', ['rev-parse', '@{u}'])).trim();
        const base = (await runCommand('git', ['merge-base', '@', '@{u}'])).trim();

        if (local === remote) {
            sendEvent(res, { status: 'uptodate', message: 'Your panel is updated.', local });
        } else if (local === base) {
            sendEvent(res, { status: 'available', message: 'Update is available.', remote });
        } else {
            sendEvent(res, { status: 'diverged', message: 'Your version has diverged from the remote.' });
        }
    } catch (error) {
        sendEvent(res, { status: 'error', message: `Update check failed: ${error.message}` });
    } finally {
        sendEvent(res, { status: 'finished' });
        res.end();
    }
});


app.get('/api/update-app', (req, res) => {
     res.setHeader('Content-Type', 'text/event-stream');
     res.setHeader('Cache-Control', 'no-cache');
     res.setHeader('Connection', 'keep-alive');
     
     const backupDir = path.join(__dirname, '..', 'backups');
     fs.ensureDirSync(backupDir);
     const backupFile = `backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
     const backupPath = path.join(backupDir, backupFile);

     (async () => {
         try {
             sendEvent(res, { log: 'Creating backup...' });
             const filesToBackup = fs.readdirSync(path.join(__dirname, '..')).filter(f => f !== 'backups' && f !== '.git' && f!== 'proxy/node_modules');
             await tar.c({ gzip: true, file: backupPath, cwd: path.join(__dirname, '..') }, filesToBackup);
             sendEvent(res, { log: `Backup created: ${backupFile}` });

             sendEvent(res, { log: 'Pulling latest changes from git...' });
             const pullLog = await runCommand('git', ['pull']);
             sendEvent(res, { log: pullLog });

             sendEvent(res, { log: 'Updating dependencies...' });
             const npmLog = await runCommand('npm', ['install', '--prefix', 'proxy']);
             sendEvent(res, { log: npmLog });

             sendEvent(res, { status: 'restarting', log: 'Update complete. Restarting server...' });
             res.end();
             setTimeout(() => process.exit(0), 1000);
         } catch(error) {
            sendEvent(res, { status: 'error', message: `Update failed: ${error.message}` });
            res.end();
         }
     })();
});

app.get('/api/list-backups', (req, res) => {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
        return res.json([]);
    }
    const backups = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.tar.gz'))
        .sort((a, b) => b.localeCompare(a));
    res.json(backups);
});


app.get('/api/rollback', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const backupFile = req.query.backupFile;
    const projectRoot = path.join(__dirname, '..');
    const backupPath = path.join(projectRoot, 'backups', backupFile);

    if (!backupFile || !fs.existsSync(backupPath)) {
        sendEvent(res, { status: 'error', message: 'Backup file not found.' });
        res.end();
        return;
    }
    
    (async () => {
        try {
            sendEvent(res, { log: 'Clearing old application files (preserving .git and backups)...' });
            const files = await fs.readdir(projectRoot);
            for (const file of files) {
                if (file !== 'backups' && file !== '.git') {
                    await fs.remove(path.join(projectRoot, file));
                }
            }
            sendEvent(res, { log: `Extracting ${backupFile}...` });
            await tar.x({ file: backupPath, cwd: projectRoot });

            sendEvent(res, { log: 'Installing dependencies for restored version...' });
            const npmLog = await runCommand('npm', ['install', '--prefix', 'proxy']);
            sendEvent(res, { log: npmLog });

            sendEvent(res, { status: 'restarting', log: 'Rollback complete. Restarting server...' });
            res.end();
            setTimeout(() => process.exit(0), 1000);

        } catch (error) {
            sendEvent(res, { status: 'error', message: `Rollback failed: ${error.message}` });
            res.end();
        }
    })();
});


// --- Server Start ---
app.listen(port, () => {
  console.log(`MikroTik Manager server running. Access it at http://<your_ip_address>:${port}`);
});
