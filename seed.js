const db = require('./config/db');

const seedData = async () => {
  try {
    console.log('🔌 Connected to PostgreSQL for seeding...');

    // 1. Seed Categories
    console.log('📅 Seeding Categories...');
    await db.query('DELETE FROM categories'); // Clear existing
    const categories = [
      { name: 'Food & Drinks', icon: 'restaurant', color: '#FF5733' },
      { name: 'Shopping', icon: 'shopping_bag', color: '#33FF57' },
      { name: 'Housing', icon: 'home', color: '#3357FF' },
      { name: 'Transportation', icon: 'directions_car', color: '#F333FF' },
      { name: 'Vehicle', icon: 'local_gas_station', color: '#FF33A8' },
      { name: 'Life & Entertainment', icon: 'movie', color: '#33FFF5' },
      { name: 'Communication, PC', icon: 'computer', color: '#A833FF' },
      { name: 'Financial expenses', icon: 'account_balance', color: '#FF8C33' },
      { name: 'Investments', icon: 'trending_up', color: '#33FF8C' },
      { name: 'Income', icon: 'attach_money', color: '#8C33FF' },
      { name: 'Others', icon: 'category', color: '#A0A0A0' }
    ];
    for (const cat of categories) {
      await db.query(
        'INSERT INTO categories (name, icon, color) VALUES ($1, $2, $3)',
        [cat.name, cat.icon, cat.color]
      );
    }
    console.log('✅ Categories seeded successfully!');

    // 2. Seed Payment Modes
    console.log('💎 Seeding Payment Modes...');
    await db.query('DELETE FROM payment_modes');
    const paymentModes = [
      { name: 'Cash' },
      { name: 'Credit Card' },
      { name: 'Debit Card' },
      { name: 'Net Banking' },
      { name: 'UPI' }
    ];
    for (const mode of paymentModes) {
      await db.query(
        'INSERT INTO payment_modes (name) VALUES ($1)',
        [mode.name]
      );
    }
    console.log('✅ Payment Modes seeded successfully!');

    console.log('🎉 Seeding Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error(`❌ Seeding failed: ${error.message}`);
    process.exit(1);
  }
};

seedData();
