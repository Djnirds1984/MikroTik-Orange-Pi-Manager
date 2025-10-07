const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const sqlite3 = require('@vscode/sqlite3');
const { open } = require('sqlite');
const esbuild = require('esbuild');
const archiver = require('archiver');
const fsExtra = require('fs-extra');
const tar = require('tar');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'panel.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
const API_BACKEND_FILE = path.join(__dirname, '..', 'api-backend', 'server.js');

app.use(express.json());
app.use(express.text()); // For AI fixer

// Ensure backup directory exists
fs.mkdirSync(BACKUP_DIR, { recursive: true });

let db;

// --- Database Initialization and Migrations ---
async function initDb() {
    try {
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
        console.log('Connected to the panel database.');

        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON;');

        // Migrations
        await db.exec('PRAGMA user_version;');
        let { user_version } = await db.get('PRAGMA user_version;');
        console.log(`Current DB version: ${user_version}`);

        if (user_version < 1) {
            console.log('Applying migration v1...');
            await db.exec(`
                CREATE TABLE IF NOT EXISTS routers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    host TEXT NOT NULL,
                    user TEXT NOT NULL,
                    password TEXT,
                    port INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS panel_settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS billing_plans (id TEXT PRIMARY KEY, name TEXT, price REAL, cycle TEXT, pppoeProfile TEXT, description TEXT);
                CREATE TABLE IF NOT EXISTS sales_records (id TEXT PRIMARY KEY, date TEXT, clientName TEXT, planName TEXT, planPrice REAL, discountAmount REAL, finalAmount REAL, routerName TEXT);
                CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, username TEXT NOT NULL, routerId TEXT NOT NULL, fullName TEXT, address TEXT, contactNumber TEXT, email TEXT);
                CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT, quantity INTEGER, price REAL, serialNumber TEXT, dateAdded TEXT);
            `);
            await db.exec('PRAGMA user_version = 1;');
            user_version = 1;
        }

        if (user_version < 2) {
            console.log('Applying migration v2...');
            // Make migration idempotent: check if column exists before adding
            const billingCols = await db.all("PRAGMA table_info(billing_plans);");
            if (!billingCols.some(c => c.name === 'currency')) {
                await db.exec('ALTER TABLE billing_plans ADD COLUMN currency TEXT;');
            }
            const salesCols = await db.all("PRAGMA table_info(sales_records);");
            if (!salesCols.some(c => c.name === 'currency')) {
                await db.exec('ALTER TABLE sales_records ADD COLUMN currency TEXT;');
            }
            await db.exec('PRAGMA user_version = 2;');
            user_version = 2;
        }
        
        if (user_version < 3) {
             console.log('Applying migration v3...');
            const salesCols = await db.all("PRAGMA table_info(sales_records);");
            if (!salesCols.some(c => c.name === 'clientAddress')) await db.exec('ALTER TABLE sales_records ADD COLUMN clientAddress TEXT;');
            if (!salesCols.some(c => c.name === 'clientContact')) await db.exec('ALTER TABLE sales_records ADD COLUMN clientContact TEXT;');
            if (!salesCols.some(c => c.name === 'clientEmail')) await db.exec('ALTER TABLE sales_records ADD COLUMN clientEmail TEXT;');
            await db.exec('PRAGMA user_version = 3;');
            user_version = 3;
        }
        
        if (user_version < 4) {
            console.log('Applying migration v4 (Settings Table Schema Fix)...');
            // This robustly fixes the settings tables if they have the wrong schema
            const fixSettingsTable = async (tableName) => {
                 const cols = await db.all(`PRAGMA table_info(${tableName});`);
                 // If there's no 'key' column, the schema is wrong.
                 if (!cols.some(c => c.name === 'key')) {
                     console.log(`Rebuilding malformed table: ${tableName}`);
                     await db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old;`);
                     await db.exec(`CREATE TABLE ${tableName} (key TEXT PRIMARY KEY, value TEXT);`);
                     // Attempt to copy old data if possible (best effort)
                     try {
                         // This assumes old tables had single-row data that can be converted
                         const oldData = await db.get(`SELECT * FROM ${tableName}_old LIMIT 1;`);
                         if (oldData) {
                            for (const [key, value] of Object.entries(oldData)) {
                                if (value !== null && value !== undefined) {
                                     await db.run(`INSERT OR REPLACE INTO ${tableName} (key, value) VALUES (?, ?);`, key, JSON.stringify(value));
                                }
                            }
                         }
                     } catch(e) {
                         console.error(`Could not migrate data from ${tableName}_old:`, e.message);
                     }
                     await db.exec(`DROP TABLE ${tableName}_old;`);
                 }
            };
            await fixSettingsTable('company_settings');
            await fixSettingsTable('panel_settings');
            await db.exec('PRAGMA user_version = 4;');
            user_version = 4;
        }


    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

// --- ESBuild Middleware for TS/TSX ---
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const filePath = path.join(__dirname, '..', req.path);
            const source = await fs.promises.readFile(filePath, 'utf8');
            const result = await esbuild.transform(source, {
                loader: req.path.endsWith('.tsx') ? 'tsx' : 'ts',
                format: 'esm'
            });
            res.type('application/javascript').send(result.code);
        } catch (error) {
            console.error(`esbuild error: ${error}`);
            res.status(500).send('Error compiling TypeScript file.');
        }
    } else {
        next();
    }
});

// --- API Endpoints ---

// Host Status
app.get('/api/host-status', (req, res) => {
    const getCpuUsage = () => new Promise(resolve => {
        exec("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'", (err, stdout) => {
            resolve(parseFloat(stdout.trim()) || 0);
        });
    });

    const getMemoryUsage = () => new Promise(resolve => {
        exec("free -m | awk 'NR==2{printf \"{\\\"total\\\":\\\"%sMB\\\", \\\"used\\\":\\\"%sMB\\\", \\\"free\\\":\\\"%sMB\\\", \\\"percent\\\":%.2f}\", $2, $3, $4, $3*100/$2 }'", (err, stdout) => {
             resolve(JSON.parse(stdout));
        });
    });

    const getDiskUsage = () => new Promise(resolve => {
         exec("df -h / | awk 'NR==2{printf \"{\\\"total\\\":\\\"%s\\\", \\\"used\\\":\\\"%s\\\", \\\"free\\\":\\\"%s\\\", \\\"percent\\\":%d}\", $2, $3, $4, $5}'", (err, stdout) => {
            resolve(JSON.parse(stdout));
        });
    });
    
    Promise.all([getCpuUsage(), getMemoryUsage(), getDiskUsage()]).then(([cpu, mem, disk]) => {
        res.json({ cpuUsage: cpu, memory: mem, disk });
    }).catch(err => res.status(500).json({ message: err.message }));
});

// Panel NTP Status
app.get('/api/system/host-ntp-status', (req, res) => {
    exec("timedatectl status | grep 'NTP service:'", (err, stdout, stderr) => {
        if (err) {
            console.error("Failed to get NTP status:", stderr);
            return res.status(500).json({ message: "Could not retrieve NTP status from host. 'timedatectl' may not be available." });
        }
        const enabled = stdout.includes('active');
        res.json({ enabled });
    });
});

app.post('/api/system/host-ntp/toggle', (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean "enabled" property is required.' });
    }
    exec(`sudo timedatectl set-ntp ${enabled}`, (err, stdout, stderr) => {
        if (err) {
            console.error("Failed to toggle NTP:", stderr);
            return res.status(500).json({ message: `Failed to set NTP status. Make sure the panel's user has passwordless sudo rights for 'timedatectl'. Error: ${stderr}` });
        }
        res.json({ message: `NTP service has been ${enabled ? 'enabled' : 'disabled'}.` });
    });
});


// Generic Database API
const tableMap = {
    'sales': 'sales_records',
    'billing-plans': 'billing_plans',
    'company-settings': 'company_settings',
    'panel-settings': 'panel_settings'
};

const dbRouter = express.Router();

dbRouter.use('/:table', (req, res, next) => {
    const originalTable = req.params.table;
    req.tableName = tableMap[originalTable] || originalTable;
    next();
});

dbRouter.get('/:table', async (req, res) => {
    try {
        const items = await db.all(`SELECT * FROM ${req.tableName}`);
        res.json(items);
    } catch (e) { res.status(500).json({ message: e.message }); }
});
// ... more generic routes
dbRouter.post('/:table', async (req, res) => {
    try {
        const columns = Object.keys(req.body).join(', ');
        const placeholders = Object.keys(req.body).map(() => '?').join(', ');
        const values = Object.values(req.body);
        await db.run(`INSERT INTO ${req.tableName} (${columns}) VALUES (${placeholders})`, values);
        res.status(201).json({ message: 'Created' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

dbRouter.patch('/:table/:id', async (req, res) => {
     try {
        const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(req.body), req.params.id];
        await db.run(`UPDATE ${req.tableName} SET ${updates} WHERE id = ?`, values);
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});
dbRouter.delete('/:table/:id', async (req, res) => {
    try {
        await db.run(`DELETE FROM ${req.tableName} WHERE id = ?`, req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ message: e.message }); }
});
dbRouter.post('/:table/clear-all', async (req, res) => {
    try {
        await db.run(`DELETE FROM ${req.tableName}`);
        res.status(204).send();
    } catch(e) { res.status(500).json({ message: e.message }); }
});

// --- Database Routes ---

// Special handlers for key-value settings tables
const createSettingsHandler = (tableName) => async (req, res) => {
    try {
        const rows = await db.all(`SELECT * FROM ${tableName}`);
        const settings = rows.reduce((acc, row) => {
            try { acc[row.key] = JSON.parse(row.value); }
            catch { acc[row.key] = row.value; }
            return acc;
        }, {});
        res.json(settings);
    } catch (e) { res.status(500).json({ message: e.message }); }
};
const createSettingsSaver = (tableName) => async (req, res) => {
    try {
        await db.exec('BEGIN TRANSACTION;');
        for (const [key, value] of Object.entries(req.body)) {
            await db.run(`INSERT OR REPLACE INTO ${tableName} (key, value) VALUES (?, ?);`, key, JSON.stringify(value));
        }
        await db.exec('COMMIT;');
        res.json({ message: 'Settings saved.' });
    } catch (e) {
        await db.exec('ROLLBACK;');
        res.status(500).json({ message: e.message });
    }
};

// FIX: Define specific routes BEFORE the generic `dbRouter` to ensure they are matched first.
app.get('/api/db/panel-settings', createSettingsHandler('panel_settings'));
app.post('/api/db/panel-settings', createSettingsSaver('panel_settings'));
app.get('/api/db/company-settings', createSettingsHandler('company_settings'));
app.post('/api/db/company-settings', createSettingsSaver('company_settings'));

// All other /api/db routes will be handled by the generic router.
app.use('/api/db', dbRouter);


// --- ZeroTier CLI ---
const ztCli = (command) => new Promise((resolve, reject) => {
    exec(`sudo zerotier-cli -j ${command}`, (error, stdout, stderr) => {
        if (error) {
             if (stderr.includes("zerotier-cli: missing authentication token")) {
                return reject({ status: 500, code: 'ZEROTIER_SERVICE_DOWN', message: 'ZeroTier service is not running or token is missing.' });
            }
             if (error.message.includes('No such file or directory')) {
                return reject({ status: 404, code: 'ZEROTIER_NOT_INSTALLED', message: 'zerotier-cli not found.' });
            }
            return reject({ status: 500, message: stderr || error.message });
        }
        resolve(JSON.parse(stdout));
    });
});

app.get('/api/zt/status', async (req, res) => {
    try {
        const [info, networks] = await Promise.all([ztCli('info'), ztCli('listnetworks')]);
        res.json({ info, networks });
    } catch (err) {
        res.status(err.status || 500).json({ message: err.message, code: err.code });
    }
});
// ... other ZT routes
app.post('/api/zt/join', async (req, res) => {
    try {
        const { networkId } = req.body;
        await ztCli(`join ${networkId}`);
        res.json({ message: 'Join command sent.' });
    } catch(err) { res.status(err.status || 500).json({ message: err.message }); }
});
app.post('/api/zt/leave', async (req, res) => {
    try {
        const { networkId } = req.body;
        await ztCli(`leave ${networkId}`);
        res.json({ message: 'Leave command sent.' });
    } catch(err) { res.status(err.status || 500).json({ message: err.message }); }
});
app.post('/api/zt/set', async (req, res) => {
    try {
        const { networkId, setting, value } = req.body;
        await ztCli(`set ${networkId} ${setting}=${value}`);
        res.json({ message: 'Setting updated.' });
    } catch(err) { res.status(err.status || 500).json({ message: err.message }); }
});

// ZT Installer
app.get('/api/zt/install', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const child = exec('curl -s https://install.zerotier.com | sudo bash');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    child.stdout.on('data', log => send({ log }));
    child.stderr.on('data', log => send({ log }));
    child.on('close', code => {
        if (code === 0) {
            send({ status: 'success' });
        } else {
            send({ status: 'error', message: 'Installation script failed.' });
        }
        send({ status: 'finished' });
        res.end();
    });
});


// --- AI Fixer ---
app.get('/api/fixer/file-content', async (req, res) => {
    try {
        const content = await fs.promises.readFile(API_BACKEND_FILE, 'utf-8');
        res.type('text/plain').send(content);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.post('/api/fixer/apply-fix', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    const newCode = req.body;
    
    const apply = async () => {
        try {
            send({ log: 'Writing new code to api-backend/server.js...' });
            await fs.promises.writeFile(API_BACKEND_FILE, newCode, 'utf-8');
            send({ log: 'Restarting the API backend service with pm2...' });
            
            exec('pm2 restart mikrotik-api-backend', (err, stdout, stderr) => {
                if (err) {
                    send({ log: `PM2 restart failed: ${stderr}` });
                    send({ status: 'error', message: 'Failed to restart backend service.' });
                } else {
                    send({ log: 'Backend service restarted successfully.' });
                    send({ status: 'restarting' });
                }
                res.end();
            });

        } catch (e) {
            send({ status: 'error', message: e.message });
            res.end();
        }
    };
    apply();
});

// Report Generator
app.post('/api/generate-report', async (req, res) => {
    try {
        const { view, routerName, geminiAnalysis } = req.body;
        const backendCode = await fs.promises.readFile(API_BACKEND_FILE, 'utf-8').catch(() => 'Could not read backend file.');
        
        let report = `--- MIKROTIK PANEL SYSTEM REPORT ---\n`;
        report += `Date: ${new Date().toISOString()}\n\n`;
        report += `--- AI DIAGNOSIS SUMMARY ---\n${geminiAnalysis}\n\n`;
        report += `--- CONTEXT ---\n`;
        report += `Current View: ${view}\n`;
        report += `Selected Router: ${routerName || 'None'}\n\n`;
        report += `--- BACKEND CODE (api-backend/server.js) ---\n\n${backendCode}\n`;
        
        res.setHeader('Content-disposition', 'attachment; filename=mikrotik-panel-report.txt');
        res.setHeader('Content-type', 'text/plain');
        res.charset = 'UTF-8';
        res.write(report);
        res.end();

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// --- Updater and Backups ---
const runCommandStream = (command, res, options = {}) => {
    return new Promise((resolve, reject) => {
        const child = exec(command, { cwd: path.join(__dirname, '..'), ...options });
        
        const stdoutChunks = [];
        const stderrChunks = [];

        child.stdout.on('data', data => {
            const log = data.toString();
            if (res) res.write(`data: ${JSON.stringify({ log })}\n\n`);
            stdoutChunks.push(log);
        });

        child.stderr.on('data', data => {
            const log = data.toString();
            const isError = !log.startsWith('Receiving objects:') && !log.startsWith('Resolving deltas:');
            if (res) res.write(`data: ${JSON.stringify({ log, isError })}\n\n`);
            stderrChunks.push(log);
        });

        child.on('close', code => {
            const stdout = stdoutChunks.join('').trim();
            const stderr = stderrChunks.join('').trim();
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr || `Command failed with exit code ${code}`));
            }
        });

        child.on('error', err => {
            reject(err);
        });
    });
};

const runCommand = (command) => runCommandStream(command, null);

app.get('/api/current-version', async (req, res) => {
    try {
        await runCommand("git rev-parse --is-inside-work-tree");
        exec("git log -1 --pretty=format:'{\"hash\": \"%h\", \"title\": \"%s\", \"description\": \"%b\"}'", { cwd: path.join(__dirname, '..') }, (err, stdout) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(JSON.parse(stdout.trim()));
        });
    } catch(e) {
        res.status(500).json({ message: "This does not appear to be a git repository."});
    }
});

app.get('/api/update-status', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        send({ log: "Verifying git repository..." });
        await runCommand('git rev-parse --is-inside-work-tree');
        
        send({ log: "Connecting to remote repository..." });
        await runCommandStream('git fetch', res);
        send({ log: "Remote repository checked." });

        const [local, remote, mergeBase] = await Promise.all([
            runCommand('git rev-parse HEAD'),
            runCommand('git rev-parse @{u}'),
            runCommand('git merge-base HEAD @{u}')
        ]);
        
        if (local === remote) {
            send({ status: 'uptodate', message: 'Panel is up to date.' });
        } else if (local === mergeBase) {
            send({ status: 'available', message: 'New version available.' });
            const changelog = await runCommand("git log ..origin/main --pretty=format:'%h - %s (%cr)'");
            send({ newVersionInfo: {
                title: "New update found",
                description: "A new version of the panel is available.",
                changelog: changelog.trim()
            }});
        } else if (remote === mergeBase) {
            send({ status: 'ahead', message: 'Your version is ahead of the official repository.' });
        } else {
            send({ status: 'diverged', message: 'Your version has diverged. Manual update required.' });
        }

    } catch (e) {
        let message = e.message;
        if (message.includes('fatal: not a git repository')) {
            message = 'This is not a git repository. The updater requires the application to be cloned from git.';
        } else if (message.includes('Could not resolve host: github.com') || message.includes('fatal: unable to access')) {
            message = 'Failed to connect to GitHub. Please check your server\'s internet connection and DNS settings.';
        } else if (message.includes('fatal: no upstream configured')) {
            message = 'Git repository has no upstream branch configured. Unable to check for updates.';
        }
        send({ status: 'error', message });
    } finally {
        send({ status: 'finished' });
        res.end();
    }
});

app.get('/api/update-app', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        const backupFile = `backup-update-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
        send({ log: `Creating application backup: ${backupFile}...` });
        
        const projectRoot = path.join(__dirname, '..');
        const archivePath = path.join(BACKUP_DIR, backupFile);
        
        // FIX: Use system tar command for reliability and streaming output
        const tarCommand = `tar -czf "${archivePath}" --exclude="./proxy/backups" --exclude="./.git" --exclude="**/node_modules" -C "${projectRoot}" .`;
        await runCommandStream(tarCommand, res);
        
        send({ log: 'Backup complete.' });
        
        send({ log: 'Pulling latest changes from git...' });
        await runCommandStream('git pull', res);
        
        send({ log: 'Installing dependencies for UI server...' });
        await runCommandStream('npm install --prefix proxy', res);

        send({ log: 'Installing dependencies for API backend...' });
        await runCommandStream('npm install --prefix api-backend', res);
        
        send({ log: 'Restarting panel services...' });
        exec('pm2 restart all', (err, stdout) => {
            if (err) {
                 send({ log: `PM2 restart failed: ${err.message}`, isError: true });
                 send({ status: 'error', message: err.message });
            } else {
                send({ log: stdout });
                send({ status: 'restarting' });
            }
            res.end();
        });

    } catch(e) {
        send({ log: e.message, isError: true });
        send({ status: 'error', message: e.message });
        res.end();
    }
});

app.get('/api/rollback-app', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const { backupFile } = req.query;
    if (!backupFile || backupFile.includes('..') || !backupFile.endsWith('.tar.gz')) {
        send({ status: 'error', message: 'Invalid application backup file specified.' });
        return res.end();
    }

    const rollback = async () => {
        try {
            send({ log: `Starting application rollback from ${backupFile}...`});
            const backupPath = path.join(BACKUP_DIR, backupFile);
            if (!fs.existsSync(backupPath)) {
                throw new Error('Backup file not found.');
            }
            
            send({ log: 'Extracting backup over current application files...'});
            const projectRoot = path.join(__dirname, '..');
            // FIX: Use system tar command for reliability and streaming output
            const tarCommand = `tar -xzf "${backupPath}" -C "${projectRoot}"`;
            await runCommandStream(tarCommand, res);


            send({ log: 'Re-installing dependencies for UI server...'});
            await runCommandStream('npm install --prefix proxy', res);

            send({ log: 'Re-installing dependencies for API backend...'});
            await runCommandStream('npm install --prefix api-backend', res);

            send({ log: 'Restarting panel services...'});
            exec('pm2 restart all', (err, stdout) => {
                 if (err) {
                     send({ log: `PM2 restart failed: ${err.message}`, isError: true });
                     send({ status: 'error', message: err.message });
                } else {
                    send({ log: stdout });
                    send({ status: 'restarting' });
                }
                res.end();
            });

        } catch (e) {
            send({ log: e.message, isError: true });
            send({ status: 'error', message: e.message });
            res.end();
        }
    };
    rollback();
});


// Database Backup/Restore
app.get('/api/create-backup', async (req, res) => {
    const backupFile = `panel-db-backup-${new Date().toISOString().replace(/:/g, '-')}.sqlite`;
    try {
        await fs.promises.copyFile(DB_PATH, path.join(BACKUP_DIR, backupFile));
        res.json({ message: `Backup created successfully: ${backupFile}` });
    } catch(e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/list-backups', async (req, res) => {
    try {
        const dirents = await fs.promises.readdir(BACKUP_DIR, { withFileTypes: true });
        // Filter out directories and hidden files, then sort
        const files = dirents
            .filter(dirent => dirent.isFile() && !dirent.name.startsWith('.'))
            .map(dirent => dirent.name)
            .sort()
            .reverse();
        res.json(files);
    } catch (e) { res.status(500).json({ message: e.message }); }
});


app.post('/api/delete-backup', async (req, res) => {
    try {
        const { backupFile } = req.body;
        // Basic path sanitization
        if (backupFile.includes('..')) return res.status(400).json({ message: 'Invalid filename' });
        await fs.promises.unlink(path.join(BACKUP_DIR, backupFile));
        res.json({ message: 'Backup deleted.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/download-backup/:filename', (req, res) => {
    const { filename } = req.params;
    if (filename.includes('..')) return res.status(400).send('Invalid filename');
    res.download(path.join(BACKUP_DIR, filename));
});

app.get('/api/restore-backup', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const { backupFile } = req.query;
    if (!backupFile || backupFile.includes('..')) {
        send({ status: 'error', message: 'Invalid backup file specified.' });
        return res.end();
    }

    const restore = async () => {
        try {
            send({ log: 'Closing current database connection...'});
            if(db) await db.close();

            send({ log: `Restoring from ${backupFile}...`});
            await fs.promises.copyFile(path.join(BACKUP_DIR, backupFile), DB_PATH);

            send({ log: 'Restarting panel service...'});
            exec('pm2 restart mikrotik-manager', (err) => {
                if (err) send({ status: 'error', message: err.message });
                else send({ status: 'restarting' });
                res.end();
            });

        } catch (e) {
            send({ status: 'error', message: e.message });
            res.end();
        }
    };
    restore();
});


// --- Static file serving ---
app.use(express.static(path.join(__dirname, '..')));

// SPA Fallback:
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// --- Start Server ---
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`MikroTik Manager UI server running. Listening on http://localhost:${PORT}`);
    });
});