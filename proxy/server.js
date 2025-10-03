const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const axios = require('axios');
const https = require('https');
const { exec, spawn } = require('child_process');
const archiver = require('archiver');
const fsExtra = require('fs-extra');
const tar = require('tar');

const app = express();
app.use(cors());
app.use(express.json());

// Middleware for on-the-fly TSX/TS transpilation with enhanced error reporting
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
                    jsx: 'automatic',
                    external: ['react', 'react-dom/client', '@google/genai', 'recharts'],
                });
                res.set('Content-Type', 'application/javascript');
                res.send(result.outputFiles[0].text);
            } catch (e) {
                console.error('ESBuild transpilation failed:', e);

                // --- DEBUGGING CODE START ---
                // This block catches the error and sends a detailed report to the browser.
                const errorMessage = (e.errors || []).map(err => {
                    return `> Error: ${err.text}\n  at ${err.location.file}:${err.location.line}:${err.location.column}`;
                }).join('\n\n') || e.message;

                res.set('Content-Type', 'text/html');
                res.status(500).send(`
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Server Error</title>
                        <style>
                            body { font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace; background-color: #111827; color: #f3f4f6; padding: 2rem; }
                            .container { max-width: 900px; margin: 0 auto; background-color: #1f2937; border: 1px solid #374151; border-radius: 0.5rem; padding: 2rem; }
                            h1 { color: #f87171; border-bottom: 1px solid #4b5563; padding-bottom: 0.5rem; }
                            pre { background-color: #111827; padding: 1rem; border-radius: 0.25rem; white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em; }
                            code { color: #d1d5db; }
                            p { color: #9ca3af; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>500 - Internal Server Error</h1>
                            <p>The server failed to process the file: <strong>${req.path}</strong>. This is usually caused by a syntax error or an incorrect import path in one of your application files.</p>
                            <h2>Error Details:</h2>
                            <pre><code>${errorMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
                        </div>
                    </body>
                    </html>
                `);
                // --- DEBUGGING CODE END ---
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
    
    // For self-signed certificates, which MikroTik uses by default for https.
    const agent = (protocol === 'https') 
        ? new https.Agent({ rejectUnauthorized: false }) 
        : undefined;

    return axios.create({
        baseURL: `${protocol}://${host}:${port}`,
        auth,
        httpsAgent: agent
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
            fetchAll(api, '/rest/system/routerboard').catch(() => []), // Fetch safely
        ]);
        const info = resource[0] || {}; // Guard against empty response
        const board = routerboard[0] || {};
        res.json({
            boardName: board['model'] || info['board-name'] || 'Unknown',
            version: info['version'] || 'N/A',
            cpuLoad: info['cpu-load'] || 0,
            uptime: info['uptime'] || 'N/A',
            memoryUsage: (info['total-memory'] && info['free-memory'])
                ? Math.round(((info['total-memory'] - info['free-memory']) / info['total-memory']) * 100)
                : 0,
            totalMemory: info['total-memory']
                ? `${Math.round(info['total-memory'] / 1024 / 1024)}MiB`
                : 'N/A',
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
        // Hotspot might not exist, so fail gracefully
        res.json([]);
    }
});

// --- PPPoE Profile Management ---

app.post('/api/ppp/profiles', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const profiles = await fetchAll(api, '/rest/ppp/profile');
        res.json(profiles.map(p => ({
            id: p['.id'],
            name: p.name,
            localAddress: p['local-address'],
            remoteAddress: p['remote-address'],
            rateLimit: p['rate-limit'],
        })));
    } catch(error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ip/pools', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const pools = await fetchAll(api, '/rest/ip/pool');
        res.json(pools.map(p => ({
            id: p['.id'],
            name: p.name,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const cleanPayload = (obj) => {
  const newObj = {};
  for (const key in obj) {
    if (obj[key] !== '' && obj[key] !== null && obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
};

app.post('/api/ppp/profiles/add', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { profileData } = req.body;
        const payload = cleanPayload({
            name: profileData.name,
            'local-address': profileData.localAddress,
            'remote-address': profileData.remoteAddress,
            'rate-limit': profileData.rateLimit,
        });
        const response = await api.put('/rest/ppp/profile', payload);
        res.status(201).json(response.data);
    } catch (error) {
        res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});

app.post('/api/ppp/profiles/update', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { profileData } = req.body;
        const payload = cleanPayload({
            '.id': profileData.id,
            name: profileData.name,
            'local-address': profileData.localAddress,
            'remote-address': profileData.remoteAddress,
            'rate-limit': profileData.rateLimit,
        });
        const response = await api.patch('/rest/ppp/profile', payload);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});

app.post('/api/ppp/profiles/delete', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { profileId } = req.body;
        await api.delete(`/rest/ppp/profile/${profileId}`);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});

// --- PPPoE Secret (User) Management ---

app.post('/api/ppp/secrets', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const secrets = await fetchAll(api, '/rest/ppp/secret');
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
        const active = await fetchAll(api, '/rest/ppp/active');
        res.json(active.map(a => ({
            id: a['.id'],
            name: a.name,
            uptime: a.uptime,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/ppp/secrets/add', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secretData } = req.body;
        const payload = cleanPayload({
            name: secretData.name,
            password: secretData.password,
            service: secretData.service || 'ppp',
            profile: secretData.profile,
            comment: secretData.comment,
        });
        const response = await api.put('/rest/ppp/secret', payload);
        res.status(201).json(response.data);
    } catch (error) {
        res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});

app.post('/api/ppp/secrets/update', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secretData } = req.body;
        const payload = cleanPayload({
            '.id': secretData.id,
            name: secretData.name,
            password: secretData.password,
            service: secretData.service,
            profile: secretData.profile,
            comment: secretData.comment,
        });
        const response = await api.patch('/rest/ppp/secret', payload);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});

app.post('/api/ppp/secrets/delete', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secretId } = req.body;
        await api.delete(`/rest/ppp/secret/${secretId}`);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});

app.post('/api/ppp/process-payment', async (req, res) => {
    try {
        const api = createRouterApi(req.body.routerConfig);
        const { secret, plan, nonPaymentProfile } = req.body;

        // 1. Calculate new due date (30 days from now)
        const today = new Date();
        const newDueDate = new Date(today.setDate(today.getDate() + 30));
        const dueDateString = newDueDate.toISOString().split('T')[0]; // YYYY-MM-DD format

        // 2. Prepare the new comment
        let commentJson = {};
        try {
            if (secret.comment) commentJson = JSON.parse(secret.comment);
        } catch { /* ignore parsing errors, start fresh */ }
        
        commentJson.dueDate = dueDateString;
        commentJson.plan = plan.name;
        const newComment = JSON.stringify(commentJson);

        // 3. Update the user's secret with new profile and comment
        await api.patch('/rest/ppp/secret', {
            '.id': secret.id,
            profile: plan.pppoeProfile,
            comment: newComment,
        });

        // 4. Manage the scheduler
        const schedulerName = `ppp-due-check-${secret.name}`;
        const scriptName = `ppp-expire-script-${secret.name}`;
        const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;
        const startDate = newDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '');

        // Find and remove old scheduler/script
        const [schedulers, scripts] = await Promise.all([
            fetchAll(api, `/rest/system/scheduler?name=${schedulerName}`),
            fetchAll(api, `/rest/system/script?name=${scriptName}`),
        ]);
        if (schedulers.length > 0) await api.delete(`/rest/system/scheduler/${schedulers[0]['.id']}`);
        if (scripts.length > 0) await api.delete(`/rest/system/script/${scripts[0]['.id']}`);

        // Add new script
        await api.put('/rest/system/script', { name: scriptName, source: scriptSource });

        // Add new scheduler
        await api.put('/rest/system/scheduler', {
            name: schedulerName,
            'on-event': scriptName,
            'start-date': startDate,
            'start-time': '00:00:01', // Run just after midnight
        });

        res.json({ success: true, message: 'Payment processed and scheduler updated.' });

    } catch (error) {
         res.status(500).json({ message: error.response?.data?.detail || error.message });
    }
});


// --- Updater Endpoints ---
const projectRoot = path.join(__dirname, '..');
const backupsDir = path.join(projectRoot, 'backups');

const sendSse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

// Helper for running simple commands and getting a promise.
// Crucially, it sets GIT_TERMINAL_PROMPT=0 to prevent git from hanging on credential prompts.
const run = (cmd) => new Promise((resolve, reject) => {
    const options = {
        cwd: projectRoot,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    };
    exec(cmd, options, (err, stdout, stderr) => {
        if (err) {
            // Include stderr in the rejection for better error messages (e.g., from ssh)
            return reject(new Error(stderr || stdout || err.message));
        }
        resolve(stdout.trim());
    });
});

// Helper for running commands that stream output over SSE.
// Also prevents git hangs.
const runStream = (res, cmd, args, opts) => {
    const defaultOptions = {
        cwd: projectRoot,
        shell: false,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    };
    const finalOpts = { ...defaultOptions, ...opts };
    if (opts && opts.env) {
        finalOpts.env = { ...defaultOptions.env, ...opts.env };
    }
    
    const proc = spawn(cmd, args, finalOpts);
    proc.stdout.on('data', data => sendSse(res, { log: data.toString() }));
    proc.stderr.on('data', data => sendSse(res, { log: data.toString() }));
    return new Promise((resolve, reject) => proc.on('close', code => {
        if (code === 0) resolve(code);
        else reject(new Error(`Command '${cmd} ${args.join(' ')}' failed with code ${code}`));
    }));
};


app.get('/api/update-status', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    (async () => {
        try {
            // Step 1: Check remote URL and inform user
            const remoteUrl = await run('git config --get remote.origin.url');
            sendSse(res, { log: `--- Found Git remote URL: ${remoteUrl}` });

            // Step 2: Enforce SSH
            if (!remoteUrl.startsWith('git@') && !remoteUrl.startsWith('ssh://')) {
                sendSse(res, {
                    status: 'error',
                    message: `Git remote is not configured for SSH. Please use an SSH URL.`,
                    log: `FAIL: Remote URL must start with 'git@' or 'ssh://'.`
                });
                return;
            }
            sendSse(res, { log: `--- Remote URL is using SSH. OK.` });

            // Step 3: Test SSH connection to GitHub
            sendSse(res, { log: `--- Testing SSH connection to github.com...` });
            try {
                // BatchMode=yes prevents password prompts, causing it to fail fast if keys are not set up.
                // The output on success or failure is captured in stderr, which is useful.
                await run('ssh -o BatchMode=yes -T git@github.com');
            } catch (e) {
                const sshError = e.message || '';
                if (sshError.includes('successfully authenticated')) {
                    sendSse(res, { log: `--- SSH connection successful. ---` });
                    // This is a success case, so we continue.
                } else {
                    sendSse(res, {
                        status: 'error',
                        message: 'SSH connection to GitHub failed. Check your SSH key setup.',
                        log: `FAIL: SSH connection test failed.\n\n${sshError}`
                    });
                    return; // Stop execution
                }
            }

            // Step 4: Fetch updates and compare commits
            sendSse(res, { log: `\n--- Fetching latest updates from remote...` });
            await run('git remote update');
            sendSse(res, { log: `Fetch complete.` });

            const local = await run('git rev-parse @');
            const remote = await run('git rev-parse @{u}');
            const base = await run('git merge-base @ @{u}');

            if (local === remote) {
                sendSse(res, { status: 'uptodate', message: 'Your panel is updated.', local });
            } else if (local === base) {
                sendSse(res, { status: 'available', message: 'Update is available.', local, remote });
            } else {
                sendSse(res, { status: 'diverged', message: 'Local changes detected. Please commit or stash changes.', local, remote });
            }
            // Add a "finished" event to signal a graceful close
            sendSse(res, { status: 'finished' });
        } catch (err) {
            sendSse(res, { status: 'error', message: err.message, log: err.stack });
        } finally {
            res.end();
        }
    })();
});


app.get('/api/update-app', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    (async () => {
        try {
            // Backup
            sendSse(res, { log: '--- Creating backup ---' });
            if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
            const backupName = `backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
            const output = fs.createWriteStream(path.join(backupsDir, backupName));
            const archive = archiver('tar', { gzip: true });
            
            const end = new Promise((resolve, reject) => {
                output.on('close', resolve);
                archive.on('error', reject);
            });

            archive.pipe(output);
            archive.glob('**/*', {
                cwd: projectRoot,
                ignore: ['node_modules/**', '.git/**', 'backups/**']
            });
            await archive.finalize();
            await end;
            sendSse(res, { log: `Backup created: ${backupName}` });

            // Update
            sendSse(res, { log: '\n--- Pulling latest code from Git ---' });
            await runStream(res, 'git', ['pull']);
            
            sendSse(res, { log: '\n--- Installing dependencies ---' });
            await runStream(res, 'npm', ['install'], { cwd: path.join(projectRoot, 'proxy') });

            sendSse(res, { log: '\n--- Restarting application with PM2 ---' });
            await runStream(res, 'pm2', ['restart', 'mikrotik-manager']);

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

app.get('/api/rollback', (req, res) => {
     res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const { backupFile } = req.query;
    const backupPath = path.join(backupsDir, backupFile);

    if (!backupFile || !fs.existsSync(backupPath)) {
        sendSse(res, { status: 'error', message: 'Backup file not found.' });
        return res.end();
    }
    
    (async () => {
        try {
            sendSse(res, { log: `--- Starting rollback to ${backupFile} ---` });
            sendSse(res, { log: `Removing current application files...` });

            const files = fs.readdirSync(projectRoot);
            for (const file of files) {
                if (file !== 'backups' && file !== '.git' && file !== 'node_modules') {
                     await fsExtra.remove(path.join(projectRoot, file));
                }
            }

            sendSse(res, { log: `Extracting backup...` });
            await tar.x({ file: backupPath, cwd: projectRoot });

            sendSse(res, { log: '\n--- Restoring dependencies ---' });
            await runStream(res, 'npm', ['install'], { cwd: path.join(projectRoot, 'proxy') });

            sendSse(res, { log: '\n--- Restarting application with PM2 ---' });
            await runStream(res, 'pm2', ['restart', 'mikrotik-manager']);

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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`MikroTik Manager server running. Access it at http://<your_ip_address>:${PORT}`);
});