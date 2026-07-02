const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Welcome route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Welcome to Kharcha App Backend API (PostgreSQL)!'
  });
});

// API Routes
app.use('/api/v1/auth', require('./routes/auth.route'));
app.use('/api/v1/users', require('./routes/user.route'));
app.use('/api/v1/categories', require('./routes/category.route'));
app.use('/api/v1/payment_modes', require('./routes/payment_mode.route'));
app.use('/api/v1/wallet', require('./routes/wallet.route'));
// Removed obsolete expenses route
app.use('/api/v1/dashboard', require('./routes/dashboard.route'));
app.use('/api/v1/reports', require('./routes/report.route'));
app.use('/api/v1/transactions', require('./routes/transaction.route'));
app.use('/api/v1/history', require('./routes/history.route'));
app.use('/api/v1/settings', require('./routes/settings.route'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

module.exports = app;
