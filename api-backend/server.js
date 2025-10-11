import express from 'express';
import cors from 'cors';
import session from 'express-session';
import FileStore from 'session-file-store';
import path from 'path';
import { fileURLToPath } from 'url';

import routerApi from './routes/routers.js';
import mikrotikApi from './routes/mikrotik.js';
import systemApi from './routes/system.js';
import authApi from './routes/auth.js';
import updaterApi from './routes/updater.js';
import db from './database.js'; // Ensures DB is initialized

console.log('API Server starting...');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3002;

const AppFileStore = FileStore(session);

// Allow requests from the UI server's origin
const corsOptions = {
    origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
};

app.use(cors(corsOptions));
console.log('CORS configured.');

app.use(express.json());
console.log('JSON parser enabled.');

// Session configuration
try {
    app.use(session({
        store: new AppFileStore({ path: path.join(__dirname, 'sessions'), ttl: 86400, logFn: () => {} }),
        secret: 'a_very_secret_key_that_should_be_in_an_env_file', // Replace with a real secret from environment variables
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false, // Set to true if your proxy is configured for HTTPS
            maxAge: 1000 * 60 * 60 * 24 // 1 day
        }
    }));
    console.log('Session middleware configured successfully.');
} catch (e) {
    console.error('FATAL: Session middleware failed to initialize.', e);
}


// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API backend is running.' });
});

// API Routes
app.use('/api', authApi);
app.use('/api', routerApi);
app.use('/api', mikrotikApi);
app.use('/api', systemApi);
app.use('/api/updater', updaterApi);
console.log('API routes mounted.');

app.listen(port, () => {
    console.log(`✅ API backend server is now listening on port ${port}`);
});
