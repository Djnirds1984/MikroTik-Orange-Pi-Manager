import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Proxy API requests to the backend server
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
}));

// Serve the static files from the React app build
const staticFilesPath = path.join(__dirname, '../dist');
console.log(`Serving static files from: ${staticFilesPath}`);
app.use(express.static(staticFilesPath));

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ Proxy server listening on port ${port}`);
});
