const express = require('express');
const path = require('path');
const app = express();
const PORT = 3001;

// Define the path to the dist folder, where the frontend is built
const buildPath = path.join(__dirname, '..', 'dist');

// Serve static files from the React app build
app.use(express.static(buildPath));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
// This is crucial for client-side routing to work.
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MikroTik Manager UI server running on http://localhost:${PORT}`);
});
