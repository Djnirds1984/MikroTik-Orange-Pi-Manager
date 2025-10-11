import express from 'express';
import bcrypt from 'bcrypt';
import db from '../database.js';

const router = express.Router();
const saltRounds = 10;

// Middleware to check if user is authenticated
export const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};


// Check if any users exist (for initial setup)
router.get('/auth/has-users', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Database error' });
        }
        res.json({ hasUsers: row.count > 0 });
    });
});

// Register a new user (only if no users exist)
router.post('/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Database error' });
        }
        if (row.count > 0) {
            return res.status(403).json({ message: 'Registration is not allowed' });
        }

        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) {
                return res.status(500).json({ message: 'Error hashing password' });
            }
            db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function (err) {
                if (err) {
                    return res.status(500).json({ message: 'Could not create user' });
                }
                req.session.userId = this.lastID;
                res.status(201).json({ user: { id: this.lastID, username } });
            });
        });
    });
});

// Login
router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.userId = user.id;
                res.json({ user: { id: user.id, username: user.username } });
            } else {
                res.status(401).json({ message: 'Invalid credentials' });
            }
        });
    });
});

// Logout
router.post('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Could not log out' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out successfully' });
    });
});

// Check session
router.get('/auth/check-session', (req, res) => {
    if (req.session.userId) {
        db.get('SELECT id, username FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json({ user });
        });
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});


export default router;
