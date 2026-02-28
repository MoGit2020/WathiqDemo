require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRouter        = require('./routes/auth');
const propertiesRouter  = require('./routes/properties');
const applicationsRouter = require('./routes/applications');
const contractsRouter   = require('./routes/contracts');
const paymentsRouter    = require('./routes/payments');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger (dev convenience)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRouter);
app.use('/api/properties',   propertiesRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/contracts',    contractsRouter);
app.use('/api/payments',     paymentsRouter);

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Wathiq.om API' }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Wathiq.om API running on http://localhost:${PORT}`);
});
