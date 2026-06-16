import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Set up headers to mimic CORS from vercel.json
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'");
  next();
});

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));

// Simple mock for Vercel Serverless Function behavior
const apiDir = path.join(__dirname, 'api');
const files = fs.readdirSync(apiDir);

for (const file of files) {
  if (file.endsWith('.js')) {
    const routeName = file.replace('.js', '');
    const modulePath = `file://${path.join(apiDir, file)}`;
    
    app.all(`/api/${routeName}`, async (req, res) => {
      try {
        const routeModule = await import(modulePath);
        // Vercel handles parsing body, Express already does this via express.json()
        await routeModule.default(req, res);
      } catch (err) {
        console.error(`Error in /api/${routeName}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal Server Error' });
        }
      }
    });
  }
}

// Fallback to index.html for SPA if any
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
