
const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs-extra');
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'panel.db');
const JWT_SECRET = 'your_super_secret_key_for_jwt_that_is_very_long_and_secure'; // Should be in an env var in production

let db;

// --- Database Initialization and Migrations ---
const initializeDatabase = async () => {
    try {
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Use exec for idempotent schema creation
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role_id INTEGER,
                security_questions TEXT,
                FOREIGN KEY(role_id) REFERENCES roles(id)
            );
            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                permissions TEXT,
                is_deletable BOOLEAN DEFAULT TRUE,
                is_editable BOOLEAN DEFAULT TRUE,
                is_superadmin BOOLEAN DEFAULT FALSE
            );
            CREATE TABLE IF NOT EXISTS routers ( id TEXT PRIMARY KEY, name TEXT, host TEXT, user TEXT, password TEXT, port INTEGER );
            CREATE TABLE IF NOT EXISTS sales ( id TEXT PRIMARY KEY, date TEXT, clientName TEXT, planName TEXT, planPrice REAL, discountAmount REAL, finalAmount REAL, routerName TEXT, currency TEXT, routerId TEXT, clientAddress TEXT, clientContact TEXT, clientEmail TEXT );
            CREATE TABLE IF NOT EXISTS inventory ( id TEXT PRIMARY KEY, name TEXT, quantity INTEGER, price REAL, serialNumber TEXT, dateAdded TEXT );
            CREATE TABLE IF NOT EXISTS expenses ( id TEXT PRIMARY KEY, date TEXT, category TEXT, description TEXT, amount REAL );
            CREATE TABLE IF NOT EXISTS company_settings ( key TEXT PRIMARY KEY, value TEXT );
            CREATE TABLE IF NOT EXISTS panel_settings ( key TEXT PRIMARY KEY, value TEXT );
            CREATE TABLE IF NOT EXISTS customers ( id TEXT PRIMARY KEY, username TEXT NOT NULL, routerId TEXT NOT NULL, fullName TEXT, address TEXT, contactNumber TEXT, email TEXT );
            CREATE TABLE IF NOT EXISTS billing_plans ( id TEXT PRIMARY KEY, routerId TEXT, name TEXT, price REAL, cycle TEXT, pppoeProfile TEXT, description TEXT, currency TEXT );
            CREATE TABLE IF NOT EXISTS voucher_plans ( id TEXT PRIMARY KEY, routerId TEXT, name TEXT, duration_minutes INTEGER, price REAL, currency TEXT, mikrotik_profile_name TEXT );
            CREATE TABLE IF NOT EXISTS license ( id INTEGER PRIMARY KEY, key TEXT, expires_at TEXT, device_id TEXT );
        `);

        // --- Seed Initial Roles and Superadmin User ---
        const superadminRole = await db.get("SELECT id FROM roles WHERE name = 'Superadmin'");
        if (!superadminRole) {
            await db.run("INSERT INTO roles (name, permissions, is_deletable, is_editable, is_superadmin) VALUES (?, ?, ?, ?, ?)", 'Superadmin', '["*:*"]', false, false, true);
        }

        const adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
        if (!adminRole) {
            await db.run("INSERT INTO roles (name, permissions, is_deletable, is_editable) VALUES (?, ?, ?, ?)", 'Administrator', '[]', false, true);
        }

        const userRole = await db.get("SELECT id FROM roles WHERE name = 'User'");
        if (!userRole) {
             await db.run("INSERT INTO roles (name, permissions) VALUES (?, ?)", 'User', '[]');
        }

        const superadminUser = await db.get("SELECT id FROM users WHERE username = 'superadmin'");
        if (!superadminUser) {
            const superadminRoleId = (await db.get("SELECT id FROM roles WHERE name = 'Superadmin'")).id;
            const hashedPassword = await bcrypt.hash('superadmin12345', 10);
            await db.run("INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)", 'superadmin', hashedPassword, superadminRoleId);
        }

        console.log('Database initialized successfully.');
    } catch (e) {
        console.error('Failed to initialize database:', e);
        process.exit(1);
    }
};

// --- Middleware ---
app.use(express.json());
// Serve locale files specifically
app.use('/locales', express.static(path.join(__dirname, '../locales')));
// Serve env.js from the project root
app.get('/env.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'env.js'));
});
app.use(express.static(path.join(__dirname, '../dist')));

// Cache-control middleware for API routes to prevent stale license status
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT u.id, u.username, r.name as role, r.is_superadmin FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?', decoded.id);
        if (!user) {
            return res.status(403).json({ message: 'User not found' });
        }
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid token' });
    }
};

const snakeCaseResource = (req, res, next) => {
    if (req.params.resource) {
        req.params.resource = req.params.resource.replace(/-/g, '_');
    }
    next();
};


// --- Auth Routes ---
app.get('/api/auth/has-users', async (req, res) => {
    try {
        const adminUser = await db.get("SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'Administrator'");
        res.json({ hasUsers: !!adminUser });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const adminUser = await db.get("SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'Administrator'");
        if (adminUser) {
            return res.status(403).json({ message: 'An administrator account already exists.' });
        }

        const { username, password, securityQuestions } = req.body;
        if (!username || !password || !securityQuestions || securityQuestions.length !== 3) {
            return res.status(400).json({ message: 'Username, password, and three security questions are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const adminRoleId = (await db.get("SELECT id FROM roles WHERE name = 'Administrator'")).id;

        const result = await db.run(
            'INSERT INTO users (username, password, role_id, security_questions) VALUES (?, ?, ?, ?)',
            username, hashedPassword, adminRoleId, JSON.stringify(securityQuestions)
        );
        
        const user = { id: result.lastID, username, role: 'Administrator' };
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.get('SELECT u.id, u.username, u.password, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?', username);
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/auth/status', authenticateToken, (req, res) => {
    res.json(req.user);
});

// --- Generic Database API ---

// Specific handlers for settings to override the generic one and fix kebab-case issue from old clients
const getSettings = async (tableName, res) => {
    try {
        const rows = await db.all(`SELECT * FROM ${tableName}`);
        const settings = rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

app.get('/api/db/company-settings', authenticateToken, (req, res) => getSettings('company_settings', res));
app.get('/api/db/panel-settings', authenticateToken, (req, res) => getSettings('panel_settings', res));


app.get('/api/db/:resource', authenticateToken, snakeCaseResource, async (req, res) => {
    try {
        // Special handling for key-value tables in case they are called with snake_case
        if (req.params.resource === 'company_settings' || req.params.resource === 'panel_settings') {
            return await getSettings(req.params.resource, res);
        }
        
        // Original generic handler for list-based tables
        const data = await db.all(`SELECT * FROM ${req.params.resource}`);
        res.json(data);
    } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/db/:resource', authenticateToken, snakeCaseResource, async (req, res) => {
    try {
        if (req.params.resource === 'company_settings' || req.params.resource === 'panel_settings') {
            const settings = req.body;
            await db.exec('BEGIN TRANSACTION');
            try {
                for (const key in settings) {
                    if (Object.prototype.hasOwnProperty.call(settings, key)) {
                        const value = settings[key];
                        const dbValue = (value === null || value === undefined) ? null : String(value);
                        await db.run(`INSERT OR REPLACE INTO ${req.params.resource} (key, value) VALUES (?, ?)`, [key, dbValue]);
                    }
                }
                await db.exec('COMMIT');
                res.status(201).json({ message: 'Settings updated' });
            } catch (e) {
                await db.exec('ROLLBACK');
                throw e; // Re-throw to be caught by outer catch
            }
        } else {
            // Original generic handler
            const columns = Object.keys(req.body).join(', ');
            const placeholders = Object.keys(req.body).map(() => '?').join(', ');
            const values = Object.values(req.body);
            await db.run(`INSERT OR REPLACE INTO ${req.params.resource} (${columns}) VALUES (${placeholders})`, values);
            res.status(201).json({ message: 'Created/Replaced' });
        }
    } catch(e) { 
        res.status(500).json({ message: e.message }); 
    }
});


app.patch('/api/db/:resource/:id', authenticateToken, snakeCaseResource, async (req, res) => {
    try {
        const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(req.body), req.params.id];
        await db.run(`UPDATE ${req.params.resource} SET ${updates} WHERE id = ?`, values);
        res.json({ message: 'Updated' });
    } catch(e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/db/:resource/:id', authenticateToken, snakeCaseResource, async (req, res) => {
    try {
        await db.run(`DELETE FROM ${req.params.resource} WHERE id = ?`, req.params.id);
        res.status(204).send();
    } catch(e) { res.status(500).json({ message: e.message }); }
});


// --- License API ---
const LICENSE_JWT_SECRET = 'a_different_secret_for_licenses_specifically_because_security';

const getDeviceId = async () => {
    return new Promise((resolve, reject) => {
        exec('cat /sys/class/net/eth0/address /sys/class/net/wlan0/address /etc/machine-id 2>/dev/null', (err, stdout) => {
            if (err) {
                return reject(err);
            }
            const lines = stdout.split('\n');
            const mac = lines.map(l => l.trim()).find(l => l && l !== '00:00:00:00:00:00');
            if (mac) {
                return resolve(mac.replace(/:/g, ''));
            }
            const machineId = lines.find(l => l.trim());
            if (machineId) {
                return resolve(machineId.trim());
            }
            reject(new Error('Could not determine a unique device ID.'));
        });
    });
};


app.get('/api/license/device-id', authenticateToken, async (req, res) => {
    try {
        const deviceId = await getDeviceId();
        res.json({ deviceId });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/license/status', authenticateToken, async (req, res) => {
    try {
        const record = await db.get('SELECT * FROM license LIMIT 1');
        if (!record || !record.key) {
            return res.json({ licensed: false });
        }
        const decoded = jwt.verify(record.key, LICENSE_JWT_SECRET);
        const deviceId = await getDeviceId();
        
        if (decoded.deviceId !== deviceId) {
            return res.json({ licensed: false, deviceId, error: "License is for a different device." });
        }
        if (new Date(decoded.expires) < new Date()) {
            return res.json({ licensed: false, deviceId, error: "License has expired." });
        }

        res.json({ licensed: true, expires: decoded.expires, deviceId });
    } catch (e) {
        res.json({ licensed: false, error: "Invalid license key format." });
    }
});

app.post('/api/license/activate', authenticateToken, async (req, res) => {
    try {
        const { licenseKey } = req.body;
        const decoded = jwt.verify(licenseKey, LICENSE_JWT_SECRET);
        const deviceId = await getDeviceId();

        if (decoded.deviceId !== deviceId) {
            return res.status(400).json({ message: 'This license key is for a different device.' });
        }
        if (new Date(decoded.expires) < new Date()) {
            return res.status(400).json({ message: 'This license key has expired.' });
        }
        
        await db.run('DELETE FROM license');
        await db.run('INSERT INTO license (key, expires_at, device_id) VALUES (?, ?, ?)', licenseKey, decoded.expires, decoded.deviceId);
        
        res.json({ message: 'Activation successful.' });
    } catch (e) {
        res.status(400).json({ message: 'Invalid or malformed license key.' });
    }
});

app.post('/api/license/generate', authenticateToken, async (req, res) => {
    try {
        // Only superadmin can generate
        if (!req.user.is_superadmin) {
            return res.status(403).json({ message: 'You do not have permission to generate license keys.' });
        }
        const { deviceId, days } = req.body;
        if (!deviceId || !days) {
            return res.status(400).json({ message: 'Device ID and validity days are required.' });
        }

        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + parseInt(days, 10));

        const licenseKey = jwt.sign({ deviceId, expires: expirationDate.toISOString() }, LICENSE_JWT_SECRET);

        res.json({ licenseKey });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});



// --- File Fallback for Client-Side Routing ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});


// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`MikroTik Panel UI server running on http://0.0.0.0:${PORT}`);
    });
});
