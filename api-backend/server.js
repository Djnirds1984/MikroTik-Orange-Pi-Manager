
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const ssh2 = require('ssh2');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());
app.use(express.text()); // For AI fixer

// --- MikroTik API Proxy Middleware ---
const getRouterConfig = async (routerId, authToken) => {
    // The API backend needs to get credentials from the main UI server's database.
    try {
        const response = await axios.get(`http://127.0.0.1:3001/api/internal/router-credentials/${routerId}`, {
            headers: { 'Authorization': authToken }
        });
        return response.data;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`Failed to fetch credentials for router ${routerId}:`, errorMessage);
        throw new Error(`Could not retrieve router credentials. Please ensure the main panel server is running. Details: ${errorMessage}`);
    }
};

app.post('/mt-api/test-connection', async (req, res) => {
    const { host, user, password, port } = req.body;
    try {
        const protocol = port === 443 ? 'https' : 'http';
        const url = `${protocol}://${host}:${port}/rest/system/resource`;
        await axios.get(url, {
            auth: { username: user, password: password || '' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        res.json({ success: true, message: 'Connection successful!' });
    } catch (error) {
        console.error("Test connection error:", error.message);
        res.status(400).json({ success: false, message: `Connection failed: ${error.message}` });
    }
});

app.post('/mt-api/:routerId/hotspot/panel-setup', async (req, res) => {
    try {
        const { routerId } = req.params;
        const { panelHostname } = req.body;
        const router = await getRouterConfig(routerId, req.headers.authorization);
        const protocol = router.port === 443 ? 'https' : 'http';
        const api = axios.create({
            baseURL: `${protocol}://${router.host}:${router.port}/rest`,
            auth: { username: router.user, password: router.password || '' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        // 1. Add to Walled Garden
        const walledGardenPath = '/ip/hotspot/walled-garden/ip';
        const { data: existingWalledGarden } = await api.get(walledGardenPath, { params: { 'dst-host': panelHostname } });
        if (existingWalledGarden.length === 0) {
            await api.put(walledGardenPath, { 'action': 'accept', 'dst-host': panelHostname });
        }

        // 2. Prepare login files with iframe
        const loginHtmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hotspot Login</title>
    <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        iframe { width: 100%; height: 100%; border: none; }
    </style>
</head>
<body>
    <iframe src="http://${panelHostname}:3001/hotspot-login?mac=$(mac-esc)&ip=$(ip-esc)&link-login-only=$(link-login-only-esc)&router_id=${routerId}"></iframe>
</body>
</html>`;
        
        const aloginHtmlContent = `<!DOCTYPE html>
<html>
<head><title>Logging in...</title></head>
<body>
<form name="login" action="$(link-login-only)" method="post" style="display:none;">
<input type="hidden" name="username" value="$(username)">
<input type="hidden" name="password" value="$(password)">
</form>
<script>document.login.submit();</script>
</body>
</html>`;

        const uploadFile = async (fileName, content) => {
            const filePath = `hotspot/${fileName}`;
            const { data: existingFiles } = await api.get('/file', { params: { name: filePath } });
            
            if (existingFiles.length > 0) {
                const fileId = existingFiles[0]['.id'];
                await api.patch(`/file/${fileId}`, { contents: content });
            } else {
                await api.put('/file', { name: filePath, contents: content });
            }
        };

        await uploadFile('login.html', loginHtmlContent);
        await uploadFile('alogin.html', aloginHtmlContent);

        res.json({ message: 'Hotspot panel configured successfully! Walled Garden updated and login files created.' });

    } catch (error) {
        const detail = error.response?.data?.detail || error.message;
        console.error('Panel setup error:', detail);
        res.status(500).json({ message: `Failed to configure panel hotspot: ${detail}` });
    }
});


// Generic proxy for all other MikroTik API calls
app.all('/mt-api/:routerId/*', async (req, res) => {
    try {
        const { routerId } = req.params;
        const path = req.path.replace(`/mt-api/${routerId}`, '');
        
        const router = await getRouterConfig(routerId, req.headers.authorization);
        const protocol = router.port === 443 ? 'https' : 'http';
        const url = `${protocol}://${router.host}:${router.port}/rest${path}`;
        
        const response = await axios({
            method: req.method,
            url: url,
            data: Object.keys(req.body).length > 0 ? req.body : undefined,
            params: req.query,
            auth: { username: router.user, password: router.password || '' },
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            responseType: 'stream'
        });
        
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);

    } catch (error) {
        console.error('API Request Error:', `[${req.method}] ${req.path} -`, error.message);
        if (error.response) {
            let errorData = '';
            error.response.data.on('data', chunk => errorData += chunk);
            error.response.data.on('end', () => {
                console.error('Axios Response Data:', errorData);
                try {
                    const jsonData = JSON.parse(errorData);
                    res.status(error.response.status).json(jsonData);
                } catch {
                    res.status(error.response.status).send(errorData);
                }
            });
        } else {
            res.status(500).json({ message: error.message });
        }
    }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/ssh' });

wss.on('connection', (ws) => {
    const conn = new ssh2.Client();
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'auth') {
                const { host, user, password, term_cols, rows } = msg.data;
                conn.on('ready', () => {
                    ws.send('\r\n*** SSH Connection Established ***\r\n');
                    conn.shell({ term: 'xterm-color', cols: term_cols, rows: rows }, (err, stream) => {
                        if (err) return ws.send(`\r\n*** SSH Shell Error: ${err.message} ***\r\n`);
                        
                        stream.on('data', (data) => ws.send(data.toString('utf-8')));
                        stream.on('close', () => conn.end());

                        ws.on('message', (data) => {
                            try {
                                const newMsg = JSON.parse(data);
                                if (newMsg.type === 'data') stream.write(newMsg.data);
                                else if (newMsg.type === 'resize') stream.setWindow(newMsg.rows, newMsg.cols, 0, 0);
                            } catch(e) { /* ignore non-json */ }
                        });
                    });
                }).on('error', (err) => {
                    ws.send(`\r\n*** SSH Connection Error: ${err.message} ***\r\n`);
                }).connect({ host, port: 22, username: user, password });
            }
        } catch(e) { /* ignore non-json */ }
    });
    ws.on('close', () => conn.end());
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`MikroTik API backend listening on port ${PORT}`);
});
