const express = require('express');
const { transform } = require('esbuild');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process'); // Import spawn
const archiver = require('archiver');
const tar = require('tar');
const sqlite3 = require('@vscode/sqlite3');
const { open } = require('sqlite');

const app = express();
const port = 3001;
const projectRoot = path.join(__dirname, '..');
const dbPath = path.join(projectRoot, 'panel.db');
let db;

// --- Database Initialization ---
async function initializeDatabase() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    console.log('Connected to the SQLite database.');

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
        currency TEXT NOT NULL,
        cycle TEXT NOT NULL,
        pppoeProfile TEXT NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS sales_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        clientName TEXT NOT NULL,
        planName TEXT NOT NULL,
        planPrice REAL NOT NULL,
        currency TEXT NOT NULL,
        discountAmount REAL NOT NULL,
        finalAmount REAL NOT NULL,
        routerName TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL,
        serialNumber TEXT,
        dateAdded TEXT NOT NULL
      );
    `);
    console.log('Database tables are ready.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

initializeDatabase();


// Middleware
app.use(express.json());


// --- Middleware for Live Transpilation ---
app.get(/\.(ts|tsx)$/, async (req, res) => {
    try {
        const filePath = path.join(__dirname, '..', req.path); 
        
        if (!await fs.pathExists(filePath)) {
            return res.status(404).send('// File not found');
        }
        
        const source = await fs.readFile(filePath, 'utf8');
        const result = await transform(source, {
            loader: req.path.endsWith('.ts') ? 'ts' : 'tsx',
            target: 'esnext',
        });
        res.setHeader('Content-Type', 'application/javascript');
        res.send(result.code);
    } catch (e) {
        console.error('ESBuild transpilation failed:', e);
        res.status(500).send(`// Transpilation Error: ${e.message}`);
    }
});


// --- Static File Serving ---
app.use(express.static(path.join(__dirname, '..')));

// Helper to run shell commands
const runCommand = (command, cwd = process.cwd()) => {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Command error: ${stderr}`);
                return reject(new Error(stderr));
            }
            resolve(stdout.trim());
        });
    });
};

// --- New Database API Endpoints ---
const dbApi = express.Router();

// Routers
dbApi.get('/routers', async (req, res) => {
    const routers = await db.all('SELECT * FROM routers');
    res.json(routers);
});
dbApi.post('/routers', async (req, res) => {
    const { id, name, host, user, password, port } = req.body;
    await db.run('INSERT INTO routers (id, name, host, user, password, port) VALUES (?, ?, ?, ?, ?, ?)', [id, name, host, user, password, port]);
    res.status(201).json({ id });
});
dbApi.patch('/routers/:id', async (req, res) => {
    const { name, host, user, password, port } = req.body;
    await db.run('UPDATE routers SET name = ?, host = ?, user = ?, password = ?, port = ? WHERE id = ?', [name, host, user, password, port, req.params.id]);
    res.status(200).json({ message: 'Router updated' });
});
dbApi.delete('/routers/:id', async (req, res) => {
    await db.run('DELETE FROM routers WHERE id = ?', req.params.id);
    res.status(204).send();
});

// Billing Plans
dbApi.get('/billing-plans', async (req, res) => {
    const plans = await db.all('SELECT * FROM billing_plans');
    res.json(plans);
});
dbApi.post('/billing-plans', async (req, res) => {
    const { id, name, price, currency, cycle, pppoeProfile, description } = req.body;
    await db.run('INSERT INTO billing_plans (id, name, price, currency, cycle, pppoeProfile, description) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, name, price, currency, cycle, pppoeProfile, description]);
    res.status(201).json({ id });
});
dbApi.patch('/billing-plans/:id', async (req, res) => {
    const { name, price, currency, cycle, pppoeProfile, description } = req.body;
    await db.run('UPDATE billing_plans SET name = ?, price = ?, currency = ?, cycle = ?, pppoeProfile = ?, description = ? WHERE id = ?', [name, price, currency, cycle, pppoeProfile, description, req.params.id]);
    res.status(200).json({ message: 'Plan updated' });
});
dbApi.delete('/billing-plans/:id', async (req, res) => {
    await db.run('DELETE FROM billing_plans WHERE id = ?', req.params.id);
    res.status(204).send();
});

// Sales Records
dbApi.get('/sales', async (req, res) => {
    const sales = await db.all('SELECT * FROM sales_records ORDER BY date DESC');
    res.json(sales);
});
dbApi.post('/sales', async (req, res) => {
    const { id, date, clientName, planName, planPrice, currency, discountAmount, finalAmount, routerName } = req.body;
    await db.run('INSERT INTO sales_records (id, date, clientName, planName, planPrice, currency, discountAmount, finalAmount, routerName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, date, clientName, planName, planPrice, currency, discountAmount, finalAmount, routerName]);
    res.status(201).json({ id });
});
dbApi.delete('/sales/all', async (req, res) => {
    await db.run('DELETE FROM sales_records');
    res.status(204).send();
});
dbApi.delete('/sales/:id', async (req, res) => {
    await db.run('DELETE FROM sales_records WHERE id = ?', req.params.id);
    res.status(204).send();
});


// Inventory Items
dbApi.get('/inventory', async (req, res) => {
    const items = await db.all('SELECT * FROM inventory_items ORDER BY dateAdded DESC');
    res.json(items);
});
dbApi.post('/inventory', async (req, res) => {
    const { id, name, quantity, price, serialNumber, dateAdded } = req.body;
    await db.run('INSERT INTO inventory_items (id, name, quantity, price, serialNumber, dateAdded) VALUES (?, ?, ?, ?, ?, ?)', [id, name, quantity, price, serialNumber, dateAdded]);
    res.status(201).json({ id });
});
dbApi.patch('/inventory/:id', async (req, res) => {
    const { name, quantity, price, serialNumber, dateAdded } = req.body;
    await db.run('UPDATE inventory_items SET name = ?, quantity = ?, price = ?, serialNumber = ?, dateAdded = ? WHERE id = ?', [name, quantity, price, serialNumber, dateAdded, req.params.id]);
    res.status(200).json({ message: 'Item updated' });
});
dbApi.delete('/inventory/:id', async (req, res) => {
    await db.run('DELETE FROM inventory_items WHERE id = ?', req.params.id);
    res.status(204).send();
});

app.use('/api/db', dbApi);


// --- Updater API Endpoints ---
const sendSse = (res, data) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/api/update-status', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        sendSse(res, { log: '>>> Checking Git remote URL...' });
        const remoteUrl = await runCommand('git config --get remote.origin.url', projectRoot);
        sendSse(res, { log: `Remote URL: ${remoteUrl || '[Not Configured]'}` });
        
        if (!remoteUrl || !remoteUrl.startsWith('git@')) {
             throw new Error(`Git remote is not configured for SSH. Current URL is "${remoteUrl || 'Not Set'}". Please use SSH (e.g., git@github.com:user/repo.git) for updates.`);
        }
        
        sendSse(res, { log: '\n>>> Fetching latest data from remote repository...' });
        await runCommand('git fetch origin', projectRoot);
        sendSse(res, { log: 'Fetch complete.' });

        sendSse(res, { log: '\n>>> Comparing local and remote versions...' });
        const local = await runCommand('git rev-parse HEAD', projectRoot);
        const remote = await runCommand('git rev-parse @{u}', projectRoot);
        
        if (local === remote) {
            sendSse(res, { status: 'uptodate', message: 'Your panel is up-to-date.', local });
        } else {
            sendSse(res, { status: 'available', message: 'An update is available.', local, remote });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Update check failed:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
    } finally {
        sendSse(res, { status: 'finished' }); 
        res.end();
    }
});

const restartApp = (res, serviceName = 'mikrotik-manager mikrotik-api-backend') => {
    sendSse(res, { log: `\n>>> Restarting application with pm2: ${serviceName}...` });
    exec(`pm2 restart ${serviceName}`, (err, stdout, stderr) => {
        if (err) {
            console.error('PM2 restart failed:', stderr);
            sendSse(res, { status: 'error', message: `Failed to restart server: ${stderr}` });
        } else {
            console.log('PM2 restart successful:', stdout);
            sendSse(res, { log: 'Restart command issued successfully.' });
        }
        res.end();
    });
};

app.get('/api/update-app', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const backupDir = path.join(projectRoot, 'backups');
    const backupFileName = `backup-update-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
    const backupFilePath = path.join(backupDir, backupFileName);

    try {
        sendSse(res, { log: `>>> Creating backup at ${backupFilePath}` });
        await fs.ensureDir(backupDir);
        
        const archive = archiver('tar', { gzip: true });
        const output = fs.createWriteStream(backupFilePath);
        archive.pipe(output);
        archive.glob('**/*', {
            cwd: projectRoot,
            ignore: ['backups/**', 'node_modules/**', '.git/**', 'panel.db'], // Exclude DB from app backup
        });
        await archive.finalize();
        sendSse(res, { log: 'Backup created successfully.' });

        sendSse(res, { log: '\n>>> Pulling latest changes from Git...' });
        const pullOutput = await runCommand('git pull origin main', projectRoot);
        sendSse(res, { log: pullOutput });
        sendSse(res, { log: 'Git pull complete.' });
        
        sendSse(res, { log: '\n>>> Installing dependencies for UI server...' });
        const proxyInstall = await runCommand('npm install', path.join(projectRoot, 'proxy'));
        sendSse(res, { log: proxyInstall });
        
        sendSse(res, { log: '\n>>> Installing dependencies for API backend...' });
        const apiInstall = await runCommand('npm install', path.join(projectRoot, 'api-backend'));
        sendSse(res, { log: apiInstall });
        sendSse(res, { log: 'Dependencies installed.' });
        
        sendSse(res, { status: 'restarting' });
        restartApp(res);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Update process failed:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
        res.end();
    }
});


app.get('/api/list-backups', async (req, res) => {
    try {
        const backupDir = path.join(projectRoot, 'backups');
        await fs.ensureDir(backupDir);
        const files = await fs.readdir(backupDir);
        res.json(files.filter(f => f.endsWith('.tar.gz')).sort().reverse());
    } catch (error) {
        res.status(500).json({ message: 'Could not list backups.' });
    }
});

app.get('/api/rollback', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { backupFile } = req.query;
    if (!backupFile || typeof backupFile !== 'string') {
        sendSse(res, { status: 'error', message: 'Invalid backup file specified.' });
        return res.end();
    }

    const backupFilePath = path.join(projectRoot, 'backups', backupFile);

    try {
        sendSse(res, { log: `>>> Starting rollback from ${backupFile}` });
        if (!await fs.pathExists(backupFilePath)) {
            throw new Error('Backup file not found.');
        }

        await runCommand(`tar -xzf "${backupFilePath}" -C "${projectRoot}"`);
        
        sendSse(res, { log: 'Files restored successfully.' });
        
        sendSse(res, { status: 'restarting' });
        restartApp(res);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Rollback failed:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
        res.end();
    }
});

// --- ZeroTier Panel Management API Endpoints ---
app.get('/api/zt/status', async (req, res) => {
    try {
        const networksJson = await runCommand('zerotier-cli -j listnetworks');
        const networks = JSON.parse(networksJson);
        const infoJson = await runCommand('zerotier-cli -j info');
        const info = JSON.parse(infoJson);
        res.status(200).json({ info, networks });
    } catch (error) {
        const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
        console.error('ZeroTier status check failed:', errorMessage);

        if (errorMessage.includes('not found')) {
            return res.status(404).json({ 
                code: 'ZEROTIER_NOT_INSTALLED',
                message: 'zerotier-cli was not found. The ZeroTier One service is likely not installed on the host system.'
            });
        }
        if (errorMessage.includes('cannot connect')) {
            return res.status(503).json({
                code: 'ZEROTIER_SERVICE_DOWN',
                message: 'Could not connect to the ZeroTier One service. It may be stopped or malfunctioning.'
            });
        }
        res.status(500).json({ 
            code: 'UNKNOWN_ERROR',
            message: 'Failed to get ZeroTier status.', 
            error: errorMessage 
        });
    }
});

app.get('/api/zt/install', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    sendSse(res, { log: '>>> Starting ZeroTier installation...' });
    sendSse(res, { log: '>>> This may take a few minutes. Please do not close this window.' });
    
    const installProcess = spawn('sudo', ['bash', '-c', 'curl -s https://install.zerotier.com | bash']);

    installProcess.stdout.on('data', (data) => {
        sendSse(res, { log: data.toString() });
    });

    installProcess.stderr.on('data', (data) => {
        sendSse(res, { log: data.toString() });
    });

    installProcess.on('close', (code) => {
        if (code === 0) {
            sendSse(res, { status: 'success', log: '\n>>> Installation completed successfully!' });
        } else {
            sendSse(res, { status: 'error', message: `Installation process exited with code ${code}. Please check the log for details.` });
        }
        sendSse(res, { status: 'finished' });
        res.end();
    });

    installProcess.on('error', (err) => {
        sendSse(res, { status: 'error', message: `Failed to start installation process: ${err.message}` });
        sendSse(res, { status: 'finished' });
        res.end();
    });
});


app.post('/api/zt/join', express.json(), async (req, res) => {
    const { networkId } = req.body;
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId)) {
        return res.status(400).json({ message: 'A valid 16-digit Network ID is required.' });
    }
    try {
        const stdout = await runCommand(`zerotier-cli join ${networkId}`);
        res.status(200).json({ message: `Successfully sent join request for network ${networkId}.`, detail: stdout });
    } catch (error) {
        console.error(`ZeroTier join failed for ${networkId}:`, error);
        res.status(500).json({ message: `Failed to join network ${networkId}.`, error: error.message });
    }
});

app.post('/api/zt/leave', express.json(), async (req, res) => {
    const { networkId } = req.body;
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId)) {
        return res.status(400).json({ message: 'A valid 16-digit Network ID is required.' });
    }
    try {
        const stdout = await runCommand(`zerotier-cli leave ${networkId}`);
        res.status(200).json({ message: `Successfully left network ${networkId}.`, detail: stdout });
    } catch (error) {
        console.error(`ZeroTier leave failed for ${networkId}:`, error);
        res.status(500).json({ message: `Failed to leave network ${networkId}.`, error: error.message });
    }
});

app.post('/api/zt/set', express.json(), async (req, res) => {
    const { networkId, setting, value } = req.body;
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId) || !setting || typeof value !== 'boolean') {
        return res.status(400).json({ message: 'Invalid request. networkId, setting, and a boolean value are required.' });
    }
    const allowedSettings = ['allowManaged', 'allowGlobal', 'allowDefault'];
    if(!allowedSettings.includes(setting)) {
        return res.status(400).json({ message: `Invalid setting. Allowed settings are: ${allowedSettings.join(', ')}` });
    }
    try {
        const stdout = await runCommand(`zerotier-cli set ${networkId} ${setting}=${value}`);
        res.status(200).json({ message: `Set ${setting} to ${value} for network ${networkId}.`, detail: stdout });
    } catch (error) {
        console.error(`ZeroTier set failed for ${networkId}:`, error);
        res.status(500).json({ message: `Failed to set ${setting} for network ${networkId}.`, error: error.message });
    }
});

// --- AI Fixer API Endpoints ---
const ALLOWED_FILE = 'api-backend/server.js';
const TARGET_FILE_PATH = path.join(projectRoot, ALLOWED_FILE);

app.get('/api/fixer/file-content', async (req, res) => {
    try {
        const content = await fs.readFile(TARGET_FILE_PATH, 'utf-8');
        res.setHeader('Content-Type', 'text/plain');
        res.send(content);
    } catch (error) {
        console.error('AI Fixer failed to read file:', error);
        res.status(500).json({ message: `Could not read the backend file: ${error.message}` });
    }
});

app.post('/api/fixer/apply-fix', express.text({ type: 'text/plain' }), async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const newCode = req.body;
    if (!newCode || typeof newCode !== 'string') {
        sendSse(res, { status: 'error', message: 'No code provided to apply.' });
        return res.end();
    }

    const backupDir = path.join(projectRoot, 'backups');
    const backupFileName = `backup-aifix-${new Date().toISOString().replace(/:/g, '-')}.js.bak`;
    const backupFilePath = path.join(backupDir, backupFileName);

    try {
        sendSse(res, { log: `>>> Backing up current backend server file to ${backupFileName}...` });
        await fs.ensureDir(backupDir);
        await fs.copy(TARGET_FILE_PATH, backupFilePath);
        sendSse(res, { log: 'Backup complete.' });

        sendSse(res, { log: '\n>>> Applying new code...' });
        await fs.writeFile(TARGET_FILE_PATH, newCode, 'utf-8');
        sendSse(res, { log: 'File updated successfully.' });

        sendSse(res, { status: 'restarting' });
        restartApp(res, 'mikrotik-api-backend');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('AI Fixer failed to apply fix:', errorMessage);
        sendSse(res, { status: 'error', message: errorMessage });
        res.end();
    }
});

// --- AI Help & Report Generation API ---
app.post('/api/generate-report', express.json(), async (req, res) => {
    const { view, routerName, geminiAnalysis } = req.body;
    
    let ztStatus = 'ZeroTier status could not be retrieved.';
    try {
        const ztInfo = await runCommand('zerotier-cli -j info');
        const ztNetworks = await runCommand('zerotier-cli -j listnetworks');
        ztStatus = `--- ZeroTier Info ---\n${JSON.stringify(JSON.parse(ztInfo), null, 2)}\n\n--- ZeroTier Networks ---\n${JSON.stringify(JSON.parse(ztNetworks), null, 2)}`;
    } catch (e) {
        ztStatus = `Could not get ZeroTier status. Error: ${e.message}`;
    }

    let backendCode = 'Backend code could not be read.';
    try {
        backendCode = await fs.readFile(TARGET_FILE_PATH, 'utf-8');
    } catch (e) {
        backendCode = `Could not read backend code. Error: ${e.message}`;
    }

    const report = `
=========================================
      AI SYSTEM DIAGNOSTIC REPORT
=========================================
Report Generated: ${new Date().toISOString()}

--- CONTEXT ---
- Current Page: ${view}
- Selected Router: ${routerName || 'None'}

--- AI ANALYSIS ---
${geminiAnalysis}

=========================================
      RAW SYSTEM DATA
=========================================

--- PANEL HOST ZEROTIER STATUS ---
${ztStatus}

--- BACKEND SERVER CODE (api-backend/server.js) ---
${backendCode}
`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=system-report.txt');
    res.send(report);
});

// --- Panel Host Management API Endpoints ---
const ENV_FILE_PATH = path.join(__dirname, '..', 'env.js');

const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

app.get('/api/panel/host-status', async (req, res) => {
    try {
        const cpuCmd = `top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}'`;
        const memCmd = `free -m`;
        const diskCmd = `df -k .`;

        const [cpuOutput, memOutput, diskOutput] = await Promise.all([
            runCommand(cpuCmd),
            runCommand(memCmd),
            runCommand(diskCmd)
        ]);

        const memLines = memOutput.split('\n');
        const memData = memLines[1].split(/\s+/);
        const totalMem = parseInt(memData[1], 10);
        const usedMem = parseInt(memData[2], 10);
        const memPercent = Math.round((usedMem / totalMem) * 100);

        const diskLines = diskOutput.split('\n');
        const diskData = diskLines[1].split(/\s+/);
        const totalDisk = parseInt(diskData[1], 10); 
        const usedDisk = parseInt(diskData[2], 10); 
        const diskPercent = parseInt(diskData[4].replace('%', ''), 10);
        
        res.json({
            cpuUsage: Math.round(parseFloat(cpuOutput)) || 0,
            memory: {
                used: formatBytes(usedMem * 1024 * 1024),
                total: formatBytes(totalMem * 1024 * 1024),
                percent: memPercent,
            },
            disk: {
                used: formatBytes(usedDisk * 1024),
                total: formatBytes(totalDisk * 1024),
                percent: diskPercent,
            },
        });

    } catch (error) {
        console.error('Failed to get panel host status:', error);
        res.status(500).json({ message: `Could not get host status: ${error.message}` });
    }
});


app.post('/api/panel/reboot', (req, res) => {
    console.log('Received request to reboot panel server.');
    runCommand('sudo reboot')
        .then(() => {
            res.status(200).json({ message: 'Reboot command issued. The server will go down shortly.' });
        })
        .catch(err => {
            console.error('Failed to issue reboot command:', err);
            res.status(500).json({ message: `Failed to reboot: ${err.message}. Ensure passwordless sudo is configured.` });
        });
});

app.get('/api/panel/ntp', async (req, res) => {
    try {
        const statusOutput = await runCommand('timedatectl status');
        const ntpServiceActive = statusOutput.includes('NTP service: active');
        const ntpConf = await runCommand(`cat /etc/systemd/timesyncd.conf | grep NTP= | cut -d'=' -f2`);
        const [primaryNtp = '', secondaryNtp = ''] = ntpConf.split(' ');
        
        res.status(200).json({
            enabled: ntpServiceActive,
            primaryNtp,
            secondaryNtp
        });
    } catch (error) {
        console.error('Failed to get panel NTP status:', error);
        res.status(500).json({ message: `Could not get NTP status: ${error.message}` });
    }
});

app.post('/api/panel/ntp', express.json(), async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings.primaryNtp !== 'string') {
        return res.status(400).json({ message: 'Invalid NTP settings provided.' });
    }
    
    try {
        const ntpConfigContent = `[Time]\nNTP=${settings.primaryNtp}${settings.secondaryNtp ? ' ' + settings.secondaryNtp : ''}\n`;
        const configDir = '/etc/systemd/timesyncd.conf.d';
        const configPath = `${configDir}/99-panel-override.conf`;

        await runCommand(`sudo mkdir -p ${configDir}`);
        await runCommand(`echo '${ntpConfigContent}' | sudo tee ${configPath}`);
        await runCommand('sudo systemctl restart systemd-timesyncd');
        
        res.status(200).json({ message: 'NTP settings applied. The service has been restarted.' });
    } catch (error) {
        console.error('Failed to set panel NTP settings:', error);
        res.status(500).json({ message: `Failed to apply NTP settings: ${error.message}. Ensure passwordless sudo is configured.` });
    }
});

// --- Panel Maintenance Actions ---
const runStreamingCommand = (res, command, args, cwd) => {
    sendSse(res, { log: `>>> Running command: ${command} ${args.join(' ')} in ${cwd}` });

    const child = spawn(command, args, { cwd, shell: true });

    child.stdout.on('data', (data) => {
        sendSse(res, { log: data.toString() });
    });
    child.stderr.on('data', (data) => {
        sendSse(res, { log: data.toString() }); 
    });
    child.on('close', (code) => {
        if (code === 0) {
            sendSse(res, { log: `\n>>> Command finished successfully (code ${code}).` });
        } else {
            sendSse(res, { log: `\n>>> Command exited with error code ${code}.` });
        }
    });
    child.on('error', (err) => {
        sendSse(res, { log: `\n>>> Failed to start command: ${err.message}` });
    });
    return child;
};

app.get('/api/panel/reinstall-deps', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const proxyDir = path.join(projectRoot, 'proxy');
    const apiDir = path.join(projectRoot, 'api-backend');

    const proxyInstall = runStreamingCommand(res, 'npm', ['install'], proxyDir);
    proxyInstall.on('close', () => {
        const apiInstall = runStreamingCommand(res, 'npm', ['install'], apiDir);
        apiInstall.on('close', () => {
            sendSse(res, { status: 'finished' });
            res.end();
        });
    });
});

app.get('/api/panel/restart-services', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const command = 'pm2';
    const args = ['restart', 'all'];

    sendSse(res, { log: `>>> Issuing command: ${command} ${args.join(' ')}` });
    sendSse(res, { log: `>>> The connection will be lost as the server restarts.` });

    const child = spawn(command, args, { cwd: projectRoot, shell: true, detached: true });

    child.stdout.on('data', (data) => sendSse(res, { log: data.toString() }));
    child.stderr.on('data', (data) => sendSse(res, { log: data.toString() }));

    child.on('exit', (code) => {
        if (code !== 0) {
            sendSse(res, { status: 'error', message: `Restart command failed with code ${code}.` });
        }
        res.end();
    });
    child.on('error', (err) => {
        sendSse(res, { status: 'error', message: `Failed to execute pm2: ${err.message}` });
        res.end();
    });

    child.unref();
});

// --- Gemini API Key Management ---
app.get('/api/panel/gemini-key', async (req, res) => {
    try {
        const content = await fs.readFile(ENV_FILE_PATH, 'utf-8');
        const match = content.match(/API_KEY\s*:\s*['"](.*?)['"]/);
        const apiKey = match ? match[1] : '';
        res.status(200).json({ apiKey });
    } catch (error) {
        console.error('Failed to read env.js for API key:', error);
        res.status(500).json({ message: `Could not read env.js: ${error.message}` });
    }
});

app.post('/api/panel/gemini-key', express.json(), async (req, res) => {
    const { apiKey } = req.body;
    if (typeof apiKey !== 'string') {
        return res.status(400).json({ message: 'Invalid API key provided.' });
    }

    try {
        let content = await fs.readFile(ENV_FILE_PATH, 'utf-8');
        const updatedContent = content.replace(/(API_KEY\s*:\s*['"]).*?(['"])/, `$1${apiKey}$2`);
        
        if (content === updatedContent) {
            throw new Error('Could not find the API_KEY field in env.js to update.');
        }

        await fs.writeFile(ENV_FILE_PATH, updatedContent, 'utf-8');
        res.status(200).json({ message: 'API key saved successfully. It is now active for all AI features.' });
    } catch (error) {
        console.error('Failed to write env.js for API key:', error);
        res.status(500).json({ message: `Could not save API key: ${error.message}` });
    }
});


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(port, () => {
  console.log(`MikroTik Manager UI server running. Access it at http://<your_ip_address>:${port}`);
});