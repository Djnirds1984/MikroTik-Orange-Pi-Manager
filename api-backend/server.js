const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { Client } = require('ssh2');

const app = express();
const PORT = 3002;
const DB_SERVER_URL = 'http://localhost:3001'; // The main panel server runs on port 3001

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

    // Grab the Authorization header from the incoming request from the frontend
    const authHeader = req.headers.authorization;
    
    // Create headers for the internal request to the main server
    const internalRequestHeaders = {};
    if (authHeader) {
        internalRequestHeaders['Authorization'] = authHeader;
    }

    if (routerConfigCache.has(routerId)) {
        req.routerInstance = createRouterInstance(routerConfigCache.get(routerId));
        return next();
    }
    try {
        // Fetch ALL router configs from the panel DB server, now with auth headers
        const response = await axios.get(`${DB_SERVER_URL}/api/db/routers`, {
            headers: internalRequestHeaders // Pass the headers here
        });
        const routers = response.data;
        const config = routers.find(r => r.id === routerId);
        
        if (!config) {
            // Clear cache for this ID if it was somehow invalid
            routerConfigCache.delete(routerId);
            return res.status(404).json({ message: `Router config for ID ${routerId} not found in database.` });
        }

        // Cache the found config
        routerConfigCache.set(routerId, config);
        req.routerInstance = createRouterInstance(config);
        next();
    } catch (error) {
        let errorMessage;
        if (axios.isAxiosError(error)) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                if (error.response.status === 401) {
                    errorMessage = 'Authentication failed when fetching router config from the main server. The session may have expired.';
                } else {
                    errorMessage = `The main panel server responded with an error (Status: ${error.response.status}).`;
                }
                console.error(`API Backend Error: Received ${error.response.status} from Panel DB Server. Data:`, error.response.data);
            } else if (error.request) {
                // The request was made but no response was received
                errorMessage = 'Could not get a response from the main panel server. Please ensure the "mikrotik-manager" process is running correctly.';
                console.error('API Backend Error: No response received from Panel DB Server. Error code:', error.code);
            } else {
                // Something happened in setting up the request that triggered an Error
                errorMessage = `An unexpected error occurred while setting up the request to the main panel server: ${error.message}`;
            }
        } else {
            errorMessage = `An internal error occurred in the API backend: ${error.message}`;
        }
        
        console.error(`Failed to fetch router config for ${routerId}:`, errorMessage);
        res.status(500).json({ message: errorMessage });
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

// --- Custom Handlers for WAN Failover Feature ---

// Custom handler for WAN routes
app.get('/mt-api/:routerId/ip/wan-routes', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const response = await req.routerInstance.get('/ip/route');
        const allRoutes = Array.isArray(response.data) ? response.data : [];
        // A WAN route for failover is identified by having 'check-gateway' enabled.
        const wanRoutes = allRoutes.filter(route => route['check-gateway']);
        return wanRoutes;
    });
});

// Custom handler for failover status
app.get('/mt-api/:routerId/ip/wan-failover-status', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const response = await req.routerInstance.get('/ip/route');
        const allRoutes = Array.isArray(response.data) ? response.data : [];
        const failoverRoutesCount = allRoutes.filter(route => route['check-gateway'] && route.disabled === 'false').length;
        // Consider failover "enabled" if there's at least one active WAN route being checked.
        return { enabled: failoverRoutesCount > 0 };
    });
});

// Custom handler for master-enabling/disabling failover
app.post('/mt-api/:routerId/ip/wan-failover', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { enabled } = req.body;
        
        const { data: allRoutes } = await req.routerInstance.get('/ip/route');
        const wanRoutes = Array.isArray(allRoutes) ? allRoutes.filter(route => route['check-gateway']) : [];
        
        if (wanRoutes.length === 0) {
            return { message: 'No WAN/Failover routes with check-gateway found to configure.' };
        }
        
        // Use Promise.all to update all routes concurrently
        const updatePromises = wanRoutes.map(route => {
            return req.routerInstance.patch(`/ip/route/${route['.id']}`, {
                disabled: enabled ? 'false' : 'true'
            });
        });
        
        await Promise.all(updatePromises);
        
        return { message: `All WAN Failover routes have been ${enabled ? 'enabled' : 'disabled'}.` };
    });
});

// --- Custom Handlers for Dashboard ---

// Custom handler for system resource to format data for the dashboard
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

// Custom handler for interfaces to format data for the dashboard
app.get('/mt-api/:routerId/interface', getRouterConfig, async (req, res) => {
    await handleApiRequest(req, res, async () => {
        const { data } = await req.routerInstance.get('/interface');
        if (Array.isArray(data)) {
            // Map kebab-case to camelCase for the frontend
            return data.map(iface => ({
                id: iface['.id'],
                name: iface.name,
                type: iface.type,
                macAddress: iface['mac-address'],
                // FIX: Use the correct property names from the MikroTik API ('-bits-per-second')
                // and convert them to numbers.
                rxRate: Number(iface['rx-bits-per-second'] || 0),
                txRate: Number(iface['tx-bits-per-second'] || 0),
                disabled: iface.disabled,
                comment: iface.comment,
            }));
        }
        return data; // Return as-is if not an array
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