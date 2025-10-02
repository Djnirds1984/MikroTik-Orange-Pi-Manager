require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { RouterOSClient } = require('node-routeros');

const app = express();
const PORT = process.env.PORT || 3001;
const { ROUTER_HOST, ROUTER_USER, ROUTER_PASSWORD, ROUTER_PORT } = process.env;

if (!ROUTER_HOST || !ROUTER_USER) {
    console.error("Router configuration (HOST, USER) is missing in .env file.");
    process.exit(1);
}

app.use(cors());
app.use(express.json());

const connectToRouter = async () => {
    const client = new RouterOSClient({
        host: ROUTER_HOST,
        user: ROUTER_USER,
        password: ROUTER_PASSWORD || '',
        port: ROUTER_PORT || 8728,
        timeout: 10 // seconds
    });
    try {
        await client.connect();
        return client;
    } catch (err) {
        console.error("Failed to connect to router:", err.message);
        throw new Error("Could not connect to the MikroTik router. Check connection details in .env and ensure the router's API service is enabled.");
    }
};

const handleRequest = async (res, callback) => {
    let client;
    try {
        client = await connectToRouter();
        const data = await callback(client);
        res.json(data);
    } catch (err) {
        console.error("Error during API request processing:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (client && client.connected) {
            client.close();
        }
    }
};

app.get('/api/system-info', (req, res) => {
    handleRequest(res, async (client) => {
        const [resource, routerboard] = await Promise.all([
            client.write('/system/resource/print'),
            client.write('/system/routerboard/print')
        ]);

        if (!resource?.[0] || !routerboard?.[0]) {
            throw new Error("Incomplete system information received from router.");
        }

        const sysInfo = resource[0];
        const boardInfo = routerboard[0];

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

app.get('/api/interfaces', (req, res) => {
    handleRequest(res, async (client) => {
        const interfaces = await client.write('/interface/print');
        if (!interfaces || interfaces.length === 0) {
            return [];
        }
        const interfaceNames = interfaces.map(iface => iface.name);
        
        const traffic = await client.write('/interface/monitor-traffic', {
            interface: interfaceNames.join(','),
            once: true,
        });

        return interfaces.map(iface => {
            const trafficData = traffic.find(t => t.name === iface.name);
            return {
                name: iface.name,
                type: iface.type,
                rxRate: trafficData ? parseInt(trafficData['rx-bits-per-second'], 10) : 0,
                txRate: trafficData ? parseInt(trafficData['tx-bits-per-second'], 10) : 0,
            };
        });
    });
});

app.get('/api/hotspot-clients', (req, res) => {
    handleRequest(res, async (client) => {
        let clients = [];
        try {
            // This command can fail if the hotspot package is not installed or enabled.
            // We catch the error and return an empty array instead of crashing.
            clients = await client.write('/ip/hotspot/active/print');
        } catch (err) {
            console.warn("Could not fetch hotspot clients. This is normal if hotspot is not configured. Error:", err.message);
            // Intentionally returning an empty array on failure.
        }
        
        return clients.map(client => ({
            macAddress: client['mac-address'],
            uptime: client.uptime,
            signal: client['signal-strength'] || 'N/A', // Signal strength is not always available
        }));
    });
});

app.listen(PORT, () => {
    console.log(`MikroTik proxy server listening on port ${PORT}`);
    console.log(`Attempting to connect to router at ${ROUTER_HOST}:${ROUTER_PORT || 8728}`);
});