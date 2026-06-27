const db = require('../config/db');

// Add Expense
exports.addExpense = async (req, res) => {
  const userId = req.user.id;
  console.log('[addExpense] START - userId:', userId);

  if (!userId) {
    console.log('[addExpense] No userId found');
    return res.status(401).json({ success: false, message: 'User not found in DB' });
  }

  const { category_id, amount, description, date, payment_mode_id } = req.body;
  console.log('[addExpense] Body:', { category_id, amount, description, date, payment_mode_id });
  const expenseDate = new Date(date || new Date());
  // Adjust for local timezone before saving to database
  const localDate = new Date(expenseDate.getTime() - (expenseDate.getTimezoneOffset() * 60000));
  const localDateStr = localDate.toISOString().split('T')[0];
  const localTimestampStr = localDate.toISOString().replace('T', ' ').replace('Z', '');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Insert into expenses table
    const newExpense = await client.query(
      'INSERT INTO expenses (user_id, category_id, amount, description, expense_date, payment_mode_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, category_id, amount, description, localDateStr, payment_mode_id]
    );
    console.log('[addExpense] Expense inserted:', newExpense.rows[0]?.id);

    // 1.5 Get category name
    const categoryRes = await client.query('SELECT name FROM categories WHERE id = $1', [category_id]);
    const categoryName = categoryRes.rows.length > 0 ? categoryRes.rows[0].name : 'Expense';

    // 2. Insert debit entry into wallet_transactions
    await client.query(
      'INSERT INTO wallet_transactions (user_id, amount, transaction_type, description, transaction_date, category) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, amount, 'debit', description || 'Expense Added', localTimestampStr, categoryName]
    );

    // 3. Deduct from users.current_balance
    await client.query(
      'UPDATE users SET current_balance = current_balance - $1 WHERE id = $2',
      [amount, userId]
    );

    await client.query('COMMIT');
    console.log('[addExpense] COMMITTED successfully');
    return res.status(201).json({ success: true, message: 'Expense added', data: newExpense.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[addExpense] ERROR - ROLLBACK:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};

// Expense History
exports.getExpenseHistory = async (req, res) => {
  const userId = req.user.id;
  console.log('[getExpenseHistory] START - userId:', userId);

  if (!userId) {
    console.log('[getExpenseHistory] No userId');
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const history = await db.query(
      "SELECT e.*, TO_CHAR(e.created_at, 'YYYY-MM-DD') as date, TO_CHAR(e.created_at, 'YYYY-MM-DD') as expense_date, c.name as category_name, c.icon as category_icon, c.color as category_color " +
      "FROM expenses e " +
      "LEFT JOIN categories c ON e.category_id = c.id " +
      "WHERE e.user_id = $1 ORDER BY e.created_at DESC",
      [userId]
    );
    console.log('[getExpenseHistory] Found:', history.rows.length, 'records');
    return res.status(200).json({ success: true, data: history.rows });
  } catch (error) {
    console.error('[getExpenseHistory] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Day Wise Expense
exports.getDayWiseExpense = async (req, res) => {
  const userId = req.user.id;
  const { date } = req.query;
  console.log('[getDayWiseExpense] START - userId:', userId, 'date:', date);

  if (!userId) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const expenses = await db.query(
      "SELECT e.*, TO_CHAR(e.created_at, 'YYYY-MM-DD') as date, TO_CHAR(e.created_at, 'YYYY-MM-DD') as expense_date, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.user_id = $1 AND DATE(e.created_at) = $2 ORDER BY e.created_at DESC",
      [userId, date]
    );
    console.log('[getDayWiseExpense] Found:', expenses.rows.length);
    return res.status(200).json({ success: true, data: expenses.rows });
  } catch (error) {
    console.error('[getDayWiseExpense] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Month Wise Expense
exports.getMonthWiseExpense = async (req, res) => {
  const userId = req.user.id;
  const { month, year } = req.query;
  console.log('[getMonthWiseExpense] START - userId:', userId, 'month:', month, 'year:', year);

  if (!userId) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const expenses = await db.query(
      "SELECT e.*, TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI:SS') as date, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.user_id = $1 AND EXTRACT(MONTH FROM e.created_at) = $2 AND EXTRACT(YEAR FROM e.created_at) = $3 ORDER BY e.created_at DESC",
      [userId, month, year]
    );
    console.log('[getMonthWiseExpense] Found:', expenses.rows.length);
    return res.status(200).json({ success: true, data: expenses.rows });
  } catch (error) {
    console.error('[getMonthWiseExpense] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Year Wise Expense
exports.getYearWiseExpense = async (req, res) => {
  const userId = req.user.id;
  const { year } = req.query;
  console.log('[getYearWiseExpense] START - userId:', userId, 'year:', year);

  if (!userId) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const expenses = await db.query(
      "SELECT e.*, TO_CHAR(e.created_at, 'YYYY-MM-DD HH24:MI:SS') as date, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.user_id = $1 AND EXTRACT(YEAR FROM e.created_at) = $2 ORDER BY e.created_at DESC",
      [userId, year]
    );
    console.log('[getYearWiseExpense] Found:', expenses.rows.length);
    return res.status(200).json({ success: true, data: expenses.rows });
  } catch (error) {
    console.error('[getYearWiseExpense] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Delete Expense
exports.deleteExpense = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  console.log('[deleteExpense] START - userId:', userId, 'expenseId:', id);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not found in DB' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Get expense details to refund the amount
    const expenseData = await client.query('SELECT amount FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
    if (expenseData.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const refundAmount = parseFloat(expenseData.rows[0].amount) || 0;

    // Delete the expense
    await client.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);

    // Insert refund transaction into wallet_transactions
    await client.query(
      'INSERT INTO wallet_transactions (user_id, amount, transaction_type, description, transaction_date) VALUES ($1, $2, $3, $4, $5)',
      [userId, refundAmount, 'credit', 'Refund for deleted expense', new Date().toISOString()]
    );

    // Refund users.current_balance
    await client.query(
      'UPDATE users SET current_balance = current_balance + $1 WHERE id = $2',
      [refundAmount, userId]
    );

    await client.query('COMMIT');
    console.log('[deleteExpense] COMMITTED - refunded:', refundAmount);
    return res.status(200).json({ success: true, message: 'Expense deleted and amount refunded successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[deleteExpense] ERROR - ROLLBACK:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};
