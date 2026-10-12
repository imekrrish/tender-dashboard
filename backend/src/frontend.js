import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

export function serveFrontend(app, directory) {
  // API misses must remain JSON errors, never the SPA document.
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
  const index = path.join(directory, 'index.html');
  if (!fs.existsSync(index)) {
    if (process.env.NODE_ENV === 'production') throw new Error('Frontend build is missing. Deploy using the root Dockerfile.');
    return;
  }
  app.use(express.static(directory, {
    index: false,
    setHeaders(res, file) {
      res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  // Avoid returning index.html for a missing JS/CSS/image asset.
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
