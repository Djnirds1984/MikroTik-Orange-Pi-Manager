const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Helper to convert camelCase to kebab-case for MikroTik API
const camelToKebab = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(camelToKebab);
    }
    return Object.keys(obj).reduce((acc, key) => {
        const kebabKey = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
        acc[kebabKey] = camelToKebab(obj[key]);
        return acc;
    }, {});
};

// Helper to create a configured axios instance for a specific router
const createApiClient = (routerConfig) => {
    const { host, port, user, password } = routerConfig;
    const protocol = port === 443 ? 'https' : 'http';
    const baseURL = `${protocol}://${host}:${port}/rest`;

    return axios.create({
        baseURL,
        auth: {
            username: user,
            password: password || '',
        },
        // Allow self-signed certificates, common on MikroTik routers
        httpsAgent: new https.Agent({
            rejectUnauthorized: false
        })
    });
};

// Generic handler for API requests to reduce boilerplate
const handleApiRequest = async (req, res, callback) => {
    try {
        const { routerConfig } = req.body;
        if (!routerConfig) {
            return res.status(400).json({ message: "Router configuration is missing." });
        }
        const apiClient = createApiClient(routerConfig);
        await callback(apiClient);
    } catch (error) {
        console.error('API Request Error:', error.response ? error.response.data : error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || error.response?.data?.detail || error.message || "An unexpected error occurred.";
        res.status(status).json({ message: `MikroTik REST API Error: ${message}` });
    }
};

// --- API Endpoints ---

app.post('/api/test-connection', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.get('/system/resource');
        if (response.data) {
            res.status(200).json({ success: true, message: `Connection successful! Board: ${response.data['board-name']}` });
        } else {
            throw new Error('Received an empty response from the router.');
        }
    });
});

app.post('/api/system-info', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const resource = (await apiClient.get('/system/resource')).data;
        const routerboard = (await apiClient.get('/system/routerboard')).data;
        res.status(200).json({
            boardName: resource['board-name'],
            version: resource.version,
            cpuLoad: resource['cpu-load'],
            uptime: resource.uptime,
            memoryUsage: Math.round(((resource['total-memory'] - resource['free-memory']) / resource['total-memory']) * 100),
            totalMemory: `${(resource['total-memory'] / 1024 / 1024).toFixed(2)} MiB`,
        });
    });
});

app.post('/api/interfaces', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.post('/interface/monitor', { "once": "", "interface": "all" });
        const interfaces = response.data.map(iface => ({
            name: iface.name,
            type: iface.type,
            rxRate: parseInt(iface['rx-bits-per-second'], 10),
            txRate: parseInt(iface['tx-bits-per-second'], 10),
        }));
        res.status(200).json(interfaces);
    });
});

app.post('/api/hotspot-clients', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        // This is a placeholder as REST API doesn't have a direct equivalent for active hotspot signal strength easily.
        // We will return an empty array to prevent dashboard errors. A more complex script might be needed on the router side.
        res.status(200).json([]);
    });
});

// --- PPPoE Profiles ---
app.post('/api/ppp/profiles', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.get('/ppp/profile');
        res.status(200).json(response.data.map(p => ({ ...p, id: p['.id'] })));
    });
});

app.post('/api/ppp/profiles/add', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { profileData } = req.body;
        const response = await apiClient.put('/ppp/profile', camelToKebab(profileData));
        res.status(201).json(response.data);
    });
});

app.post('/api/ppp/profiles/update', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { profileData } = req.body;
        const profileId = profileData.id;
        delete profileData.id; // MikroTik API uses .id in the URL, not the body for updates
        const response = await apiClient.patch(`/ppp/profile/${profileId}`, camelToKebab(profileData));
        res.status(200).json(response.data);
    });
});

app.post('/api/ppp/profiles/delete', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { profileId } = req.body;
        await apiClient.delete(`/ppp/profile/${profileId}`);
        res.status(204).send();
    });
});

// --- IP Pools ---
app.post('/api/ip/pools', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.get('/ip/pool');
        res.status(200).json(response.data.map(p => ({ ...p, id: p['.id'] })));
    });
});

// --- PPPoE Secrets ---
app.post('/api/ppp/secrets', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.get('/ppp/secret');
        res.status(200).json(response.data.map(s => ({ ...s, id: s['.id'] })));
    });
});

app.post('/api/ppp/active', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.get('/ppp/active');
        res.status(200).json(response.data.map(a => ({ ...a, id: a['.id'] })));
    });
});

app.post('/api/ppp/secrets/add', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { secretData } = req.body;
        const response = await apiClient.put('/ppp/secret', camelToKebab(secretData));
        res.status(201).json(response.data);
    });
});

app.post('/api/ppp/secrets/update', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { secretData } = req.body;
        const secretId = secretData.id;
        delete secretData.id;
        const response = await apiClient.patch(`/ppp/secret/${secretId}`, camelToKebab(secretData));
        res.status(200).json(response.data);
    });
});

app.post('/api/ppp/secrets/delete', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { secretId } = req.body;
        await apiClient.delete(`/ppp/secret/${secretId}`);
        res.status(204).send();
    });
});

// --- Payment Processing ---
const formatDateForMikroTik = (date) => {
    const d = new Date(date);
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months[d.getUTCMonth()];
    const day = String(d.getUTCDate()).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${month}/${day}/${year}`;
};

app.post('/api/ppp/process-payment', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { secret, plan, nonPaymentProfile, discountDays, paymentDate } = req.body;

        const currentDueDate = secret.comment ? JSON.parse(secret.comment).dueDate : null;
        const startDate = new Date(currentDueDate && new Date(currentDueDate) > new Date() ? currentDueDate : paymentDate);
        const newDueDate = new Date(startDate);
        newDueDate.setDate(newDueDate.getDate() + 30);

        const newComment = JSON.stringify({
            plan: plan.name,
            dueDate: newDueDate.toISOString().split('T')[0],
        });

        // 1. Update the user's secret with new due date and ensure they are on the correct profile
        await apiClient.patch(`/ppp/secret/${secret['.id']}`, {
            comment: newComment,
            profile: plan.pppoeProfile,
        });

        // 2. Create/Update the script that will disable the user
        const scriptName = `expire-${secret.name}`;
        const scriptSource = `/ppp secret set [find where name="${secret.name}"] profile="${nonPaymentProfile}"`;
        const existingScripts = await apiClient.get(`/system/script?name=${scriptName}`);
        if (existingScripts.data.length > 0) {
            await apiClient.patch(`/system/script/${existingScripts.data[0]['.id']}`, { source: scriptSource });
        } else {
            await apiClient.put('/system/script', { name: scriptName, source: scriptSource });
        }

        // 3. Create/Update the scheduler to run the script
        const schedulerName = `expire-sched-${secret.name}`;
        const formattedStartDate = formatDateForMikroTik(newDueDate);
        const existingSchedulers = await apiClient.get(`/system/scheduler?name=${schedulerName}`);
        if (existingSchedulers.data.length > 0) {
            await apiClient.patch(`/system/scheduler/${existingSchedulers.data[0]['.id']}`, {
                'start-date': formattedStartDate,
                'on-event': scriptName
            });
        } else {
            await apiClient.put('/system/scheduler', {
                name: schedulerName,
                'start-date': formattedStartDate,
                'start-time': '00:00:01',
                interval: '0s',
                'on-event': scriptName,
            });
        }

        res.status(200).json({ success: true, message: 'Payment processed successfully.' });
    });
});

// --- ZeroTier ---
app.post('/api/zerotier', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const response = await apiClient.get('/zerotier');
        res.status(200).json(response.data.map(zt => ({ ...zt, id: zt['.id'] })));
    });
});

app.post('/api/zerotier/add', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { networkId } = req.body;
        const response = await apiClient.put('/zerotier', {
            "network": networkId,
            "disabled": "false"
        });
        res.status(201).json(response.data);
    });
});

app.post('/api/zerotier/update', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { interfaceId, disabled } = req.body;
        const response = await apiClient.patch(`/zerotier/${interfaceId}`, { disabled });
        res.status(200).json(response.data);
    });
});

app.post('/api/zerotier/delete', (req, res) => {
    handleApiRequest(req, res, async (apiClient) => {
        const { interfaceId } = req.body;
        await apiClient.delete(`/zerotier/${interfaceId}`);
        res.status(204).send();
    });
});


app.listen(port, () => {
    console.log(`MikroTik Manager API backend running. Listening on port ${port}`);
});