import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Define the project root relative to the proxy/server.js file
const projectRoot = path.resolve(__dirname, '..');

// Proxy API requests
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
}));

// Serve static files from the 'dist' directory
const staticPath = path.join(projectRoot, 'dist');
app.use(express.static(staticPath));

// For any other request, serve the index.html file for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`UI and proxy server listening on port ${port}`);
});
