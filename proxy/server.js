const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');
const fs = require('fs');
const tar = require('tar');
const archiver = require('archiver');
const fsExtra = require('fs-extra');
const { NodeMikrotik } = require('node-mikrotik-api');

const app = express();
const port = 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ESBuild for JSX/TSX transpilation
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const esbuild = require('esbuild');
            const result = await esbuild.build({
                entryPoints: [path.join(__dirname, '..', req.path)],
                bundle: true,
                write: false,
                format: 'esm',
                external: ['react', 'react-dom/client', '@google/genai', 'recharts'],
            });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(result.outputFiles[0].text);
        } catch (e) {
            console.error('ESBuild transpilation failed:', e);
            res.status(500).send('Error during transpilation');
        }
    } else {
        next();
    }
});

// Helper to create MikroTik API connection
const createRouterApi = (config) => {
    return new NodeMikrotik({
        host: config.host,
        user: config.user,
        password: config.password,
        port: config.port,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Allow self-signed certificates
    });
};

// Generic API error handler
const handleApiError = (res, error, context) => {
    console.error(`API Error in ${context}:`, error);
    const message = error.message || 'An unknown error occurred';
    res.status(500).json({ message: `MikroTik API Error: ${message}` });
};

// A generic helper to execute commands on the router
const apiRequest = async (res, routerConfig, endpoint, data = {}, method = 'GET') => {
    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        let result;
        if (method === 'GET') {
            result = await api.read(endpoint, data);
        } else if (method === 'POST') {
             // For 'add' commands, data should be an array of one object
            result = await api.write(endpoint, [data]);
        } else if (method === 'PATCH') {
            // For 'set' commands, data is just the object of properties to change
            result = await api.write(endpoint, data);
        } else if (method === 'DELETE') {
            // For 'remove' commands, endpoint includes the ID
            result = await api.write(endpoint, {});
        }
        res.json(result || { success: true });
    } catch (error) {
        handleApiError(res, error, `${method} request to ${endpoint}`);
    } finally {
        if (api.connected) {
            api.close();
        }
    }
};


// --- API Endpoints ---

app.post('/api/test-connection', async (req, res) => {
    const { routerConfig } = req.body;
    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        res.json({ success: true, message: 'Connection successful!' });
    } catch (error) {
        res.status(500).json({ success: false, message: `Connection failed: ${error.message}` });
    } finally {
        if (api.connected) api.close();
    }
});

// Dashboard Data
app.post('/api/system-info', async (req, res) => {
    const { routerConfig } = req.body;
    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        const [resource, routerboard] = await Promise.all([
            api.read('/system/resource'),
            api.read('/system/routerboard'),
        ]);

        const totalMemory = resource[0]?.['total-memory'] ? `${Math.round(resource[0]['total-memory'] / 1024 / 1024)} MB` : 'N/A';
        const freeMemory = resource[0]?.['free-memory'] || 0;
        const memoryUsage = resource[0]?.['total-memory'] ? Math.round(((resource[0]['total-memory'] - freeMemory) / resource[0]['total-memory']) * 100) : 0;
        
        res.json({
            boardName: resource[0]?.['board-name'] || routerboard[0]?.model || 'N/A',
            version: resource[0]?.version || 'N/A',
            cpuLoad: resource[0]?.['cpu-load'] || 0,
            uptime: resource[0]?.uptime || 'N/A',
            totalMemory: totalMemory,
            memoryUsage: memoryUsage,
        });
    } catch (error) {
         handleApiError(res, error, 'fetching system info');
    } finally {
        if (api.connected) api.close();
    }
});

app.post('/api/interfaces', (req, res) => apiRequest(res, req.body.routerConfig, '/interface'));
app.post('/api/hotspot-clients', (req, res) => apiRequest(res, req.body.routerConfig, '/ip/hotspot/active'));

// PPPoE Profiles
app.post('/api/ppp/profiles', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/profile'));
app.post('/api/ip/pools', (req, res) => apiRequest(res, req.body.routerConfig, '/ip/pool'));
app.post('/api/ppp/profiles/add', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/profile', req.body.profileData, 'POST'));
app.post('/api/ppp/profiles/update', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/profile/${req.body.profileData.id}`, req.body.profileData, 'PATCH'));
app.post('/api/ppp/profiles/delete', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/profile/${req.body.profileId}`, {}, 'DELETE'));

// PPPoE Secrets
app.post('/api/ppp/secrets', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/secret'));
app.post('/api/ppp/active', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/active'));
app.post('/api/ppp/secrets/add', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/secret', req.body.secretData, 'POST'));
app.post('/api/ppp/secrets/update', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/secret/${req.body.secretData.id}`, req.body.secretData, 'PATCH'));
app.post('/api/ppp/secrets/delete', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/secret/${req.body.secretId}`, {}, 'DELETE'));

// Payment Processing
app.post('/api/ppp/process-payment', async (req, res) => {
    const { routerConfig, secret, plan, nonPaymentProfile, discountDays, paymentDate } = req.body;
    const api = createRouterApi(routerConfig);

    try {
        await api.connect();
        const commentData = JSON.parse(secret.comment || '{}');
        const payDate = new Date(paymentDate);
        let newDueDate;

        if (commentData.dueDate) {
            const currentDueDate = new Date(commentData.dueDate);
            if (currentDueDate > payDate) {
                newDueDate = new Date(currentDueDate.setDate(currentDueDate.getDate() + 30));
            } else {
                newDueDate = new Date(payDate.setDate(payDate.getDate() + 30));
            }
        } else {
            newDueDate = new Date(payDate.setDate(payDate.getDate() + 30));
        }
        
        const newDueDateString = newDueDate.toISOString().split('T')[0];
        const updatedComment = JSON.stringify({ ...commentData, plan: plan.name, dueDate: newDueDateString });

        // 1. Update the secret's comment first (critical path)
        await api.write(`/ppp/secret/${secret.id}`, { comment: updatedComment });

        // 2. Manage automation (secondary path, must be fault-tolerant)
        try {
            const scriptName = `expire-${secret.name}`;
            const schedulerName = `sched-expire-${secret.name}`;

            const [existingScript, existingScheduler] = await Promise.all([
                api.read('/system/script', { "?name": scriptName }),
                api.read('/system/scheduler', { "?name": schedulerName })
            ]);

            if (existingScript.length > 0) await api.write(`/system/script/${existingScript[0]['.id']}`, {}, 'DELETE');
            if (existingScheduler.length > 0) await api.write(`/system/scheduler/${existingScheduler[0]['.id']}`, {}, 'DELETE');
            
            const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;
            await api.write('/system/script', [{ name: scriptName, source: scriptSource }]);

            const startDate = new Date(newDueDateString);
            const mikrotikDate = `${startDate.toLocaleString('default', { month: 'short' }).toLowerCase()}/${String(startDate.getDate()).padStart(2, '0')}/${startDate.getFullYear()}`;
            
            await api.write('/system/scheduler', [{
                name: schedulerName, 'start-date': mikrotikDate, 'start-time': '00:01:00',
                interval: '0s', 'on-event': scriptName,
            }]);
        } catch (automationError) {
             console.warn(`Payment recorded for ${secret.name}, but scheduler setup failed:`, automationError.message);
             // Do not throw to client, as the core payment logic succeeded.
        }

        res.json({ success: true, message: 'Payment processed successfully.' });
    } catch (error) {
        handleApiError(res, error, `processing payment for ${secret.name}`);
    } finally {
        if (api.connected) api.close();
    }
});


// --- Updater Endpoints ---
const runCommand = (command, args, res, onLog) => {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd: path.join(__dirname, '..'), shell: false });
        proc.stdout.on('data', (data) => onLog(data.toString()));
        proc.stderr.on('data', (data) => onLog(data.toString()));
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command '${command} ${args.join(' ')}' failed with code ${code}`));
        });
        proc.on('error', (err) => reject(err));
    });
};

const sendSse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

app.get('/api/update-status', async (res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    try {
        const remoteUrl = await new Promise((resolve, reject) => {
            const proc = spawn('git', ['config', '--get', 'remote.origin.url'], { cwd: path.join(__dirname, '..') });
            let url = '';
            proc.stdout.on('data', (data) => url += data.toString());
            proc.on('close', (code) => code === 0 ? resolve(url.trim()) : reject(new Error('Failed to get git remote URL')));
        });

        if (!remoteUrl.startsWith('git@')) {
             sendSse(res, { status: 'error', message: `Insecure Git remote. Requires SSH (git@...) but found "${remoteUrl}".` });
             return;
        }
        
        await runCommand('ssh', ['-T', 'git@github.com', '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes'], res, log => sendSse(res, { log }));
        await runCommand('git', ['remote', 'update'], res, log => sendSse(res, { log }));

        const [local, remote] = await Promise.all([
             new Promise((resolve, reject) => {
                 const proc = spawn('git', ['rev-parse', '@'], { cwd: path.join(__dirname, '..') });
                 let hash = '';
                 proc.stdout.on('data', data => hash += data.toString());
                 proc.on('close', code => code === 0 ? resolve(hash.trim()) : reject());
            }),
             new Promise((resolve, reject) => {
                 const proc = spawn('git', ['rev-parse', '@{u}'], { cwd: path.join(__dirname, '..') });
                 let hash = '';
                 proc.stdout.on('data', data => hash += data.toString());
                 proc.on('close', code => code === 0 ? resolve(hash.trim()) : reject());
            })
        ]);
        
        if (local === remote) sendSse(res, { status: 'uptodate', message: 'Your panel is up to date.', local });
        else sendSse(res, { status: 'available', message: 'Update available.', local, remote });

    } catch (error) {
        sendSse(res, { status: 'error', message: error.message, log: error.stack });
    } finally {
        sendSse(res, { status: 'finished' });
        res.end();
    }
});

const restartApp = () => {
    if (process.env.PM2_HOME) {
        const pm2 = require('pm2');
        pm2.connect(err => {
            if (err) { console.error(err); return; }
            pm2.restart('mikrotik-manager', (err) => {
                pm2.disconnect();
                if (err) console.error('PM2 restart failed', err);
            });
        });
    }
};

app.get('/api/update-app', async (res) => {
     res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    try {
        const backupDir = path.join(__dirname, '..', 'backups');
        await fsExtra.ensureDir(backupDir);
        const backupFile = `backup-${new Date().toISOString().replace(/[.:]/g, '-')}.tar.gz`;
        const outputPath = path.join(backupDir, backupFile);

        sendSse(res, { log: `Creating backup: ${backupFile}` });
        
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('tar', { gzip: true });
        archive.pipe(output);
        archive.glob('**/*', {
            cwd: path.join(__dirname, '..'),
            ignore: ['backups/**', 'proxy/node_modules/**', '.git/**']
        });
        await archive.finalize();
        
        sendSse(res, { log: 'Backup created successfully.' });
        sendSse(res, { log: 'Pulling latest changes...' });
        await runCommand('git', ['pull'], res, log => sendSse(res, { log }));
        sendSse(res, { log: 'Installing dependencies...' });
        await runCommand('npm', ['install', '--prefix', 'proxy'], res, log => sendSse(res, { log }));
        sendSse(res, { status: 'restarting', log: 'Restarting server...' });

    } catch (error) {
        sendSse(res, { status: 'error', message: error.message });
    } finally {
        res.end();
        restartApp();
    }
});

app.get('/api/list-backups', async (req, res) => {
    try {
        const backupDir = path.join(__dirname, '..', 'backups');
        await fsExtra.ensureDir(backupDir);
        const files = await fs.promises.readdir(backupDir);
        res.json(files.filter(f => f.endsWith('.tar.gz')).sort().reverse());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/rollback', async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const { backupFile } = req.query;

    if (!backupFile || !/^[a-zA-Z0-9\-_.]+\.tar\.gz$/.test(backupFile)) {
         sendSse(res, { status: 'error', message: 'Invalid backup file name.' });
         return res.end();
    }
    const backupPath = path.join(__dirname, '..', 'backups', backupFile);

    try {
        if (!fs.existsSync(backupPath)) throw new Error('Backup file not found.');
        
        sendSse(res, { log: `Restoring from ${backupFile}...` });
        const appDir = path.join(__dirname, '..');
        const items = await fs.promises.readdir(appDir);
        for (const item of items) {
            if (!['backups', '.git', 'proxy'].includes(item)) {
                await fsExtra.remove(path.join(appDir, item));
            }
        }
        
        await tar.x({ file: backupPath, cwd: appDir });

        sendSse(res, { log: 'Files restored. Installing dependencies...' });
        await runCommand('npm', ['install', '--prefix', 'proxy'], res, log => sendSse(res, { log }));
        sendSse(res, { status: 'restarting', log: 'Restarting server...' });

    } catch (error) {
        sendSse(res, { status: 'error', message: error.message });
    } finally {
        res.end();
        restartApp();
    }
});


// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(port, () => {
    console.log(`MikroTik Manager server running. Access it at http://<your_ip_address>:${port}`);
});
