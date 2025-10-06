const express = require('express');
const { build } = require('esbuild');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');
const { exec } = require('child_process');
const fs = require('fs-extra');
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const port = 3001;
const dbPath = path.join(__dirname, 'panel.db');
const backupsDir = path.join(__dirname, 'backups');

app.use(express.json());
app.use(express.text()); // For AI fixer

let db;

// --- Database Initialization ---
const initializeDatabase = async () => {
    try {
        await fs.ensureDir(path.dirname(dbPath));
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        console.log('Connected to the panel database.');

        // Use a versioning system for migrations
        await db.exec('PRAGMA user_version;');
        const { user_version: version } = await db.get('PRAGMA user_version;');
        
        console.log(`Current DB version: ${version}`);

        if (version < 1) {
            console.log('Applying migration v1...');
            await db.exec(`
                CREATE TABLE IF NOT EXISTS routers (id TEXT PRIMARY KEY, name TEXT, host TEXT, user TEXT, password TEXT, port INTEGER);
                CREATE TABLE IF NOT EXISTS billing_plans (id TEXT PRIMARY KEY, name TEXT, price REAL, cycle TEXT, pppoeProfile TEXT, description TEXT);
                CREATE TABLE IF NOT EXISTS sales_records (id TEXT PRIMARY KEY, date TEXT, clientName TEXT, planName TEXT, planPrice REAL, discountAmount REAL, finalAmount REAL, routerName TEXT);
                CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT, quantity INTEGER, price REAL, serialNumber TEXT, dateAdded TEXT);
                CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS panel_settings (key TEXT PRIMARY KEY, value TEXT);
            `);
             await db.exec('PRAGMA user_version = 1;');
            console.log('DB v1 migration complete.');
        }

        if (version < 2) {
            console.log('Applying migration v2...');
            // Check billing_plans table
            const billingColumns = await db.all("PRAGMA table_info(billing_plans);");
            if (!billingColumns.some(c => c.name === 'currency')) {
                await db.exec(`ALTER TABLE billing_plans ADD COLUMN currency TEXT DEFAULT 'USD';`);
                console.log('Added "currency" to billing_plans.');
            }
            // Check sales_records table
            const salesColumns = await db.all("PRAGMA table_info(sales_records);");
            if (!salesColumns.some(c => c.name === 'currency')) {
                await db.exec(`ALTER TABLE sales_records ADD COLUMN currency TEXT DEFAULT 'USD';`);
                 console.log('Added "currency" to sales_records.');
            }
            await db.exec('PRAGMA user_version = 2;');
            console.log('DB v2 migration complete.');
        }

        if (version < 3) {
            console.log('Applying migration v3...');
            // Check if customers table exists
            const customersTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='customers';");
            if (!customersTable) {
                 await db.exec(`
                    CREATE TABLE customers (id TEXT PRIMARY KEY, username TEXT, routerId TEXT, fullName TEXT, address TEXT, contactNumber TEXT, email TEXT);
                `);
                 console.log('Created "customers" table.');
            }
            await db.exec('PRAGMA user_version = 3;');
            console.log('DB v3 migration complete.');
        }

        if (version < 4) {
             console.log('Applying migration v4...');
             const columns = await db.all("PRAGMA table_info(sales_records);");
             const columnNames = columns.map(c => c.name);
             if (!columnNames.includes('clientAddress')) {
                 await db.exec(`ALTER TABLE sales_records ADD COLUMN clientAddress TEXT;`);
             }
             if (!columnNames.includes('clientContact')) {
                 await db.exec(`ALTER TABLE sales_records ADD COLUMN clientContact TEXT;`);
             }
             if (!columnNames.includes('clientEmail')) {
                 await db.exec(`ALTER TABLE sales_records ADD COLUMN clientEmail TEXT;`);
             }
             await db.exec('PRAGMA user_version = 4;');
             console.log('DB v4 migration complete.');
        }


    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
};

// --- Middleware for Compiling TS/TSX ---
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const filePath = path.join(__dirname, '..', req.path);
            const result = await build({
                entryPoints: [filePath],
                bundle: true,
                write: false,
                format: 'esm',
                jsx: 'automatic',
                loader: { '.ts': 'ts', '.tsx': 'tsx' },
                external: ['react', 'react-dom/client', '@google/genai', 'recharts', 'chart.js', 'react-chartjs-2'],
            });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(result.outputFiles[0].text);
        } catch (e) {
            console.error(`esbuild error for ${req.path}:`, e);
            res.status(500).send(`// esbuild error: ${e.message}`);
        }
    } else {
        next();
    }
});


// --- Static File Serving ---
app.use(express.static(path.join(__dirname, '..')));

// --- Helper for streaming command output ---
const streamCommandOutput = (res, command) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const child = exec(command, { cwd: projectRoot });
    
    const sendLog = (log) => {
        res.write(`data: ${JSON.stringify({ log })}\n\n`);
    };

    child.stdout.on('data', (data) => sendLog(data.toString()));
    child.stderr.on('data', (data) => sendLog(`ERROR: ${data.toString()}`));
    
    child.on('close', (code) => {
        if (code === 0) {
            res.write(`data: ${JSON.stringify({ status: 'finished' })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ status: 'error', message: `Process exited with code ${code}` })}\n\n`);
        }
        res.end();
    });
};

// --- Generic Database API ---
const tableMap = {
    'sales': 'sales_records',
    'billing-plans': 'billing_plans'
};

const getTableName = (resource) => {
    return tableMap[resource] || resource;
};

// --- Settings API (Key-Value Store) ---
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

app.get('/api/db/panel-settings', async (req, res, next) => {
    try {
        const settings = await getSettings('panel_settings');
        res.json(settings);
    } catch (err) {
        next(err);
    }
});

app.post('/api/db/panel-settings', async (req, res, next) => {
    try {
        await saveSettings('panel_settings', req.body);
        res.status(200).json({ message: 'Settings saved' });
    } catch (err) {
        next(err);
    }
});

app.get('/api/db/company-settings', async (req, res, next) => {
    try {
        const settings = await getSettings('company_settings');
        res.json(settings);
    } catch (err) {
        next(err);
    }
});

app.post('/api/db/company-settings', async (req, res, next) => {
    try {
        await saveSettings('company_settings', req.body);
        res.status(200).json({ message: 'Settings saved' });
    } catch (err) {
        next(err);
    }
});

// Generic CRUD must be after specific routes
const dbRouter = express.Router();
dbRouter.get('/:resource', async (req, res, next) => {
    try {
        const tableName = getTableName(req.params.resource);
        const items = await db.all(`SELECT * FROM ${tableName}`);
        res.json(items);
    } catch (err) {
        err.message = `[${req.params.resource} -> ${getTableName(req.params.resource)}] ${err.message}`;
        next(err);
    }
});

dbRouter.post('/:resource', async (req, res, next) => {
    try {
        const tableName = getTableName(req.params.resource);
        const columns = Object.keys(req.body).join(', ');
        const placeholders = Object.keys(req.body).map(() => '?').join(', ');
        const values = Object.values(req.body);
        await db.run(`INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`, values);
        res.status(201).json(req.body);
    } catch (err) {
        next(err);
    }
});

dbRouter.patch('/:resource/:id', async (req, res, next) => {
    try {
        const tableName = getTableName(req.params.resource);
        const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(req.body), req.params.id];
        await db.run(`UPDATE ${tableName} SET ${updates} WHERE id = ?`, values);
        res.status(200).json(req.body);
    } catch (err) {
        next(err);
    }
});

dbRouter.delete('/:resource/:id', async (req, res, next) => {
    try {
        const tableName = getTableName(req.params.resource);
        await db.run(`DELETE FROM ${tableName} WHERE id = ?`, req.params.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// Special handler for clearing sales
dbRouter.post('/sales/clear-all', async (req, res, next) => {
    try {
        await db.run('DELETE FROM sales_records');
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

app.use('/api/db', dbRouter);


// --- Updater API ---
const projectRoot = path.join(__dirname, '..');

app.get('/api/current-version', async (req, res, next) => {
    try {
        const command = `git log -1 --pretty=format:'{"hash": "%h", "title": "%s", "description": "%b"}'`;
        exec(command, { cwd: projectRoot }, (err, stdout) => {
            if (err) return next(err);
            try {
                res.json(JSON.parse(stdout.trim()));
            } catch (parseErr) {
                next(parseErr);
            }
        });
    } catch (err) {
        next(err);
    }
});

app.get('/api/update-status', (req, res) => {
    const command = `git fetch origin main && git log HEAD..origin/main --pretty=format:'%h %s'`;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
  
    exec(command, { cwd: projectRoot }, (err, stdout, stderr) => {
      if (err) {
        res.write(`data: ${JSON.stringify({ status: 'error', message: stderr })}\n\n`);
        res.write(`data: ${JSON.stringify({ status: 'finished' })}\n\n`);
        res.end();
        return;
      }
      if (stdout.trim() === '') {
        res.write(`data: ${JSON.stringify({ status: 'uptodate', message: 'Panel is up to date.' })}\n\n`);
        res.write(`data: ${JSON.stringify({ status: 'finished' })}\n\n`);
        res.end();
      } else {
        exec(`git log -1 origin/main --pretty=format:'{"title": "%s", "description": "%b"}'`, { cwd: projectRoot }, (err, out) => {
            try {
                const versionInfo = JSON.parse(out);
                res.write(`data: ${JSON.stringify({ status: 'available', message: 'An update is available.', newVersionInfo: { ...versionInfo, changelog: stdout.trim() } })}\n\n`);
                res.write(`data: ${JSON.stringify({ status: 'finished' })}\n\n`);
                res.end();
            } catch(e) {
                res.write(`data: ${JSON.stringify({ status: 'error', message: 'Could not parse version info.' })}\n\n`);
                res.write(`data: ${JSON.stringify({ status: 'finished' })}\n\n`);
                res.end();
            }
        });
      }
    });
});
  
app.get('/api/update-app', (req, res) => {
    const backupFile = `backup-update-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
    const backupPath = path.join(backupsDir, backupFile);
    const command = `
        set -e
        echo "--- Creating backup: ${backupFile} ---"
        tar -czf ${backupPath} -C ${projectRoot} --exclude=proxy/panel.db --exclude=proxy/backups .
        echo "--- Pulling latest changes from origin/main ---"
        git pull origin main
        echo "--- Installing dependencies for UI server ---"
        npm install --prefix proxy
        echo "--- Installing dependencies for API backend ---"
        npm install --prefix api-backend
        echo "--- Restarting services ---"
        pm2 restart mikrotik-manager mikrotik-api-backend
    `;
    streamCommandOutput(res, command);
});

// --- Backup & Restore API ---
app.get('/api/create-backup', async (req, res, next) => {
    try {
        await fs.ensureDir(backupsDir);
        const backupFile = `manual-backup-${new Date().toISOString().replace(/:/g, '-')}.db`;
        const backupPath = path.join(backupsDir, backupFile);
        await fs.copyFile(dbPath, backupPath);
        res.status(200).json({ message: `Backup created successfully: ${backupFile}` });
    } catch (err) {
        next(err);
    }
});

app.get('/api/list-backups', async (req, res, next) => {
    try {
        await fs.ensureDir(backupsDir);
        const files = await fs.readdir(backupsDir);
        res.status(200).json(files.filter(f => f.endsWith('.db') || f.endsWith('.tar.gz')).sort().reverse());
    } catch (err) {
        next(err);
    }
});

app.get('/download-backup/:filename', (req, res, next) => {
    try {
        const { filename } = req.params;
        // Basic sanitation
        if (filename.includes('..')) {
            return res.status(400).send('Invalid filename.');
        }
        const filePath = path.join(backupsDir, filename);
        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).send('Backup not found');
        }
    } catch (err) {
        next(err);
    }
});

app.post('/api/delete-backup', async (req, res, next) => {
    try {
        const { backupFile } = req.body;
        if (backupFile.includes('..')) {
            return res.status(400).send('Invalid filename.');
        }
        const filePath = path.join(backupsDir, backupFile);
        await fs.remove(filePath);
        res.status(200).json({ message: 'Backup deleted.' });
    } catch (err) {
        next(err);
    }
});

app.get('/api/restore-backup', (req, res) => {
    const { backupFile } = req.query;
    if (backupFile.includes('..')) {
        return res.status(400).send('Invalid filename.');
    }
    const backupPath = path.join(backupsDir, backupFile);
    const command = `
      set -e
      echo "--- Restoring database from ${backupFile} ---"
      cp -f "${backupPath}" "${dbPath}"
      echo "--- Restarting panel service ---"
      pm2 restart mikrotik-manager
    `;
    streamCommandOutput(res, command);
    res.on('finish', () => {
        if (!res.writableEnded) { // Check if we haven't already sent an error
            res.write(`data: ${JSON.stringify({ status: 'restarting' })}\n\n`);
            res.end();
        }
    });
});

// --- ZeroTier Panel API ---
app.get('/api/zt/status', (req, res, next) => {
    exec('zerotier-cli -j info && zerotier-cli -j listnetworks', (err, stdout, stderr) => {
        if (err) {
            if (stderr.includes('command not found')) {
                return res.status(404).json({ message: 'ZeroTier is not installed.', code: 'ZEROTIER_NOT_INSTALLED' });
            }
            if (stderr.includes('port_open_error')) {
                return res.status(503).json({ message: 'Cannot connect to ZeroTier service.', code: 'ZEROTIER_SERVICE_DOWN' });
            }
            return next(new Error(stderr));
        }
        try {
            const parts = stdout.trim().split('\n');
            const info = JSON.parse(parts[0]);
            const networks = JSON.parse(parts[1]);
            res.json({ info, networks });
        } catch (parseErr) {
            next(parseErr);
        }
    });
});

app.get('/api/zt/install', (req, res) => {
    // This command is for Debian-based systems like Armbian
    const command = 'curl -s https://install.zerotier.com | sudo bash';
    streamCommandOutput(res, command);
});

app.post('/api/zt/:action', (req, res, next) => {
    const { action } = req.params;
    const { networkId, setting, value } = req.body;

    let command;
    switch (action) {
        case 'join': command = `zerotier-cli join ${networkId}`; break;
        case 'leave': command = `zerotier-cli leave ${networkId}`; break;
        case 'set': command = `zerotier-cli set ${networkId} ${setting}=${value}`; break;
        default: return res.status(400).json({ message: 'Invalid action.' });
    }

    exec(command, (err, stdout, stderr) => {
        if (err) return next(new Error(stderr));
        res.json({ message: stdout.trim() });
    });
});


// --- AI Fixer & System Report API ---
app.get('/api/fixer/file-content', async (req, res, next) => {
    try {
        const filePath = path.join(__dirname, '..', 'api-backend', 'server.js');
        const content = await fs.readFile(filePath, 'utf-8');
        res.type('text/plain').send(content);
    } catch (err) {
        next(err);
    }
});

app.post('/api/fixer/apply-fix', (req, res) => {
    const newCode = req.body;
    const backendServerPath = path.join(__dirname, '..', 'api-backend', 'server.js');
    const command = `
      set -e
      echo "--- Backing up current api-backend/server.js ---"
      cp "${backendServerPath}" "${backendServerPath}.bak"
      echo "--- Applying new code ---"
      echo "--- Restarting API backend service ---"
      pm2 restart mikrotik-api-backend
    `;
    
    // Write file first, then execute command
    fs.writeFile(backendServerPath, newCode, 'utf-8', (err) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to write new file content.' });
        }
        streamCommandOutput(res, command);
        res.on('finish', () => {
             if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ status: 'restarting' })}\n\n`);
                res.end();
            }
        });
    });
});

app.post('/api/generate-report', async (req, res, next) => {
    try {
        const { view, routerName, geminiAnalysis } = req.body;
        const backendCode = await fs.readFile(path.join(__dirname, '..', 'api-backend', 'server.js'), 'utf-8');

        const report = `
## MikroTik Panel System Report
Date: ${new Date().toISOString()}
Panel View: ${view}
Selected Router: ${routerName || 'None'}

---
## Gemini AI Diagnosis
${geminiAnalysis}
---

## Raw Data

### Panel Backend Code (proxy/server.js)
${await fs.readFile(__filename, 'utf-8')}

### API Backend Code (api-backend/server.js)
${backendCode}
`;
        res.type('text/plain').send(report);
    } catch (err) {
        next(err);
    }
});


// Final catch-all for React router
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message });
});

// --- Start Server ---
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`MikroTik Manager UI running. Listening on port ${port}`);
    });
}).catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});