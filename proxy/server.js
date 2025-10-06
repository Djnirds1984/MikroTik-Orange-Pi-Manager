const express = require('express');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs-extra');
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const port = 3001;

app.use(express.json());
app.use(express.text()); // For AI fixer

// --- ESBuild Middleware for on-the-fly TS/TSX compilation ---
const esbuild = require('esbuild');
const projectRoot = path.resolve(__dirname, '..');

app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const filePath = path.join(projectRoot, req.path);
            const result = await esbuild.build({
                entryPoints: [filePath],
                bundle: true,
                outfile: 'out.js',
                write: false,
                format: 'esm',
                jsx: 'automatic',
                loader: { '.ts': 'ts', '.tsx': 'tsx' },
                external: ['react', 'react-dom/client', '@google/genai', 'recharts'],
            });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(result.outputFiles[0].text);
        } catch (e) {
            console.error('ESBuild compilation error:', e);
            res.status(500).send(`/* ESBuild Error: ${e.message} */`);
        }
    } else {
        next();
    }
});

// --- Database Setup ---
const DB_FILE = path.join(__dirname, 'panel.db');
let db;

async function initializeDatabase() {
    db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    console.log('Connected to the panel database.');

    // --- Create Tables ---
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
            name TEXT NOT NULL,
            price REAL NOT NULL,
            cycle TEXT NOT NULL,
            pppoeProfile TEXT NOT NULL,
            description TEXT,
            currency TEXT DEFAULT 'USD'
        );
        CREATE TABLE IF NOT EXISTS sales_records (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            clientName TEXT NOT NULL,
            planName TEXT NOT NULL,
            planPrice REAL NOT NULL,
            discountAmount REAL NOT NULL,
            finalAmount REAL NOT NULL,
            routerName TEXT NOT NULL,
            currency TEXT DEFAULT 'USD'
        );
        CREATE TABLE IF NOT EXISTS inventory (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL,
            serialNumber TEXT,
            dateAdded TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS company_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS panel_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            routerId TEXT NOT NULL,
            username TEXT NOT NULL,
            fullName TEXT,
            address TEXT,
            contactNumber TEXT,
            email TEXT
        );
    `);
    
    // --- Database Migrations ---
    // Migration for adding client details to sales_records
    const salesColumns = await db.all("PRAGMA table_info(sales_records);");
    const hasClientAddress = salesColumns.some(col => col.name === 'clientAddress');
    if (!hasClientAddress) {
        console.log("Migrating 'sales_records' table: Adding client detail columns...");
        await db.exec(`
            ALTER TABLE sales_records ADD COLUMN clientAddress TEXT;
            ALTER TABLE sales_records ADD COLUMN clientContact TEXT;
            ALTER TABLE sales_records ADD COLUMN clientEmail TEXT;
        `);
    }

    console.log('Database tables initialized/verified.');
}

initializeDatabase().catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
});

// --- Generic DB API ---
const dbRouter = express.Router();

dbRouter.get('/:table', async (req, res) => {
    try {
        const rows = await db.all(`SELECT * FROM ${req.params.table}`);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

dbRouter.post('/:table', async (req, res) => {
    try {
        const columns = Object.keys(req.body).join(', ');
        const placeholders = Object.keys(req.body).map(() => '?').join(', ');
        await db.run(`INSERT INTO ${req.params.table} (${columns}) VALUES (${placeholders})`, Object.values(req.body));
        res.status(201).json(req.body);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

dbRouter.patch('/:table/:id', async (req, res) => {
    try {
        const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
        await db.run(`UPDATE ${req.params.table} SET ${updates} WHERE id = ?`, [...Object.values(req.body), req.params.id]);
        res.json(req.body);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

dbRouter.delete('/:table/:id', async (req, res) => {
    try {
        await db.run(`DELETE FROM ${req.params.table} WHERE id = ?`, req.params.id);
        res.status(204).send();
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.use('/api/db', dbRouter);

// Special endpoint for clearing all sales
app.post('/api/db/sales/clear-all', async (req, res) => {
    try {
        await db.run('DELETE FROM sales_records');
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// --- Key-Value Settings APIs ---
const getSettings = async (tableName) => {
    const rows = await db.all(`SELECT key, value FROM ${tableName}`);
    return rows.reduce((acc, row) => {
        try {
            acc[row.key] = JSON.parse(row.value);
        } catch {
            acc[row.key] = row.value;
        }
        return acc;
    }, {});
};

const saveSettings = async (tableName, settings) => {
    const stmt = await db.prepare(`INSERT OR REPLACE INTO ${tableName} (key, value) VALUES (?, ?)`);
    for (const [key, value] of Object.entries(settings)) {
        await stmt.run(key, JSON.stringify(value));
    }
    await stmt.finalize();
};

app.get('/api/db/company-settings', async (req, res) => res.json(await getSettings('company_settings')));
app.post('/api/db/company-settings', async (req, res) => {
    await saveSettings('company_settings', req.body);
    res.status(200).json({ message: 'Settings saved' });
});

app.get('/api/db/panel-settings', async (req, res) => res.json(await getSettings('panel_settings')));
app.post('/api/db/panel-settings', async (req, res) => {
    await saveSettings('panel_settings', req.body);
    res.status(200).json({ message: 'Settings saved' });
});


// --- Host Status API ---
app.get('/api/host-status', (req, res) => {
    const cmds = {
        cpu: "top -bn1 | grep 'Cpu(s)' | awk '{print $2 + $4}'",
        mem: "free -m | awk 'NR==2{printf \"{\\\"total\\\":\\\"%sM\\\",\\\"used\\\":\\\"%sM\\\",\\\"free\\\":\\\"%sM\\\",\\\"percent\\\":%.0f}\", $2, $3, $4, $3*100/$2 }'",
        disk: "df -h / | awk 'NR==2{printf \"{\\\"total\\\":\\\"%s\\\",\\\"used\\\":\\\"%s\\\",\\\"free\\\":\\\"%s\\\",\\\"percent\\\":%d}\", $2, $3, $4, $5}'"
    };

    const results = {};
    let completed = 0;

    Object.entries(cmds).forEach(([key, cmd]) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing ${key} command:`, stderr);
                results[key] = { error: 'Failed to fetch' };
            } else {
                try {
                    if (key === 'cpu') {
                        results.cpuUsage = parseFloat(stdout.trim());
                    } else {
                        results[key] = JSON.parse(stdout.trim());
                    }
                } catch (e) {
                     results[key] = { error: 'Failed to parse command output' };
                }
            }
            completed++;
            if (completed === Object.keys(cmds).length) {
                res.json(results);
            }
        });
    });
});


// --- ZeroTier Service APIs ---
const executeZTCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(`sudo zerotier-cli ${command}`, (error, stdout, stderr) => {
            if (error) {
                if (stderr.includes("command not found")) {
                    return reject({ code: 'ZEROTIER_NOT_INSTALLED', message: 'zerotier-cli not found.' });
                }
                if (stderr.includes("Cannot connect to ZeroTier service")) {
                    return reject({ code: 'ZEROTIER_SERVICE_DOWN', message: stderr });
                }
                return reject({ code: 'COMMAND_FAILED', message: stderr });
            }
            resolve(stdout);
        });
    });
};

app.get('/api/zt/status', async (req, res) => {
    try {
        const [info, networks] = await Promise.all([
            executeZTCommand('info -j'),
            executeZTCommand('listnetworks -j')
        ]);
        res.json({
            info: JSON.parse(info),
            networks: JSON.parse(networks)
        });
    } catch (error) {
        res.status(500).json(error);
    }
});
// Other ZT endpoints... (join, leave, set, install)
app.post('/api/zt/join', async (req, res) => {
    const { networkId } = req.body;
    try {
        await executeZTCommand(`join ${networkId}`);
        res.json({ message: `Successfully joined network ${networkId}` });
    } catch (error) { res.status(500).json(error); }
});

app.post('/api/zt/leave', async (req, res) => {
    const { networkId } = req.body;
    try {
        await executeZTCommand(`leave ${networkId}`);
        res.json({ message: `Successfully left network ${networkId}` });
    } catch (error) { res.status(500).json(error); }
});

app.post('/api/zt/set', async (req, res) => {
    const { networkId, setting, value } = req.body;
    try {
        await executeZTCommand(`set ${networkId} ${setting}=${value}`);
        res.json({ message: 'Setting updated' });
    } catch (error) { res.status(500).json(error); }
});

app.get('/api/zt/install', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const proc = exec('curl -s https://install.zerotier.com | sudo bash');

    proc.stdout.on('data', data => send({ log: data.toString() }));
    proc.stderr.on('data', data => send({ log: `ERROR: ${data.toString()}` }));

    proc.on('close', code => {
        if (code === 0) {
            send({ status: 'success' });
        } else {
            send({ status: 'error', message: `Installation script failed with code ${code}.` });
        }
        send({ status: 'finished' });
        res.end();
    });
});

// --- AI Fixer APIs ---
const API_BACKEND_FILE = path.resolve(__dirname, '..', 'api-backend', 'server.js');

app.get('/api/fixer/file-content', async (req, res) => {
    try {
        const content = await fs.readFile(API_BACKEND_FILE, 'utf-8');
        res.type('text/plain').send(content);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/fixer/apply-fix', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const newCode = req.body;
    const backupFile = `${API_BACKEND_FILE}.bak-${Date.now()}`;

    const steps = [
        () => fs.copy(API_BACKEND_FILE, backupFile).then(() => send({ log: 'Backup created.' })),
        () => fs.writeFile(API_BACKEND_FILE, newCode).then(() => send({ log: 'New code written.' })),
        () => new Promise((resolve, reject) => {
            exec('pm2 restart mikrotik-api-backend', (err, stdout) => {
                if (err) return reject(err);
                send({ log: stdout });
                resolve();
            });
        }),
    ];

    steps.reduce((p, fn) => p.then(fn), Promise.resolve())
        .then(() => {
            send({ log: 'Backend restarted successfully.', status: 'restarting' });
            res.end();
        })
        .catch(err => {
            send({ log: `ERROR: ${err.message}`, status: 'error' });
            res.end();
        });
});

// --- Report Generation ---
app.post('/api/generate-report', async (req, res) => {
    try {
        const { view, routerName, geminiAnalysis } = req.body;
        const apiBackendCode = await fs.readFile(API_BACKEND_FILE, 'utf-8').catch(() => 'Could not read api-backend/server.js');
        const proxyCode = await fs.readFile(__filename, 'utf-8').catch(() => 'Could not read proxy/server.js');
        
        let report = `--- MIKROTIK PANEL DIAGNOSTIC REPORT ---\n`;
        report += `Date: ${new Date().toISOString()}\n\n`;
        report += `--- AI DIAGNOSIS SUMMARY ---\n${geminiAnalysis}\n\n`;
        report += `--- CONTEXT ---\n`;
        report += `Current View: ${view}\nSelected Router: ${routerName || 'None'}\n\n`;
        report += `--- API BACKEND SERVER (api-backend/server.js) ---\n\n${apiBackendCode}\n\n`;
        report += `--- FRONTEND SERVER (proxy/server.js) ---\n\n${proxyCode}\n`;
        
        res.setHeader('Content-Disposition', 'attachment; filename=mikrotik-panel-report.txt');
        res.setHeader('Content-Type', 'text/plain');
        res.send(report);

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// --- Updater APIs ---
const sendEvent = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

const runCommandStream = (res, command) => {
    const proc = exec(command, { cwd: projectRoot });
    proc.stdout.on('data', data => sendEvent(res, { log: data.toString() }));
    proc.stderr.on('data', data => sendEvent(res, { log: `[stderr] ${data.toString()}` }));
    return new Promise((resolve, reject) => {
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
};

app.get('/api/current-version', async (req, res) => {
    exec('git log -1 --pretty=format:"{\\"title\\": \\"%s\\", \\"hash\\": \\"%h\\", \\"description\\": \\"%b\\"}"', { cwd: projectRoot }, (err, stdout) => {
        if (err) return res.status(500).json({ message: 'Could not get git version.' });
        res.json(JSON.parse(stdout));
    });
});

app.get('/api/update-status', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();

    const check = async () => {
        try {
            await runCommandStream(res, 'git fetch origin main');
            const local = (await execPromise('git rev-parse HEAD')).trim();
            const remote = (await execPromise('git rev-parse origin/main')).trim();
            
            if (local === remote) {
                sendEvent(res, { status: 'uptodate', message: 'Panel is up to date.' });
            } else {
                const newVersionInfoRaw = await execPromise('git log HEAD..origin/main --pretty=format:"{\\"title\\": \\"%s\\", \\"description\\": \\"%b\\", \\"changelog\\": \\"%h: %s%n%b\\"}"');
                const logEntries = newVersionInfoRaw.split('\n').filter(Boolean).map(line => JSON.parse(line));
                const newVersionInfo = {
                    title: logEntries[0].title,
                    description: logEntries[0].description,
                    changelog: logEntries.map(e => e.changelog.replace(/\\n/g, '\n')).join('\n')
                };
                sendEvent(res, { status: 'available', message: 'New version available.', newVersionInfo });
            }
        } catch (e) {
            sendEvent(res, { status: 'error', message: e.message });
        } finally {
            sendEvent(res, { status: 'finished' });
            res.end();
        }
    };
    const execPromise = (cmd) => new Promise((resolve, reject) => exec(cmd, { cwd: projectRoot }, (err, stdout) => err ? reject(err) : resolve(stdout)));
    check();
});

// --- Backup & Restore APIs ---
const BACKUP_DIR = path.join(__dirname, 'backups');
fs.ensureDirSync(BACKUP_DIR);

app.get('/api/create-backup', (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-db-${timestamp}.sqlite3`;
    const backupFilePath = path.join(BACKUP_DIR, backupFileName);

    fs.copy(DB_FILE, backupFilePath)
        .then(() => res.json({ message: `Backup created successfully: ${backupFileName}` }))
        .catch(err => res.status(500).json({ message: `Failed to create backup: ${err.message}` }));
});

app.get('/api/list-backups', async (req, res) => {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        const sortedFiles = files
            .filter(file => file.startsWith('backup-db-') && file.endsWith('.sqlite3'))
            .sort((a, b) => b.localeCompare(a)); // Sort descending
        res.json(sortedFiles);
    } catch (err) {
        res.status(500).json({ message: 'Failed to list backups.' });
    }
});

app.get('/download-backup/:filename', (req, res) => {
    const filename = req.params.filename;
    // Security: Sanitize filename to prevent directory traversal
    if (filename.includes('..')) {
        return res.status(400).send('Invalid filename.');
    }
    const filePath = path.join(BACKUP_DIR, filename);
    res.download(filePath, err => {
        if (err) {
            console.error("Download error:", err);
            res.status(404).send('File not found.');
        }
    });
});

app.post('/api/delete-backup', async (req, res) => {
    const { backupFile } = req.body;
     if (backupFile.includes('..')) {
        return res.status(400).json({ message: 'Invalid filename.' });
    }
    const filePath = path.join(BACKUP_DIR, backupFile);
    try {
        await fs.remove(filePath);
        res.json({ message: `Backup "${backupFile}" deleted successfully.` });
    } catch (err) {
        res.status(500).json({ message: `Failed to delete backup: ${err.message}` });
    }
});

app.post('/api/restore-backup', (req, res) => {
    const { backupFile } = req.body;
    if (backupFile.includes('..')) {
        return res.status(400).json({ message: 'Invalid filename.' });
    }
    const backupFilePath = path.join(BACKUP_DIR, backupFile);

    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const restore = async () => {
        try {
            send({ log: `Starting restore from ${backupFile}...` });
            await db.close(); // Close the current DB connection
            send({ log: 'Database connection closed.' });
            
            await fs.copy(backupFilePath, DB_FILE, { overwrite: true });
            send({ log: 'Backup file copied over the current database.' });

            send({ log: 'Restarting panel service to apply changes...' });
            exec('pm2 restart mikrotik-manager', (err, stdout) => {
                if (err) throw err;
                send({ log: stdout, status: 'restarting' });
                res.end();
            });
        } catch (err) {
            send({ log: `ERROR: ${err.message}`, status: 'error' });
            // Try to re-open the original DB connection if restore fails
            initializeDatabase().catch(console.error);
            res.end();
        }
    };
    restore();
});

// --- Static File Serving ---
app.use(express.static(projectRoot));

app.get('*', (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
});

app.listen(port, () => {
    console.log(`MikroTik Manager UI server running. Listening on http://localhost:${port}`);
});
