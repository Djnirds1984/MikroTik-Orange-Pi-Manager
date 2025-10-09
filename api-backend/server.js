const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { Client } = require('ssh2');

const app = express();
const PORT = 3002;
const DB_SERVER_URL = 'http://127.0.0.1:3001'; // The main panel server runs on port 3001

app.use(cors()); // Allow all origins as it's proxied by Nginx
app.use(express.json());

// In-memory cache for router configs to avoid hitting the DB on every single request
const routerConfigCache = new Map();

const handleApiRequest = async (req, res, action) => {
    try {
        const result = await action();
        // MikroTik API sometimes returns an empty string on success, which is not valid JSON
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
        // MikroTik with self-signed certs will fail without this
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    // Interceptor to map MikroTik's .id to a top-level id property for frontend convenience
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

// Middleware to fetch and cache router config from the main panel server
const getRouterConfig = async (req, res, next) => {
    const { routerId } = req.params;
    if (routerConfigCache.has(routerId)) {
        req.routerInstance = createRouterInstance(routerConfigCache.get(routerId));
        return next();
    }
    try {
        // Fetch ALL router configs from the panel DB server
        const response = await axios.get(`${DB_SERVER_URL}/api/db/routers`);
        const routers = response.data;
        const config = routers.find(r => r.id === routerId);
        
        if (!config) {
            return res.status(404).json({ message: `Router config for ID ${routerId} not found in database.` });
        }

        // Cache the found config
        routerConfigCache.set(routerId, config);
        req.routerInstance = createRouterInstance(config);
        next();
    } catch (error) {
        console.error(`Failed to fetch router config for ${routerId}:`, error.message);
        res.status(500).json({ message: 'Could not communicate with the panel database server to get router configuration.' });
    }
};

// Special endpoint for testing connection without a saved ID
app.post('/mt-api/test-connection', async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const instance = createRouterInstance(req.body);
        // Use a simple, universal endpoint for testing
        await instance.get('/system/resource');
        return { success: true, message: 'Connection successful!' };
    });
});

// All other router-specific requests are handled by this generic proxy
app.all('/mt-api/:routerId/*', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        // The API path is the part of the URL *after* the routerId
        const apiPath = req.originalUrl.replace(`/mt-api/${req.params.routerId}`, '');
        const options = {
            method: req.method,
            url: apiPath,
            data: (req.method !== 'GET' && req.body) ? req.body : undefined,
            params: req.method === 'GET' ? req.query : undefined
        };
        const response = await req.routerInstance(options);
        return response.data;
    });
});

// --- WebSocket Server for SSH ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/ssh' });

wss.on('connection', (ws) => {
    console.log('SSH WS Client connected');
    const ssh = new Client();

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            if (msg.type === 'auth') {
                const { host, user, password, term_cols, term_rows } = msg.data;
                const sshPort = 22; // SSH port is almost always 22, regardless of API port

                ssh.on('ready', () => {
                    ws.send('SSH connection established.\r\n');
                    ssh.shell({ term: 'xterm-color', cols: term_cols, rows: term_rows }, (err, stream) => {
                        if (err) {
                            ws.send(`\r\nSSH shell error: ${err.message}\r\n`);
                            return;
                        }

                        stream.on('data', (data) => ws.send(data.toString('utf-8')));
                        stream.on('close', () => ssh.end());
                        
                        // Re-register message handler for this specific stream
                        ws.on('message', (nestedMessage) => {
                            try {
                                const nestedMsg = JSON.parse(nestedMessage);
                                if (nestedMsg.type === 'data' && stream.writable) {
                                    stream.write(nestedMsg.data);
                                } else if (nestedMsg.type === 'resize' && stream.writable) {
                                    stream.setWindow(nestedMsg.rows, nestedMsg.cols);
                                }
                            } catch (e) { /* Ignore non-json data */ }
                        });
                    });
                }).on('error', (err) => {
                    ws.send(`\r\nSSH connection error: ${err.message}\r\n`);
                }).connect({ host, port: sshPort, username: user, password });
            }
        } catch(e) {
            console.error("Error processing WS message:", e);
        }
    });

    ws.on('close', () => {
        console.log('SSH WS Client disconnected');
        ssh.end();
    });
});

server.listen(PORT, () => {
    console.log(`MikroTik API backend server running on http://localhost:${PORT}`);
});