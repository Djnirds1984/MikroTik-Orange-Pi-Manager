// ecosystem.config.js - A simpler, more reliable configuration.
module.exports = {
  apps : [{
    name   : "mikrotik-manager",
    script : "proxy/server.js",
    watch: false,
  }, {
    name   : "mikrotik-api-backend",
    script : "api-backend/server.js",
    watch: false,
  }]
};
