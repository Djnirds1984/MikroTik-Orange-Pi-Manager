// ecosystem.config.js
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
}
