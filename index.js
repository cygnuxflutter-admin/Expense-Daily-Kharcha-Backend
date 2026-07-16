const dotenv = require('dotenv');
// Load environment variables before setting up app
dotenv.config();

const db = require('./config/db'); // Initialize DB connection pool
const initDatabase = require('./config/init_db');
const app = require('./app');

const PORT = process.env.PORT || 8080;

// Initialize DB and then start server
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Server running in development mode on port ${PORT}`);
    console.log(`📡 Base API URL: http://localhost:${PORT}`);
  });
});
