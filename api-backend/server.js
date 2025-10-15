
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const { exec } = require('child_process');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = 3002;

// --- Database Setup ---
let db;
(async () => {
    try {
        db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });
        await db.exec(`
            CREATE TABLE IF NOT EXISTS routers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                user TEXT NOT NULL,
                password TEXT,
                port INTEGER NOT NULL
            );
        `);
        console.log('Database connected successfully.');
    } catch (error) {
        console.error('Failed to connect to the database:', error);
        process.exit(1);
    }
})();


app.use(cors());
app.use(express.json());

const routerConfigCache = new Map();
const trafficStatsCache = new Map();

const handleApiRequest = async (req, res, action) => {
    try {
        const result = await action();
        if (result === '') {
            res.status(204).send();
        } else {
            res.json(result);
        }
    } catch (error) {
        const isAxiosError = !!error.isAxiosError;
        console.error("API Request Error:", isAxiosError ? `[${error.config.method.toUpperCase()}] ${error.config.url} - ${error.message}` : error);
        if (isAxiosError && error.response) {
            console.error("Axios Response Data:", error.response.data);
            const status = error.response.status || 500;
            let message = `MikroTik REST API Error: ${error.response.data.message || 'Bad Request'}`;
            if (error.response.data.detail) message += ` - ${error.response.data.detail}`;
            res.status(status).json({ message });
        } else {
            res.status(500).json({ message: error.message || 'An internal server error occurred.' });
        }
    }
};

const createRouterInstance = (config) => {
    if (!config || !config.host || !config.user) {
        throw new Error('Invalid router configuration: host and user are required.');
    }
    const protocol = config.port === 443 ? 'https' : 'http';
    const baseURL = `${protocol}://${config.host}:${config.port}/rest`;
    const auth = { username: config.user, password: config.password || '' };

    const instance = axios.create({ 
        baseURL, 
        auth,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    instance.interceptors.response.use(response => {
        if (response.data && Array.isArray(response.data)) {
            response.data = response.data.map(item => {
                if (item && typeof item === 'object' && '.id' in item) {
                    return { ...item, id: item['.id'] };
                }
                return item;
            });
        }
        return response;
    }, error => Promise.reject(error));

    return instance;
};

// Middleware to get router config from the local SQLite database
const getRouterConfig = async (req, res, next) => {
    const { routerId } = req.params;
    if (routerConfigCache.has(routerId)) {
        req.routerInstance = createRouterInstance(routerConfigCache.get(routerId));
        return next();
    }
    try {
        const config = await db.get('SELECT * FROM routers WHERE id = ?', routerId);
        if (!config) {
            routerConfigCache.delete(routerId);
            return res.status(404).json({ message: `Router config for ID ${routerId} not found in database.` });
        }
        routerConfigCache.set(routerId, config);
        req.routerInstance = createRouterInstance(config);
        next();
    } catch (error) {
        console.error(`Failed to fetch router config for ${routerId}:`, error.message);
        res.status(500).json({ message: `Failed to fetch router config from database: ${error.message}` });
    }
};

// --- Router Config DB Endpoints ---
app.get('/api/db/routers', async (req, res) => {
    await handleApiRequest(req, res, () => db.all('SELECT * FROM routers'));
});

app.post('/api/db/routers', async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { id, name, host, user, password, port } = req.body;
        if (!id || !name || !host || !user || !port) {
            throw new Error('Missing required fields for new router.');
        }
        await db.run(
            'INSERT INTO routers (id, name, host, user, password, port) VALUES (?, ?, ?, ?, ?, ?)',
            id, name, host, user, password || '', port
        );
        routerConfigCache.clear(); // Invalidate cache
        return { id, name, host, user, port };
    });
});

app.patch('/api/db/routers/:id', async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { id } = req.params;
        const { name, host, user, password, port } = req.body;
        if (!name || !host || !user || !port) {
            throw new Error('Missing required fields for router update.');
        }
        await db.run(
            'UPDATE routers SET name = ?, host = ?, user = ?, password = ?, port = ? WHERE id = ?',
            name, host, user, password || '', port, id
        );
        routerConfigCache.clear(); // Invalidate cache
        return { id, name, host, user, port };
    });
});

app.delete('/api/db/routers/:id', async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { id } = req.params;
        await db.run('DELETE FROM routers WHERE id = ?', id);
        routerConfigCache.clear(); // Invalidate cache
        return { message: 'Router deleted successfully' };
    });
});

// --- Updater & Cache Endpoints ---
app.post('/api/cache/reset', (req, res) => {
    routerConfigCache.clear();
    trafficStatsCache.clear();
    console.log('API caches (router config, traffic stats) have been cleared.');
    res.status(200).json({ message: 'API caches cleared successfully.' });
});

app.get('/api/updater/check', async (req, res) => {
    await handleApiRequest(req, res, () => {
        return new Promise((resolve, reject) => {
            const projectRoot = path.join(__dirname, '..');
            const command = 'git fetch origin && git rev-parse HEAD && git rev-parse origin/main';
            exec(command, { cwd: projectRoot }, (error, stdout, stderr) => {
                if (error) {
                    console.error('Git check error:', stderr);
                    if (stderr.includes('no upstream configured') || stderr.includes('not a git repository')) {
                        return resolve({ updateAvailable: false, message: 'This is not a git repository or it has no upstream branch configured.' });
                    }
                    return reject(new Error(stderr || 'Failed to check for updates.'));
                }
                const [local, remote] = stdout.trim().split('\n');
                const updateAvailable = local !== remote;
                const message = updateAvailable ? 'An update is available.' : 'Your application is up to date.';
                resolve({ updateAvailable, message, localHash: local, remoteHash: remote });
            });
        });
    });
});

app.post('/api/updater/start', (req, res) => {
    if (updaterWss && updaterWss.clients.size > 0) {
        updaterWss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'command', command: 'start-update' }));
            }
        });
        res.status(200).json({ message: 'Update process initiated.' });
    } else {
        res.status(400).json({ message: 'No updater client connected. Please go to the Updater page and try again.' });
    }
});

// --- MikroTik API Proxying ---

app.post('/mt-api/test-connection', async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const instance = createRouterInstance(req.body);
        await instance.get('/system/resource');
        return { success: true, message: 'Connection successful!' };
    });
});

app.get('/mt-api/:routerId/ip/wan-routes', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const response = await req.routerInstance.get('/ip/route');
        const allRoutes = Array.isArray(response.data) ? response.data : [];
        const wanRoutes = allRoutes.filter(route => route['check-gateway']);
        return wanRoutes;
    });
});

app.get('/mt-api/:routerId/ip/wan-failover-status', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const response = await req.routerInstance.get('/ip/route');
        const allRoutes = Array.isArray(response.data) ? response.data : [];
        const failoverRoutesCount = allRoutes.filter(route => route['check-gateway'] && route.disabled === 'false').length;
        return { enabled: failoverRoutesCount > 0 };
    });
});

app.post('/mt-api/:routerId/ip/wan-failover', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { enabled } = req.body;
        const { data: allRoutes } = await req.routerInstance.get('/ip/route');
        const wanRoutes = Array.isArray(allRoutes) ? allRoutes.filter(route => route['check-gateway']) : [];
        if (wanRoutes.length === 0) {
            return { message: 'No WAN/Failover routes with check-gateway found to configure.' };
        }
        const updatePromises = wanRoutes.map(route => {
            return req.routerInstance.patch(`/ip/route/${route['.id']}`, {
                disabled: enabled ? 'false' : 'true'
            });
        });
        await Promise.all(updatePromises);
        return { message: `All WAN Failover routes have been ${enabled ? 'enabled' : 'disabled'}.` };
    });
});

app.get('/mt-api/:routerId/system/resource', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { data } = await req.routerInstance.get('/system/resource');
        const totalMemoryBytes = data['total-memory'];
        const freeMemoryBytes = data['free-memory'];
        const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
        const formatBytes = (bytes) => {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(0)) + sizes[i];
        };
        return {
            boardName: data['board-name'],
            version: data.version,
            cpuLoad: data['cpu-load'],
            uptime: data.uptime,
            memoryUsage: totalMemoryBytes > 0 ? parseFloat(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(1)) : 0,
            totalMemory: formatBytes(totalMemoryBytes)
        };
    });
});

app.get('/mt-api/:routerId/interface', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { routerId } = req.params;
        const { data: currentInterfaces } = await req.routerInstance.get('/interface');
        if (!Array.isArray(currentInterfaces)) {
            return currentInterfaces;
        }
        const now = Date.now();
        const previousStats = trafficStatsCache.get(routerId);
        let processedInterfaces;
        if (previousStats && previousStats.interfaces) {
            const timeDiffSeconds = (now - previousStats.timestamp) / 1000;
            const prevInterfaceMap = previousStats.interfaces;
            processedInterfaces = currentInterfaces.map(iface => {
                const prevIface = prevInterfaceMap.get(iface.name);
                let rxRate = 0;
                let txRate = 0;
                if (prevIface && timeDiffSeconds > 0.1) {
                    let rxByteDiff = iface['rx-byte'] - prevIface.rxByte;
                    let txByteDiff = iface['tx-byte'] - prevIface.txByte;
                    if (rxByteDiff < 0) { rxByteDiff = iface['rx-byte']; }
                    if (txByteDiff < 0) { txByteDiff = iface['tx-byte']; }
                    rxRate = (rxByteDiff * 8) / timeDiffSeconds;
                    txRate = (txByteDiff * 8) / timeDiffSeconds;
                }
                return { ...iface, id: iface['.id'], rxRate: Math.round(rxRate), txRate: Math.round(txRate) };
            });
        } else {
            processedInterfaces = currentInterfaces.map(iface => ({ ...iface, id: iface['.id'], rxRate: 0, txRate: 0 }));
        }
        const newInterfaceMap = new Map();
        currentInterfaces.forEach(iface => {
            newInterfaceMap.set(iface.name, { rxByte: iface['rx-byte'], txByte: iface['tx-byte'] });
        });
        trafficStatsCache.set(routerId, { timestamp: now, interfaces: newInterfaceMap });
        return processedInterfaces;
    });
});

app.post('/mt-api/:routerId/system/clock/sync', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const now = new Date();
        const time = now.toTimeString().split(' ')[0];
        const month = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
        const day = ('0' + now.getDate()).slice(-2);
        const year = now.getFullYear();
        const date = `${month}/${day}/${year}`;
        await req.routerInstance.post('/system/clock/set', { time, date });
        return { message: `Router time successfully synced to ${date} ${time}.` };
    });
});

app.post('/mt-api/:routerId/ppp/process-payment', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { secret, plan, nonPaymentProfile, paymentDate } = req.body;
        if (!secret || !secret.id || !secret.name || !plan || !nonPaymentProfile || !paymentDate) {
            throw new Error('Missing required payment data: secret, plan, nonPaymentProfile, and paymentDate are required.');
        }
        const payment = new Date(paymentDate);
        let newDueDate = new Date(payment);
        switch(plan.cycle) {
            case 'Monthly': newDueDate.setMonth(newDueDate.getMonth() + 1); break;
            case 'Quarterly': newDueDate.setMonth(newDueDate.getMonth() + 3); break;
            case 'Yearly': newDueDate.setFullYear(newDueDate.getFullYear() + 1); break;
            default: newDueDate.setDate(newDueDate.getDate() + 30); break;
        }
        const formatDateForMikroTik = (date) => {
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            return `${months[date.getMonth()]}/${('0' + date.getDate()).slice(-2)}/${date.getFullYear()}`;
        };
        const mikrotikDate = formatDateForMikroTik(newDueDate);
        const comment = JSON.stringify({ plan: plan.name, dueDate: newDueDate.toISOString().split('T')[0] });
        await req.routerInstance.patch(`/ppp/secret/${secret.id}`, { comment });
        const scriptName = `expire-${secret.name}`;
        const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;
        const { data: existingScripts } = await req.routerInstance.get(`/system/script?name=${scriptName}`);
        if (existingScripts && existingScripts.length > 0) {
            await req.routerInstance.patch(`/system/script/${existingScripts[0]['.id']}`, { source: scriptSource });
        } else {
            await req.routerInstance.put('/system/script', { name: scriptName, source: scriptSource, policy: "read,write,test" });
        }
        const schedulerName = `expire-sched-${secret.name}`;
        const schedulerPayload = { 'on-event': scriptName, 'start-date': mikrotikDate, 'start-time': '00:00:01' };
        const { data: existingSchedulers } = await req.routerInstance.get(`/system/scheduler?name=${schedulerName}`);
        if (existingSchedulers && existingSchedulers.length > 0) {
            await req.routerInstance.patch(`/system/scheduler/${existingSchedulers[0]['.id']}`, schedulerPayload);
        } else {
            await req.routerInstance.put('/system/scheduler', { name: schedulerName, ...schedulerPayload });
        }
        return { message: `Payment processed successfully. User ${secret.name} will expire on ${mikrotikDate}.` };
    });
});

app.get('/mt-api/:routerId/log', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, () => req.routerInstance.get('/log').then(r => r.data));
});

app.post('/mt-api/:routerId/hotspot/panel-setup', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { routerId } = req.params;
        const { panelHostname } = req.body;
        if (!panelHostname) throw new Error("panelHostname is required.");
        const { data: walledGardenEntries } = await req.routerInstance.get('/ip/hotspot/walled-garden/ip');
        const existingEntry = Array.isArray(walledGardenEntries) && walledGardenEntries.find(e => e['dst-host'] === panelHostname);
        if (!existingEntry) {
            await req.routerInstance.put('/ip/hotspot/walled-garden/ip', { action: 'accept', 'dst-host': panelHostname, comment: 'Panel Hotspot Login' });
        }
        const upsertFile = async (fullPath, content) => {
            const { data: files } = await req.routerInstance.get(`/file?name=${encodeURIComponent(fullPath)}`);
            const existingFile = Array.isArray(files) && files.find(f => f.name === fullPath);
            if (existingFile) {
                await req.routerInstance.patch(`/file/${existingFile['.id']}`, { contents: content });
            } else {
                await req.routerInstance.post('/file', { name: fullPath, contents: content });
            }
        };
        const loginHtmlContent = `<html><head><title>Redirecting...</title><meta http-equiv="refresh" content="0;url=http://${panelHostname}:3001/hotspot-login?mac=$(mac-esc)&ip=$(ip-esc)&link-login-only=$(link-login-only-esc)&router_id=${routerId}"></head><body><p>Please wait...</p></body></html>`;
        await upsertFile('hotspot/login.html', loginHtmlContent);
        const aloginHtmlContent = `<html><head><title>Logging in...</title></head><body><form name="login" action="$(link-login-only)" method="post"><input type="hidden" name="username" value="$(username)"><input type="hidden" name="password" value="$(password)"></form><script>document.login.submit();</script></body></html>`;
        await upsertFile('hotspot/alogin.html', aloginHtmlContent);
        return { message: "Panel Hotspot configured successfully on the router!" };
    });
});

app.post('/mt-api/:routerId/file/print', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, () => req.routerInstance.post('/file/print', req.body).then(r => r.data));
});

app.all('/mt-api/:routerId/*', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const apiPath = req.path.replace(`/mt-api/${req.params.routerId}`, '');
        const options = {
            method: req.method,
            url: apiPath,
            data: (req.method !== 'GET' && req.body) ? req.body : undefined,
            params: req.query
        };
        const response = await req.routerInstance(options);
        return response.data;
    });
});

const server = http.createServer(app);
const sshWss = new WebSocket.Server({ noServer: true });
const updaterWss = new WebSocket.Server({ noServer: true });

sshWss.on('connection', (ws) => {
    console.log('SSH WS Client connected');
    const ssh = new Client();
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'auth') {
                const { host, user, password, term_cols, term_rows } = msg.data;
                ssh.on('ready', () => {
                    ws.send('SSH connection established.\r\n');
                    ssh.shell({ term: 'xterm-color', cols: term_cols, rows: term_rows }, (err, stream) => {
                        if (err) return ws.send(`\r\nSSH shell error: ${err.message}\r\n`);
                        stream.on('data', (data) => ws.send(data.toString('utf-8')));
                        stream.on('close', () => ssh.end());
                        ws.on('message', (nestedMessage) => {
                            try {
                                const nestedMsg = JSON.parse(nestedMessage);
                                if (nestedMsg.type === 'data' && stream.writable) stream.write(nestedMsg.data);
                                else if (nestedMsg.type === 'resize' && stream.writable) stream.setWindow(nestedMsg.rows, nestedMsg.cols);
                            } catch (e) {}
                        });
                    });
                }).on('error', (err) => {
                    ws.send(`\r\nSSH connection error: ${err.message}\r\n`);
                }).connect({ host, port: 22, username: user, password });
            }
        } catch(e) { console.error("Error processing WS message:", e); }
    });
    ws.on('close', () => {
        console.log('SSH WS Client disconnected');
        ssh.end();
    });
});

updaterWss.on('connection', (ws) => {
    console.log('Updater WS Client connected');
    ws.send(JSON.stringify({ type: 'log', data: 'Updater WebSocket connection established. Ready to receive update command.' }));
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'command' && msg.command === 'start-update') {
                console.log('Starting update process via WebSocket command...');
                const projectRoot = path.join(__dirname, '..');
                const commands = [
                    'git reset --hard origin/main',
                    'npm install --prefix proxy',
                    'npm install --prefix api-backend',
                ];
                const executeSequentially = (index) => {
                    if (index >= commands.length) {
                        ws.send(JSON.stringify({ type: 'log', data: '\n--- RESTARTING SERVERS ---' }));
                        ws.send(JSON.stringify({ type: 'log', data: 'Application will restart. This page should reload automatically in 10-15 seconds.' }));
                        exec('pm2 restart all', { cwd: projectRoot }, (err, stdout, stderr) => {
                             if (ws.readyState === WebSocket.OPEN) {
                                if (err) ws.send(JSON.stringify({ type: 'log', data: `PM2 restart command failed: ${stderr}`}));
                                else ws.send(JSON.stringify({ type: 'log', data: `PM2 restart command issued: ${stdout}`}));
                                ws.close();
                            }
                        });
                        return;
                    }
                    ws.send(JSON.stringify({ type: 'log', data: `\n> ${commands[index]}` }));
                    const proc = exec(commands[index], { cwd: projectRoot });
                    const sendToClient = (data) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'log', data: data.toString().trim() }));
                        }
                    };
                    proc.stdout.on('data', sendToClient);
                    proc.stderr.on('data', sendToClient);
                    proc.on('close', (code) => {
                        if (code !== 0) {
                            ws.send(JSON.stringify({ type: 'log', data: `\n--- ERROR: Command failed with code ${code}. Aborting update. ---` }));
                        } else {
                            executeSequentially(index + 1);
                        }
                    });
                };
                executeSequentially(0);
            }
        } catch (e) { console.error("Error processing Updater WS message:", e); }
    });
    ws.on('close', () => console.log('Updater WS Client disconnected'));
});

server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname === '/ws/ssh') {
      sshWss.handleUpgrade(request, socket, head, (ws) => sshWss.emit('connection', ws, request));
    } else if (pathname === '/ws/updater') {
      updaterWss.handleUpgrade(request, socket, head, (ws) => updaterWss.emit('connection', ws, request));
    } else {
      socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log(`MikroTik API backend server running on http://localhost:${PORT}`);
});
