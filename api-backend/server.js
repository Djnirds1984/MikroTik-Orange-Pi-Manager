const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios');

const app = express();
const port = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// --- Helper Functions ---

const createApiClient = (routerConfig) => {
    const isSsl = routerConfig.port === 443 || String(routerConfig.port).endsWith('443');
    const protocol = isSsl ? 'https' : 'http';
    const baseURL = `${protocol}://${routerConfig.host}:${routerConfig.port}/rest`;

    return axios.create({
        baseURL,
        auth: {
            username: routerConfig.user,
            password: routerConfig.password || '',
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false // Allow self-signed certificates
        }),
        timeout: 10000, // 10 second timeout
    });
};

const handleApiRequest = async (req, res, handler) => {
    const { routerConfig } = req.body;
    if (!routerConfig) {
        return res.status(400).json({ message: 'Router configuration is missing.' });
    }

    const apiClient = createApiClient(routerConfig);
    try {
        const result = await handler(apiClient, req.body);
        res.json(result);
    } catch (error) {
        let errorMessage = 'An unknown API error occurred';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                errorMessage = error.response.data?.detail || error.response.data?.message || `Request failed with status ${error.response.status}`;
            } else if (error.request) {
                errorMessage = 'No response from router. Check host, port, and firewall.';
            } else {
                errorMessage = error.message;
            }
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        console.error(`API Error on ${req.path}:`, errorMessage, error);
        res.status(500).json({ message: `MikroTik REST API Error: ${errorMessage}` });
    }
};

// --- API Endpoints ---

app.post('/api/test-connection', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        const response = await api.get('/system/resource');
        const resource = Array.isArray(response.data) ? response.data[0] : response.data;
        return { success: true, message: `Successfully connected to ${resource['board-name']}!` };
    });
});

app.post('/api/system-info', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        const [resourceRes, routerboardRes] = await Promise.all([
            api.get('/system/resource'),
            api.get('/system/routerboard'),
        ]);
        const resource = Array.isArray(resourceRes.data) ? resourceRes.data[0] : resourceRes.data;
        const routerboard = Array.isArray(routerboardRes.data) ? routerboardRes.data[0] : routerboardRes.data;
        
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
        const interfacesRes = await api.get('/interface');
        const interfaces = interfacesRes.data;
        const interfaceNames = interfaces.map(i => i.name).join(',');

        const monitorRes = await api.post('/interface/monitor-traffic', {
            interface: interfaceNames,
            once: "",
        });
        
        return monitorRes.data.map(iface => {
            const originalIface = interfaces.find(i => i.name === iface.name);
            return {
                name: iface.name,
                type: originalIface?.type || 'unknown',
                rxRate: parseInt(iface['rx-bits-per-second'], 10),
                txRate: parseInt(iface['tx-bits-per-second'], 10),
            };
        });
    });
});

app.post('/api/hotspot-clients', (req, res) => {
    handleApiRequest(req, res, async (api) => {
        try {
            const response = await api.get('/ip/hotspot/active');
            return response.data.map(client => ({
                macAddress: client['mac-address'],
                uptime: client.uptime,
                signal: client['signal-strength'] || 'N/A',
            }));
        } catch (e) {
            return []; // Hotspot package might not be installed
        }
    });
});

// Generic CRUD handlers
const getData = (path) => (api) => api.get(path).then(res => res.data);
const addData = (path) => (api, body) => api.put(path, body.data);
const updateData = (path) => (api, body) => api.patch(`${path}/${body.data.id}`, body.data);
const deleteData = (path) => (api, body) => api.delete(`${path}/${body.id}`);

// PPPoE Profiles
app.post('/api/ppp/profiles', (req, res) => handleApiRequest(req, res, getData('/ppp/profile')));
app.post('/api/ip/pools', (req, res) => handleApiRequest(req, res, getData('/ip/pool')));
app.post('/api/ppp/profiles/add', (req, res) => handleApiRequest(req, res, (api, body) => api.put('/ppp/profile', body.profileData)));
app.post('/api/ppp/profiles/update', (req, res) => handleApiRequest(req, res, (api, body) => api.patch(`/ppp/profile/${body.profileData.id}`, body.profileData)));
app.post('/api/ppp/profiles/delete', (req, res) => handleApiRequest(req, res, (api, body) => api.delete(`/ppp/profile/${body.profileId}`)));

// PPPoE Secrets (Users)
app.post('/api/ppp/secrets', (req, res) => handleApiRequest(req, res, getData('/ppp/secret')));
app.post('/api/ppp/active', (req, res) => handleApiRequest(req, res, getData('/ppp/active')));
app.post('/api/ppp/secrets/add', (req, res) => handleApiRequest(req, res, (api, body) => api.put('/ppp/secret', body.secretData)));
app.post('/api/ppp/secrets/update', (req, res) => handleApiRequest(req, res, (api, body) => api.patch(`/ppp/secret/${body.secretData.id}`, body.secretData)));
app.post('/api/ppp/secrets/delete', (req, res) => handleApiRequest(req, res, (api, body) => api.delete(`/ppp/secret/${body.secretId}`)));


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

        // 1. Update secret comment
        await api.patch(`/ppp/secret/${secret.id}`, { comment: newComment });

        try {
            const scriptName = `expire-${secret.name}`;
            const schedulerName = `sched-expire-${secret.name}`;
            const scriptContent = `/ppp secret set [find where name="${secret.name}"] profile="${nonPaymentProfile}"`;

            // 2. Upsert Script
            const scriptRes = await api.get(`/system/script?name=${scriptName}`);
            if (scriptRes.data.length > 0) {
                await api.patch(`/system/script/${scriptRes.data[0]['.id']}`, { source: scriptContent });
            } else {
                await api.put('/system/script', { name: scriptName, source: scriptContent });
            }

            // 3. Upsert Scheduler
            const schedulerRes = await api.get(`/system/scheduler?name=${schedulerName}`);
            const formattedDueDate = formatSchedulerDate(newDueDate);
            if (schedulerRes.data.length > 0) {
                await api.patch(`/system/scheduler/${schedulerRes.data[0]['.id']}`, { 'start-date': formattedDueDate, 'on-event': scriptName });
            } else {
                await api.put('/system/scheduler', { name: schedulerName, 'start-date': formattedDueDate, 'start-time': '00:00:01', interval: '0s', 'on-event': scriptName });
            }
        } catch (e) {
            console.error("Could not update scheduler (this is non-critical). Error:", e.response?.data?.detail || e.message);
        }

        return { success: true, message: 'Payment processed.' };
    });
});


// Start Server
app.listen(port, () => {
    console.log(`MikroTik REST API Backend running. Awaiting requests from UI on port 3001.`);
});
