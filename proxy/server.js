require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs').promises;
const esbuild = require('esbuild');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Middleware to transpile TSX/TS files on the fly for development
app.get(/\.(tsx|ts)$/, async (req, res, next) => {
    try {
        // Resolve file path relative to the project root
        const filePath = path.join(__dirname, '..', req.path);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        
        const result = await esbuild.transform(fileContent, {
            loader: req.path.endsWith('.tsx') ? 'tsx' : 'ts',
            jsx: 'automatic', // Use the new JSX transform
            target: 'esnext'
        });

        res.set('Content-Type', 'application/javascript; charset=utf-8');
        res.send(result.code);
    } catch (error) {
        // If file doesn't exist, pass to next middleware (like 404 handler)
        if (error.code === 'ENOENT') {
            return next();
        }
        console.error(`Error transpiling ${req.path}:`, error);
        res.status(500).send('Error during server-side transpilation');
    }
});

// Helper function to create an Axios instance for a specific router
const createApiClient = ({ host, user, password, port, useSsl = false }) => {
    if (!host || !user) {
        throw new Error("Router configuration (host, user) is missing.");
    }
    const protocol = useSsl ? 'https' : 'http';
    const apiPort = port || (useSsl ? 443 : 80);

    const instance = axios.create({
        baseURL: `${protocol}://${host}:${apiPort}/rest`,
        auth: {
            username: user,
            password: password || '',
        },
        timeout: 10000, // 10 seconds timeout
        httpsAgent: useSsl ? new https.Agent({ rejectUnauthorized: false }) : undefined,
    });
    
    return instance;
};

// Generic request handler
const handleRequest = async (req, res, callback) => {
    try {
        // NOTE: The UI does not provide a useSsl option, so we default to false.
        const apiClient = createApiClient({ ...req.body, useSsl: false });
        const data = await callback(apiClient);
        res.json(data);
    } catch (err) {
        let errorMessage = 'An unknown error occurred.';
        if (axios.isAxiosError(err)) {
            if (err.response) {
                // The request was made and the server responded with a status code
                const detail = err.response.data?.detail || err.response.statusText;
                errorMessage = `Router API error: ${err.response.status} - ${detail}`;
            } else if (err.request) {
                // The request was made but no response was received
                errorMessage = `Could not connect to the MikroTik router. Check connection details and ensure the router's WWW service is enabled at ${req.body.host}.`;
            } else {
                // Something happened in setting up the request that triggered an Error
                errorMessage = err.message;
            }
        } else {
             errorMessage = err.message;
        }
        console.error("Error during API request processing:", errorMessage);
        res.status(500).json({ error: errorMessage });
    }
};

// --- API Endpoints ---

// Test connection endpoint
app.post('/api/test-connection', async (req, res) => {
    try {
        const apiClient = createApiClient({ ...req.body, useSsl: false });
        // A simple GET request to check connectivity and credentials
        await apiClient.get('/system/resource');
        res.json({ success: true, message: 'Connection successful!' });
    } catch (err) {
        let errorMessage = 'Failed to connect.';
         if (axios.isAxiosError(err)) {
             if (err.response) {
                 errorMessage = `Connection failed: ${err.response.status} ${err.response.data?.title || err.response.statusText}. Check credentials.`;
             } else if (err.request) {
                 errorMessage = `Connection failed. No response from ${req.body.host}. Check host, port, and firewall.`;
             } else {
                 errorMessage = `Connection setup error: ${err.message}`;
             }
         } else {
            errorMessage = err.message;
         }
        res.json({ success: false, message: errorMessage });
    }
});


// System info endpoint
app.post('/api/system-info', (req, res) => {
    handleRequest(req, res, async (client) => {
        const [resourceRes, routerboardRes] = await Promise.all([
            client.get('/system/resource'),
            client.get('/system/routerboard')
        ]);

        const sysInfo = resourceRes.data;
        const boardInfo = routerboardRes.data;
        
        if (!sysInfo || !boardInfo) {
            throw new Error("Incomplete system information received from router.");
        }

        const totalMemory = parseInt(sysInfo['total-memory'], 10);
        const freeMemory = parseInt(sysInfo['free-memory'], 10);
        const memoryUsage = totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : 0;

        return {
            boardName: boardInfo['board-name'],
            version: sysInfo.version,
            cpuLoad: parseInt(sysInfo['cpu-load'], 10),
            uptime: sysInfo.uptime,
            memoryUsage: memoryUsage,
            totalMemory: `${Math.round(totalMemory / 1024 / 1024)}MiB`,
        };
    });
});

// Interfaces endpoint
app.post('/api/interfaces', (req, res) => {
    handleRequest(req, res, async (client) => {
        const proplist = ['.id', 'name', 'type', 'rx-byte', 'tx-byte'].join(',');

        const initialStatsRes = await client.get('/interface', { params: { '.proplist': proplist } });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        const finalStatsRes = await client.get('/interface', { params: { '.proplist': proplist } });

        const initialStats = initialStatsRes.data;
        const finalStats = finalStatsRes.data;

        const finalStatsMap = new Map(finalStats.map(item => [item['.id'], item]));

        return initialStats.map(initialIface => {
            const finalIface = finalStatsMap.get(initialIface['.id']);
            if (!finalIface) {
                return {
                    name: initialIface.name,
                    type: initialIface.type,
                    rxRate: 0,
                    txRate: 0,
                };
            }

            const rxRate = (parseInt(finalIface['rx-byte'], 10) - parseInt(initialIface['rx-byte'], 10)) * 8;
            const txRate = (parseInt(finalIface['tx-byte'], 10) - parseInt(initialIface['tx-byte'], 10)) * 8;

            return {
                name: initialIface.name,
                type: initialIface.type,
                rxRate: Math.max(0, rxRate), // Ensure rate is not negative
                txRate: Math.max(0, txRate),
            };
        });
    });
});

// Hotspot clients endpoint
app.post('/api/hotspot-clients', (req, res) => {
    handleRequest(req, res, async (client) => {
        try {
            const response = await client.get('/ip/hotspot/active');
            const clients = response.data;
            return clients.map(client => ({
                macAddress: client['mac-address'],
                uptime: client.uptime,
                signal: client['signal-strength'] || 'N/A',
            }));
        } catch (err) {
            if (axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.data?.detail?.includes("no such item"))) {
                 console.warn("Could not fetch hotspot clients. This is normal if hotspot is not configured.");
                 return []; // Hotspot feature might not be installed or enabled
            }
            // Re-throw other errors to be caught by the main handler
            throw err;
        }
    });
});

// --- Frontend Serving ---
const staticPath = path.join(__dirname, '..');

// Serve static files from the root directory.
// Our custom middleware will catch .tsx/.ts requests first.
app.use(express.static(staticPath));

// For any other route, serve the index.html file for the React app (Single Page App support)
app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});


app.listen(PORT, () => {
    console.log(`MikroTik Manager server running. Access it at http://localhost:${PORT}`);
});