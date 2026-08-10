import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import offerRoutes from './routes/offers.js';
import orderRoutes from './routes/orders.js';
import purchaseRoutes from './routes/purchases.js';
import notificationRoutes from './routes/notifications.js';
import sellerRoutes from './routes/seller.js';
import presentationRoutes, { pageRouter, imageRouter } from './routes/presentation.js';
import { authRequired } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

app.get('/', (req, res) => res.json({ name: 'Mboppi API', version: '1.0.0' }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/img', imageRouter);
app.use('/p', pageRouter);
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

export default app;
