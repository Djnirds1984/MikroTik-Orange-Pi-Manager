const express = require('express');
const { transform } = require('esbuild');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const archiver = require('archiver');
const tar = require('tar');

const app = express();
const port = 3001;

// --- Middleware for Live Transpilation ---
// FIX: Replaced the generic app.use with an explicit .get handler for .ts/.tsx files.
// This is more robust and prevents the static middleware from incorrectly handling these files
// with the wrong MIME type.
app.get(/\.(ts|tsx)$/, async (req, res) => {
    try {
        const filePath = path.join(__dirname, '..', req.path); // Use req.path for safety
        
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
// This will serve files like index.html, env.js, and any other static assets.
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

// --- Updater API Endpoints ---
const projectRoot = path.join(__dirname, '..');

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
        sendSse(res, { log: `Remote URL: ${remoteUrl}` });
        if (!remoteUrl.startsWith('git@')) {
             throw new Error(`Git remote is not configured for SSH. Current URL is ${remoteUrl}. Please use SSH (e.g., git@github.com:user/repo.git) for updates.`);
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
        sendSse(res, { status: 'finished' }); // Signal to the client that we are done
        res.end();
    }
});

const restartApp = (res) => {
    sendSse(res, { log: '\n>>> Restarting application with pm2...' });
    // Restart both servers by their names for reliability
    exec('pm2 restart mikrotik-manager mikrotik-api-backend', (err, stdout, stderr) => {
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
    const backupFileName = `backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
    const backupFilePath = path.join(backupDir, backupFileName);

    try {
        // 1. Create Backup
        sendSse(res, { log: `>>> Creating backup at ${backupFilePath}` });
        await fs.ensureDir(backupDir);
        
        const archive = archiver('tar', { gzip: true });
        const output = fs.createWriteStream(backupFilePath);
        archive.pipe(output);
        archive.glob('**/*', {
            cwd: projectRoot,
            ignore: ['backups/**', 'node_modules/**', '.git/**'],
        });
        await archive.finalize();
        sendSse(res, { log: 'Backup created successfully.' });

        // 2. Git Pull
        sendSse(res, { log: '\n>>> Pulling latest changes from Git...' });
        const pullOutput = await runCommand('git pull origin main', projectRoot); // Assuming 'main' branch
        sendSse(res, { log: pullOutput });
        sendSse(res, { log: 'Git pull complete.' });
        
        // 3. NPM Install
        sendSse(res, { log: '\n>>> Installing dependencies for UI server...' });
        const proxyInstall = await runCommand('npm install', path.join(projectRoot, 'proxy'));
        sendSse(res, { log: proxyInstall });
        
        sendSse(res, { log: '\n>>> Installing dependencies for API backend...' });
        const apiInstall = await runCommand('npm install', path.join(projectRoot, 'api-backend'));
        sendSse(res, { log: apiInstall });
        sendSse(res, { log: 'Dependencies installed.' });
        
        // 4. Restart
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

        // Extract tarball over the project directory
        await tar.x({
            file: backupFilePath,
            cwd: projectRoot,
            strip: 0,
        });
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(port, () => {
  console.log(`MikroTik Manager UI server running. Access it at http://<your_ip_address>:${port}`);
});