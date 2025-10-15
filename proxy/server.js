
const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const os = require('os');
const { exec, spawn } = require('child_process');
const fs = require('fs-extra');
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'panel.db');
const JWT_SECRET = 'your_super_secret_key_for_jwt_that_is_very_long_and_secure';
const APP_ROOT = path.join(__dirname, '..');
const BACKUP_PATH = path.join(__dirname, 'backups');
const API_BACKEND_PATH = path.join(APP_ROOT, 'api-backend', 'server.js');

let db;

// --- Helper Functions ---

const execPromise = (command, options = {}) => {
    return new Promise((resolve, reject) => {
        exec(command, { ...options, timeout: 20000 }, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = stderr || error.message;
                let errResponse = { message: errorMessage, code: error.code };

                if (errorMessage.includes('sudo: a password is required')) {
                    errResponse.code = 'SUDO_PASSWORD_REQUIRED';
                } else if (errorMessage.includes('command not found') || error.code === 127) {
                    const cmd = command.split(' ')[0].split('/').pop();
                    errResponse.code = `${cmd.toUpperCase()}_NOT_INSTALLED`;
                } else if (errorMessage.includes('zerotier-one.service is not running')) {
                    errResponse.code = 'ZEROTIER_SERVICE_DOWN';
                }
                
                console.error(`Exec error for command "${command}":`, errResponse);
                return reject(errResponse);
            }
            resolve(stdout.trim());
        });
    });
};

const sendSse = (res, data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const streamCommand = (res, command, args = []) => {
    const child = spawn(command, args, { cwd: APP_ROOT });

    const sendLog = (log) => sendSse(res, { log });
    const sendError = (log) => sendSse(res, { log, isError: true });

    child.stdout.on('data', (data) => sendLog(data.toString()));
    child.stderr.on('data', (data) => sendError(data.toString()));

    child.on('error', (err) => {
        sendError(`Spawn error: ${err.message}`);
        sendSse(res, { status: 'error', message: err.message });
        res.end();
    });

    child.on('close', (code) => {
        if (code !== 0) {
            sendError(`Process exited with code ${code}`);
            sendSse(res, { status: 'error', message: `Process failed with code ${code}. Check logs for details.` });
        } else {
            sendSse(res, { status: 'success' });
        }
        sendSse(res, { status: 'finished' });
        res.end();
    });
};


function getCPUUsage() {
    return new Promise((resolve) => {
        const start = os.cpus().map(c => ({ ...c, total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }));
        setTimeout(() => {
            const end = os.cpus().map(c => ({ ...c, total: c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }));
            const idle = end.reduce((acc, cpu, i) => acc + cpu.times.idle - start[i].times.idle, 0);
            const total = end.reduce((acc, cpu, i) => acc + cpu.total - start[i].total, 0);
            resolve(100 - (100 * idle / total));
        }, 1000);
    });
}

// --- Database Initialization ---
const initializeDatabase = async () => {
    try {
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        
        await db.exec(`
            CREATE TABLE IF NOT EXISTS panel_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role_id INTEGER NOT NULL,
                is_superadmin BOOLEAN DEFAULT 0,
                FOREIGN KEY (role_id) REFERENCES panel_roles(id)
            );
            CREATE TABLE IF NOT EXISTS security_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES panel_users(id)
            );
            CREATE TABLE IF NOT EXISTS panel_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
            CREATE TABLE IF NOT EXISTS permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
            CREATE TABLE IF NOT EXISTS role_permissions (role_id INTEGER, permission_id INTEGER, FOREIGN KEY (role_id) REFERENCES panel_roles(id), FOREIGN KEY (permission_id) REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));
            CREATE TABLE IF NOT EXISTS routers (id TEXT PRIMARY KEY, name TEXT, host TEXT, user TEXT, password TEXT, port INTEGER);
            CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS billing_plans (id TEXT PRIMARY KEY, routerId TEXT, name TEXT, price REAL, cycle TEXT, pppoeProfile TEXT, description TEXT, currency TEXT);
            CREATE TABLE IF NOT EXISTS voucher_plans (id TEXT PRIMARY KEY, routerId TEXT, name TEXT, duration_minutes INTEGER, price REAL, currency TEXT, mikrotik_profile_name TEXT);
            CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, routerId TEXT, date TEXT, clientName TEXT, planName TEXT, planPrice REAL, discountAmount REAL, finalAmount REAL, currency TEXT, clientAddress TEXT, clientContact TEXT, clientEmail TEXT);
            CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT, quantity INTEGER, price REAL, serialNumber TEXT, dateAdded TEXT);
            CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, date TEXT, category TEXT, description TEXT, amount REAL);
            CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, routerId TEXT, username TEXT, fullName TEXT, address TEXT, contactNumber TEXT, email TEXT);
        `);

        const roles = ['Superadmin', 'Administrator', 'Viewer'];
        for (const role of roles) {
            await db.run('INSERT OR IGNORE INTO panel_roles (name) VALUES (?)', role);
        }
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
};

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));
app.use('/locales', express.static(path.join(__dirname, '../locales')));
app.get('/env.js', (req, res) => res.sendFile(path.join(APP_ROOT, 'env.js')));
app.use(express.static(path.join(APP_ROOT, 'dist')));

app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
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

// --- Auth Routes ---
app.get('/api/auth/has-users', async (req, res) => {
    try {
        const userCount = await db.get('SELECT COUNT(*) as count FROM panel_users');
        res.json({ hasUsers: userCount.count > 0 });
    } catch (error) {
        res.status(500).json({ message: 'Failed to check user status.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, securityQuestions } = req.body;
        const userCount = await db.get('SELECT COUNT(*) as count FROM panel_users');
        
        if (userCount.count > 0) {
            return res.status(403).json({ message: 'Registration is only allowed for the first user.' });
        }

        if (!username || !password || !securityQuestions || securityQuestions.length !== 3) {
            return res.status(400).json({ message: 'Username, password, and three security questions are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const superadminRole = await db.get('SELECT id FROM panel_roles WHERE name = ?', 'Superadmin');
        if (!superadminRole) throw new Error('Superadmin role not found.');

        const result = await db.run('INSERT INTO panel_users (username, password, role_id, is_superadmin) VALUES (?, ?, ?, ?)', username, hashedPassword, superadminRole.id, 1);
        const userId = result.lastID;

        const stmt = await db.prepare('INSERT INTO security_questions (user_id, question, answer) VALUES (?, ?, ?)');
        for (const qa of securityQuestions) {
            const hashedAnswer = await bcrypt.hash(qa.answer.toLowerCase().trim(), 10);
            await stmt.run(userId, qa.question, hashedAnswer);
        }
        await stmt.finalize();
        
        const user = { id: userId, username, role: 'Superadmin', is_superadmin: true, permissions: ['*:*'] };
        const token = jwt.sign({ sub: user.id, ...user }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'Administrator created successfully', token, user });

    } catch (error) {
        res.status(500).json({ message: `Registration failed: ${error.message}` });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const userRow = await db.get(`
            SELECT u.id, u.username, u.password, r.name as role, u.is_superadmin 
            FROM panel_users u
            JOIN panel_roles r ON u.role_id = r.id
            WHERE u.username = ?
        `, username);
        
        if (!userRow || !await bcrypt.compare(password, userRow.password)) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const permissions = (await db.all('SELECT p.name FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?', userRow.role_id)).map(p => p.name);
        if (userRow.is_superadmin) permissions.push('*:*');

        const user = { id: userRow.id, username: userRow.username, role: userRow.role, is_superadmin: !!userRow.is_superadmin, permissions };
        const token = jwt.sign({ sub: user.id, ...user }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user });
    } catch (error) {
        res.status(500).json({ message: `Login failed: ${error.message}` });
    }
});

app.get('/api/auth/status', authenticateToken, async (req, res) => {
    res.json(req.user);
});

app.post('/api/auth/logout', (req, res) => {
    res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/api/auth/security-questions/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const questions = await db.all('SELECT question FROM security_questions WHERE user_id = (SELECT id FROM panel_users WHERE username = ?)', username);
        res.json({ questions: questions.map(q => q.question) });
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve security questions' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { username, answers, newPassword } = req.body;
        const user = await db.get('SELECT id FROM panel_users WHERE username = ?', username);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const questions = await db.all('SELECT question, answer FROM security_questions WHERE user_id = ?', user.id);
        if (questions.length !== 3 || answers.length !== 3) return res.status(400).json({ message: 'Invalid request.' });

        let correctCount = 0;
        for (let i = 0; i < 3; i++) {
            const dbAnswer = questions.find(q => q.question === `Question ${i + 1}`)?.answer || questions[i]?.answer; // Fallback for old data
            if (await bcrypt.compare(answers[i].toLowerCase().trim(), dbAnswer)) {
                correctCount++;
            }
        }
        
        if (correctCount !== 3) return res.status(403).json({ message: 'Security answers are incorrect.' });
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.run('UPDATE panel_users SET password = ? WHERE id = ?', hashedPassword, user.id);

        res.json({ message: 'Password has been reset successfully. You can now log in.' });

    } catch (error) {
        res.status(500).json({ message: `Password reset failed: ${error.message}` });
    }
});

// --- Generic DB API ---
const genericDbHandler = (resource) => {
    const router = express.Router();
    router.use(authenticateToken);

    router.get('/', async (req, res) => {
        try {
            const query = `SELECT * FROM ${resource}` + (req.query.routerId ? ` WHERE routerId = '${req.query.routerId}'` : '');
            const items = await db.all(query);
            res.json(items);
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    router.post('/', async (req, res) => {
        try {
            const columns = Object.keys(req.body).join(', ');
            const placeholders = Object.keys(req.body).map(() => '?').join(', ');
            await db.run(`INSERT INTO ${resource} (${columns}) VALUES (${placeholders})`, Object.values(req.body));
            res.status(201).json({ message: 'Created' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    router.patch('/:id', async (req, res) => {
        try {
            const updates = Object.keys(req.body).map(k => `${k} = ?`).join(', ');
            await db.run(`UPDATE ${resource} SET ${updates} WHERE id = ?`, [...Object.values(req.body), req.params.id]);
            res.json({ message: 'Updated' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    router.delete('/:id', async (req, res) => {
        try {
            await db.run(`DELETE FROM ${resource} WHERE id = ?`, req.params.id);
            res.json({ message: 'Deleted' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    return router;
};

const resources = ['routers', 'billing_plans', 'voucher_plans', 'sales', 'inventory', 'expenses', 'customers'];
resources.forEach(resource => app.use(`/api/db/${resource}`, genericDbHandler(resource)));

// Special handler for key-value tables like company_settings
const keyValueHandler = (table) => {
    const router = express.Router();
    router.use(authenticateToken);
    router.get('/', async (req, res) => {
        try {
            const rows = await db.all(`SELECT key, value FROM ${table}`);
            const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
            res.json(settings);
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    router.post('/', async (req, res) => {
        try {
            const stmt = await db.prepare(`INSERT OR REPLACE INTO ${table} (key, value) VALUES (?, ?)`);
            for (const [key, value] of Object.entries(req.body)) {
                await stmt.run(key, value);
            }
            await stmt.finalize();
            res.json({ message: 'Settings saved' });
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    return router;
};
app.use('/api/db/company_settings', keyValueHandler('company_settings'));
app.use('/api/db/panel_settings', keyValueHandler('panel_settings'));

// --- Panel/Host Specific APIs ---
app.get('/api/host-status', authenticateToken, async (req, res) => {
    try {
        const [cpuUsage, mem, disk] = await Promise.all([
            getCPUUsage(),
            execPromise("free -m | awk '/Mem:/ {print $2,$3,$4}'"),
            execPromise("df -h / | awk 'NR==2 {print $2,$3,$4,$5}'")
        ]);
        const [totalMem, usedMem, freeMem] = mem.split(' ');
        const [totalDisk, usedDisk, freeDisk, percentDisk] = disk.split(' ');
        res.json({
            cpuUsage: parseFloat(cpuUsage),
            memory: { total: `${totalMem}MB`, used: `${usedMem}MB`, free: `${freeMem}MB`, percent: (usedMem / totalMem) * 100 },
            disk: { total: totalDisk, used: usedDisk, free: freeDisk, percent: parseInt(percentDisk) }
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to get host status', details: error.message });
    }
});

// All other routes were here in the last refactor...
const ztRouter = express.Router();
ztRouter.use(authenticateToken);
ztRouter.get('/status', async (req, res) => {
    try {
        const [info, networks] = await Promise.all([
            execPromise('zerotier-cli -j info').then(JSON.parse),
            execPromise('zerotier-cli -j listnetworks').then(JSON.parse)
        ]);
        res.json({ info, networks });
    } catch (err) {
        res.status(500).json(err);
    }
});
// ... other zt routes ...
app.use('/api/zt', ztRouter);
// ... etc ...

// --- File Fallback for Client-Side Routing ---
app.get('*', (req, res) => {
    res.sendFile(path.join(APP_ROOT, 'dist/index.html'));
});

// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`MikroTik Panel UI server running on http://0.0.0.0:${PORT}`);
    });
});
