import axios from 'axios';
import https from 'https';
import db from './database.js';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export const getRouterConfig = (routerId) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM routers WHERE id = ?', [routerId], (err, router) => {
            if (err) {
                return reject({ status: 500, message: 'Database error fetching router config.' });
            }
            if (!router) {
                return reject({ status: 404, message: 'Router configuration not found.' });
            }
            resolve(router);
        });
    });
};

export const mikrotikApi = async (routerConfig, method, path, data = null) => {
    const { host, user, password, port } = routerConfig;
    const protocol = port === 443 || port === 8443 ? 'https' : 'http';
    const url = `${protocol}://${host}:${port}/rest${path}`;

    try {
        const response = await axios({
            method,
            url,
            data,
            httpsAgent: protocol === 'https' ? httpsAgent : undefined,
            auth: {
                username: user,
                password: password || '',
            },
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        console.error(`MikroTik API Error (${method} ${path}):`, error.response?.data || error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || `Failed to communicate with router at ${host}. Check connection and credentials.`;
        throw { status, message };
    }
};
