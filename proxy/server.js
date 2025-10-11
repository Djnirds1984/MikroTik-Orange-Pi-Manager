import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Define the project root relative to the proxy/server.js file
const projectRoot = path.resolve(__dirname, '..');

// Proxy API requests to the backend server
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
}));

// Serve hotspot login page separately
const hotspotLoginPath = path.join(projectRoot, 'dist/hotspot-login.html');
if (fs.existsSync(hotspotLoginPath)) {
    app.get('/hotspot-login.html', (req, res) => {
        res.sendFile(hotspotLoginPath);
    });
}


// Serve static files from the 'dist' directory
const staticPath = path.join(projectRoot, 'dist');
app.use(express.static(staticPath));

// For any other request, serve the main index.html file for client-side routing
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
   if (fs.existsSync(indexPath)) {
       res.sendFile(indexPath);
   } else {
       res.status(404).send('Main application file not found. Please run the build process.');
   }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`UI and proxy server listening on http://0.0.0.0:${port}`);
});
