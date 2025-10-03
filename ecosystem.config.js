// ecosystem.config.js - Now uses ES Module syntax
import { fileURLToPath } from 'url';
import path from 'path';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  apps : [{
    name   : "mikrotik-manager",
    script : "./proxy/server.js",
    cwd    : __dirname,
  }, {
    name   : "mikrotik-api-backend",
    script : "./api-backend/server.js",
    cwd    : __dirname,
  }]
};
