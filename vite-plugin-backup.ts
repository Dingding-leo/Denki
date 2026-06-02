import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

const BACKUP_FILE = path.resolve(__dirname, 'denki-backup.json');

export function denkiBackupPlugin(): Plugin {
  return {
    name: 'denki-backup',
    configureServer(server) {
      // POST /api/backup — Save full database snapshot to filesystem
      server.middlewares.use('/api/backup', (req, res, next) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              // Validate JSON before saving
              JSON.parse(body);
              fs.writeFileSync(BACKUP_FILE, body, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
          });
          return;
        }

        // GET /api/backup — Read backup from filesystem
        if (req.method === 'GET') {
          try {
            if (fs.existsSync(BACKUP_FILE)) {
              const data = fs.readFileSync(BACKUP_FILE, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'No backup file found' }));
            }
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
          return;
        }

        next();
      });
    },
  };
}
