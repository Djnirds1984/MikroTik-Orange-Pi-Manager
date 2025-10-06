
const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('@vscode/sqlite3');
const fs = require('fs-extra');
const { exec } = require('child_process');
const archiver = require('archiver');
const tar = require('tar');
const esbuild = require('esbuild');

const app = express();
const port = 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Middleware to compile TSX/TS files on the fly
app.get(/\.(tsx|ts)$/, async (req, res, next) => {
  try {
    // Construct the file path relative to the project root
    const filePath = path.join(__dirname, '..', req.path);

    // Check if the file exists
    if (!await fs.pathExists(filePath)) {
      return next(); // Pass to the next middleware (express.static) if not found
    }

    const source = await fs.readFile(filePath, 'utf-8');

    // Use esbuild to transform the TSX/TS code to JavaScript
    const result = await esbuild.transform(source, {
      loader: req.path.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'esm',
      sourcemap: 'inline', // Good for debugging
    });

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(result.code);
  } catch (error) {
    console.error(`esbuild compilation error for ${req.path}:`, error);
    // Send a response that shows the error in the browser console
    res.status(500).send(`/* ESBuild Compilation Error:\n${error.message.replace(/\*\//g, '*\\/')}\n*/`);
  }
});


// --- Database Setup ---
let db;
const dbPath = path.join(__dirname, 'panel.db');

async function initializeDatabase() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    console.log('Connected to the panel database.');

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
            currency TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS company_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            companyName TEXT,
            address TEXT,
            contactNumber TEXT,
            email TEXT,
            logoBase64 TEXT
        );
        CREATE TABLE IF NOT EXISTS panel_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            routerId TEXT NOT NULL,
            fullName TEXT,
            address TEXT,
            contactNumber TEXT,
            email TEXT,
            UNIQUE(username, routerId)
        );
    `);
    
    // Ensure default settings exist
    await db.run("INSERT OR IGNORE INTO panel_settings (key, value) VALUES ('language', 'en')");
    await db.run("INSERT OR IGNORE INTO panel_settings (key, value) VALUES ('currency', 'USD')");
    await db.run("INSERT OR IGNORE INTO company_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM company_settings WHERE id = 1)");


  } catch (err) {
    console.error('Database initialization error:', err.message);
    process.exit(1);
  }
}

// --- Generic DB API Handlers ---
const handleDbGet = (table) => async (req, res) => {
  try {
    // Replace hyphens for table names
    const tableName = table.replace(/-/g, '_');
    const items = await db.all(`SELECT * FROM ${tableName}`);
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handleDbPost = (table) => async (req, res) => {
  try {
    const tableName = table.replace(/-/g, '_');
    const item = req.body;
    const columns = Object.keys(item).join(', ');
    const placeholders = Object.keys(item).map(() => '?').join(', ');
    const values = Object.values(item);
    await db.run(`INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`, values);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handleDbPatch = (table) => async (req, res) => {
  try {
    const tableName = table.replace(/-/g, '_');
    const { id } = req.params;
    const fields = req.body;
    delete fields.id;
    const setClause = Object.keys(fields).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(fields), id];
    await db.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, values);
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const handleDbDelete = (table) => async (req, res) => {
  try {
    const tableName = table.replace(/-/g, '_');
    const { id } = req.params;
    await db.run(`DELETE FROM ${tableName} WHERE id = ?`, id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// --- Database API Endpoints ---
const dbRouter = express.Router();
['routers', 'billing-plans', 'sales', 'inventory', 'customers'].forEach(table => {
    const endpoint = `/${table}`;
    dbRouter.get(endpoint, handleDbGet(table));
    dbRouter.post(endpoint, handleDbPost(table));
    dbRouter.patch(`${endpoint}/:id`, handleDbPatch(table));
    dbRouter.delete(`${endpoint}/:id`, handleDbDelete(table));
});

// Custom endpoints
dbRouter.post('/sales/clear-all', async (req, res) => {
    try {
        await db.run('DELETE FROM sales_records');
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Company Settings
dbRouter.get('/company-settings', async (req, res) => {
    try {
        const settings = await db.get('SELECT * FROM company_settings WHERE id = 1');
        res.json(settings || {});
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
dbRouter.post('/company-settings', async (req, res) => {
    try {
        const settings = req.body;
        await db.run(
            `UPDATE company_settings SET companyName = ?, address = ?, contactNumber = ?, email = ?, logoBase64 = ? WHERE id = 1`,
            [settings.companyName, settings.address, settings.contactNumber, settings.email, settings.logoBase64]
        );
        res.json({ message: 'Settings saved' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Panel Settings
dbRouter.get('/panel-settings', async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM panel_settings');
        const settings = rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
dbRouter.post('/panel-settings', async (req, res) => {
    try {
        const settings = req.body;
        for (const key in settings) {
            await db.run('UPDATE panel_settings SET value = ? WHERE key = ?', [settings[key], key]);
        }
        res.json({ message: 'Settings saved' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.use('/api/db', dbRouter);

// --- ZeroTier CLI Endpoints ---
const ztCliCommand = (command) => {
    return new Promise((resolve, reject) => {
        // Use sudo if available
        const cmd = `command -v sudo >/dev/null && sudo zerotier-cli ${command} || zerotier-cli ${command}`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                if (stderr.includes('zerotier-cli: missing authentication token and authtoken.secret not found')) {
                    return reject({ code: 'ZEROTIER_SERVICE_DOWN', message: stderr });
                }
                if (stderr.includes('command not found')) {
                     return reject({ code: 'ZEROTIER_NOT_INSTALLED', message: stderr });
                }
                return reject({ code: 'COMMAND_FAILED', message: stderr || error.message });
            }
            resolve(stdout);
        });
    });
};

app.get('/api/zt/status', async (req, res) => {
    try {
        const [info, networks] = await Promise.all([
            ztCliCommand('-j info'),
            ztCliCommand('-j listnetworks')
        ]);
        res.json({
            info: JSON.parse(info),
            networks: JSON.parse(networks)
        });
    } catch (error) {
        res.status(500).json({ message: error.message, code: error.code });
    }
});

app.post('/api/zt/join', async (req, res) => {
    try {
        const { networkId } = req.body;
        const result = await ztCliCommand(`join ${networkId}`);
        res.json({ message: result });
    } catch (error) {
        res.status(500).json({ message: error.message, code: error.code });
    }
});

app.post('/api/zt/leave', async (req, res) => {
    try {
        const { networkId } = req.body;
        const result = await ztCliCommand(`leave ${networkId}`);
        res.json({ message: result });
    } catch (error) {
        res.status(500).json({ message: error.message, code: error.code });
    }
});

app.post('/api/zt/set', async (req, res) => {
    try {
        const { networkId, setting, value } = req.body;
        const result = await ztCliCommand(`set ${networkId} ${setting}=${value}`);
        res.json({ message: result });
    } catch (error) {
        res.status(500).json({ message: error.message, code: error.code });
    }
});

// --- File System & Panel Management ---
const projectRoot = path.join(__dirname, '..');
const apiBackendPath = path.join(projectRoot, 'api-backend', 'server.js');
const envJsPath = path.join(projectRoot, 'env.js');

app.get('/api/fixer/file-content', async (req, res) => {
    try {
        const content = await fs.readFile(apiBackendPath, 'utf-8');
        res.type('text/plain').send(content);
    } catch (error) {
        res.status(500).send('Could not read backend server file.');
    }
});

const streamLog = (res, message) => {
    res.write(`data: ${JSON.stringify({ log: message })}\n\n`);
};

app.post('/api/fixer/apply-fix', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const newCode = req.body;
    (async () => {
        try {
            streamLog(res, '>>> Backing up current backend server file...');
            await fs.copy(apiBackendPath, `${apiBackendPath}.bak`);
            streamLog(res, '>>> Backup created.');

            streamLog(res, '>>> Writing new code to backend server file...');
            await fs.writeFile(apiBackendPath, newCode);
            streamLog(res, '>>> File written successfully.');

            streamLog(res, '>>> Restarting API backend service via pm2...');
            res.write(`data: ${JSON.stringify({ status: 'restarting' })}\n\n`);

            exec('pm2 restart mikrotik-api-backend', (error, stdout, stderr) => {
                // This part might not be reached if the connection is severed by the restart
                if (error) {
                    console.error(`pm2 restart error: ${error}`);
                    streamLog(res, `>>> PM2 restart command failed: ${stderr}`);
                    res.write(`data: ${JSON.stringify({ status: 'error', message: stderr })}\n\n`);
                } else {
                    streamLog(res, `>>> PM2 restart successful: ${stdout}`);
                }
                res.end();
            });
        } catch (error) {
            streamLog(res, `>>> An error occurred: ${error.message}`);
            res.write(`data: ${JSON.stringify({ status: 'error', message: error.message })}\n\n`);
            res.end();
        }
    })();
});

// --- Updater ---
const sendSse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

app.get('/api/update-status', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const commands = [
        'git fetch origin',
        'git status -uno'
    ];

    let commandIndex = 0;

    function runNextCommand() {
        if (commandIndex >= commands.length) {
            sendSse(res, { status: 'finished' });
            res.end();
            return;
        }

        const command = commands[commandIndex];
        sendSse(res, { log: `> ${command}` });

        const child = exec(command, { cwd: projectRoot });

        child.stdout.on('data', (data) => {
            const output = data.toString();
            sendSse(res, { log: output });
            
            if (command.includes('git status')) {
                if (output.includes('Your branch is up to date')) {
                    sendSse(res, { status: 'uptodate', message: 'Panel is already up to date.' });
                } else if (output.includes('Your branch is behind')) {
                     exec('git log HEAD..origin/main --oneline', { cwd: projectRoot }, (err, stdout) => {
                        const newVersionInfo = {
                            title: 'New version found',
                            description: 'A new version of the panel is available.',
                            changelog: stdout || 'Could not retrieve changelog.'
                        };
                        sendSse(res, { status: 'available', message: 'New version available!', newVersionInfo });
                    });
                } else if (output.includes('have diverged')) {
                    sendSse(res, { status: 'diverged', message: 'Branch has diverged from origin. Manual intervention required.' });
                }
            }
        });

        child.stderr.on('data', (data) => {
            sendSse(res, { log: `ERROR: ${data.toString()}` });
            sendSse(res, { status: 'error', message: 'An error occurred during check.' });
            res.end();
        });

        child.on('close', (code) => {
            if (code !== 0 && res.writable) {
                 // Error was already handled by stderr listener
            } else {
                commandIndex++;
                runNextCommand();
            }
        });
    }

    runNextCommand();
});

app.get('/api/current-version', (req, res) => {
    exec('git log -1 --pretty=format:"%h%n%s%n%b"', { cwd: projectRoot }, (err, stdout) => {
        if (err) {
            return res.status(500).json({ error: 'Could not get current version' });
        }
        const [hash, title, ...description] = stdout.split('\n');
        res.json({ hash, title, description: description.join('\n').trim() });
    });
});

app.get('/api/update-app', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const backupDir = path.join(projectRoot, 'backups');
    const backupFileName = `backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
    const backupFilePath = path.join(backupDir, backupFileName);

    const commands = [
        `mkdir -p ${backupDir}`,
        `tar -czf ${backupFilePath} --exclude=backups --exclude=.git --exclude=node_modules --exclude=api-backend/node_modules --exclude=proxy/node_modules .`,
        'git reset --hard origin/main',
        'npm install --prefix proxy',
        'npm install --prefix api-backend',
        'pm2 restart all'
    ];
    let cmdIdx = 0;

    const run = () => {
        if (cmdIdx >= commands.length) {
            sendSse(res, { status: 'restarting' });
            res.end();
            return;
        }
        const cmd = commands[cmdIdx];
        sendSse(res, { log: `\n> ${cmd}` });
        const child = exec(cmd, { cwd: projectRoot });
        child.stdout.on('data', data => sendSse(res, { log: data.toString() }));
        child.stderr.on('data', data => sendSse(res, { log: `STDERR: ${data.toString()}` }));
        child.on('close', code => {
            if (code !== 0) {
                sendSse(res, { status: 'error', message: `Command failed with code ${code}.` });
                res.end();
            } else {
                cmdIdx++;
                run();
            }
        });
    };
    run();
});

app.get('/api/list-backups', async (req, res) => {
    try {
        const backupDir = path.join(projectRoot, 'backups');
        await fs.ensureDir(backupDir);
        const files = await fs.readdir(backupDir);
        res.json(files.filter(f => f.endsWith('.tar.gz')).sort().reverse());
    } catch (error) {
        res.status(500).json({ message: 'Failed to list backups.' });
    }
});

app.post('/api/delete-backup', async (req, res) => {
    try {
        const { backupFile } = req.body;
        if (!backupFile || !/^[a-zA-Z0-9_.-]+\.tar\.gz$/.test(backupFile)) {
            return res.status(400).json({ message: 'Invalid backup file name.' });
        }
        const filePath = path.join(projectRoot, 'backups', backupFile);
        await fs.remove(filePath);
        res.json({ message: 'Backup deleted.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete backup.' });
    }
});

app.get('/api/rollback', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const { backupFile } = req.query;
    if (!backupFile || !/^[a-zA-Z0-9_.-]+\.tar\.gz$/.test(backupFile)) {
        sendSse(res, { status: 'error', message: 'Invalid backup file name.' });
        return res.end();
    }
    const backupFilePath = path.join(projectRoot, 'backups', backupFile);
    
    sendSse(res, { log: `Starting rollback from ${backupFile}` });
    
    fs.exists(backupFilePath)
    .then(exists => {
        if (!exists) throw new Error('Backup file not found.');
        
        sendSse(res, { log: '>>> Extracting backup...' });
        return tar.x({
            file: backupFilePath,
            cwd: projectRoot,
            onentry: (entry) => sendSse(res, {log: `Restoring ${entry.path}`})
        });
    })
    .then(() => {
        sendSse(res, { log: '>>> Extraction complete. Restarting services...' });
        return new Promise((resolve, reject) => {
            exec('pm2 restart all', { cwd: projectRoot }, (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr));
                sendSse(res, { log: stdout });
                resolve();
            });
        });
    })
    .then(() => {
        sendSse(res, { status: 'restarting' });
        res.end();
    })
    .catch(err => {
        sendSse(res, { status: 'error', message: err.message });
        res.end();
    });
});

// --- Panel Management ---
const execSudo = (command, res) => {
    return new Promise((resolve, reject) => {
        exec(`sudo ${command}`, (error, stdout, stderr) => {
            if (error) {
                 if (stderr.includes('sudo: a password is required')) {
                    return reject(new Error("This action requires the panel's user to have passwordless sudo permissions."));
                 }
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout);
        });
    });
}
app.post('/api/panel/reboot', async (req, res) => {
    try {
        await execSudo('reboot');
        res.json({ message: 'Reboot command sent to panel host.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/panel/gemini-key', async (req, res) => {
    try {
        const content = await fs.readFile(envJsPath, 'utf-8');
        const match = content.match(/API_KEY:\s*"([^"]*)"/);
        res.json({ apiKey: match ? match[1] : '' });
    } catch (err) {
        res.status(500).json({ message: 'Could not read env.js' });
    }
});
app.post('/api/panel/gemini-key', async (req, res) => {
     try {
        const { apiKey } = req.body;
        let content = await fs.readFile(envJsPath, 'utf-8');
        content = content.replace(/API_KEY:\s*"[^"]*"/, `API_KEY: "${apiKey}"`);
        await fs.writeFile(envJsPath, content);
        res.json({ message: 'API Key updated. It will be active on next page reload.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to write to env.js' });
    }
});

app.get('/api/panel/host-status', (req, res) => {
    const commands = {
        cpu: "top -bn1 | grep 'Cpu(s)' | awk '{print $2 + $4}'",
        mem: "free -m | awk 'NR==2{printf \"{\\\"total\\\":\\\"%sMB\\\", \\\"used\\\":\\\"%sMB\\\", \\\"free\\\":\\\"%sMB\\\", \\\"percent\\\":%d}\", $2, $3, $4, $3*100/$2 }'",
        disk: "df -h / | awk 'NR==2{printf \"{\\\"total\\\":\\\"%s\\\", \\\"used\\\":\\\"%s\\\", \\\"free\\\":\\\"%s\\\", \\\"percent\\\":%d}\", $2, $3, $4, $5}'"
    };
    
    const promises = Object.entries(commands).map(([key, cmd]) => 
        new Promise((resolve, reject) => {
            exec(cmd, (err, stdout, stderr) => {
                if (err) return reject(stderr);
                resolve({ [key]: stdout.trim() });
            });
        })
    );

    Promise.all(promises)
        .then(results => {
            const status = results.reduce((acc, result) => ({...acc, ...result}), {});
            res.json({
                cpuUsage: parseFloat(status.cpu),
                memory: JSON.parse(status.mem),
                disk: JSON.parse(status.disk),
            });
        })
        .catch(error => {
            res.status(500).json({ message: "Failed to get host status.", error });
        });
});

app.post('/api/generate-report', async (req, res) => {
    try {
        const { view, routerName, geminiAnalysis } = req.body;
        const [ztStatus, backendCode, ...logs] = await Promise.all([
             ztCliCommand('-j status').catch(e => `Error: ${e.message}`),
             fs.readFile(apiBackendPath, 'utf-8').catch(() => 'Could not read backend file.'),
             // Add other log fetching logic here if needed
        ]);

        let report = `
=========================================
 MIKROTIK PANEL - SYSTEM REPORT
=========================================
Date: ${new Date().toISOString()}

-------[ AI Diagnosis Summary ]-------
${geminiAnalysis}

-------[ Current State ]-------
Page View: ${view}
Selected Router: ${routerName || 'None'}

-------[ ZeroTier Host Status ]-------
${ztStatus}

-------[ API Backend Code (api-backend/server.js) ]-------
${backendCode}

`;
        res.setHeader('Content-disposition', 'attachment; filename=mikrotik-panel-report.txt');
        res.setHeader('Content-type', 'text/plain');
        res.charset = 'UTF-8';
        res.write(report);
        res.end();
    } catch (error) {
        res.status(500).json({ message: `Failed to generate report: ${error.message}` });
    }
});


// --- Serve Static Frontend ---
// Must be last after all API routes
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});


initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`MikroTik Manager UI server running. Access it at http://localhost:${port}`);
  });
});
