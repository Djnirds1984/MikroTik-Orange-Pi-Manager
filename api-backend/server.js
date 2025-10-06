const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const port = 3002;

app.use(cors());
app.use(express.json());

// Diagnostic endpoint to confirm the server is running
app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'MikroTik API Backend is running.' });
});

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
const handleApiRequest = async (req, res, next, callback) => {
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
        
        // Pass the error to the global error handler
        const err = new Error(`MikroTik REST API Error: ${message}`);
        err.status = status;
        next(err);
    }
};

// --- API Endpoints ---

app.post('/api/test-connection', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/system/resource');
        if (response.data) {
            res.status(200).json({ success: true, message: `Connection successful! Board: ${response.data['board-name']}` });
        } else {
            throw new Error('Received an empty response from the router.');
        }
    });
});

app.post('/api/system-info', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const resource = (await apiClient.get('/system/resource')).data;
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

app.post('/api/interfaces', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const interfacesResponse = await apiClient.get('/interface');
        const allInterfaces = interfacesResponse.data;

        if (!allInterfaces || !Array.isArray(allInterfaces)) {
            return res.status(200).json([]);
        }

        const activeInterfaceNames = allInterfaces
            .filter(iface => iface.disabled === 'false' && iface.name)
            .map(iface => iface.name);

        let monitoredDataMap = new Map();
        
        // FIX: Changed from the incorrect '/interface/monitor' to the correct '/interface/monitor-traffic' endpoint.
        // This is the proper endpoint for fetching live traffic statistics and resolves the 400 errors.
        if (activeInterfaceNames.length > 0) {
            const monitorPromises = activeInterfaceNames.map(name =>
                apiClient.post('/interface/monitor-traffic', {
                    "once": "",
                    "interface": name
                }).catch(err => {
                    // This is not a critical error, just log it. The interface will show 0bps.
                    console.warn(`Could not monitor interface "${name}": ${err.message}`);
                    return null; // Return null so Promise.all doesn't reject
                })
            );

            const results = await Promise.all(monitorPromises);
            
            // Filter out any failed requests and flatten the array of results.
            // Each successful result.data is an array containing a single monitor object.
            const successfulMonitors = results
                .filter(r => r && r.data && Array.isArray(r.data))
                .flatMap(r => r.data);

            if (successfulMonitors.length > 0) {
                monitoredDataMap = new Map(successfulMonitors.map(m => [m.name, m]));
            }
        }

        const interfaces = allInterfaces.map(iface => {
            const monitoredData = monitoredDataMap.get(iface.name);
            return {
                name: iface.name,
                type: iface.type,
                rxRate: monitoredData ? parseInt(monitoredData['rx-bits-per-second'], 10) || 0 : 0,
                txRate: monitoredData ? parseInt(monitoredData['tx-bits-per-second'], 10) || 0 : 0,
            };
        });

        res.status(200).json(interfaces);
    });
});


// --- Hotspot Endpoints ---
app.post('/api/hotspot/active', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ip/hotspot/active');
        const activeUsers = Array.isArray(response.data) ? response.data : [];
        const data = activeUsers.map(u => ({
            id: u['.id'],
            user: u.user,
            address: u.address,
            macAddress: u['mac-address'],
            uptime: u.uptime,
            bytesIn: parseInt(u['bytes-in'], 10) || 0,
            bytesOut: parseInt(u['bytes-out'], 10) || 0,
            comment: u.comment,
        }));
        res.status(200).json(data);
    });
});

app.post('/api/hotspot/hosts', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ip/hotspot/host');
        const hosts = Array.isArray(response.data) ? response.data : [];
        const data = hosts.map(h => ({
            id: h['.id'],
            macAddress: h['mac-address'],
            address: h.address,
            toAddress: h['to-address'],
            authorized: h.authorized === 'true',
            bypassed: h.bypassed === 'true',
            comment: h.comment,
        }));
        res.status(200).json(data);
    });
});

app.post('/api/hotspot/active/remove', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required.' });
        }
        await apiClient.delete(`/ip/hotspot/active/${userId}`);
        res.status(204).send();
    });
});


// --- PPPoE Profiles ---
app.post('/api/ppp/profiles', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ppp/profile');
        const profiles = Array.isArray(response.data) ? response.data : [];
        const data = profiles.map(p => {
            const {
                '.id': id,
                name,
                'local-address': localAddress,
                'remote-address': remoteAddress,
                'rate-limit': rateLimit
            } = p;
            return { id, name, localAddress, remoteAddress, rateLimit };
        });
        res.status(200).json(data);
    });
});

app.post('/api/ppp/profiles/add', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { profileData } = req.body;
        const response = await apiClient.put('/ppp/profile', camelToKebab(profileData));
        res.status(201).json(response.data);
    });
});

app.post('/api/ppp/profiles/update', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { profileData } = req.body;
        const profileId = profileData.id;
        delete profileData.id;
        const response = await apiClient.patch(`/ppp/profile/${profileId}`, camelToKebab(profileData));
        res.status(200).json(response.data);
    });
});

app.post('/api/ppp/profiles/delete', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { profileId } = req.body;
        await apiClient.delete(`/ppp/profile/${profileId}`);
        res.status(204).send();
    });
});

// --- IP Pools & Addresses ---
app.post('/api/ip/pools', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ip/pool');
        const pools = Array.isArray(response.data) ? response.data : [];
        res.status(200).json(pools.map(p => ({ ...p, id: p['.id'] })));
    });
});

app.post('/api/ip/addresses', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ip/address');
        const addresses = Array.isArray(response.data) ? response.data : [];
        const data = addresses.map(a => ({
            id: a['.id'],
            address: a.address,
            interface: a.interface,
            disabled: a.disabled
        }));
        res.status(200).json(data);
    });
});

// --- PPPoE Secrets ---

// Helper function to sanitize secret data before sending to MikroTik
const sanitizeSecretData = (data) => {
    // Delete any property that is not a valid parameter for the /ppp/secret endpoint.
    // This includes read-only properties from GET requests and client-side computed properties.
    const invalidKeys = [
        'id', '.id', 'last-logged-out', 'last-caller-id', 'caller-id', 'uptime',
        'isActive', 'activeInfo', 'customer'
    ];
    invalidKeys.forEach(key => delete data[key]);
    return data;
};

app.post('/api/ppp/secrets', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ppp/secret');
        const secrets = Array.isArray(response.data) ? response.data : [];
        res.status(200).json(secrets.map(s => ({ ...s, id: s['.id'] })));
    });
});

app.post('/api/ppp/active', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/ppp/active');
        const activeConnections = Array.isArray(response.data) ? response.data : [];
        res.status(200).json(activeConnections.map(a => ({ ...a, id: a['.id'] })));
    });
});

app.post('/api/ppp/secrets/add', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        let { secretData } = req.body;
        // Sanitize the data to remove any client-side or read-only properties
        secretData = sanitizeSecretData(secretData);
        const response = await apiClient.put('/ppp/secret', camelToKebab(secretData));
        res.status(201).json(response.data);
    });
});

app.post('/api/ppp/secrets/update', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        let { secretData } = req.body;
        const secretId = secretData.id || secretData['.id'];
        
        // Sanitize the data to remove any client-side or read-only properties
        secretData = sanitizeSecretData(secretData);

        const response = await apiClient.patch(`/ppp/secret/${secretId}`, camelToKebab(secretData));
        res.status(200).json(response.data);
    });
});

app.post('/api/ppp/secrets/delete', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
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

app.post('/api/ppp/process-payment', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { secret, plan, nonPaymentProfile, discountDays, paymentDate } = req.body;

        const currentDueDate = secret.comment ? JSON.parse(secret.comment).dueDate : null;
        const startDate = new Date(currentDueDate && new Date(currentDueDate) > new Date() ? currentDueDate : paymentDate);
        const newDueDate = new Date(startDate);
        newDueDate.setDate(newDueDate.getDate() + 30);

        const newComment = JSON.stringify({
            plan: plan.name,
            dueDate: newDueDate.toISOString().split('T')[0],
        });

        await apiClient.patch(`/ppp/secret/${secret['.id']}`, {
            comment: newComment,
            profile: plan.pppoeProfile,
        });

        const scriptName = `expire-${secret.name}`;
        const scriptSource = `/ppp secret set [find where name="${secret.name}"] profile="${nonPaymentProfile}"`;
        
        // FIX: Handle cases where the router returns a single object or nothing, preventing server crashes.
        const scriptResponse = await apiClient.get(`/system/script?name=${scriptName}`);
        const existingScripts = Array.isArray(scriptResponse.data) ? scriptResponse.data : (scriptResponse.data ? [scriptResponse.data] : []);

        if (existingScripts.length > 0) {
            await apiClient.patch(`/system/script/${existingScripts[0]['.id']}`, { source: scriptSource });
        } else {
            await apiClient.put('/system/script', { name: scriptName, source: scriptSource });
        }

        const schedulerName = `expire-sched-${secret.name}`;
        const formattedStartDate = formatDateForMikroTik(newDueDate);
        
        // FIX: Handle cases where the router returns a single object or nothing, preventing server crashes.
        const schedulerResponse = await apiClient.get(`/system/scheduler?name=${schedulerName}`);
        const existingSchedulers = Array.isArray(schedulerResponse.data) ? schedulerResponse.data : (schedulerResponse.data ? [schedulerResponse.data] : []);

        if (existingSchedulers.length > 0) {
            await apiClient.patch(`/system/scheduler/${existingSchedulers[0]['.id']}`, {
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

// --- System Management ---
app.post('/api/system/reboot', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        // The reboot command is a POST request with an empty body
        await apiClient.post('/system/reboot', {});
        res.status(200).json({ message: 'Reboot command sent to router.' });
    });
});

app.post('/api/system/ntp/client', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/system/ntp/client');
        const settings = response.data?.[0] || {}; // Usually just one config
        res.status(200).json({
            enabled: settings.enabled === 'true',
            primaryNtp: settings['primary-ntp'] || '',
            secondaryNtp: settings['secondary-ntp'] || '',
        });
    });
});

app.post('/api/system/ntp/client/set', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { settings } = req.body;
        const payload = {
            enabled: settings.enabled ? 'true' : 'false',
            'primary-ntp': settings.primaryNtp,
            'secondary-ntp': settings.secondaryNtp
        };
        const itemsResponse = await apiClient.get('/system/ntp/client');
        // Safely access the first item, as the API might not return an array.
        const configObject = itemsResponse.data?.[0];

        if (!configObject || !configObject['.id']) {
            return res.status(404).json({ message: 'NTP client settings object with .id not found on router.' });
        }
        
        const configId = configObject['.id'];
        await apiClient.patch(`/system/ntp/client/${configId}`, payload);
        res.status(200).json({ message: 'NTP settings updated successfully.' });
    });
});

// --- Network Management (VLANs) ---
app.post('/api/network/vlans', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const response = await apiClient.get('/interface/vlan');
        const vlans = Array.isArray(response.data) ? response.data : [];
        const data = vlans.map(v => ({
            id: v['.id'],
            name: v.name,
            'vlan-id': v['vlan-id'],
            interface: v.interface,
        }));
        res.status(200).json(data);
    });
});

app.post('/api/network/vlans/add', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { vlanData } = req.body;
        // MikroTik requires vlan-id to be a string
        vlanData['vlan-id'] = String(vlanData['vlan-id']);
        const response = await apiClient.put('/interface/vlan', vlanData);
        res.status(201).json(response.data);
    });
});

app.post('/api/network/vlans/delete', (req, res, next) => {
    handleApiRequest(req, res, next, async (apiClient) => {
        const { vlanId } = req.body;
        await apiClient.delete(`/interface/vlan/${vlanId}`);
        res.status(204).send();
    });
});


// --- Global Error Handling Middleware (must be the last app.use call) ---
// This acts as a safety net to catch any unhandled errors from the API routes
// and prevents the entire server process from crashing.
app.use((err, req, res, next) => {
    console.error('Unhandled Exception:', err.stack || err.message);
    if (res.headersSent) {
        return next(err);
    }
    const status = err.status || 500;
    const message = err.message || 'An unexpected internal server error occurred.';
    res.status(status).json({ message });
});


app.listen(port, () => {
    console.log(`MikroTik Manager API backend running. Listening on port ${port}`);
});