import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import { authRequired } from './auth.js';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ name: 'Marketplace API', version: '1.0.0' }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.get('/api/me', authRequired, (req, res) => res.json({ user: req.user }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    await initDb();
    console.log('Base de données PostgreSQL connectée');
  } catch (err) {
    console.error('Impossible de se connecter à la base de données :', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`API Marketplace démarrée sur http://localhost:${PORT}`);
  });
}

main();
