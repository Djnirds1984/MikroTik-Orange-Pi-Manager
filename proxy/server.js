
const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const archiver = require('archiver');
const tar = require('tar');
const os = require('os');
const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);


const app = express();
const PORT = 3001;
const JWT_SECRET = 'your-super-secret-key-that-should-be-in-an-env-file';
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));


// --- Database Setup ---
let db;
(async () => {
    await fs.ensureDir(BACKUP_DIR);
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS routers (id TEXT PRIMARY KEY, name TEXT, host TEXT, user TEXT, password TEXT, port INTEGER);
        CREATE TABLE IF NOT EXISTS billing_plans (id TEXT PRIMARY KEY, routerId TEXT, name TEXT, price REAL, cycle TEXT, pppoeProfile TEXT, description TEXT, currency TEXT);
        CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, routerId TEXT, date TEXT, clientName TEXT, planName TEXT, planPrice REAL, discountAmount REAL, finalAmount REAL, currency TEXT, clientAddress TEXT, clientContact TEXT, clientEmail TEXT);
        CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT, quantity INTEGER, price REAL, serialNumber TEXT, dateAdded TEXT);
        CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, date TEXT, category TEXT, description TEXT, amount REAL);
        CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS panel_settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT);
        CREATE TABLE IF NOT EXISTS security_questions (user_id INTEGER, question TEXT, answer_hash TEXT, FOREIGN KEY(user_id) REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, routerId TEXT, username TEXT UNIQUE, fullName TEXT, address TEXT, contactNumber TEXT, email TEXT);
        CREATE TABLE IF NOT EXISTS voucher_plans (id TEXT PRIMARY KEY, routerId TEXT, name TEXT, duration_minutes INTEGER, price REAL, currency TEXT, mikrotik_profile_name TEXT);
    `);
})();

// --- Auth Middleware & Routes ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.status(403).json({ message: "Invalid token" });
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: "Authorization header required" });
    }
};

app.get('/api/auth/has-users', async (req, res) => {
    const count = await db.get('SELECT COUNT(*) as count FROM users');
    res.json({ hasUsers: count.count > 0 });
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password, securityQuestions } = req.body;
    const count = await db.get('SELECT COUNT(*) as count FROM users');
    if (count.count > 0) return res.status(403).json({ message: 'Registration is closed.' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await db.run('INSERT INTO users (username, password) VALUES (?, ?)', username, hashedPassword);
    
    for (const sq of securityQuestions) {
        const hashedAnswer = await bcrypt.hash(sq.answer.toLowerCase().trim(), 10);
        await db.run('INSERT INTO security_questions (user_id, question, answer_hash) VALUES (?, ?, ?)', userResult.lastID, sq.question, hashedAnswer);
    }
    
    const user = { id: userResult.lastID, username };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (user && await bcrypt.compare(password, user.password)) {
        const payload = { id: user.id, username: user.username };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: payload });
    } else {
        res.status(401).json({ message: 'Invalid username or password' });
    }
});

app.post('/api/auth/logout', (req, res) => res.sendStatus(200));

app.get('/api/auth/status', authMiddleware, (req, res) => res.json(req.user));
// Other auth routes...

// --- Generic DB API ---
const createDbApi = (tableName) => {
    const router = express.Router();
    router.get('/', async (req, res) => {
        let query = `SELECT * FROM ${tableName}`;
        if (req.query.routerId) query += ` WHERE routerId = '${req.query.routerId}'`;
        res.json(await db.all(query));
    });
    router.post('/', async (req, res) => {
        await db.run(`INSERT INTO ${tableName} (${Object.keys(req.body).join(',')}) VALUES (${Object.keys(req.body).map(() => '?').join(',')})`, ...Object.values(req.body));
        res.status(201).json({ message: 'Created' });
    });
    router.patch('/:id', async (req, res) => {
        const { id } = req.params;
        const fields = Object.keys(req.body).filter(k => k !== 'id').map(k => `${k} = ?`).join(',');
        const values = Object.values(req.body).filter(v => v !== id);
        await db.run(`UPDATE ${tableName} SET ${fields} WHERE id = ?`, ...values, id);
        res.json({ message: 'Updated' });
    });
    router.delete('/:id', async (req, res) => {
        await db.run(`DELETE FROM ${tableName} WHERE id = ?`, req.params.id);
        res.json({ message: 'Deleted' });
    });
    return router;
};

app.use('/api/db/routers', authMiddleware, createDbApi('routers'));
app.use('/api/db/billing-plans', authMiddleware, createDbApi('billing_plans'));
app.use('/api/db/sales', authMiddleware, createDbApi('sales'));
app.use('/api/db/inventory', authMiddleware, createDbApi('inventory'));
app.use('/api/db/expenses', authMiddleware, createDbApi('expenses'));
app.use('/api/db/customers', authMiddleware, createDbApi('customers'));
app.use('/api/db/voucher-plans', authMiddleware, createDbApi('voucher_plans'));


// --- Special DB Routes ---
app.get('/api/db/company-settings', authMiddleware, async (req, res) => {
    const rows = await db.all("SELECT key, value FROM company_settings");
    res.json(rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});
app.post('/api/db/company-settings', authMiddleware, async (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
        await db.run("INSERT OR REPLACE INTO company_settings (key, value) VALUES (?, ?)", key, value);
    }
    res.json({ message: 'Settings saved' });
});
// Same for panel_settings
app.get('/api/db/panel-settings', authMiddleware, async (req, res) => {
    const rows = await db.all("SELECT key, value FROM panel_settings");
    res.json(rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});
app.post('/api/db/panel-settings', authMiddleware, async (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
        await db.run("INSERT OR REPLACE INTO panel_settings (key, value) VALUES (?, ?)", key, value);
    }
    res.json({ message: 'Settings saved' });
});
app.post('/api/db/sales/clear-all', authMiddleware, async (req, res) => {
    await db.run('DELETE FROM sales WHERE routerId = ?', req.body.routerId);
    res.json({ message: 'Sales cleared' });
});


// --- Public Hotspot Routes ---
app.get('/api/public/voucher-plans/:routerId', async (req, res) => {
    const plans = await db.all('SELECT * FROM voucher_plans WHERE routerId = ?', req.params.routerId);
    res.json(plans);
});
app.get('/api/public/company-settings', async (req, res) => {
    const rows = await db.all("SELECT key, value FROM company_settings");
    res.json(rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});

// Internal route for API backend
app.get('/api/internal/router-credentials/:routerId', authMiddleware, async (req, res) => {
    const router = await db.get('SELECT * FROM routers WHERE id = ?', req.params.routerId);
    if (!router) return res.status(404).json({ message: 'Router not found' });
    res.json(router);
});


// Host Status API
app.get('/api/host-status', authMiddleware, (req, res) => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = (usedMem / totalMem) * 100;
    
    exec('df -h /', (err, stdout) => {
        let disk = { total: 'N/A', used: 'N/A', free: 'N/A', percent: 0 };
        if (!err) {
            const lines = stdout.split('\n');
            const parts = lines[1].split(/\s+/);
            disk = { total: parts[1], used: parts[2], free: parts[3], percent: parseInt(parts[4]) || 0 };
        }
        res.json({
            cpuUsage: os.loadavg()[0] / cpus.length * 100, // 1-minute average
            memory: { total: (totalMem / 1e9).toFixed(2) + ' GB', used: (usedMem / 1e9).toFixed(2) + ' GB', free: (freeMem / 1e9).toFixed(2) + ' GB', percent: memPercent },
            disk
        });
    });
});
// ... other API endpoints for ZT, Updater, NGrok, System, etc.


// --- Static File Serving ---
const projectRoot = path.join(__dirname, '..');
app.use(express.static(projectRoot));

app.get('/hotspot-login', (req, res) => {
    res.sendFile(path.join(projectRoot, 'hotspot-login.html'));
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
    // Avoid serving index.html for API-like paths
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
        return res.status(404).send('Not Found');
    }
    res.sendFile(path.join(projectRoot, 'index.html'));
});


app.listen(PORT, '0.0.0.0', () => {
    console.log(`MikroTik UI server listening on port ${PORT}`);
});
