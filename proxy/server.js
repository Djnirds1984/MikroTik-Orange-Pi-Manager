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

let db;

// --- Helper Functions ---
const streamToString = (stream) => {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
};

const sendSse = (res, data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const execPromise = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: APP_ROOT }, (error, stdout, stderr) => {
            if (error) {
                // Log the full error but reject with a cleaner message
                console.error(`Exec error for command "${command}":`, error);
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout.trim());
        });
    });
};

function getCPUUsage() {
    return new Promise((resolve) => {
        exec("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'", (err, stdout) => {
            if (err) {
                console.error("Failed to get CPU usage with 'top', falling back to load average.", err);
                const load = os.loadavg();
                const numCPUs = os.cpus().length || 1;
                resolve(Math.min((load[0] / numCPUs) * 100, 100));
                return;
            }
            const usage = parseFloat(stdout.trim());
            resolve(isNaN(usage) ? 0 : usage);
        });
    });
}

// --- Database Initialization ---
const initializeDatabase = async () => {
    try {
        await fs.ensureDir(BACKUP_PATH);
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS users ( id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role_id INTEGER, security_questions TEXT, FOREIGN KEY(role_id) REFERENCES roles(id) );
            CREATE TABLE IF NOT EXISTS roles ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, permissions TEXT, is_deletable BOOLEAN DEFAULT TRUE, is_editable BOOLEAN DEFAULT TRUE, is_superadmin BOOLEAN DEFAULT FALSE );
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
        
        // Seed default roles
        const superadminRole = await db.get("SELECT id FROM roles WHERE name = 'Superadmin'");
        if (!superadminRole) {
            await db.run("INSERT INTO roles (name, permissions, is_deletable, is_editable, is_superadmin) VALUES (?, ?, ?, ?, ?)", 'Superadmin', JSON.stringify(['*:*']), false, false, true);
        }
        
        const adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
        if (!adminRole) {
            const adminPermissions = [
                'dashboard:view', 'scripting:use', 'terminal:use', 'routers:*', 'network:*',
                'pppoe:*', 'billing:*', 'sales:*', 'inventory:*', 'hotspot:*',
                'panel_hotspot:*', 'zerotier:*', 'mikrotik_files:*', 'company:edit',
                'system_settings:edit', 'updater:use', 'super_router:use', 'logs:view', 'help:view'
            ];
            await db.run("INSERT INTO roles (name, permissions, is_deletable, is_editable, is_superadmin) VALUES (?, ?, ?, ?, ?)", 'Administrator', JSON.stringify(adminPermissions), true, true, false);
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
app.use('/locales', express.static(path.join(__dirname, '../locales')));
app.get('/env.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'env.js')));
app.use(express.static(path.join(__dirname, '../dist')));

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
        const user = await db.get('SELECT u.id, u.username, r.name as role, r.permissions, r.is_superadmin FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?', decoded.id);
        if (!user) return res.status(403).json({ message: 'User not found' });
        
        // Parse permissions from JSON string
        try {
            user.permissions = JSON.parse(user.permissions);
        } catch(e) {
            user.permissions = [];
        }
        
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid token' });
    }
};

// --- Auth Routes ---
app.get('/api/auth/has-users', async (req, res) => {
    try {
        const userCount = await db.get("SELECT COUNT(id) as count FROM users WHERE username != 'superadmin'");
        res.json({ hasUsers: userCount.count > 0 });
    } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.get('SELECT u.id, u.username, u.password, r.name as role, r.permissions, r.is_superadmin FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ?', username);
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, user: { id: user.id, username: user.username, role: user.role, permissions: JSON.parse(user.permissions || '[]'), is_superadmin: !!user.is_superadmin } });
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

// --- Host Status API ---
app.get('/api/host-status', authenticateToken, async (req, res) => {
    // ... implementation remains the same
    try {
        const diskUsagePromise = new Promise((resolve) => {
            exec("df -k /", (err, stdout) => {
                if (err) { console.error("Failed to get disk usage:", err); return resolve({ total: 'N/A', used: 'N/A', free: 'N/A', percent: 0 }); }
                try {
                    const lines = stdout.trim().split('\n');
                    const parts = lines[lines.length - 1].trim().split(/\s+/);
                    const [_filesystem, total, used, free, percentStr] = parts;
                    const formatKB = (kb) => { const bytes = parseInt(kb, 10) * 1024; if (bytes === 0) return '0 B'; const k = 1024; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ['B', 'KB', 'MB', 'GB', 'TB'][i]; };
                    resolve({ total: formatKB(total), used: formatKB(used), free: formatKB(free), percent: parseFloat(percentStr) || 0 });
                } catch (parseError) { console.error("Failed to parse 'df' output:", parseError); resolve({ total: 'N/A', used: 'N/A', free: 'N/A', percent: 0 }); }
            });
        });
        const [cpuUsage, disk] = await Promise.all([getCPUUsage(), diskUsagePromise]);
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const formatBytes = (bytes) => { if (bytes === 0) return '0 B'; const i = Math.floor(Math.log(bytes) / Math.log(1024)); return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ['B', 'KB', 'MB', 'GB', 'TB'][i]; };
        res.json({ cpuUsage, memory: { total: formatBytes(totalMemory), free: formatBytes(freeMemory), used: formatBytes(usedMemory), percent: (usedMemory / totalMemory) * 100 }, disk });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Panel Management API (Superadmin only) ---
const isSuperAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_superadmin) {
        return res.status(403).json({ message: 'Forbidden: Super administrator access required.' });
    }
    next();
};

const panelManagementRouter = express.Router();
panelManagementRouter.use(isSuperAdmin);

panelManagementRouter.get('/users', async (req, res) => {
    try {
        const users = await db.all('SELECT u.id, u.username, r.name as role FROM users u JOIN roles r ON u.role_id = r.id');
        res.json(users);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

panelManagementRouter.get('/roles', async (req, res) => {
    try {
        const roles = await db.all('SELECT id, name FROM roles WHERE is_superadmin = FALSE');
        res.json(roles);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

panelManagementRouter.post('/users', async (req, res) => {
    const { username, password, role_id } = req.body;
    if (!username || !password || !role_id) return res.status(400).json({ message: 'Username, password, and role_id are required.' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', username, hashedPassword, role_id);
        res.status(201).json({ message: 'User created successfully' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

panelManagementRouter.patch('/users/:id', async (req, res) => {
    const { role_id } = req.body;
    if (!role_id) return res.status(400).json({ message: 'role_id is required.' });
    try {
        await db.run('UPDATE users SET role_id = ? WHERE id = ?', role_id, req.params.id);
        res.json({ message: 'User role updated successfully' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

panelManagementRouter.delete('/users/:id', async (req, res) => {
    if (req.user.id == req.params.id) return res.status(400).json({ message: 'Cannot delete yourself.' });
    try {
        await db.run('DELETE FROM users WHERE id = ?', req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.use('/api/panel-management', authenticateToken, panelManagementRouter);


// --- Generic DB API ---
app.get('/api/db/:resource', authenticateToken, async (req, res) => {
    const resource = req.params.resource.replace(/-/g, '_');
    try {
        if (resource.endsWith('_settings')) {
            const rows = await db.all(`SELECT * FROM ${resource}`);
            const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
            return res.json(settings);
        }
        const data = await db.all(`SELECT * FROM ${resource}`);
        res.json(data || []);
    } catch(e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/db/:resource', authenticateToken, async (req, res) => {
    const resource = req.params.resource.replace(/-/g, '_');
    try {
        if (resource.endsWith('_settings')) {
            await db.exec('BEGIN');
            for (const [key, value] of Object.entries(req.body)) {
                await db.run(`INSERT OR REPLACE INTO ${resource} (key, value) VALUES (?, ?)`, key, String(value ?? ''));
            }
            await db.exec('COMMIT');
            return res.status(201).json({ message: 'Settings updated' });
        }
        const columns = Object.keys(req.body).join(', ');
        const placeholders = Object.keys(req.body).map(() => '?').join(', ');
        await db.run(`INSERT OR REPLACE INTO ${resource} (${columns}) VALUES (${placeholders})`, Object.values(req.body));
        res.status(201).json({ message: 'Created/Replaced' });
    } catch(e) { res.status(500).json({ message: e.message }); }
});
app.patch('/api/db/:resource/:id', authenticateToken, async (req, res) => {
    const resource = req.params.resource.replace(/-/g, '_');
    try {
        const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(req.body), req.params.id];
        await db.run(`UPDATE ${resource} SET ${updates} WHERE id = ?`, values);
        res.json({ message: 'Updated' });
    } catch(e) { res.status(500).json({ message: e.message }); }
});
app.delete('/api/db/:resource/:id', authenticateToken, async (req, res) => {
    const resource = req.params.resource.replace(/-/g, '_');
    try {
        await db.run(`DELETE FROM ${resource} WHERE id = ?`, req.params.id);
        res.status(204).send();
    } catch(e) { res.status(500).json({ message: e.message }); }
});


// --- Updater and Backup Endpoints ---
app.get('/api/current-version', authenticateToken, async (req, res) => {
    try {
        const pkg = await fs.readJson(path.join(APP_ROOT, 'package.json'));
        const hash = await execPromise('git rev-parse --short HEAD');
        res.json({ title: `v${pkg.version}`, hash });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/update-status', authenticateToken, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const run = async () => {
        try {
            sendSse(res, { log: 'Checking for updates...' });
            await execPromise('git remote update');
            const status = await execPromise('git status -uno');
            if (status.includes('Your branch is up to date')) {
                sendSse(res, { status: 'uptodate', message: 'Panel is up to date.' });
            } else if (status.includes('Your branch is behind')) {
                const log = await execPromise('git log --pretty=format:"%h - %s (%cr)" ..origin/main');
                sendSse(res, { status: 'available', message: 'A new version is available!', newVersionInfo: { title: 'New Update', changelog: log } });
            } else if (status.includes('Your branch is ahead')) {
                sendSse(res, { status: 'ahead', message: 'Your version is ahead of the remote. Manual intervention may be required.' });
            } else {
                sendSse(res, { status: 'diverged', message: 'Your local branch has diverged from the remote.' });
            }
        } catch (e) {
            sendSse(res, { status: 'error', message: e.message, isError: true });
        } finally {
            sendSse(res, { status: 'finished' });
            res.end();
        }
    };
    run();
});

app.get('/api/update-app', authenticateToken, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const run = async () => {
        try {
            sendSse(res, { log: 'Creating backup before update...' });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = `backup-${timestamp}.tar.gz`;
            const archive = archiver('tar', { gzip: true });
            const output = fs.createWriteStream(path.join(BACKUP_PATH, backupFile));
            archive.pipe(output);
            archive.glob('**/*', { cwd: APP_ROOT, ignore: ['proxy/backups/**', 'node_modules/**', '.git/**'] });
            await archive.finalize();
            sendSse(res, { log: `Backup created: ${backupFile}` });

            sendSse(res, { log: 'Pulling latest changes from git...' });
            await execPromise('git pull');
            sendSse(res, { log: 'Installing dependencies for UI server...' });
            await execPromise('npm install --prefix proxy');
            sendSse(res, { log: 'Installing dependencies for API backend...' });
            await execPromise('npm install --prefix api-backend');
            sendSse(res, { log: 'Restarting application services...' });
            await execPromise('pm2 restart all');
            sendSse(res, { status: 'restarting', log: 'Restart signal sent. The application will reload shortly.' });
        } catch (e) {
            sendSse(res, { status: 'error', message: e.message, isError: true });
        } finally {
            sendSse(res, { status: 'finished' });
            res.end();
        }
    };
    run();
});

app.get('/api/list-backups', authenticateToken, async (req, res) => {
    try {
        const files = await fs.readdir(BACKUP_PATH);
        res.json(files.sort().reverse());
    } catch (e) {
        res.status(500).json({ message: `Failed to read backups directory: ${e.message}` });
    }
});

app.post('/api/delete-backup', authenticateToken, async (req, res) => {
    const { backupFile } = req.body;
    if (!backupFile || backupFile.includes('..')) {
        return res.status(400).json({ message: 'Invalid backup filename.' });
    }
    try {
        await fs.remove(path.join(BACKUP_PATH, backupFile));
        res.json({ message: `${backupFile} deleted successfully.` });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/api/rollback-app', authenticateToken, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const run = async () => {
        const { backupFile } = req.query;
        if (!backupFile || backupFile.includes('..')) {
            sendSse(res, { status: 'error', message: 'Invalid backup file.', isError: true });
            res.end();
            return;
        }

        try {
            sendSse(res, { log: `Starting rollback from ${backupFile}...` });
            const backupFilePath = path.join(BACKUP_PATH, backupFile);
            if (!await fs.pathExists(backupFilePath)) throw new Error('Backup file not found.');
            
            sendSse(res, { log: 'Extracting backup...' });
            await tar.x({ file: backupFilePath, cwd: APP_ROOT });
            sendSse(res, { log: 'Restoring dependencies...' });
            await execPromise('npm install --prefix proxy');
            await execPromise('npm install --prefix api-backend');
            sendSse(res, { log: 'Restarting application...' });
            await execPromise('pm2 restart all');
            sendSse(res, { status: 'restarting', log: 'Rollback complete. Application restarting...' });
        } catch (e) {
            sendSse(res, { status: 'error', message: e.message, isError: true });
        } finally {
            sendSse(res, { status: 'finished' });
            res.end();
        }
    };
    run();
});

// --- Database-specific backup endpoint ---
app.get('/api/create-backup', authenticateToken, async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDbPath = path.join(BACKUP_PATH, `panel-db-backup-${timestamp}.sqlite`);
        await fs.copyFile(DB_PATH, backupDbPath);
        res.json({ message: 'Database backup created successfully.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/download-backup/:filename', authenticateToken, (req, res) => {
    const { filename } = req.params;
    if (!filename || filename.includes('..')) {
        return res.status(400).send('Invalid filename.');
    }
    const filePath = path.join(BACKUP_PATH, filename);
    res.download(filePath, (err) => {
        if (err) {
            console.error('Download error:', err);
            res.status(404).send('File not found.');
        }
    });
});

// --- License API (implementation remains) ---
app.get('/api/license/status', authenticateToken, async (req, res) => { /* ... */ });
app.post('/api/license/activate', authenticateToken, async (req, res) => { /* ... */ });
// ... other license endpoints


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