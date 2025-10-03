const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const axios = require('axios');
const { exec, spawn } = require('child_process');
const archiver = require('archiver');
const fsExtra = require('fs-extra');
const tar = require('tar');

const app = express();
app.use(cors());
app.use(express.json());

// Middleware for on-the-fly TSX/TS transpilation
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        const filePath = path.join(__dirname, '..', req.path);
        if (fs.existsSync(filePath)) {
            try {
                const result = await esbuild.build({
                    entryPoints: [filePath],
                    bundle: true,
                    write: false,
                    format: 'esm',
                    platform: 'browser',
                    // FIX: Use modern JSX transform for React 17+
                    jsx: 'automatic',
                });
                res.set('Content-Type', 'application/javascript');
                res.send(result.outputFiles[0].text);
            } catch (e) {
                console.error('ESBuild error:', e);
                res.status(500).send('Error transpiling file');
            }
        } else {
            res.status(404).send('File not found');
        }
    } else {
        next();
    }
});

// State for traffic calculation
let trafficState = {};

const createRouterApi = (routerConfig) => {
    const { host, user, password, port } = routerConfig;
    const protocol = (port === 443 || port === 8443) ? 'https' : 'http';
    const auth = {
        username: user,
        password: password || '',
    };
    return axios.create({
        baseURL: `${protocol}://${host}:${port}`,
        auth,
        // For self-signed certificates, you might need this in a real scenario:
        // httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
};

// --- API Endpoints ---
app.post('/api/test-connection', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        await api.get('/rest/system/resource');
        res.json({ success: true, message: 'Connection successful!' });
    } catch (error) {
        console.error("Test connection error:", error.message);
        res.status(500).json({ success: false, message: error.message || 'Failed to connect to router.' });
    }
});

const fetchAll = async (api, path) => {
    const response = await api.get(path);
    return response.data;
};

app.post('/api/system-info', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const [resource, routerboard] = await Promise.all([
            fetchAll(api, '/rest/system/resource'),
            fetchAll(api, '/rest/system/routerboard'),
        ]);
        const info = resource[0];
        const board = routerboard[0];
        res.json({
            boardName: board['model'],
            version: info['version'],
            cpuLoad: info['cpu-load'],
            uptime: info['uptime'],
            memoryUsage: Math.round(((info['total-memory'] - info['free-memory']) / info['total-memory']) * 100),
            totalMemory: `${Math.round(info['total-memory'] / 1024 / 1024)}MiB`,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/interfaces', async (req, res) => {
    try {
        const { id } = req.body.routerConfig;
        const api = createRouterApi(req.body.routerConfig);
        const interfaces = await fetchAll(api, '/rest/interface');
        
        if (!trafficState[id]) {
            trafficState[id] = { lastPoll: Date.now(), interfaces: {} };
        }
        
        const now = Date.now();
        const timeDiff = (now - trafficState[id].lastPoll) / 1000; // in seconds

        const result = interfaces.map(iface => {
            const last = trafficState[id].interfaces[iface.name] || { rxByte: iface['rx-byte'], txByte: iface['tx-byte'] };
            
            const rxRate = timeDiff > 0 ? Math.max(0, (iface['rx-byte'] - last.rxByte) * 8 / timeDiff) : 0;
            const txRate = timeDiff > 0 ? Math.max(0, (iface['tx-byte'] - last.txByte) * 8 / timeDiff) : 0;

            trafficState[id].interfaces[iface.name] = { rxByte: iface['rx-byte'], txByte: iface['tx-byte'] };

            return {
                name: iface.name,
                type: iface.type,
                rxRate,
                txRate,
            };
        });

        trafficState[id].lastPoll = now;
        res.json(result);
    } catch (error) {
         res.status(500).json({ message: error.message });
    }
});

app.post('/api/hotspot-clients', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const clients = await fetchAll(api, '/rest/ip/hotspot/active');
        res.json(clients.map(client => ({
            macAddress: client['mac-address'],
            uptime: client.uptime,
            signal: client['signal-strength'] || 'N/A',
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/pppoe-settings', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const [profiles, pppSettings, radius] = await Promise.all([
             fetchAll(api, '/rest/ppp/profile'),
             fetchAll(api, '/rest/ppp'),
             fetchAll(api, '/rest/radius')
        ]).catch(e => {
            if (e.response && e.response.data && e.response.data.detail) {
                 throw new Error(e.response.data.detail);
            }
            throw e;
        });

        const pppoeServer = (await fetchAll(api, '/rest/interface/pppoe-server/server'))[0] || {};

        res.json({
            useRadius: radius.length > 0 && radius[0].service.includes('ppp'),
            defaultProfile: pppoeServer['default-profile'] || 'none',
            authentication: {
                pap: pppoeServer['authentication']?.includes('pap'),
                chap: pppoeServer['authentication']?.includes('chap'),
                mschap1: pppoeServer['authentication']?.includes('mschap1'),
                mschap2: pppoeServer['authentication']?.includes('mschap2'),
            },
            radiusConfig: radius.length > 0 ? { address: radius[0].address } : undefined,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/pppoe-active', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const clients = await fetchAll(api, '/rest/ppp/active');
        res.json(clients.map(client => ({
            id: client['.id'],
            name: client.name,
            service: client.service,
            address: client.address,
            callerId: client['caller-id'],
            uptime: client.uptime,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp-profiles', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const profiles = await fetchAll(api, '/rest/ppp/profile');
        res.json(profiles.map(p => ({
            id: p['.id'],
            name: p.name,
        })));
    } catch(error) {
        res.status(500).json({ message: error.message });
    }
});

// --- Updater Endpoints ---
const projectRoot = path.join(__dirname, '..');
const backupsDir = path.join(projectRoot, 'backups');

const sendSse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

app.get('/api/update-status', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const run = (cmd) => new Promise((resolve, reject) => {
        exec(cmd, { cwd: projectRoot }, (err, stdout) => err ? reject(err) : resolve(stdout.trim()));
    });

    try {
        await run('git remote update');
        const local = await run('git rev-parse @');
        const remote = await run('git rev-parse @{u}');
        const base = await run('git merge-base @ @{u}');

        if (local === remote) {
            sendSse(res, { status: 'uptodate', message: 'You are running the latest version.' });
        } else if (local === base) {
            sendSse(res, { status: 'available', message: 'A new version is available.' });
        } else {
             sendSse(res, { status: 'diverged', message: 'Local changes detected. Please commit or stash changes.' });
        }
    } catch (err) {
        sendSse(res, { status: 'error', message: err.message });
    } finally {
        res.end();
    }
});

app.get('/api/update-app', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const runStream = (cmd, args, opts) => {
        const proc = spawn(cmd, args, { cwd: projectRoot, shell: true, ...opts });
        proc.stdout.on('data', data => sendSse(res, { log: data.toString() }));
        proc.stderr.on('data', data => sendSse(res, { log: data.toString() }));
        return new Promise(resolve => proc.on('close', resolve));
    };

    (async () => {
        try {
            // Backup
            sendSse(res, { log: '--- Creating backup ---' });
            if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
            const backupName = `backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
            const output = fs.createWriteStream(path.join(backupsDir, backupName));
            const archive = archiver('tar', { gzip: true });
            archive.pipe(output);
            archive.glob('**/*', {
                cwd: projectRoot,
                ignore: ['node_modules/**', '.git/**', 'backups/**']
            });
            await archive.finalize();
            sendSse(res, { log: `Backup created: ${backupName}` });

            // Update
            sendSse(res, { log: '\n--- Pulling latest code from Git ---' });
            await runStream('git', ['pull']);
            
            sendSse(res, { log: '\n--- Installing dependencies ---' });
            await runStream('npm', ['install'], { cwd: path.join(projectRoot, 'proxy') });

            sendSse(res, { log: '\n--- Restarting application with PM2 ---' });
            await runStream('pm2', ['restart', 'mikrotik-manager']);

            sendSse(res, { status: 'restarting' });

        } catch (e) {
            sendSse(res, { status: 'error', message: e.message });
        } finally {
            res.end();
        }
    })();
});

app.get('/api/list-backups', (req, res) => {
    if (!fs.existsSync(backupsDir)) return res.json([]);
    const backups = fs.readdirSync(backupsDir)
        .filter(f => f.endsWith('.tar.gz'))
        .sort((a, b) => b.localeCompare(a));
    res.json(backups);
});

app.post('/api/rollback', (req, res) => {
     res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const { backupFile } = req.body;
    const backupPath = path.join(backupsDir, backupFile);

    if (!fs.existsSync(backupPath)) {
        sendSse(res, { status: 'error', message: 'Backup file not found.' });
        return res.end();
    }
    
    (async () => {
        try {
            sendSse(res, { log: `--- Starting rollback to ${backupFile} ---` });
            sendSse(res, { log: `Removing current application files...` });

            // Remove everything except backups, .git, node_modules
            const files = fs.readdirSync(projectRoot);
            for (const file of files) {
                if (file !== 'backups' && file !== '.git' && file !== 'node_modules') {
                     await fsExtra.remove(path.join(projectRoot, file));
                }
            }

            sendSse(res, { log: `Extracting backup...` });
            await tar.x({ file: backupPath, cwd: projectRoot });

            const runStream = (cmd, args, opts) => {
                const proc = spawn(cmd, args, { cwd: projectRoot, shell: true, ...opts });
                proc.stdout.on('data', data => sendSse(res, { log: data.toString() }));
                proc.stderr.on('data', data => sendSse(res, { log: data.toString() }));
                return new Promise(resolve => proc.on('close', resolve));
            };

            sendSse(res, { log: '\n--- Restoring dependencies ---' });
            await runStream('npm', ['install'], { cwd: path.join(projectRoot, 'proxy') });

            sendSse(res, { log: '\n--- Restarting application with PM2 ---' });
            await runStream('pm2', ['restart', 'mikrotik-manager']);

            sendSse(res, { status: 'restarting' });

        } catch(e) {
            sendSse(res, { status: 'error', message: e.message });
        } finally {
            res.end();
        }
    })();
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '..')));

// The "catchall" handler: for any request that doesn't match one above,
// send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 3001;
// CRITICAL FIX: Listen on '0.0.0.0' to accept connections from other devices on the network.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`MikroTik Manager server running. Access it at http://<your_ip_address>:${PORT}`);
});