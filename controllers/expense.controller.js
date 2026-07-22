const db = require('../config/db');

// Add Expense (Migrated to use wallet_transactions only)
exports.addExpense = async (req, res) => {
  const userId = req.user.id;
  console.log('[addExpense] START - userId:', userId);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const { category_id, amount, description, date, payment_mode_id } = req.body;
  const parsedAmount = parseFloat(amount);
  const txDate = date || new Date().toISOString().split('T')[0];

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Get current balance (source of truth)
    const userResult = await client.query('SELECT current_balance FROM users WHERE id = $1', [userId]);
    const openingBalance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].current_balance) || 0 : 0;

    const closingBalance = openingBalance - parsedAmount;

    // 2. Insert debit entry into wallet_transactions
    const newTransaction = await client.query(
      `INSERT INTO wallet_transactions
        (user_id, category_id, payment_mode_id, transaction_type, amount, description, expense_date, opening_balance, closing_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, category_id, payment_mode_id || null, 'debit', parsedAmount, description || 'Expense', txDate, openingBalance, closingBalance]
    );

    // 3. Deduct from users.current_balance
    await client.query(
      'UPDATE users SET current_balance = current_balance - $1 WHERE id = $2',
      [parsedAmount, userId]
    );

    await client.query('COMMIT');
    console.log('[addExpense] COMMITTED successfully');

    // Fetch category name for response
    const catResult = await db.query('SELECT name FROM categories WHERE id = $1', [category_id]);
    const categoryName = catResult.rows.length > 0 ? catResult.rows[0].name : '';

    return res.status(201).json({
      success: true,
      message: 'Expense added',
      data: { ...newTransaction.rows[0], category_name: categoryName }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[addExpense] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};

// Expense History (Migrated to wallet_transactions)
exports.getExpenseHistory = async (req, res) => {
  const userId = req.user.id;
  try {
    const history = await db.query(
      `SELECT wt.*,
              TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date,
              TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as expense_date,
              c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM wallet_transactions wt
       LEFT JOIN categories c ON wt.category_id = c.id
       WHERE wt.user_id = $1 AND wt.transaction_type = 'debit'
       ORDER BY wt.expense_date DESC, wt.created_at DESC`,
      [userId]
    );
    return res.status(200).json({ success: true, data: history.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Day Wise Expense
exports.getDayWiseExpense = async (req, res) => {
  const userId = req.user.id;
  const { date } = req.query;
  try {
    const expenses = await db.query(
      `SELECT wt.*, TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date, c.name as category_name
       FROM wallet_transactions wt
       LEFT JOIN categories c ON wt.category_id = c.id
       WHERE wt.user_id = $1 AND wt.transaction_type = 'debit' AND DATE(wt.expense_date) = $2
       ORDER BY wt.created_at DESC`,
      [userId, date]
    );
    return res.status(200).json({ success: true, data: expenses.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Month Wise Expense
exports.getMonthWiseExpense = async (req, res) => {
  const userId = req.user.id;
  const { month, year } = req.query;
  try {
    const expenses = await db.query(
      `SELECT wt.*, TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date, c.name as category_name
       FROM wallet_transactions wt
       LEFT JOIN categories c ON wt.category_id = c.id
       WHERE wt.user_id = $1 AND wt.transaction_type = 'debit'
       AND EXTRACT(MONTH FROM wt.expense_date) = $2 AND EXTRACT(YEAR FROM wt.expense_date) = $3
       ORDER BY wt.created_at DESC`,
      [userId, month, year]
    );
    return res.status(200).json({ success: true, data: expenses.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Year Wise Expense
exports.getYearWiseExpense = async (req, res) => {
  const userId = req.user.id;
  const { year } = req.query;
  try {
    const expenses = await db.query(
      `SELECT wt.*, TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date, c.name as category_name
       FROM wallet_transactions wt
       LEFT JOIN categories c ON wt.category_id = c.id
       WHERE wt.user_id = $1 AND wt.transaction_type = 'debit' AND EXTRACT(YEAR FROM wt.expense_date) = $2
       ORDER BY wt.created_at DESC`,
      [userId, year]
    );
    return res.status(200).json({ success: true, data: expenses.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Expense
exports.deleteExpense = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const txResult = await client.query('SELECT amount FROM wallet_transactions WHERE id = $1 AND user_id = $2', [id, userId]);
    if (txResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    const refundAmount = parseFloat(txResult.rows[0].amount) || 0;

    await client.query('DELETE FROM wallet_transactions WHERE id = $1 AND user_id = $2', [id, userId]);

    await client.query(
      'UPDATE users SET current_balance = current_balance + $1 WHERE id = $2',
      [refundAmount, userId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Expense deleted and balance updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
