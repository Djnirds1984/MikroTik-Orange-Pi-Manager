// ecosystem.config.js - Now uses absolute paths for reliability
import { fileURLToPath } from 'url';
import path from 'path';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  apps : [{
    name   : "mikrotik-manager",
    script : path.join(__dirname, 'proxy', 'server.js'),
    // No cwd needed as script path is absolute
  }, {
    name   : "mikrotik-api-backend",
    script : path.join(__dirname, 'api-backend', 'server.js'),
    // No cwd needed as script path is absolute
  }]
};
