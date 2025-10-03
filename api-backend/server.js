const express = require('express');
const https = require('https');
const cors = require('cors');
const { NodeMikrotik } = require('node-mikrotik-api');

const app = express();
const port = 3002;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json());

// Helper to create MikroTik API connection
const createRouterApi = (config) => {
    return new NodeMikrotik({
        host: config.host,
        user: config.user,
        password: config.password,
        port: config.port,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Allow self-signed certificates
    });
};

// Generic API error handler
const handleApiError = (res, error, context) => {
    console.error(`API Error in ${context}:`, error);
    const message = error.message || 'An unknown error occurred';
    res.status(500).json({ message: `MikroTik API Error: ${message}` });
};

// A generic helper to execute commands on the router
const apiRequest = async (res, routerConfig, endpoint, data = {}, method = 'GET') => {
    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        let result;
        if (method === 'GET') {
            result = await api.read(endpoint, data);
        } else if (method === 'POST') {
             // For 'add' commands, data should be an array of one object
            result = await api.write(endpoint, [data]);
        } else if (method === 'PATCH') {
            // For 'set' commands, data is just the object of properties to change
            result = await api.write(endpoint, data);
        } else if (method === 'DELETE') {
            // For 'remove' commands, endpoint includes the ID
            result = await api.write(endpoint, {});
        }
        res.json(result || { success: true });
    } catch (error) {
        handleApiError(res, error, `${method} request to ${endpoint}`);
    } finally {
        if (api.connected) {
            api.close();
        }
    }
};


// --- API Endpoints ---

app.post('/api/test-connection', async (req, res) => {
    const { routerConfig } = req.body;
    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        res.json({ success: true, message: 'Connection successful!' });
    } catch (error) {
        res.status(500).json({ success: false, message: `Connection failed: ${error.message}` });
    } finally {
        if (api.connected) api.close();
    }
});

// Dashboard Data
app.post('/api/system-info', async (req, res) => {
    const { routerConfig } = req.body;
    const api = createRouterApi(routerConfig);
    try {
        await api.connect();
        const [resource, routerboard] = await Promise.all([
            api.read('/system/resource'),
            api.read('/system/routerboard'),
        ]);

        const totalMemory = resource[0]?.['total-memory'] ? `${Math.round(resource[0]['total-memory'] / 1024 / 1024)} MB` : 'N/A';
        const freeMemory = resource[0]?.['free-memory'] || 0;
        const memoryUsage = resource[0]?.['total-memory'] ? Math.round(((resource[0]['total-memory'] - freeMemory) / resource[0]['total-memory']) * 100) : 0;
        
        res.json({
            boardName: resource[0]?.['board-name'] || routerboard[0]?.model || 'N/A',
            version: resource[0]?.version || 'N/A',
            cpuLoad: resource[0]?.['cpu-load'] || 0,
            uptime: resource[0]?.uptime || 'N/A',
            totalMemory: totalMemory,
            memoryUsage: memoryUsage,
        });
    } catch (error) {
         handleApiError(res, error, 'fetching system info');
    } finally {
        if (api.connected) api.close();
    }
});

app.post('/api/interfaces', (req, res) => apiRequest(res, req.body.routerConfig, '/interface'));
app.post('/api/hotspot-clients', (req, res) => apiRequest(res, req.body.routerConfig, '/ip/hotspot/active'));

// PPPoE Profiles
app.post('/api/ppp/profiles', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/profile'));
app.post('/api/ip/pools', (req, res) => apiRequest(res, req.body.routerConfig, '/ip/pool'));
app.post('/api/ppp/profiles/add', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/profile', req.body.profileData, 'POST'));
app.post('/api/ppp/profiles/update', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/profile/${req.body.profileData.id}`, req.body.profileData, 'PATCH'));
app.post('/api/ppp/profiles/delete', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/profile/${req.body.profileId}`, {}, 'DELETE'));

// PPPoE Secrets
app.post('/api/ppp/secrets', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/secret'));
app.post('/api/ppp/active', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/active'));
app.post('/api/ppp/secrets/add', (req, res) => apiRequest(res, req.body.routerConfig, '/ppp/secret', req.body.secretData, 'POST'));
app.post('/api/ppp/secrets/update', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/secret/${req.body.secretData.id}`, req.body.secretData, 'PATCH'));
app.post('/api/ppp/secrets/delete', (req, res) => apiRequest(res, req.body.routerConfig, `/ppp/secret/${req.body.secretId}`, {}, 'DELETE'));

// Payment Processing
app.post('/api/ppp/process-payment', async (req, res) => {
    const { routerConfig, secret, plan, nonPaymentProfile, discountDays, paymentDate } = req.body;
    const api = createRouterApi(routerConfig);

    try {
        await api.connect();
        const commentData = JSON.parse(secret.comment || '{}');
        const payDate = new Date(paymentDate);
        let newDueDate;

        if (commentData.dueDate) {
            const currentDueDate = new Date(commentData.dueDate);
            if (currentDueDate > payDate) {
                newDueDate = new Date(currentDueDate.setDate(currentDueDate.getDate() + 30));
            } else {
                newDueDate = new Date(payDate.setDate(payDate.getDate() + 30));
            }
        } else {
            newDueDate = new Date(payDate.setDate(payDate.getDate() + 30));
        }
        
        const newDueDateString = newDueDate.toISOString().split('T')[0];
        const updatedComment = JSON.stringify({ ...commentData, plan: plan.name, dueDate: newDueDateString });

        // 1. Update the secret's comment first (critical path)
        await api.write(`/ppp/secret/${secret.id}`, { comment: updatedComment });

        // 2. Manage automation (secondary path, must be fault-tolerant)
        try {
            const scriptName = `expire-${secret.name}`;
            const schedulerName = `sched-expire-${secret.name}`;

            const [existingScript, existingScheduler] = await Promise.all([
                api.read('/system/script', { "?name": scriptName }),
                api.read('/system/scheduler', { "?name": schedulerName })
            ]);

            if (existingScript.length > 0) await api.write(`/system/script/${existingScript[0]['.id']}`, {}, 'DELETE');
            if (existingScheduler.length > 0) await api.write(`/system/scheduler/${existingScheduler[0]['.id']}`, {}, 'DELETE');
            
            const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;
            await api.write('/system/script', [{ name: scriptName, source: scriptSource }]);

            const startDate = new Date(newDueDateString);
            const mikrotikDate = `${startDate.toLocaleString('default', { month: 'short' }).toLowerCase()}/${String(startDate.getDate()).padStart(2, '0')}/${startDate.getFullYear()}`;
            
            await api.write('/system/scheduler', [{
                name: schedulerName, 'start-date': mikrotikDate, 'start-time': '00:01:00',
                interval: '0s', 'on-event': scriptName,
            }]);
        } catch (automationError) {
             console.warn(`Payment recorded for ${secret.name}, but scheduler setup failed:`, automationError.message);
             // Do not throw to client, as the core payment logic succeeded.
        }

        res.json({ success: true, message: 'Payment processed successfully.' });
    } catch (error) {
        handleApiError(res, error, `processing payment for ${secret.name}`);
    } finally {
        if (api.connected) api.close();
    }
});


app.listen(port, () => {
    console.log(`MikroTik API Backend running. Listening on http://localhost:${port}`);
});
