import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { isAuthenticated } from './auth.js';


const router = express.Router();
router.use(isAuthenticated);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../'); // Assumes api-backend is one level down
const backupsDir = path.join(projectRoot, 'proxy/backups'); // Store backups in proxy folder

if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

const execPromise = (command, options = {}) => {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing: ${command}\n${stderr}`);
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout.trim());
        });
    });
};

router.get('/status', async (req, res) => {
    try {
        await execPromise('git remote update', { cwd: projectRoot });
        const status = await execPromise('git status -uno', { cwd: projectRoot });
        
        if (status.includes('Your branch is up to date')) {
            res.json({ updateAvailable: false, message: 'Application is up-to-date.' });
        } else if (status.includes('Your branch is behind')) {
            res.json({ updateAvailable: true, message: 'An update is available.' });
        } else {
            res.json({ updateAvailable: false, message: 'Could not determine update status.', details: status });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to check for updates.', error: error.message });
    }
});

const streamLog = (res, message) => {
    res.write(`${message}\n`);
};

router.post('/update', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    streamLog(res, 'Starting update process...');

    try {
        const backupFileName = `backup-update-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
        const backupPath = path.join(backupsDir, backupFileName);

        streamLog(res, `Creating backup at ${backupPath}...`);
        const tarCommand = `tar --exclude='./.git' --exclude='./api-backend/node_modules' --exclude='./proxy/node_modules' --exclude='./node_modules' --exclude='./api-backend/sessions' --exclude='./api-backend/mikrotik_manager.db' -czf ${backupPath} .`;
        await execPromise(tarCommand, { cwd: projectRoot });
        streamLog(res, 'Backup created successfully.');
        
        streamLog(res, 'Pulling latest changes from git...');
        await execPromise('git pull', { cwd: projectRoot });
        streamLog(res, 'Git pull successful.');

        streamLog(res, 'Installing frontend dependencies...');
        await execPromise('npm install', { cwd: projectRoot });
        streamLog(res, 'Frontend dependencies installed.');
        
        streamLog(res, 'Installing backend dependencies...');
        await execPromise('npm install', { cwd: path.join(projectRoot, 'api-backend') });
        streamLog(res, 'Backend dependencies installed.');
        
        streamLog(res, 'Installing proxy dependencies...');
        await execPromise('npm install', { cwd: path.join(projectRoot, 'proxy') });
        streamLog(res, 'Proxy dependencies installed.');

        streamLog(res, 'Building frontend application...');
        await execPromise('npm run build', { cwd: projectRoot });
        streamLog(res, 'Frontend build complete.');

        streamLog(res, 'Update complete. Restarting application in 5 seconds...');
        setTimeout(() => {
            exec('pm2 restart all', (err) => {
                if (err) console.error("Failed to restart pm2", err);
            });
        }, 5000);
        res.end();

    } catch (error) {
        streamLog(res, `\n--- UPDATE FAILED ---\n${error.message}`);
        res.end();
    }
});


router.get('/backups', (req, res) => {
    fs.readdir(backupsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ message: 'Could not read backups directory.' });
        }
        const backups = files
            .filter(file => file.endsWith('.tar.gz'))
            .map(file => {
                try {
                    const stats = fs.statSync(path.join(backupsDir, file));
                    return {
                        name: file,
                        size: stats.size,
                        date: stats.mtime,
                    };
                } catch (e) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.date.getTime() - a.date.getTime());
        res.json(backups);
    });
});

router.post('/restore', async (req, res) => {
    const { backupName } = req.body;
    if (!backupName || !/^[a-zA-Z0-9\-_.]+\.tar\.gz$/.test(backupName)) {
        return res.status(400).json({ message: 'Invalid backup file name.' });
    }

    const backupPath = path.join(backupsDir, backupName);
    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ message: 'Backup file not found.' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    streamLog(res, `Starting restore from ${backupName}...`);

    try {
        streamLog(res, `Restoring files from backup...`);
        const restoreCommand = `tar -xzf ${backupPath} -C ${projectRoot}`;
        await execPromise(restoreCommand);
        streamLog(res, 'Files restored successfully.');
        
        streamLog(res, 'Re-installing dependencies...');
        await execPromise('npm install', { cwd: projectRoot });
        await execPromise('npm install', { cwd: path.join(projectRoot, 'api-backend') });
        await execPromise('npm install', { cwd: path.join(projectRoot, 'proxy') });
        streamLog(res, 'Dependencies installed.');
        
        streamLog(res, 'Re-building frontend...');
        await execPromise('npm run build', { cwd: projectRoot });
        streamLog(res, 'Build complete.');
        
        streamLog(res, 'Restore complete. Restarting application in 5 seconds...');
        setTimeout(() => {
            exec('pm2 restart all', (err) => {
                if (err) console.error("Failed to restart pm2", err);
            });
        }, 5000);
        res.end();

    } catch (error) {
        streamLog(res, `\n--- RESTORE FAILED ---\n${error.message}`);
        res.end();
    }
});


export default router;
