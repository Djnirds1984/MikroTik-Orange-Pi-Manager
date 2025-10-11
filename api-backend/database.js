import sqlite3 from '@vscode/sqlite3';
import { verbose } from '@vscode/sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VBS = verbose();
const db = new VBS.Database(path.join(__dirname, 'mikrotik_manager.db'), (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDb();
    }
});

const initializeDb = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS routers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            user TEXT NOT NULL,
            password TEXT,
            port INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS company_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            clientName TEXT,
            planName TEXT,
            planPrice REAL,
            discountAmount REAL,
            finalAmount REAL,
            routerName TEXT,
            currency TEXT,
            routerId TEXT,
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
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            category TEXT,
            description TEXT,
            amount REAL NOT NULL
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
        CREATE TABLE IF NOT EXISTS billing_plans (
            id TEXT PRIMARY KEY,
            routerId TEXT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            cycle TEXT NOT NULL,
            pppoeProfile TEXT NOT NULL,
            description TEXT,
            currency TEXT NOT NULL
        );
         CREATE TABLE IF NOT EXISTS voucher_plans (
            id TEXT PRIMARY KEY,
            routerId TEXT,
            name TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            price REAL NOT NULL,
            currency TEXT NOT NULL,
            mikrotik_profile_name TEXT NOT NULL
        );
    `;

    db.exec(sql, (err) => {
        if (err) {
            console.error("Error creating tables", err.message);
        } else {
            console.log("Tables are ready or already exist.");
        }
    });
};

export default db;
