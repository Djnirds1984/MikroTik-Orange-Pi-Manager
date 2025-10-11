import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database.js';
import { mikrotikApi } from '../api.js';
import { isAuthenticated } from './auth.js';


const router = express.Router();
router.use(isAuthenticated);

// GET all routers
router.get('/routers', (req, res) => {
    db.all("SELECT id, name, host, user, port FROM routers", [], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json(rows);
    });
});

// POST a new router
router.post('/routers', (req, res) => {
    const { name, host, user, password, port } = req.body;
    const newRouter = { id: uuidv4(), name, host, user, password, port };

    const sql = 'INSERT INTO routers (id, name, host, user, password, port) VALUES (?,?,?,?,?,?)';
    db.run(sql, [newRouter.id, name, host, user, password, port], function (err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        // Return without password
        res.status(201).json({ id: newRouter.id, name, host, user, port });
    });
});

// PATCH an existing router
router.patch('/routers/:id', (req, res) => {
    const { name, host, user, password, port } = req.body;
    const { id } = req.params;

    // Build query dynamically
    const fields = [];
    const params = [];

    if (name) { fields.push('name = ?'); params.push(name); }
    if (host) { fields.push('host = ?'); params.push(host); }
    if (user) { fields.push('user = ?'); params.push(user); }
    if (password) { fields.push('password = ?'); params.push(password); }
    if (port) { fields.push('port = ?'); params.push(port); }

    if (fields.length === 0) {
        return res.status(400).json({ message: "No fields to update provided." });
    }

    params.push(id);
    const sql = `UPDATE routers SET ${fields.join(', ')} WHERE id = ?`;

    db.run(sql, params, function (err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: "Router not found." });
        }
        res.json({ message: "Router updated successfully", changes: this.changes });
    });
});


// DELETE a router
router.delete('/routers/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM routers WHERE id = ?', id, function (err) {
        if (err) {
            res.status(400).json({ "error": res.message });
            return;
        }
         if (this.changes === 0) {
            return res.status(404).json({ message: "Router not found." });
        }
        res.status(204).send();
    });
});

// Test connection
router.post('/routers/test', async (req, res) => {
    const routerConfig = req.body;
    try {
        await mikrotikApi(routerConfig, 'get', '/system/resource');
        res.json({ message: 'Connection successful!' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message || 'Connection failed.' });
    }
});


export default router;
