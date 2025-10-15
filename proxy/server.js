const express = require('express');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const fsExtra = require('fs-extra');
const { exec, spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const tar = require('tar');
const archiver = require('archiver');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');

const app = express();
const PORT = 3001;

// --- Database Setup ---
let db;
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const SECRET_KEY = 'your-very-secret-key-that-is-long-and-secure'; // Should be in an env variable in a real app

async function initializeDatabase() {
    try {
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Enable WAL mode for better concurrency
        await db.run('PRAGMA journal_mode = WAL;');

        console.log('Database connected successfully.');

        // Run migrations
        await db.exec(`
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
                currency TEXT
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
                language TEXT DEFAULT 'en',
                currency TEXT DEFAULT 'USD',
                geminiApiKey TEXT
            );
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                routerId TEXT NOT NULL,
                username TEXT NOT NULL,
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
             CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role_id INTEGER,
                FOREIGN KEY (role_id) REFERENCES roles(id)
            );
            CREATE TABLE IF NOT EXISTS permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id INTEGER,
                permission_id INTEGER,
                FOREIGN KEY (role_id) REFERENCES roles(id),
                FOREIGN KEY (permission_id) REFERENCES permissions(id),
                PRIMARY KEY (role_id, permission_id)
            );
            CREATE TABLE IF NOT EXISTS security_questions (
                user_id INTEGER,
                question TEXT NOT NULL,
                answer_hash TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id),
                PRIMARY KEY (user_id, question)
            );
            CREATE TABLE IF NOT EXISTS license (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        `);

        // --- Superadmin & Role Migration ---
        await db.run('BEGIN TRANSACTION');
        try {
            const superadminRole = await db.get("SELECT id FROM roles WHERE name = 'Superadmin'");
            if (!superadminRole) {
                const { lastID: roleId } = await db.run("INSERT INTO roles (name) VALUES ('Superadmin')");
                const superadminUser = await db.get("SELECT id FROM users WHERE username = 'superadmin'");
                if (!superadminUser) {
                    const pass = await bcrypt.hash('superadmin12345', 10);
                    await db.run(
                        "INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)",
                        'superadmin', pass, roleId
                    );
                    console.log("Superadmin account created with default password.");
                }
            }

            const adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
            if (!adminRole) {
                await db.run("INSERT INTO roles (name) VALUES ('Administrator')");
            }
            await db.run('COMMIT');
        } catch (e) {
            await db.run('ROLLBACK');
            console.error("Error during superadmin migration:", e);
        }

        console.log('Database migrations completed.');

    } catch (err) {
        console.error('Failed to connect to or initialize the database:', err);
        process.exit(1);
    }
}

initializeDatabase();


// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Middleware to prevent browser caching for API routes
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};


// --- Static File Serving ---
const staticPath = path.join(__dirname, '..', 'dist');
app.use(express.static(staticPath));
app.use('/assets', express.static(path.join(staticPath, 'assets')));
app.get('/env.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'env.js'));
});


// --- License Generation & Validation Logic ---

const getDeviceId = () => {
    try {
        const interfaces = os.networkInterfaces();
        // Prioritize common wired/wireless interfaces on SBCs
        const priorityInterfaces = ['eth0', 'wlan0', 'end0'];
        let macAddress = '';

        for (const name of priorityInterfaces) {
            if (interfaces[name]) {
                const mac = interfaces[name].find(iface => iface.mac && iface.mac !== '00:00:00:00:00:00')?.mac;
                if (mac) {
                    macAddress = mac;
                    break;
                }
            }
        }

        // Fallback to any available MAC address if priority ones are not found
        if (!macAddress) {
            for (const name in interfaces) {
                const mac = interfaces[name].find(iface => iface.mac && iface.mac !== '00:00:00:00:00:00')?.mac;
                if (mac) {
                    macAddress = mac;
                    break;
                }
            }
        }
        
        if (macAddress) {
            return crypto.createHash('sha256').update(macAddress).digest('hex').substring(0, 16);
        }

        // Further fallback for systems without MAC (e.g., some containers)
        if (fs.existsSync('/etc/machine-id')) {
            const machineId = fs.readFileSync('/etc/machine-id').toString().trim();
            return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
        }
        
        throw new Error('Could not determine a unique device ID.');

    } catch (e) {
        console.error("Error getting device ID:", e);
        // Final fallback
        return crypto.createHash('sha256').update(os.hostname() + os.arch()).digest('hex').substring(0, 16);
    }
};

const LICENSE_SECRET = 'a-different-very-secret-key-for-licenses';

app.get('/api/license/device-id', authenticateToken, (req, res) => {
    try {
        res.json({ deviceId: getDeviceId() });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/license/status', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT * FROM license LIMIT 1');
        if (!row) {
            return res.json({ licensed: false });
        }
        
        jwt.verify(row.key, LICENSE_SECRET, (err, decoded) => {
            if (err) {
                return res.json({ licensed: false, deviceId: getDeviceId() });
            }

            const { deviceId, expires } = decoded;
            if (deviceId !== getDeviceId()) {
                return res.json({ licensed: false, deviceId: getDeviceId(), message: 'License is for a different device.' });
            }
            if (new Date(expires) < new Date()) {
                return res.json({ licensed: false, deviceId: getDeviceId(), message: 'License has expired.' });
            }

            res.json({ licensed: true, expires, deviceId: getDeviceId() });
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


app.post('/api/license/activate', authenticateToken, async (req, res) => {
    const { licenseKey } = req.body;
    if (!licenseKey) {
        return res.status(400).json({ message: 'License key is required.' });
    }

    try {
        jwt.verify(licenseKey, LICENSE_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(400).json({ message: 'Invalid or expired license key.' });
            }

            const { deviceId, expires } = decoded;
            
            if (deviceId !== getDeviceId()) {
                return res.status(400).json({ message: 'This license key is not valid for this device.' });
            }

            if (new Date(expires) < new Date()) {
                return res.status(400).json({ message: 'This license key has expired.' });
            }

            // Clear old licenses and save the new one
            await db.run('DELETE FROM license');
            await db.run('INSERT INTO license (key, data) VALUES (?, ?)', licenseKey, JSON.stringify(decoded));

            res.json({ success: true, message: 'Application activated successfully.' });
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


app.post('/api/license/generate', authenticateToken, async (req, res) => {
    // Only Superadmin can generate licenses
    try {
        const user = await db.get('SELECT r.name as roleName FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?', req.user.id);
        if (user?.roleName !== 'Superadmin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
        
        const { deviceId, days } = req.body;
        if (!deviceId || !days) {
            return res.status(400).json({ message: 'Device ID and validity days are required.' });
        }

        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + parseInt(days, 10));

        const licenseKey = jwt.sign(
            { deviceId, expires: expirationDate.toISOString() },
            LICENSE_SECRET
        );

        res.json({ licenseKey });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// --- Auth Routes ---

// Check if any users exist (for initial setup)
app.get('/api/auth/has-users', async (req, res) => {
    try {
        const count = await db.get('SELECT COUNT(id) as count FROM users');
        res.json({ hasUsers: count.count > 0 });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});

// Register first admin user
app.post('/api/auth/register', async (req, res) => {
     try {
        const { username, password, securityQuestions } = req.body;
        const count = await db.get('SELECT COUNT(id) as count FROM users');
        if (count.count > 0) {
            return res.status(403).json({ message: 'Registration is closed. An admin account already exists.' });
        }
        if (!username || !password || !securityQuestions || securityQuestions.length !== 3) {
            return res.status(400).json({ message: 'Username, password, and three security questions are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        let adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
        if (!adminRole) {
            const { lastID } = await db.run("INSERT INTO roles (name) VALUES ('Administrator')");
            adminRole = { id: lastID };
        }

        const { lastID: userId } = await db.run('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', username, hashedPassword, adminRole.id);
        
        for (const sq of securityQuestions) {
            const answerHash = await bcrypt.hash(sq.answer.toLowerCase(), 10);
            await db.run('INSERT INTO security_questions (user_id, question, answer_hash) VALUES (?, ?, ?)', userId, sq.question, answerHash);
        }

        const token = jwt.sign({ id: userId, username, role: 'Administrator' }, SECRET_KEY, { expiresIn: '24h' });
        res.status(201).json({ 
            token, 
            user: { username, role: 'Administrator' }
        });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.get('SELECT u.*, r.name as roleName, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?', username);
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }
        
        const isSuperadmin = user.roleName === 'Superadmin';

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, is_superadmin: isSuperadmin }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ 
            token, 
            user: { username: user.username, role: user.role, is_superadmin: isSuperadmin } 
        });
    } catch(e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    // In a real app, you might blacklist the token here
    res.json({ message: 'Logged out successfully' });
});

// Check token status
app.get('/api/auth/status', authenticateToken, async (req, res) => {
     try {
        const user = await db.get('SELECT u.username, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?', req.user.id);
        if (!user) return res.sendStatus(404);
        const isSuperadmin = user.role === 'Superadmin';
        res.json({ username: user.username, role: user.role, is_superadmin: isSuperadmin });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Get Security Questions for a user
app.get('/api/auth/security-questions/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await db.get('SELECT id FROM users WHERE username = ?', username);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const questions = await db.all('SELECT question FROM security_questions WHERE user_id = ?', user.id);
        res.json({ questions: questions.map(q => q.question) });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// Reset password with security questions
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { username, answers, newPassword } = req.body;
        const user = await db.get('SELECT id FROM users WHERE username = ?', username);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const questions = await db.all('SELECT question, answer_hash FROM security_questions WHERE user_id = ?', user.id);
        if (questions.length !== answers.length) {
            return res.status(400).json({ message: 'Incorrect number of answers provided.' });
        }

        let correctAnswers = 0;
        for (let i = 0; i < questions.length; i++) {
            if (await bcrypt.compare(answers[i].toLowerCase(), questions[i].answer_hash)) {
                correctAnswers++;
            }
        }
        
        // Require all answers to be correct
        if (correctAnswers !== questions.length) {
            return res.status(401).json({ message: 'One or more security answers are incorrect.' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.run('UPDATE users SET password = ? WHERE id = ?', hashedPassword, user.id);

        res.json({ message: 'Password has been reset successfully.' });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// DANGEROUS: Reset all credentials
app.post('/api/auth/reset-all', authenticateToken, async (req, res) => {
    try {
        // Ensure only an admin can do this
        const user = await db.get('SELECT r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?', req.user.id);
        if (user.role !== 'Administrator' && user.role !== 'Superadmin') {
            return res.status(403).json({ message: 'Forbidden' });
        }
        
        // Delete all users EXCEPT the permanent superadmin
        await db.run("DELETE FROM security_questions WHERE user_id NOT IN (SELECT id FROM users WHERE username = 'superadmin')");
        await db.run("DELETE FROM users WHERE username != 'superadmin'");

        res.json({ message: 'All non-superadmin accounts have been deleted. Please re-register.' });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// --- Generic DB Proxy Routes ---
app.get('/api/db/:resource', authenticateToken, async (req, res) => {
    try {
        const { resource } = req.params;
        const query = req.query;
        let sql = `SELECT * FROM ${resource}`;
        const params = [];
        if (Object.keys(query).length > 0) {
            sql += ' WHERE ' + Object.keys(query).map(k => `${k} = ?`).join(' AND ');
            params.push(...Object.values(query));
        }
        const data = await db.all(sql, params);
        res.json(data);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/db/:resource', authenticateToken, async (req, res) => {
    try {
        const { resource } = req.params;
        const columns = Object.keys(req.body);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${resource} (${columns.join(', ')}) VALUES (${placeholders})`;
        await db.run(sql, Object.values(req.body));
        res.status(201).json({ message: 'Created' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.patch('/api/db/:resource/:id', authenticateToken, async (req, res) => {
    try {
        const { resource, id } = req.params;
        const columns = Object.keys(req.body);
        const setters = columns.map(col => `${col} = ?`).join(', ');
        const sql = `UPDATE ${resource} SET ${setters} WHERE id = ?`;
        await db.run(sql, [...Object.values(req.body), id]);
        res.json({ message: 'Updated' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.delete('/api/db/:resource/:id', authenticateToken, async (req, res) => {
    try {
        const { resource, id } = req.params;
        await db.run(`DELETE FROM ${resource} WHERE id = ?`, id);
        res.json({ message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/db/sales/clear-all', authenticateToken, async (req, res) => {
    try {
        const { routerId } = req.body;
        await db.run('DELETE FROM sales WHERE routerId = ?', routerId);
        res.json({ message: 'All sales for this router have been cleared.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- Fallback for React Router ---
app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});

// --- Server Startup ---
const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`MikroTik Panel UI server running on http://localhost:${PORT}`);
});
