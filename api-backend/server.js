const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// --- Helper Functions ---

// Converts camelCase to kebab-case for MikroTik API compatibility
const camelToKebab = (str) => str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

// Converts object keys from camelCase to kebab-case recursively
const convertKeysToKebab = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(convertKeysToKebab);
    return Object.keys(obj).reduce((acc, key) => {
        acc[camelToKebab(key)] = obj[key];
        return acc;
    }, {});
};

// Main request handler to create API instance and handle errors
const handleApiRequest = async (req, res, callback) => {
    const { routerConfig } = req.body;
    if (!routerConfig) {
        return res.status(400).json({ message: 'Router configuration is missing.' });
    }

    const { host, user, password, port } = routerConfig;
    const protocol = [443, 8729].includes(port) ? 'https' : 'http';
    
    const api = axios.create({
        baseURL: `${protocol}://${host}:${port}`,
        auth: {
            username: user,
            password: password || '',
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    try {
        await callback(api, req, res);
    } catch (error) {
        console.error(`API Error for ${host}:`, { 
            status: error.response?.status, 
            data: error.response?.data,
            message: error.message 
        });
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || error.response?.data?.detail || 'An unexpected error occurred on the API backend.';
        res.status(status).json({ message: `MikroTik REST API Error: ${message}` });
    }
};

// --- API Endpoints ---

app.post('/api/test-connection', (req, res) => handleApiRequest(req, res, async (api) => {
    const response = await api.get('/rest/system/identity');
    res.json({ success: true, message: `Connection successful! Router name: ${response.data.name}` });
}));

app.post('/api/system-info', (req, res) => handleApiRequest(req, res, async (api) => {
    const [resourceRes, routerboardRes] = await Promise.all([
        api.get('/rest/system/resource'),
        api.get('/rest/routerboard'),
    ]);
    const resource = resourceRes.data;
    res.json({
        boardName: resource['board-name'],
        version: resource.version,
        cpuLoad: resource['cpu-load'],
        uptime: resource.uptime,
        totalMemory: `${Math.round(resource['total-memory'] / 1024 / 1024)} MB`,
        memoryUsage: Math.round(((resource['total-memory'] - resource['free-memory']) / resource['total-memory']) * 100),
    });
}));

app.post('/api/interfaces', (req, res) => handleApiRequest(req, res, async (api) => {
    const response = await api.post('/rest/interface/monitor', { once: true });
    res.json(response.data.map(iface => ({
        name: iface.name,
        type: iface.type,
        rxRate: parseInt(iface['rx-bits-per-second'], 10),
        txRate: parseInt(iface['tx-bits-per-second'], 10),
    })));
}));

app.post('/api/hotspot-clients', (req, res) => handleApiRequest(req, res, async (api) => {
    try {
        const response = await api.get('/rest/ip/hotspot/active');
        res.json(response.data.map(client => ({
            macAddress: client['mac-address'],
            uptime: client.uptime,
            signal: client['signal-strength'] || 'N/A',
        })));
    } catch (error) {
        if (error.response?.status === 404) return res.json([]);
        throw error;
    }
}));

// --- PPPoE Profile Endpoints ---
app.post('/api/ppp/profiles', (req, res) => handleApiRequest(req, res, async (api) => {
    const response = await api.get('/rest/ppp/profile');
    res.json(response.data.map(p => ({
        id: p['.id'], name: p.name, localAddress: p['local-address'],
        remoteAddress: p['remote-address'], rateLimit: p['rate-limit'],
    })));
}));

app.post('/api/ppp/profiles/add', (req, res) => handleApiRequest(req, res, async (api) => {
    const { profileData } = req.body;
    const response = await api.put('/rest/ppp/profile', convertKeysToKebab(profileData));
    res.status(201).json(response.data);
}));

app.post('/api/ppp/profiles/update', (req, res) => handleApiRequest(req, res, async (api) => {
    const { profileData } = req.body;
    const { id, ...dataToUpdate } = profileData;
    const response = await api.patch(`/rest/ppp/profile/${id}`, convertKeysToKebab(dataToUpdate));
    res.json(response.data);
}));

app.post('/api/ppp/profiles/delete', (req, res) => handleApiRequest(req, res, async (api) => {
    await api.delete(`/rest/ppp/profile/${req.body.profileId}`);
    res.status(204).send();
}));

// --- IP Pool Endpoints ---
app.post('/api/ip/pools', (req, res) => handleApiRequest(req, res, async (api) => {
    const response = await api.get('/rest/ip/pool');
    res.json(response.data.map(p => ({ id: p['.id'], name: p.name })));
}));

// --- PPPoE Secret (User) Endpoints ---
app.post('/api/ppp/secrets', (req, res) => handleApiRequest(req, res, async (api) => {
    const response = await api.get('/rest/ppp/secret');
    res.json(response.data.map(s => ({
        id: s['.id'], name: s.name, service: s.service, profile: s.profile, comment: s.comment,
    })));
}));

app.post('/api/ppp/active', (req, res) => handleApiRequest(req, res, async (api) => {
    const response = await api.get('/rest/ppp/active');
    res.json(response.data.map(a => ({ id: a['.id'], name: a.name, uptime: a.uptime })));
}));

app.post('/api/ppp/secrets/add', (req, res) => handleApiRequest(req, res, async (api) => {
    const { secretData } = req.body;
    const response = await api.put('/rest/ppp/secret', convertKeysToKebab(secretData));
    res.status(201).json(response.data);
}));

app.post('/api/ppp/secrets/update', (req, res) => handleApiRequest(req, res, async (api) => {
    const { secretData } = req.body;
    const { id, ...dataToUpdate } = secretData;
    const response = await api.patch(`/rest/ppp/secret/${id}`, convertKeysToKebab(dataToUpdate));
    res.json(response.data);
}));

app.post('/api/ppp/secrets/delete', (req, res) => handleApiRequest(req, res, async (api) => {
    await api.delete(`/rest/ppp/secret/${req.body.secretId}`);
    res.status(204).send();
}));

// --- Payment Processing ---
const formatSchedulerDate = (date) => {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return `${monthNames[date.getMonth()]}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
};

app.post('/api/ppp/process-payment', (req, res) => handleApiRequest(req, res, async (api) => {
    const { secret, plan, nonPaymentProfile, paymentDate } = req.body;
    const commentData = JSON.parse(secret.comment || '{}');
    const oldDueDate = commentData.dueDate ? new Date(commentData.dueDate) : new Date(paymentDate);
    const payDate = new Date(paymentDate);

    const startDate = oldDueDate > payDate ? oldDueDate : payDate;
    const newDueDate = new Date(startDate);
    newDueDate.setDate(newDueDate.getDate() + 30);

    const newComment = JSON.stringify({ plan: plan.name, dueDate: newDueDate.toISOString().split('T')[0] });
    await api.patch(`/rest/ppp/secret/${secret.id}`, { comment: newComment });

    try {
        const scriptName = `expire-${secret.name}`;
        const schedulerName = `expire-sched-${secret.name}`;
        const scriptSource = `/ppp secret set [find where name="${secret.name}"] profile="${nonPaymentProfile}"`;

        const [scriptRes, schedRes] = await Promise.all([
            api.get('/rest/system/script', { params: { "?name": scriptName } }),
            api.get('/rest/system/scheduler', { params: { "?name": schedulerName } }),
        ]);

        if (scriptRes.data.length > 0) {
            await api.patch(`/rest/system/script/${scriptRes.data[0]['.id']}`, { source: scriptSource });
        } else {
            await api.put('/rest/system/script', { name: scriptName, source: scriptSource });
        }

        if (schedRes.data.length > 0) {
            await api.patch(`/rest/system/scheduler/${schedRes.data[0]['.id']}`, { 'start-date': formatSchedulerDate(newDueDate), 'on-event': scriptName });
        } else {
            await api.put('/rest/system/scheduler', { name: schedulerName, 'start-date': formatSchedulerDate(newDueDate), 'start-time': '00:00:01', 'on-event': scriptName });
        }
    } catch (e) {
        console.warn(`Could not update scheduler (is it installed?): ${e.message}`);
    }

    res.json({ success: true, message: 'Payment processed.' });
}));


app.listen(port, () => {
    console.log(`MikroTik Manager API backend running. Listening on port ${port}`);
});
