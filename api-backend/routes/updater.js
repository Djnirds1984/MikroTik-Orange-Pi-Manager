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
                return reject(error);
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

router.post('/update', async (req, res) => {
    // Stream response back to client
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write('Starting update process...\n');

    try {
        const backupFileName = `backup-update-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`;
        const backupPath = path.join(backupsDir, backupFileName);

        res.write(`Creating backup at ${backupPath}...\n`);
        // Note: Excluding node_modules and other large/unnecessary dirs
        const tarCommand = `tar --exclude='./.git' --exclude='./api-backend/node_modules' --exclude='./proxy/node_modules' --exclude='./node_modules' --exclude='./api-backend/sessions' -czf ${backupPath} .`;
        await execPromise(tarCommand, { cwd: projectRoot });
        res.write('Backup created successfully.\n');
        
        res.write('Pulling latest changes from git...\n');
        await execPromise('git pull', { cwd: projectRoot });
        res.write('Git pull successful.\n');

        res.write('Installing frontend dependencies...\n');
        await execPromise('npm install', { cwd: projectRoot });
        res.write('Frontend dependencies installed.\n');
        
        res.write('Installing backend dependencies...\n');
        await execPromise('npm install', { cwd: path.join(projectRoot, 'api-backend') });
        res.write('Backend dependencies installed.\n');

        res.write('Building frontend application...\n');
        await execPromise('npm run build', { cwd: projectRoot });
        res.write('Frontend build complete.\n');

        res.write('Update complete. Restarting application in 5 seconds...\n');
        setTimeout(() => {
            exec('pm2 restart all', (err) => {
                if (err) console.error("Failed to restart pm2", err);
            });
        }, 5000);
        res.end();

    } catch (error) {
        res.write(`\n--- UPDATE FAILED ---\n`);
        res.write(error.message);
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
                const stats = fs.statSync(path.join(backupsDir, file));
                return {
                    name: file,
                    size: stats.size,
                    date: stats.mtime,
                };
            })
            .sort((a, b) => b.date - a.date);
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
    res.write(`Starting restore from ${backupName}...\n`);

    try {
        const restoreCommand = `tar -xzf ${backupPath} -C ${projectRoot}`;
        await execPromise(restoreCommand);
        res.write('Files restored successfully.\n');
        
        res.write('Re-installing dependencies...\n');
        await execPromise('npm install', { cwd: projectRoot });
        await execPromise('npm install', { cwd: path.join(projectRoot, 'api-backend') });
        res.write('Dependencies installed.\n');
        
        res.write('Re-building frontend...\n');
        await execPromise('npm run build', { cwd: projectRoot });
        res.write('Build complete.\n');
        
        res.write('Restore complete. Restarting application in 5 seconds...\n');
        setTimeout(() => {
            exec('pm2 restart all');
        }, 5000);
        res.end();

    } catch (error) {
        res.write(`\n--- RESTORE FAILED ---\n`);
        res.write(error.message);
        res.end();
    }
});


export default router;
