const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');

const app = express();
const port = 3002;

// Allow requests from the frontend server's origin
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // In development, the origin is likely http://localhost:3001 or an IP address.
        // We can be flexible here.
        const allowedOrigins = [
            'http://localhost:3001',
            `http://${process.env.HOST_IP || 'localhost'}:3001`,
        ];
        
        const isAllowed = allowedOrigins.some(allowedOrigin => origin.startsWith(allowedOrigin.substring(0, allowedOrigin.lastIndexOf(':'))));
        
        if (isAllowed || !origin) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked origin - ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Main proxy route for all MikroTik API calls
app.all('/api/mikrotik/*', async (req, res) => {
    const {
        'x-router-host': host,
        'x-router-user': user,
        'x-router-password': password,
        'x-router-port': routerPort,
    } = req.headers;

    if (!host || !user || !routerPort) {
        return res.status(400).json({
            message: 'Missing router credentials in request headers (X-Router-Host, X-Router-User, X-Router-Port).',
            details: {}
        });
    }

    const path = req.path.replace('/api/mikrotik', '/rest');
    const isSsl = parseInt(routerPort, 10) === 443 || parseInt(routerPort, 10) === 8729;
    const protocol = isSsl ? 'https' : 'http';
    const url = `${protocol}://${host}:${routerPort}${path}`;

    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            auth: {
                username: user,
                password: password || '',
            },
            // For HTTPS, we need to ignore self-signed certificates which are common on routers
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            timeout: 10000, // 10 second timeout
        });

        // Forward the status code and data from the MikroTik router
        res.status(response.status).json(response.data);

    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error(`[${host}] API Error on ${req.method} ${path}: Status ${error.response.status}`, error.response.data);
                res.status(error.response.status).json({
                    message: error.response.data?.message || 'Router API error',
                    details: error.response.data?.detail || error.response.data || 'No further details.',
                    path: path,
                });
            } else if (error.request) {
                // The request was made but no response was received
                 console.error(`[${host}] No response from router on ${req.method} ${url}`, error.message);
                 res.status(504).json({
                     message: `No response from the router at ${host}. Please check the host address, port, and network connection.`,
                     details: `Error: ${error.code}`,
                     path: path,
                 });
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error(`[${host}] Request setup error on ${req.method} ${url}`, error.message);
                res.status(500).json({
                    message: 'Internal error setting up the request to the router.',
                    details: error.message,
                    path: path,
                });
            }
        } else {
             console.error(`[${host}] Unknown server error on ${req.method} ${url}`, error);
             res.status(500).json({ message: 'An unknown server error occurred.' });
        }
    }
});


app.listen(port, () => {
    console.log(`MikroTik API Backend running. Listening for requests from the UI on port ${port}.`);
});
