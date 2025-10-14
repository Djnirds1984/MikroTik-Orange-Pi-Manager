const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Server } = require('ws');
const { Client } = require('ssh2');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'a-very-weak-secret-key-for-dev-only';
const DB_PATH = path.join(__dirname, '..', 'proxy', 'panel.db');

app.use(cors());
app.use(express.json());

let db; // Database connection will be initialized asynchronously

// --- Database Connection ---
// Lazily connect to the DB on first request needing it
const getDb = async () => {
    if (!db) {
        const { open } = require('sqlite');
        const sqlite3 = require('@vscode/sqlite3');
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database,
            mode: sqlite3.OPEN_READONLY
        });
    }
    return db;
};

// --- Authentication Middleware ---
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Authentication token required.' });
        }
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Invalid or expired token.' });
            }
            req.user = user;
            next();
        });
    } catch (e) {
        res.status(500).json({ message: `Authentication error: ${e.message}` });
    }
};

// Middleware to get router config from DB
const getRouterConfig = async (req, res, next) => {
    try {
        const { routerId } = req.params;
        if (!routerId) {
            return res.status(400).json({ message: 'Router ID is required.' });
        }
        const database = await getDb();
        const router = await database.get('SELECT * FROM routers WHERE id = ?', routerId);

        if (!router) {
            return res.status(404).json({ message: `Router with ID ${routerId} not found.` });
        }

        req.routerConfig = router;
        next();
    } catch (e) {
        console.error(`DB Error getting router config: ${e.message}`);
        res.status(500).json({ message: 'Failed to retrieve router configuration from database.' });
    }
};


// --- Generic API Proxy ---
// This will handle the majority of GET, POST, PATCH, DELETE requests
app.all('/mt-api/:routerId/*', authenticate, getRouterConfig, async (req, res) => {
    const { routerConfig } = req;
    const { routerId } = req.params;
    const path = req.path.substring(`/mt-api/${routerId}`.length);
    const method = req.method;
    const data = method !== 'GET' ? req.body : undefined;

    // Use baseURL for safety against SSRF
    const apiClient = axios.create({
        baseURL: `http://${routerConfig.host}:${routerConfig.port}/rest`,
        auth: {
            username: routerConfig.user,
            password: routerConfig.password || '',
        },
        timeout: 10000,
    });

    try {
        // Manually construct the URL with the query string to avoid encoding issues
        const url = `${path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
        
        const response = await apiClient.request({
            method,
            url, // Use the manually constructed URL
            data,
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error(`API Request Error: [${method}] ${path} -`, error.message);
        if (error.response) {
            console.error('Axios Response Data:', error.response.data);
            res.status(error.response.status).json(error.response.data);
        } else if (error.request) {
            res.status(500).json({ message: 'No response received from MikroTik router. Check connectivity and firewall.' });
        } else {
            res.status(500).json({ message: `Error setting up request: ${error.message}` });
        }
    }
});


// Test Connection Endpoint (does not need routerId in path)
app.post('/mt-api/test-connection', authenticate, async (req, res) => {
    const { host, user, password, port } = req.body;
    try {
        const response = await axios.get(`http://${host}:${port}/rest/system/resource`, {
            auth: { username: user, password: password || '' },
            timeout: 5000,
        });
        if (response.status === 200) {
            res.json({ success: true, message: 'Connection successful!' });
        } else {
            res.status(response.status).json({ success: false, message: `Received status ${response.status}` });
        }
    } catch (error) {
        console.error('Test connection error:', error.message);
        const message = error.response ? `Router responded with ${error.response.status} ${error.response.statusText}` : 'Could not connect to router. Check host, port, credentials, and network.';
        res.status(400).json({ success: false, message });
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`MikroTik API backend listening on port ${PORT}`);
});

// --- WebSocket for SSH ---
const wss = new Server({ server });

wss.on('connection', (ws) => {
    console.log('WS Client connected');
    const conn = new Client();
    let stream;

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'auth') {
                const { host, port, user, password, term_cols, term_rows } = msg.data;
                conn.on('ready', () => {
                    console.log('SSH Client :: ready');
                    conn.shell({ cols: term_cols, rows: term_rows }, (err, s) => {
                        if (err) {
                            ws.send(`SSH Shell Error: ${err.message}\r\n`);
                            return conn.end();
                        }
                        stream = s;
                        stream.on('close', () => {
                            console.log('SSH Stream :: close');
                            conn.end();
                        }).on('data', (data) => {
                            ws.send(data);
                        });
                        ws.send('*** SSH connection established ***\r\n');
                    });
                }).on('error', (err) => {
                     ws.send(`SSH Connection Error: ${err.message}\r\n`);
                }).on('close', () => {
                    console.log('SSH Client :: close');
                    ws.close();
                }).connect({
                    host,
                    port: 22, // SSH port is almost always 22
                    username: user,
                    password,
                    readyTimeout: 20000
                });
            } else if (msg.type === 'data') {
                stream && stream.write(msg.data);
            } else if (msg.type === 'resize') {
                 stream && stream.setWindow(msg.rows, msg.cols);
            }
        } catch (e) {
            console.error("WS message parse error:", e);
        }
    });

    ws.on('close', () => {
        console.log('WS Client disconnected');
        conn.end();
    });
});