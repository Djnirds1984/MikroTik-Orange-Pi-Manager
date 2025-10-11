import express from 'express';
import cors from 'cors';
import session from 'express-session';
import FileStore from 'session-file-store';

import routerApi from './routes/routers.js';
import mikrotikApi from './routes/mikrotik.js';
import systemApi from './routes/system.js';
import authApi from './routes/auth.js';
import updaterApi from './routes/updater.js';
import db from './database.js'; // Ensures DB is initialized

const app = express();
const port = 3002;

const AppFileStore = FileStore(session);

app.use(cors({
    origin: 'http://localhost:3001',
    credentials: true,
}));
app.use(express.json());
app.use(session({
    store: new AppFileStore({ path: './sessions', ttl: 86400 }), // 1 day TTL
    secret: 'a_very_secret_key_that_should_be_in_env', // Change this in production
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Set to true if using HTTPS
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));


app.use('/api', routerApi);
app.use('/api', mikrotikApi);
app.use('/api', systemApi);
app.use('/api', authApi);
app.use('/api/updater', updaterApi);


app.listen(port, () => {
    console.log(`API backend server listening on port ${port}`);
});
