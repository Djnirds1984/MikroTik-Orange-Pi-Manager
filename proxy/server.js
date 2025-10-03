const express = require('express');
const esbuild = require('esbuild');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs-extra');
const tar = require('tar');

const app = express();
const port = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// ESBuild middleware for transpiling TSX/TS files
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const sourcePath = path.join(__dirname, '..', req.path);
            const result = await esbuild.build({
                entryPoints: [sourcePath],
                bundle: true,
                outfile: 'out.js',
                write: false,
                format: 'esm',
                jsx: 'automatic',
                loader: { '.tsx': 'tsx' },
                // Mark dependencies as external to let the browser handle them via importmap
                external: ['react', 'react-dom/client', '@google/genai', 'recharts'],
            });
            res.set('Content-Type', 'application/javascript');
            res.send(result.outputFiles[0].text);
        } catch (e) {
            console.error('ESBuild transpilation failed:', e);
            res.status(500).send('ESBuild compilation error.');
        }
    } else {
        next();
    }
});

// Serve static files from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// --- MikroTik API Helper ---
const createRouterApi = (config) => {
    const protocol = config.port === 443 || config.port === 8729 ? 'https' : 'http';
    const baseURL = `${protocol}://${config.host}:${config.port}/rest`;
    
    // Allow self-signed certificates for local routers
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
    });

    const instance = axios.create({
        baseURL,
        auth: {
            username: config.user,
            password: config.password || '',
        },
        httpsAgent: protocol === 'https' ? httpsAgent : undefined,
    });

    return {
        write: async (endpoint, data) => {
            try {
                // The MikroTik API expects an array for .id lookups, but a plain object for adds/sets
                const payload = Array.isArray(data) ? data : [data];
                const response = await instance.post(endpoint, payload);
                return response.data;
            } catch (error) {
                const errorMsg = error.response?.data?.message || error.message;
                throw new Error(`MikroTik API Error: ${errorMsg}`);
            }
        },
        read: async (endpoint) => {
             try {
                const response = await instance.get(endpoint);
                return response.data;
            } catch (error) {
                const errorMsg = error.response?.data?.message || error.message;
                throw new Error(`MikroTik API Error: ${errorMsg}`);
            }
        }
    };
};

// --- API Endpoints ---

// Test Connection
app.post('/api/test-connection', async (req, res) => {
    try {
        const { routerConfig } = req.body;
        const api = createRouterApi(routerConfig);
        const systemInfo = await api.read('/system/resource');
        res.json({ success: true, message: `Connection successful! Fetched RouterOS version ${systemInfo.version}.` });
    } catch (error) {
        console.error('Test connection error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Dashboard Data
app.post('/api/system-info', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const [resource, routerboard] = await Promise.all([
            api.read('/system/resource'),
            api.read('/system/routerboard').catch(() => ({})) // Handle routerboard failing gracefully
        ]);
        const memoryUsage = ((resource['total-memory'] - resource['free-memory']) / resource['total-memory']) * 100;
        res.json({
            boardName: resource['board-name'] || routerboard['board-name'] || 'N/A',
            version: resource.version,
            cpuLoad: resource['cpu-load'],
            uptime: resource.uptime,
            memoryUsage: Math.round(memoryUsage),
            totalMemory: `${(resource['total-memory'] / 1024 / 1024).toFixed(0)} MB`,
        });
    } catch (error) {
        console.error('API Error fetching system info:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/interfaces', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const interfaces = await api.read('/interface');
        const trafficData = await api.write('/interface/monitor', {
            'numbers': interfaces.map(i => i.name).join(','),
            'once': 'true'
        });
        
        const combined = interfaces.map(iface => {
            const traffic = trafficData.find(t => t.name === iface.name);
            return {
                id: iface['.id'],
                name: iface.name,
                type: iface.type,
                rxRate: traffic ? (traffic['rx-bits-per-second'] || 0) : 0,
                txRate: traffic ? (traffic['tx-bits-per-second'] || 0) : 0,
            };
        });
        res.json(combined);
    } catch (error) {
        console.error('API Error fetching interfaces:', error);
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/hotspot-clients', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const clients = await api.read('/ip/hotspot/active');
        const simplifiedClients = clients.map(c => ({
            macAddress: c['mac-address'],
            uptime: c.uptime,
            signal: 'N/A' // This info isn't directly available here
        }));
        res.json(simplifiedClients);
    } catch (error) {
        if (error.message && error.message.includes('no such command')) {
            res.json([]);
        } else {
            console.error('API Error fetching hotspot clients:', error);
            res.status(500).json({ message: error.message });
        }
    }
});

// PPPoE Profiles
app.post('/api/ppp/profiles', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const profiles = await api.read('/ppp/profile');
        res.json(profiles.map(p => ({
            id: p['.id'],
            name: p.name,
            localAddress: p['local-address'],
            remoteAddress: p['remote-address'],
            rateLimit: p['rate-limit'],
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/profiles/add', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { profileData } = req.body;
        const result = await api.write('/ppp/profile/add', {
            'name': profileData.name,
            'local-address': profileData.localAddress,
            'remote-address': profileData.remoteAddress,
            'rate-limit': profileData.rateLimit,
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/profiles/update', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { profileData } = req.body;
        const result = await api.write('/ppp/profile/set', {
            '.id': profileData.id,
            'name': profileData.name,
            'local-address': profileData.localAddress,
            'remote-address': profileData.remoteAddress,
            'rate-limit': profileData.rateLimit,
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/profiles/delete', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { profileId } = req.body;
        const result = await api.write('/ppp/profile/remove', { '.id': profileId });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// IP Pools
app.post('/api/ip/pools', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const pools = await api.read('/ip/pool');
        res.json(pools.map(p => ({ id: p['.id'], name: p.name })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PPPoE Secrets (Users)
app.post('/api/ppp/secrets', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const secrets = await api.read('/ppp/secret');
        res.json(secrets.map(s => ({
            id: s['.id'],
            name: s.name,
            service: s.service,
            profile: s.profile,
            comment: s.comment,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/active', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const active = await api.read('/ppp/active');
        res.json(active.map(a => ({
            id: a['.id'],
            name: a.name,
            uptime: a.uptime,
        })));
    } catch (error) {
        if (error.message && error.message.includes('no such command')) {
            res.json([]);
        } else {
            res.status(500).json({ message: error.message });
        }
    }
});

app.post('/api/ppp/secrets/add', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secretData } = req.body;
        const result = await api.write('/ppp/secret/add', {
            name: secretData.name,
            password: secretData.password,
            service: 'pppoe',
            profile: secretData.profile,
            comment: secretData.comment,
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/secrets/update', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secretData } = req.body;
        const payload = {
            '.id': secretData.id,
            name: secretData.name,
            profile: secretData.profile,
            comment: secretData.comment,
        };
        if (secretData.password) {
            payload.password = secretData.password;
        }
        const result = await api.write('/ppp/secret/set', payload);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/secrets/delete', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secretId } = req.body;
        const result = await api.write('/ppp/secret/remove', { '.id': secretId });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Process Payment
app.post('/api/ppp/process-payment', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secret, plan, nonPaymentProfile, paymentDate } = req.body;

        const commentData = JSON.parse(secret.comment || '{}');
        const currentDueDate = commentData.dueDate ? new Date(commentData.dueDate) : new Date(paymentDate);
        const paymentDay = new Date(paymentDate);
        
        const startDate = currentDueDate > paymentDay ? currentDueDate : paymentDay;
        
        const newDueDate = new Date(startDate);
        newDueDate.setDate(newDueDate.getDate() + 30);
        
        const newComment = JSON.stringify({
            ...commentData,
            plan: plan.name,
            dueDate: newDueDate.toISOString().split('T')[0],
        });

        await api.write('/ppp/secret/set', {
            '.id': secret.id,
            comment: newComment,
            profile: plan.pppoeProfile,
        });

        const scriptName = `ppp-expire-${secret.name}`;
        const schedulerName = `ppp-scheduler-${secret.name}`;
        const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;

        const existingScripts = await api.write('/system/script/print', [`?name=${scriptName}`]);
        if (existingScripts.length > 0) {
            await api.write('/system/script/remove', { '.id': existingScripts[0]['.id'] });
        }
        const existingSchedulers = await api.write('/system/scheduler/print', [`?name=${schedulerName}`]);
        if (existingSchedulers.length > 0) {
            await api.write('/system/scheduler/remove', { '.id': existingSchedulers[0]['.id'] });
        }

        await api.write('/system/script/add', {
            name: scriptName,
            source: scriptSource,
        });
        
        const schedulerStartDate = newDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '').replace(' ', '/').replace(' ', '/');
        await api.write('/system/scheduler/add', {
            name: schedulerName,
            'start-date': schedulerStartDate.toLowerCase(),
            'start-time': '00:00:01',
            'on-event': scriptName,
            interval: '0s',
        });

        res.json({ success: true, message: 'Payment processed and scheduler updated.' });
    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({ message: error.message });
    }
});


// --- Updater Endpoints ---
const sendSse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

const runCommand = (command, cwd = '.') => {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${stdout}\n${stderr}`));
                return;
            }
            resolve(stdout.trim());
        });
    });
};

app.get('/api/update-status', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const projectRoot = path.join(__dirname, '..');

    try {
        sendSse(res, { log: "--> Checking Git remote configuration..." });
        const remoteUrl = await runCommand('git config --get remote.origin.url', projectRoot);
        sendSse(res, { log: `Remote URL: ${remoteUrl}` });
        if (!remoteUrl.startsWith('git@')) {
             sendSse(res, { status: 'error', message: `Insecure Git remote detected. Updater requires an SSH remote (git@...). Current remote is: ${remoteUrl}` });
             return;
        }

        sendSse(res, { log: "\n--> Testing SSH connection to GitHub..." });
        try {
            const sshTestOutput = await runCommand('ssh -T git@github.com 2>&1', projectRoot);
             sendSse(res, { log: sshTestOutput });
        } catch (e) {
             if (e.message.includes('successfully authenticated')) {
                 sendSse(res, { log: e.message });
             } else {
                 throw e;
             }
        }
        
        sendSse(res, { log: "\n--> Fetching latest updates from remote..." });
        await runCommand('git fetch', projectRoot);
        sendSse(res, { log: "Fetch complete." });
        
        sendSse(res, { log: "\n--> Comparing local and remote versions..." });
        const [local, remote, base] = await Promise.all([
            runCommand('git rev-parse HEAD', projectRoot),
            runCommand('git rev-parse @{u}', projectRoot),
            runCommand('git merge-base HEAD @{u}', projectRoot)
        ]);
        sendSse(res, { log: `Local version:  ${local.substring(0,7)}` });
        sendSse(res, { log: `Remote version: ${remote.substring(0,7)}` });

        if (local === remote) {
            sendSse(res, { status: 'uptodate', message: 'Your panel is up to date.', local });
        } else if (local === base) {
             sendSse(res, { status: 'available', message: 'A new version is available.', local, remote });
        } else {
            sendSse(res, { status: 'diverged', message: 'Your local branch has diverged from the remote.', local, remote });
        }

    } catch (error) {
        sendSse(res, { log: `\nERROR: ${error.message}` });
        sendSse(res, { status: 'error', message: "An error occurred while checking for updates." });
    } finally {
        sendSse(res, { status: 'finished' });
        res.end();
    }
});

app.get('/api/update-app', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const projectRoot = path.join(__dirname, '..');
    const backupDir = path.join(projectRoot, 'backups');
    const backupFile = path.join(backupDir, `backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`);

    try {
        sendSse(res, { log: "--> Creating pre-update backup..." });
        await fs.ensureDir(backupDir);
        
        const filesToBackup = (await fs.readdir(projectRoot)).filter(file => file !== 'backups' && file !== '.git');
        
        await tar.c({ gzip: true, file: backupFile, cwd: projectRoot }, filesToBackup);
        
        sendSse(res, { log: `Backup created at ${path.basename(backupFile)}` });

        sendSse(res, { log: "\n--> Pulling latest changes from Git..." });
        const pullOutput = await runCommand('git pull', projectRoot);
        sendSse(res, { log: pullOutput });
        
        sendSse(res, { log: "\n--> Installing/updating backend dependencies..." });
        const npmOutput = await runCommand('npm install', path.join(projectRoot, 'proxy'));
        sendSse(res, { log: npmOutput });

        sendSse(res, { log: "\nUpdate complete. Restarting server..." });
        sendSse(res, { status: 'restarting' });

        setTimeout(() => {
             exec('pm2 restart mikrotik-manager || exit 1', (err) => {
                if (err) {
                    console.log('PM2 not found. Exiting process for manual/external restart.');
                    process.exit(0);
                }
            });
        }, 1000);
        
    } catch (error) {
        sendSse(res, { log: `ERROR: ${error.message}` });
        sendSse(res, { status: 'error', message: 'Update failed. Check logs for details.' });
    } finally {
        res.end();
    }
});

app.get('/api/list-backups', async (req, res) => {
    try {
        const backupDir = path.join(__dirname, '..', 'backups');
        await fs.ensureDir(backupDir);
        const files = await fs.readdir(backupDir);
        res.json(files.filter(f => f.endsWith('.tar.gz')).sort().reverse());
    } catch (error) {
        res.status(500).json([]);
    }
});

app.get('/api/rollback', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const { backupFile } = req.query;
    if (!backupFile || !/^[a-zA-Z0-9_.-]+\.tar\.gz$/.test(backupFile)) {
        sendSse(res, { status: 'error', message: 'Invalid backup filename.' });
        res.end();
        return;
    }
    
    const projectRoot = path.join(__dirname, '..');
    const backupPath = path.join(projectRoot, 'backups', backupFile);

    try {
        sendSse(res, { log: `--> Starting rollback from ${backupFile}` });
        if (!await fs.pathExists(backupPath)) {
            throw new Error('Backup file not found.');
        }

        sendSse(res, { log: "--> Clearing current application files..." });
        const files = await fs.readdir(projectRoot);
        for (const file of files) {
            if (file !== '.git' && file !== 'backups') {
                await fs.remove(path.join(projectRoot, file));
            }
        }
        sendSse(res, { log: "Files cleared." });
        
        sendSse(res, { log: "--> Extracting backup..." });
        await tar.x({ file: backupPath, cwd: projectRoot });
        sendSse(res, { log: "Backup extracted." });

        sendSse(res, { log: "\n--> Re-installing dependencies for restored version..." });
        const npmOutput = await runCommand('npm install', path.join(projectRoot, 'proxy'));
        sendSse(res, { log: npmOutput });
        
        sendSse(res, { log: "\nRollback complete. Restarting server..." });
        sendSse(res, { status: 'restarting' });

        setTimeout(() => {
            exec('pm2 restart mikrotik-manager || exit 1', (err) => {
                if (err) process.exit(0);
            });
        }, 1000);

    } catch (error) {
        sendSse(res, { log: `ERROR: ${error.message}` });
        sendSse(res, { status: 'error', message: 'Rollback failed.' });
    } finally {
        res.end();
    }
});

// --- Server Start ---
app.listen(port, () => {
  console.log(`MikroTik Manager server running. Access it at http://<your_ip_address>:${port}`);
});
