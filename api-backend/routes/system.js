import express from 'express';
import os from 'node-os-utils';
import { exec } from 'child_process';
import db from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { isAuthenticated } from './auth.js';

const router = express.Router();
router.use(isAuthenticated);


// --- Host System Status ---
router.get('/system/host-status', async (req, res) => {
    try {
        const cpuUsage = await os.cpu.usage();
        const memInfo = await os.mem.info();
        
        exec('df -h /', (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error getting disk usage: ${error}`);
                return res.status(500).json({ message: "Failed to get disk usage" });
            }
            
            const lines = stdout.trim().split('\n');
            if (lines.length < 2) {
                 return res.status(500).json({ message: "Could not parse disk usage output." });
            }
            const parts = lines[1].split(/\s+/);
            const disk = {
                total: parts[1],
                used: parts[2],
                free: parts[3],
                percent: parseFloat(parts[4]),
            };
            
            res.json({
                cpuUsage,
                memory: {
                    total: `${Math.round(memInfo.totalMemMb / 1024)} GB`,
                    free: `${Math.round(memInfo.freeMemMb / 1024 * 100) / 100} GB`,
                    used: `${Math.round((memInfo.totalMemMb - memInfo.freeMemMb) / 1024 * 100) / 100} GB`,
                    percent: memInfo.usedMemPercentage,
                },
                disk,
            });
        });

    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve host status', error: error.message });
    }
});

// --- Company Settings ---
router.get('/system/company-settings', (req, res) => {
    db.all('SELECT key, value FROM company_settings', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Database error' });
        }
        const settings = rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        res.json(settings);
    });
});

router.post('/system/company-settings', (req, res) => {
    const settings = req.body;
    db.serialize(() => {
        const stmt = db.prepare('INSERT OR REPLACE INTO company_settings (key, value) VALUES (?, ?)');
        Object.entries(settings).forEach(([key, value]) => {
            stmt.run(key, value);
        });
        stmt.finalize((err) => {
            if (err) {
                return res.status(500).json({ message: 'Failed to save settings' });
            }
            res.json({ message: 'Settings saved successfully' });
        });
    });
});

// --- Sales Data ---
router.get('/system/sales/:routerId', (req, res) => {
    const { routerId } = req.params;
    const query = routerId === 'all' 
      ? 'SELECT * FROM sales ORDER BY date DESC' 
      : 'SELECT * FROM sales WHERE routerId = ? ORDER BY date DESC';
    const params = routerId === 'all' ? [] : [routerId];

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows);
    });
});

router.post('/system/sales', (req, res) => {
    const sale = { ...req.body, id: uuidv4() };
    const sql = `INSERT INTO sales (id, date, clientName, planName, planPrice, discountAmount, finalAmount, routerName, currency, routerId, clientAddress, clientContact, clientEmail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const params = [sale.id, sale.date, sale.clientName, sale.planName, sale.planPrice, sale.discountAmount, sale.finalAmount, sale.routerName, sale.currency, sale.routerId, sale.clientAddress, sale.clientContact, sale.clientEmail];
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ message: 'Failed to add sale' });
        res.status(201).json(sale);
    });
});

router.delete('/system/sales/:id', (req, res) => {
    db.run('DELETE FROM sales WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to delete sale' });
        res.status(204).send();
    });
});

router.delete('/system/sales/clear/:routerId', (req, res) => {
    const { routerId } = req.params;
    const query = routerId === 'all' ? 'DELETE FROM sales' : 'DELETE FROM sales WHERE routerId = ?';
    const params = routerId === 'all' ? [] : [routerId];
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ message: 'Failed to clear sales' });
        res.status(204).send();
    });
});

// --- Inventory ---
router.get('/system/inventory', (req, res) => {
    db.all('SELECT * FROM inventory ORDER BY dateAdded DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows);
    });
});
router.post('/system/inventory', (req, res) => {
    const item = { ...req.body, id: uuidv4() };
    const sql = `INSERT INTO inventory (id, name, quantity, price, serialNumber, dateAdded) VALUES (?,?,?,?,?,?)`;
    db.run(sql, [item.id, item.name, item.quantity, item.price, item.serialNumber, item.dateAdded], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to add item' });
        res.status(201).json(item);
    });
});
router.patch('/system/inventory/:id', (req, res) => {
    const { name, quantity, price, serialNumber, dateAdded } = req.body;
    const sql = `UPDATE inventory SET name = ?, quantity = ?, price = ?, serialNumber = ?, dateAdded = ? WHERE id = ?`;
    db.run(sql, [name, quantity, price, serialNumber, dateAdded, req.params.id], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to update item' });
        res.json({ message: 'Item updated' });
    });
});
router.delete('/system/inventory/:id', (req, res) => {
    db.run('DELETE FROM inventory WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to delete item' });
        res.status(204).send();
    });
});

// --- Expenses ---
router.get('/system/expenses', (req, res) => {
    db.all('SELECT * FROM expenses ORDER BY date DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json(rows);
    });
});
router.post('/system/expenses', (req, res) => {
    const expense = { ...req.body, id: uuidv4() };
    const sql = `INSERT INTO expenses (id, date, category, description, amount) VALUES (?,?,?,?,?)`;
    db.run(sql, [expense.id, expense.date, expense.category, expense.description, expense.amount], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to add expense' });
        res.status(201).json(expense);
    });
});
router.patch('/system/expenses/:id', (req, res) => {
    const { date, category, description, amount } = req.body;
    const sql = `UPDATE expenses SET date = ?, category = ?, description = ?, amount = ? WHERE id = ?`;
    db.run(sql, [date, category, description, amount, req.params.id], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to update expense' });
        res.json({ message: 'Expense updated' });
    });
});
router.delete('/system/expenses/:id', (req, res) => {
    db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to delete expense' });
        res.status(204).send();
    });
});

// --- Billing Plans ---
router.get('/system/billing-plans/:routerId', (req, res) => {
    const { routerId } = req.params;
    db.all('SELECT * FROM billing_plans WHERE routerId = ?', [routerId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(rows);
    });
});
router.post('/system/billing-plans', (req, res) => {
    const plan = { ...req.body, id: uuidv4() };
    const sql = `INSERT INTO billing_plans (id, routerId, name, price, cycle, pppoeProfile, description, currency) VALUES (?,?,?,?,?,?,?,?)`;
    const params = [plan.id, plan.routerId, plan.name, plan.price, plan.cycle, plan.pppoeProfile, plan.description, plan.currency];
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ message: 'Failed to add plan' });
        res.status(201).json(plan);
    });
});
router.patch('/system/billing-plans/:id', (req, res) => {
    const plan = req.body;
    const sql = `UPDATE billing_plans SET routerId = ?, name = ?, price = ?, cycle = ?, pppoeProfile = ?, description = ?, currency = ? WHERE id = ?`;
    const params = [plan.routerId, plan.name, plan.price, plan.cycle, plan.pppoeProfile, plan.description, plan.currency, req.params.id];
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ message: 'Failed to update plan' });
        res.json({ message: 'Plan updated' });
    });
});
router.delete('/system/billing-plans/:id', (req, res) => {
    db.run('DELETE FROM billing_plans WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ message: 'Failed to delete plan' });
        res.status(204).send();
    });
});

export default router;
