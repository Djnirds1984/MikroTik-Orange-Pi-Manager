const express = require('express');
const path = require('path');
const sqlite3 = require('@vscode/sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const { exec } = require('child_process');
const archiver = require('archiver');
const tar = require('tar');
const fsExtra = require('fs-extra');


const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'panel.db');
// In a real app, this should be a more secure, randomly generated secret stored in an environment variable
const JWT_SECRET = 'your-super-secret-and-long-jwt-key-that-is-at-least-32-characters';

let db;

// --- Database Initialization ---
async function initializeDatabase() {
    try {
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        await db.migrate({
            migrationsPath: path.join(__dirname, 'migrations'), // if you want to use migration files
            force: 'last',
            // Or define migrations directly:
            migrations: {
                '001-initial-schema': `
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        role_id INTEGER,
                        FOREIGN KEY (role_id) REFERENCES roles(id)
                    );
                    CREATE TABLE IF NOT EXISTS security_questions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        question TEXT NOT NULL,
                        answer_hash TEXT NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE TABLE IF NOT EXISTS roles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT UNIQUE NOT NULL,
                        is_superadmin INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS permissions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT UNIQUE NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS role_permissions (
                        role_id INTEGER,
                        permission_id INTEGER,
                        PRIMARY KEY (role_id, permission_id),
                        FOREIGN KEY (role_id) REFERENCES roles(id),
                        FOREIGN KEY (permission_id) REFERENCES permissions(id)
                    );
                    CREATE TABLE IF NOT EXISTS routers (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        host TEXT NOT NULL,
                        user TEXT NOT NULL,
                        password TEXT,
                        port INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS billing_plans (
                        id TEXT PRIMARY KEY,
                        routerId TEXT NOT NULL,
                        name TEXT NOT NULL,
                        price REAL NOT NULL,
                        cycle TEXT NOT NULL,
                        pppoeProfile TEXT NOT NULL,
                        description TEXT,
                        currency TEXT
                    );
                    CREATE TABLE IF NOT EXISTS sales (
                        id TEXT PRIMARY KEY,
                        routerId TEXT NOT NULL,
                        date TEXT NOT NULL,
                        clientName TEXT NOT NULL,
                        planName TEXT NOT NULL,
                        planPrice REAL NOT NULL,
                        discountAmount REAL NOT NULL,
                        finalAmount REAL NOT NULL,
                        currency TEXT,
                        clientAddress TEXT,
                        clientContact TEXT,
                        clientEmail TEXT
                    );
                    CREATE TABLE IF NOT EXISTS inventory (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        price REAL,
                        serialNumber TEXT,
                        dateAdded TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS expenses (
                        id TEXT PRIMARY KEY,
                        date TEXT NOT NULL,
                        category TEXT NOT NULL,
                        description TEXT,
                        amount REAL NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS company_settings (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        companyName TEXT,
                        address TEXT,
                        contactNumber TEXT,
                        email TEXT,
                        logoBase64 TEXT
                    );
                    CREATE TABLE IF NOT EXISTS panel_settings (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        language TEXT,
                        currency TEXT,
                        geminiApiKey TEXT
                    );
                     CREATE TABLE IF NOT EXISTS customers (
                        id TEXT PRIMARY KEY,
                        routerId TEXT NOT NULL,
                        username TEXT NOT NULL, -- pppoe username
                        fullName TEXT,
                        address TEXT,
                        contactNumber TEXT,
                        email TEXT,
                        UNIQUE(routerId, username)
                    );
                    CREATE TABLE IF NOT EXISTS voucher_plans (
                        id TEXT PRIMARY KEY,
                        routerId TEXT NOT NULL,
                        name TEXT NOT NULL,
                        duration_minutes INTEGER NOT NULL,
                        price REAL NOT NULL,
                        currency TEXT NOT NULL,
                        mikrotik_profile_name TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS license (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        key TEXT NOT NULL
                    );
                `,
                '002-superadmin': `
                    INSERT OR IGNORE INTO roles (name, is_superadmin) VALUES ('Superadmin', 1);
                    INSERT OR IGNORE INTO users (username, password, role_id) 
                    SELECT 'superadmin', '${bcrypt.hashSync('superadmin12345', 10)}', (SELECT id FROM roles WHERE name = 'Superadmin')
                    WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'superadmin');
                `
            }
        });

        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
    // Prevent caching of API responses
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireSuperadmin = (req, res, next) => {
    if (req.user && req.user.is_superadmin) {
        next();
    } else {
        res.status(403).json({ message: 'Forbidden: Superadmin access required.' });
    }
}

// --- Auth Routes ---
app.get('/api/auth/has-users', async (req, res) => {
    try {
        // Only check for an 'Administrator' role, ignore 'Superadmin' for this check
        const adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
        if (!adminRole) {
            return res.json({ hasUsers: false });
        }
        const user = await db.get('SELECT 1 FROM users WHERE role_id = ?', adminRole.id);
        res.json({ hasUsers: !!user });
    } catch (error) {
        res.status(500).json({ message: 'Failed to check for users.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, securityQuestions } = req.body;
        
        // Ensure an 'Administrator' role exists
        let adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
        if (!adminRole) {
            await db.run("INSERT INTO roles (name, is_superadmin) VALUES ('Administrator', 0)");
            adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
        }

        // Check if an 'Administrator' already exists, if so, block registration
        const existingAdmin = await db.get("SELECT 1 FROM users WHERE role_id = ?", adminRole.id);
        if (existingAdmin) {
            return res.status(403).json({ message: 'An administrator account already exists. Registration is closed.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', username, hashedPassword, adminRole.id);
        const userId = result.lastID;

        // Save security questions
        const stmt = await db.prepare('INSERT INTO security_questions (user_id, question, answer_hash) VALUES (?, ?, ?)');
        for (const qa of securityQuestions) {
            const answerHash = await bcrypt.hash(qa.answer.toLowerCase().trim(), 10);
            await stmt.run(userId, qa.question, answerHash);
        }
        await stmt.finalize();
        
        const user = { id: userId, username, role: 'Administrator', is_superadmin: 0 };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ user, token });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Failed to register user.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const userRow = await db.get('SELECT users.*, roles.name as role_name, roles.is_superadmin FROM users JOIN roles ON users.role_id = roles.id WHERE username = ?', username);
        
        if (!userRow || !await bcrypt.compare(password, userRow.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const userPayload = { 
            id: userRow.id, 
            username: userRow.username, 
            role: userRow.role_name,
            is_superadmin: userRow.is_superadmin
        };
        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

        res.json({ user: userPayload, token });
    } catch (error) {
        res.status(500).json({ message: 'Login failed' });
    }
});

app.get('/api/auth/status', authenticateToken, (req, res) => {
    res.json(req.user);
});

app.post('/api/auth/logout', (req, res) => {
    // In a stateless JWT setup, logout is handled client-side by deleting the token.
    // This endpoint is here for completeness or if a token blocklist were implemented.
    res.status(200).json({ message: 'Logged out successfully' });
});

app.post('/api/auth/reset-all', authenticateToken, async (req, res) => {
    // This is a dangerous operation, so double-check it's an admin/superadmin
    if (req.user.role !== 'Administrator' && !req.user.is_superadmin) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    try {
        // Delete all users EXCEPT the superadmin
        await db.run('DELETE FROM users WHERE is_superadmin = 0 OR is_superadmin IS NULL');
        // We can also delete all security questions as they are linked to non-superadmin users
        await db.run('DELETE FROM security_questions');
        res.json({ message: 'All non-superadmin credentials have been reset.' });
    } catch (error) {
        console.error("Failed to reset credentials", error);
        res.status(500).json({ message: 'Failed to reset credentials.' });
    }
});


// --- License Routes ---
const getDeviceId = () => {
    try {
        const networkInterfaces = os.networkInterfaces();
        const priorityInterfaces = ['eth0', 'wlan0'];
        let macAddress = '';

        for (const ifaceName of priorityInterfaces) {
            if (networkInterfaces[ifaceName]) {
                const iface = networkInterfaces[ifaceName].find(details => details.mac && details.mac !== '00:00:00:00:00:00');
                if (iface) {
                    macAddress = iface.mac;
                    break;
                }
            }
        }
        
        if (!macAddress) {
            for (const ifaceName in networkInterfaces) {
                const iface = networkInterfaces[ifaceName].find(details => details.mac && !details.internal && details.mac !== '00:00:00:00:00:00');
                if (iface) {
                    macAddress = iface.mac;
                    break;
                }
            }
        }

        if (macAddress) {
            return macAddress.replace(/:/g, '').toLowerCase();
        }

        // Fallback for systems without a clear MAC (e.g., containers)
        if (fs.existsSync('/etc/machine-id')) {
            return fs.readFileSync('/etc/machine-id', 'utf8').trim();
        }

        throw new Error('Could not determine a unique device ID.');

    } catch (e) {
        console.error("Error getting device ID:", e);
        throw new Error("Failed to retrieve a unique device identifier for licensing.");
    }
};


app.get('/api/license/device-id', authenticateToken, (req, res) => {
    try {
        const deviceId = getDeviceId();
        res.json({ deviceId });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/license/status', authenticateToken, async (req, res) => {
    try {
        if (req.user.is_superadmin) {
            return res.json({ licensed: true, expires: 'N/A (Superadmin)', deviceId: getDeviceId() });
        }

        const licenseRow = await db.get('SELECT key FROM license WHERE id = 1');
        if (!licenseRow || !licenseRow.key) {
            return res.json({ licensed: false });
        }
        
        const decoded = jwt.verify(licenseRow.key, JWT_SECRET);
        
        if (decoded.deviceId !== getDeviceId()) {
            return res.json({ licensed: false, error: 'License is for a different device.' });
        }

        const expires = new Date(decoded.expires);
        if (expires < new Date()) {
            return res.json({ licensed: false, error: 'License has expired.' });
        }
        
        res.json({ licensed: true, expires: expires.toISOString(), deviceId: decoded.deviceId });
    } catch (e) {
        // Catches JWT errors (malformed, expired, etc.)
        res.json({ licensed: false });
    }
});

app.post('/api/license/activate', authenticateToken, async (req, res) => {
    const { licenseKey } = req.body;
    try {
        const decoded = jwt.verify(licenseKey, JWT_SECRET);

        if (decoded.deviceId !== getDeviceId()) {
            return res.status(400).json({ message: 'Invalid license key for this device.' });
        }

        const expires = new Date(decoded.expires);
        if (expires < new Date()) {
            return res.status(400).json({ message: 'This license key has expired.' });
        }

        await db.run('INSERT OR REPLACE INTO license (id, key) VALUES (1, ?)', licenseKey);
        res.json({ success: true, message: 'Application activated successfully.' });
    } catch (e) {
        res.status(400).json({ message: 'Invalid or malformed license key.' });
    }
});

app.post('/api/license/generate', authenticateToken, requireSuperadmin, (req, res) => {
    const { deviceId, days } = req.body;
    if (!deviceId || !days) {
        return res.status(400).json({ message: 'Device ID and validity days are required.' });
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + parseInt(days, 10));

    const licenseKey = jwt.sign({
        deviceId,
        expires: expirationDate.toISOString()
    }, JWT_SECRET);
    
    res.json({ licenseKey });
});

// --- Generic DB CRUD Routes ---
// These are protected by the authenticateToken middleware
const crudRoutes = ['routers', 'billing-plans', 'sales', 'inventory', 'expenses', 'customers', 'voucher-plans'];
crudRoutes.forEach(route => {
    // GET all
    app.get(`/api/db/${route}`, authenticateToken, async (req, res) => {
        try {
            let query = `SELECT * FROM ${route}`;
            const params = [];
            if (req.query.routerId) {
                query += ' WHERE routerId = ?';
                params.push(req.query.routerId);
            }
            const items = await db.all(query, params);
            res.json(items);
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    // POST new
    app.post(`/api/db/${route}`, authenticateToken, async (req, res) => {
        try {
            const columns = Object.keys(req.body).join(', ');
            const placeholders = Object.keys(req.body).map(() => '?').join(', ');
            const values = Object.values(req.body);
            await db.run(`INSERT INTO ${route} (${columns}) VALUES (${placeholders})`, values);
            res.status(201).json({ message: 'Created' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    // PATCH update
    app.patch(`/api/db/${route}/:id`, authenticateToken, async (req, res) => {
        try {
            const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
            const values = [...Object.values(req.body), req.params.id];
            await db.run(`UPDATE ${route} SET ${updates} WHERE id = ?`, values);
            res.json({ message: 'Updated' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    // DELETE
    app.delete(`/api/db/${route}/:id`, authenticateToken, async (req, res) => {
        try {
            await db.run(`DELETE FROM ${route} WHERE id = ?`, req.params.id);
            res.json({ message: 'Deleted' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
});

// Special route for clearing sales
app.post('/api/db/sales/clear-all', authenticateToken, async (req, res) => {
    try {
        const { routerId } = req.body;
        if (!routerId) return res.status(400).json({ message: "Router ID is required." });
        await db.run('DELETE FROM sales WHERE routerId = ?', routerId);
        res.json({ message: 'Sales records cleared for this router.' });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});


// Special routes for settings (singleton tables)
app.get('/api/db/company-settings', authenticateToken, async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM company_settings WHERE id = 1');
        res.json(settings || {});
    } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/db/company-settings', authenticateToken, async (req, res) => {
    try {
        const { companyName, address, contactNumber, email, logoBase64 } = req.body;
        await db.run(
            'INSERT OR REPLACE INTO company_settings (id, companyName, address, contactNumber, email, logoBase64) VALUES (1, ?, ?, ?, ?, ?)',
            companyName, address, contactNumber, email, logoBase64
        );
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/db/panel-settings', authenticateToken, async (req, res) => {
    try {
        const settings = await db.get('SELECT language, currency, geminiApiKey FROM panel_settings WHERE id = 1');
        res.json(settings || {});
    } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/db/panel-settings', authenticateToken, async (req, res) => {
    try {
        // Fetch existing to only update provided fields
        const existing = await db.get('SELECT * FROM panel_settings WHERE id = 1') || {};
        const newSettings = { ...existing, ...req.body };
        await db.run(
            'INSERT OR REPLACE INTO panel_settings (id, language, currency, geminiApiKey) VALUES (1, ?, ?, ?)',
            newSettings.language, newSettings.currency, newSettings.geminiApiKey
        );
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Serve Frontend ---
const buildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(buildPath));
app.use('/assets', express.static(path.join(buildPath, 'assets')));

// On any other route, serve the index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`MikroTik Panel UI server running on http://0.0.0.0:${PORT}`);
    });
}).catch(err => {
    console.error("Failed to start server:", err);
});