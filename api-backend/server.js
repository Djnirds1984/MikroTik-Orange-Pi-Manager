const express = require('express');
const cors = require('cors');
const Mikrotik = require('node-mikrotik-api');
const https = require('https');

const app = express();
const port = 3002;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- MikroTik Connection Helper ---
const createRouterApi = (config) => {
    // This allows connecting to routers with self-signed SSL certificates
    const agent = new https.Agent({
        rejectUnauthorized: false
    });

    return new Mikrotik({
        host: config.host,
        user: config.user,
        password: config.password || '',
        port: config.port || 80,
        secure: config.port === 443,
        tls: config.port === 443 ? { agent } : undefined,
    });
};

// --- API Endpoints ---

// Test connection endpoint
app.post('/api/test-connection', (req, res) => {
    const { routerConfig } = req.body;
    const api = createRouterApi(routerConfig);
    
    api.connect()
        .then(([conn]) => {
            conn.close();
            res.json({ success: true, message: 'Connection successful!' });
        })
        .catch(error => {
            console.error('Test connection error:', error);
            res.status(500).json({ success: false, message: `Failed to connect: ${error.message}` });
        });
});

// Generic API request handler
const handleApiRequest = async (req, res, callback) => {
    const { routerConfig } = req.body;
    if (!routerConfig) {
        return res.status(400).json({ message: 'Router configuration is missing.' });
    }
    const api = createRouterApi(routerConfig);
    try {
        const [conn] = await api.connect();
        const data = await callback(conn, req.body);
        res.json(data);
        conn.close();
    } catch (error) {
        console.error(`API Error on ${req.path}:`, error);
        res.status(500).json({ message: `MikroTik API Error: ${error.message}` });
    }
};

// --- Dashboard Endpoints ---

app.post('/api/system-info', (req, res) => {
    handleApiRequest(req, res, async (conn) => {
        const [[resource], [routerboard]] = await conn.write(['/system/resource/print'], ['/system/routerboard/print']);
        
        const totalMemoryBytes = resource['total-memory'] || 0;
        const freeMemoryBytes = resource['free-memory'] || 0;
        const memoryUsage = totalMemoryBytes > 0 ? Math.round(((totalMemoryBytes - freeMemoryBytes) / totalMemoryBytes) * 100) : 0;

        return {
            boardName: routerboard['board-name'] || 'N/A',
            version: resource.version || 'N/A',
            cpuLoad: parseInt(resource['cpu-load'] || '0', 10),
            uptime: resource.uptime || 'N/A',
            memoryUsage: memoryUsage,
            totalMemory: `${Math.round(totalMemoryBytes / 1024 / 1024)} MB`,
        };
    });
});

app.post('/api/interfaces', (req, res) => {
    handleApiRequest(req, res, async (conn) => {
        const interfaces = await conn.write(['/interface/print']);
        const monitorData = await conn.write(['/interface/monitor-traffic', `=interfaces=${interfaces.map(i => i.name).join(',')}`, '=once=']);
        
        return interfaces.map(iface => {
            const traffic = monitorData.find(m => m.name === iface.name) || {};
            return {
                id: iface['.id'],
                name: iface.name,
                type: iface.type,
                rxRate: parseInt(traffic['rx-bits-per-second'] || '0', 10),
                txRate: parseInt(traffic['tx-bits-per-second'] || '0', 10),
            };
        });
    });
});

app.post('/api/hotspot-clients', (req, res) => {
     handleApiRequest(req, res, async (conn) => {
        try {
            const clients = await conn.write(['/ip/hotspot/active/print']);
            return clients.map(client => ({
                macAddress: client['mac-address'] || 'N/A',
                uptime: client.uptime || 'N/A',
                signal: client['signal-strength'] || 'N/A'
            }));
        } catch (error) {
            // Hotspot package might not be installed, which is not a critical error.
            if (error.message.includes('no such command')) {
                return [];
            }
            throw error; // Re-throw other errors
        }
    });
});


// --- PPPoE Endpoints ---
app.post('/api/ppp/profiles', (req, res) => {
    handleApiRequest(req, res, (conn) => conn.write(['/ppp/profile/print']).then(profiles => profiles.map(p => ({
        id: p['.id'],
        name: p.name,
        localAddress: p['local-address'],
        remoteAddress: p['remote-address'],
        rateLimit: p['rate-limit'],
    }))));
});

app.post('/api/ip/pools', (req, res) => {
    handleApiRequest(req, res, (conn) => conn.write(['/ip/pool/print']).then(pools => pools.map(p => ({
        id: p['.id'],
        name: p.name,
    }))));
});

app.post('/api/ppp/profiles/add', (req, res) => {
    handleApiRequest(req, res, (conn, body) => {
        const { name, localAddress, remoteAddress, rateLimit } = body.profileData;
        const command = ['/ppp/profile/add', `=name=${name}`];
        if (localAddress) command.push(`=local-address=${localAddress}`);
        if (remoteAddress) command.push(`=remote-address=${remoteAddress}`);
        if (rateLimit) command.push(`=rate-limit=${rateLimit}`);
        return conn.write(command);
    });
});

app.post('/api/ppp/profiles/update', (req, res) => {
    handleApiRequest(req, res, (conn, body) => {
        const { id, name, localAddress, remoteAddress, rateLimit } = body.profileData;
        return conn.write(['/ppp/profile/set', `=.id=${id}`, `=name=${name}`, `=local-address=${localAddress || ''}`, `=remote-address=${remoteAddress || ''}`, `=rate-limit=${rateLimit || ''}`]);
    });
});

app.post('/api/ppp/profiles/delete', (req, res) => {
    handleApiRequest(req, res, (conn, body) => conn.write(['/ppp/profile/remove', `=.id=${body.profileId}`]));
});


// --- PPPoE Secret/User Endpoints ---

app.post('/api/ppp/secrets', (req, res) => {
    handleApiRequest(req, res, conn => conn.write(['/ppp/secret/print']).then(secrets => secrets.map(s => ({
        id: s['.id'],
        name: s.name,
        service: s.service,
        profile: s.profile,
        comment: s.comment,
    }))));
});

app.post('/api/ppp/active', (req, res) => {
    handleApiRequest(req, res, conn => conn.write(['/ppp/active/print']).then(active => active.map(a => ({
        id: a['.id'],
        name: a.name,
        uptime: a.uptime,
    }))));
});

app.post('/api/ppp/secrets/add', (req, res) => {
    handleApiRequest(req, res, (conn, body) => {
        const { name, password, profile, comment } = body.secretData;
        return conn.write(['/ppp/secret/add', `=service=pppoe`, `=name=${name}`, `=password=${password}`, `=profile=${profile}`, `=comment=${comment || ''}`]);
    });
});

app.post('/api/ppp/secrets/update', (req, res) => {
    handleApiRequest(req, res, (conn, body) => {
        const { id, password, profile, comment } = body.secretData;
        const command = ['/ppp/secret/set', `=.id=${id}`, `=profile=${profile}`, `=comment=${comment || ''}`];
        if (password) {
            command.push(`=password=${password}`);
        }
        return conn.write(command);
    });
});

app.post('/api/ppp/secrets/delete', (req, res) => {
    handleApiRequest(req, res, (conn, body) => conn.write(['/ppp/secret/remove', `=.id=${body.secretId}`]));
});


// Payment processing endpoint
app.post('/api/ppp/process-payment', (req, res) => {
    handleApiRequest(req, res, async (conn, body) => {
        const { secret, plan, nonPaymentProfile, paymentDate, discountDays } = body;

        const currentDueDate = parseComment(secret.comment).dueDate;
        const baseDate = currentDueDate && new Date(currentDueDate) > new Date() ? new Date(currentDueDate) : new Date(paymentDate);
        
        const newDueDate = new Date(baseDate);
        newDueDate.setDate(newDueDate.getDate() + 30);
        
        const newDueDateString = newDueDate.toISOString().split('T')[0];

        // Update the secret's comment with new due date and plan
        const newComment = JSON.stringify({ plan: plan.name, dueDate: newDueDateString });
        await conn.write(['/ppp/secret/set', `=.id=${secret.id}`, `=comment=${newComment}`]);

        // --- Automation via Scheduler (optional, wrapped in try/catch) ---
        try {
            const scriptName = `ppp-expiry-${secret.name}`;
            const schedulerName = `ppp-expiry-sch-${secret.name}`;
            const scriptSource = `/ppp secret set [find name="${secret.name}"] profile="${nonPaymentProfile}"`;

            // Upsert Script
            const [existingScript] = await conn.write(['/system/script/print', `?name=${scriptName}`]);
            if (existingScript) {
                await conn.write(['/system/script/set', `=.id=${existingScript['.id']}`, `=source=${scriptSource}`]);
            } else {
                await conn.write(['/system/script/add', `=name=${scriptName}`, `=source=${scriptSource}`]);
            }

            // Upsert Scheduler
            const [existingScheduler] = await conn.write(['/system/scheduler/print', `?name=${schedulerName}`]);
            const startDate = new Date(newDueDateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '');
            const [month, day, year] = startDate.split(' ');
            const mikrotikStartDate = `${month.toLowerCase()}/${day}/${year}`;

            if (existingScheduler) {
                await conn.write(['/system/scheduler/set', `=.id=${existingScheduler['.id']}`, `=start-date=${mikrotikStartDate}`, `=on-event=${scriptName}`]);
            } else {
                await conn.write(['/system/scheduler/add', `=name=${schedulerName}`, `=start-date=${mikrotikStartDate}`, `=start-time=00:00:01`, `=on-event=${scriptName}`]);
            }
        } catch (automationError) {
             console.error(`Payment recorded, but automation failed for ${secret.name}:`, automationError.message);
             // Do not throw an error, as the core payment logic succeeded.
        }

        return { success: true, message: 'Payment processed and subscription updated.' };
    });
});

const parseComment = (comment) => {
    if (!comment) return {};
    try { return JSON.parse(comment); } catch { return {}; }
};

app.listen(port, () => {
    console.log(`MikroTik Manager API Backend running on port ${port}`);
});
