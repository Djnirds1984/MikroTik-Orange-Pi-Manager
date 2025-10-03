const express = require('express');
const cors = require('cors');
const https = require('https');
const MikroTikAPI = require('node-mikrotik-api');

const app = express();
const port = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// --- Helper Functions ---

/**
 * Creates and configures a MikroTik API connection instance.
 * @param {object} routerConfig - The router configuration.
 * @returns {MikroTikAPI} A new MikroTik API instance.
 */
const createRouterApi = (routerConfig) => {
    const apiConfig = {
        host: routerConfig.host,
        user: routerConfig.user,
        password: routerConfig.password || '',
        port: routerConfig.port || 80,
    };
    
    // The library handles TLS internally based on port, but we can be explicit
    if (routerConfig.port === 443) {
        apiConfig.tls = true;
        apiConfig.tlsOptions = {
            rejectUnauthorized: false // Allow self-signed certificates for local devices
        };
    }

    return new MikroTikAPI(apiConfig);
};

/**
 * A robust wrapper for handling API requests. It manages the connection lifecycle
 * and sends a standardized error response on failure.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} handler - An async function that receives the API connection and performs operations.
 */
const handleApiRequest = async (req, res, handler) => {
    const { routerConfig } = req.body;
    if (!routerConfig) {
        return res.status(400).json({ message: 'Router configuration is missing.' });
    }

    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        const result = await handler(api, req.body);
        res.json(result);
    } catch (error) {
        // Errors from the library can be arrays of objects
        const errorMessage = error[0]?.message || (error instanceof Error ? error.message : 'An unknown API error occurred');
        console.error(`API Error on ${req.path}:`, errorMessage, error);
        res.status(500).json({ message: `MikroTik API Error: ${errorMessage}` });
    } finally {
        if (api.connected) {
            api.close();
        }
    }
};

// --- API Endpoints ---

// Test Connection
app.post('/api/test-connection', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        const [resource] = await api.read('/system/resource');
        return { success: true, message: `Successfully connected to ${resource['board-name']}!` };
    });
});

// Dashboard
app.post('/api/system-info', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        const [[resource], [routerboard]] = await Promise.all([
            api.read('/system/resource'),
            api.read('/system/routerboard'),
        ]);
        const totalMemoryBytes = parseInt(resource['total-memory'], 10);
        const freeMemoryBytes = parseInt(resource['free-memory'], 10);
        return {
            boardName: resource['board-name'] || 'N/A',
            version: routerboard['current-firmware'] || resource['version'] || 'N/A',
            cpuLoad: parseInt(resource['cpu-load'], 10) || 0,
            uptime: resource.uptime || 'N/A',
            memoryUsage: totalMemoryBytes > 0 ? Math.round(((totalMemoryBytes - freeMemoryBytes) / totalMemoryBytes) * 100) : 0,
            totalMemory: `${(totalMemoryBytes / 1024 / 1024).toFixed(2)} MB`,
        };
    });
});

app.post('/api/interfaces', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        const monitor = await api.write('/interface/monitor-traffic', {
            interface: (await api.read('/interface')).map(i => i.name).join(','),
            once: true,
        });
        return monitor.map(iface => ({
            name: iface.name,
            type: iface.type, // Note: monitor-traffic might not return type, this is an assumption
            rxRate: parseInt(iface['rx-bits-per-second'], 10),
            txRate: parseInt(iface['tx-bits-per-second'], 10),
        }));
    });
});

app.post('/api/hotspot-clients', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        try {
            const clients = await api.read('/ip/hotspot/active');
            return clients.map(client => ({
                macAddress: client['mac-address'],
                uptime: client.uptime,
                signal: client['signal-strength'] || 'N/A',
            }));
        } catch (e) {
            return []; // Hotspot package might not be installed
        }
    });
});

// PPPoE Profiles
app.post('/api/ppp/profiles', (req, res) => handleApiRequest(req, res, api => api.read('/ppp/profile')));
app.post('/api/ip/pools', (req, res) => handleApiRequest(req, res, api => api.read('/ip/pool')));

const formatProfileDataForApi = (data) => ({
    name: data.name,
    'local-address': data.localAddress || undefined,
    'remote-address': data.remoteAddress || undefined,
    'rate-limit': data.rateLimit || undefined,
});

app.post('/api/ppp/profiles/add', (req, res) => {
    handleApiRequest(req, res, (api, body) => api.write('/ppp/profile/add', formatProfileDataForApi(body.profileData)));
});

app.post('/api/ppp/profiles/update', (req, res) => {
    handleApiRequest(req, res, (api, body) => {
        const { id, ...rest } = body.profileData;
        return api.write('/ppp/profile/set', { '.id': id, ...formatProfileDataForApi(rest) });
    });
});

app.post('/api/ppp/profiles/delete', (req, res) => {
    handleApiRequest(req, res, (api, body) => api.write('/ppp/profile/remove', { '.id': body.profileId }));
});

// PPPoE Secrets (Users)
app.post('/api/ppp/secrets', (req, res) => handleApiRequest(req, res, api => api.read('/ppp/secret')));
app.post('/api/ppp/active', (req, res) => handleApiRequest(req, res, api => api.read('/ppp/active')));

const formatSecretDataForApi = (data) => {
    const apiData = {
        name: data.name,
        service: data.service || 'pppoe',
        profile: data.profile,
        comment: data.comment || undefined,
    };
    if (data.password) {
        apiData.password = data.password;
    }
    return apiData;
};

app.post('/api/ppp/secrets/add', (req, res) => {
    handleApiRequest(req, res, (api, body) => api.write('/ppp/secret/add', formatSecretDataForApi(body.secretData)));
});

app.post('/api/ppp/secrets/update', (req, res) => {
    handleApiRequest(req, res, (api, body) => {
        const { id, ...rest } = body.secretData;
        return api.write('/ppp/secret/set', { '.id': id, ...formatSecretDataForApi(rest) });
    });
});

app.post('/api/ppp/secrets/delete', (req, res) => {
    handleApiRequest(req, res, (api, body) => api.write('/ppp/secret/remove', { '.id': body.secretId }));
});

// Payment Processing
const formatSchedulerDate = (date) => {
  const d = new Date(date);
  const month = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

const parseComment = (comment) => {
    if (!comment) return {};
    try { return JSON.parse(comment); } catch { return {}; }
};

app.post('/api/ppp/process-payment', (req, res) => {
    handleApiRequest(req, res, async (api, body) => {
        const { secret, plan, nonPaymentProfile, paymentDate } = body;

        const commentData = parseComment(secret.comment);
        const startDate = new Date(commentData.dueDate && new Date(commentData.dueDate) > new Date() ? commentData.dueDate : paymentDate);
        
        const newDueDate = new Date(startDate);
        newDueDate.setDate(newDueDate.getDate() + 30);
        
        const newComment = JSON.stringify({
            plan: plan.name,
            dueDate: newDueDate.toISOString().split('T')[0],
        });

        await api.write('/ppp/secret/set', { '.id': secret.id, comment: newComment });

        try {
            const scriptName = `expire-${secret.name}`;
            const schedulerName = `sched-expire-${secret.name}`;
            const scriptContent = `/ppp secret set [find where name="${secret.name}"] profile="${nonPaymentProfile}"`;

            const [existingScript] = await api.write('/system/script/print', { "?name": scriptName });
            if (existingScript) {
                await api.write('/system/script/set', { '.id': existingScript['.id'], source: scriptContent });
            } else {
                await api.write('/system/script/add', { name: scriptName, source: scriptContent });
            }

            const [existingScheduler] = await api.write('/system/scheduler/print', { "?name": schedulerName });
            const formattedDueDate = formatSchedulerDate(newDueDate);
            if (existingScheduler) {
                await api.write('/system/scheduler/set', { '.id': existingScheduler['.id'], 'start-date': formattedDueDate, 'on-event': scriptName });
            } else {
                await api.write('/system/scheduler/add', { name: schedulerName, 'start-date': formattedDueDate, 'start-time': '00:00:01', interval: '0s', 'on-event': scriptName });
            }
        } catch (e) {
            console.error("Could not update scheduler (this is non-critical). Error:", e[0]?.message || e.message);
        }

        return { success: true, message: 'Payment processed.' };
    });
});

// Start Server
app.listen(port, () => {
    console.log(`MikroTik API Backend running. Awaiting requests from UI on port 3001.`);
});