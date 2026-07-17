const db = require('./db');

const initDatabase = async () => {
  console.log('📦 Initializing Database Tables & Seed Data...');
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255),
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        mobile VARCHAR(20), -- Increased length for country codes
        password TEXT,
        role VARCHAR(20) DEFAULT 'user',
        photo_url TEXT,
        current_plan VARCHAR(50),
        current_balance NUMERIC(15, 2) DEFAULT 0,
        auth_provider VARCHAR(20) DEFAULT 'email',
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        has_added_initial_credit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        reset_otp VARCHAR(6),
        otp_expiry TIMESTAMP,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        refresh_token_expiry TIMESTAMP
      );
    `);

    // 2. Categories Table (Aligned with your screenshot)
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon TEXT,
        color VARCHAR(20),
        category_type VARCHAR(20), -- expense or income
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Payment Modes Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_modes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        icon TEXT
      );
    `);

    // 4. Wallet Transactions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        payment_mode_id INTEGER REFERENCES payment_modes(id) ON DELETE SET NULL,
        transaction_type VARCHAR(20) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        description TEXT,
        expense_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        opening_balance NUMERIC(15, 2),
        closing_balance NUMERIC(15, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. App Config Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id SERIAL PRIMARY KEY,
        key_name VARCHAR(50) UNIQUE NOT NULL,
        value TEXT NOT NULL
      );
    `);

    // --- SEED DATA LOGIC ---

    // Seed Categories if table is empty
    const catCheck = await client.query('SELECT COUNT(*) FROM categories');
    if (parseInt(catCheck.rows[0].count) === 0) {
      console.log('🌱 Seeding default categories...');
      const categoryData = [
        ['Food', 'restaurant', '#22C55E', 'expense'],
        ['Travel', 'car', '#3B82F6', 'expense'],
        ['Shopping', 'shopping_bag', '#EC4899', 'expense'],
        ['Bills', 'receipt', '#F59E0B', 'expense'],
        ['Health', 'heart', '#EF4444', 'expense'],
        ['Entertainment', 'tv', '#8B5CF6', 'expense'],
        ['Recharge', 'smartphone', '#14B8A6', 'expense'],
        ['Salary', 'account_balance_wallet', '#2E7D32', 'income'],
        ['Business', 'business_center', '#1565C0', 'income'],
        ['Freelance', 'work', '#00838F', 'income'],
        ['Bonus', 'redeem', '#C62828', 'income'],
        ['Investment', 'trending_up', '#2E7D32', 'income']
      ];
      for (const cat of categoryData) {
        await client.query(
          'INSERT INTO categories (name, icon, color, category_type) VALUES ($1, $2, $3, $4)',
          cat
        );
      }
    }

    // Seed Payment Modes if table is empty
    const pmCheck = await client.query('SELECT COUNT(*) FROM payment_modes');
    if (parseInt(pmCheck.rows[0].count) === 0) {
      console.log('🌱 Seeding default payment modes...');
      const pmData = [['Cash', 'money'], ['Online', 'account_balance'], ['Card', 'credit_card']];
      for (const pm of pmData) {
        await client.query('INSERT INTO payment_modes (name, icon) VALUES ($1, $2)', pm);
      }
    }

    // Default Ads Config
    await client.query(`
      INSERT INTO app_config (key_name, value) VALUES ('is_show_ads', 'true') ON CONFLICT DO NOTHING;
      INSERT INTO app_config (key_name, value) VALUES ('ads_config_json', '{}') ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('✅ All Database Tables and Data verified successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during Database Initialization:', error.message);
  } finally {
    client.release();
  }
};

module.exports = initDatabase;
