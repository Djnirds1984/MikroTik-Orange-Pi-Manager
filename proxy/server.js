const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const tar = require('tar');
const archiver = require('archiver');
const fsExtra = require('fs-extra');

const app = express();
const port = 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ESBuild for JSX/TSX transpilation
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const esbuild = require('esbuild');
            const result = await esbuild.build({
                entryPoints: [path.join(__dirname, '..', req.path)],
                bundle: true,
                write: false,
                format: 'esm',
                external: ['react', 'react-dom/client', '@google/genai', 'recharts'],
            });
            res.setHeader('Content-Type', 'application/javascript');
            res.send(result.outputFiles[0].text);
        } catch (e) {
            console.error('ESBuild transpilation failed:', e);
            res.status(500).send('Error during transpilation');
        }
    } else {
        next();
    }
});


// --- Updater Endpoints ---
const runCommand = (command, args, res, onLog) => {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd: path.join(__dirname, '..'), shell: false });
        proc.stdout.on('data', (data) => onLog(data.toString()));
        proc.stderr.on('data', (data) => onLog(data.toString()));
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command '${command} ${args.join(' ')}' failed with code ${code}`));
        });
        proc.on('error', (err) => reject(err));
    });
};

const sendSse = (res, data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

app.get('/api/update-status', async (res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    try {
        const remoteUrl = await new Promise((resolve, reject) => {
            const proc = spawn('git', ['config', '--get', 'remote.origin.url'], { cwd: path.join(__dirname, '..') });
            let url = '';
            proc.stdout.on('data', (data) => url += data.toString());
            proc.on('close', (code) => code === 0 ? resolve(url.trim()) : reject(new Error('Failed to get git remote URL')));
        });

        if (!remoteUrl.startsWith('git@')) {
             sendSse(res, { status: 'error', message: `Insecure Git remote. Requires SSH (git@...) but found "${remoteUrl}".` });
             return;
        }
        
        await runCommand('ssh', ['-T', 'git@github.com', '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes'], res, log => sendSse(res, { log }));
        await runCommand('git', ['remote', 'update'], res, log => sendSse(res, { log }));

        const [local, remote] = await Promise.all([
             new Promise((resolve, reject) => {
                 const proc = spawn('git', ['rev-parse', '@'], { cwd: path.join(__dirname, '..') });
                 let hash = '';
                 proc.stdout.on('data', data => hash += data.toString());
                 proc.on('close', code => code === 0 ? resolve(hash.trim()) : reject());
            }),
             new Promise((resolve, reject) => {
                 const proc = spawn('git', ['rev-parse', '@{u}'], { cwd: path.join(__dirname, '..') });
                 let hash = '';
                 proc.stdout.on('data', data => hash += data.toString());
                 proc.on('close', code => code === 0 ? resolve(hash.trim()) : reject());
            })
        ]);
        
        if (local === remote) sendSse(res, { status: 'uptodate', message: 'Your panel is up to date.', local });
        else sendSse(res, { status: 'available', message: 'Update available.', local, remote });

    } catch (error) {
        sendSse(res, { status: 'error', message: error.message, log: error.stack });
    } finally {
        sendSse(res, { status: 'finished' });
        res.end();
    }
});

const restartApp = () => {
    if (process.env.PM2_HOME) {
        const pm2 = require('pm2');
        pm2.connect(err => {
            if (err) { console.error(err); return; }
            // Restart both processes
            pm2.restart('mikrotik-manager', (err) => {
                if (err) console.error('PM2 UI restart failed', err);
                pm2.restart('mikrotik-api-backend', (err) => {
                    pm2.disconnect();
                    if (err) console.error('PM2 API restart failed', err);
                });
            });
        });
    }
};

app.get('/api/update-app', async (res) => {
     res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    try {
        const backupDir = path.join(__dirname, '..', 'backups');
        await fsExtra.ensureDir(backupDir);
        const backupFile = `backup-${new Date().toISOString().replace(/[.:]/g, '-')}.tar.gz`;
        const outputPath = path.join(backupDir, backupFile);

        sendSse(res, { log: `Creating backup: ${backupFile}` });
        
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('tar', { gzip: true });
        archive.pipe(output);
        archive.glob('**/*', {
            cwd: path.join(__dirname, '..'),
            ignore: ['backups/**', 'proxy/node_modules/**', 'api-backend/node_modules/**', '.git/**']
        });
        await archive.finalize();
        
        sendSse(res, { log: 'Backup created successfully.' });
        sendSse(res, { log: 'Pulling latest changes...' });
        await runCommand('git', ['pull'], res, log => sendSse(res, { log }));
        sendSse(res, { log: 'Installing UI server dependencies...' });
        await runCommand('npm', ['install', '--prefix', 'proxy'], res, log => sendSse(res, { log }));
        sendSse(res, { log: 'Installing API server dependencies...' });
        await runCommand('npm', ['install', '--prefix', 'api-backend'], res, log => sendSse(res, { log }));
        sendSse(res, { status: 'restarting', log: 'Restarting servers...' });

    } catch (error) {
        sendSse(res, { status: 'error', message: error.message });
    } finally {
        res.end();
        restartApp();
    }
});

app.get('/api/list-backups', async (req, res) => {
    try {
        const backupDir = path.join(__dirname, '..', 'backups');
        await fsExtra.ensureDir(backupDir);
        const files = await fs.promises.readdir(backupDir);
        res.json(files.filter(f => f.endsWith('.tar.gz')).sort().reverse());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/rollback', async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const { backupFile } = req.query;

    if (!backupFile || !/^[a-zA-Z0-9\-_.]+\.tar\.gz$/.test(backupFile)) {
         sendSse(res, { status: 'error', message: 'Invalid backup file name.' });
         return res.end();
    }
    const backupPath = path.join(__dirname, '..', 'backups', backupFile);

    try {
        if (!fs.existsSync(backupPath)) throw new Error('Backup file not found.');
        
        sendSse(res, { log: `Restoring from ${backupFile}...` });
        const appDir = path.join(__dirname, '..');
        
        // Find and remove items, preserving key directories
        const items = await fs.promises.readdir(appDir);
        for (const item of items) {
            if (!['backups', '.git', 'proxy', 'api-backend'].includes(item)) {
                await fsExtra.remove(path.join(appDir, item));
            }
        }
        
        await tar.x({ file: backupPath, cwd: appDir });

        sendSse(res, { log: 'Files restored. Installing dependencies for both servers...' });
        await runCommand('npm', ['install', '--prefix', 'proxy'], res, log => sendSse(res, { log }));
        await runCommand('npm', ['install', '--prefix', 'api-backend'], res, log => sendSse(res, { log }));
        sendSse(res, { status: 'restarting', log: 'Restarting servers...' });

    } catch (error) {
        sendSse(res, { status: 'error', message: error.message });
    } finally {
        res.end();
        restartApp();
    }
});


// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(port, () => {
    console.log(`MikroTik Manager UI server running. Access it at http://<your_ip_address>:${port}`);
});