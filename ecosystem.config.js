// ecosystem.config.cjs
// IMPORTANT: This file is now a .cjs file to ensure it's loaded as a CommonJS module.
module.exports = {
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
