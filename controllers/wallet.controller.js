const db = require('../config/db');

// Add Credit (convenience wrapper — uses same logic as unified addTransaction)
exports.addCredit = async (req, res) => {
  const userId = req.user.id;
  console.log('[addCredit] START - userId:', userId);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not found in DB' });
  }

  const { amount, description, payment_mode_id, date } = req.body;
  console.log('[addCredit] Body:', { amount, description, date });
  
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
  }

  const txDate = date || new Date().toISOString().split('T')[0];

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Get opening balance from last transaction
    const lastTxResult = await client.query(
      'SELECT closing_balance FROM wallet_transactions WHERE user_id = $1 ORDER BY expense_date DESC, created_at DESC LIMIT 1',
      [userId]
    );
    
    // Fallback to current_balance if no transactions exist
    let openingBalance = 0;
    if (lastTxResult.rows.length > 0) {
      openingBalance = parseFloat(lastTxResult.rows[0].closing_balance) || 0;
    } else {
      const userResult = await client.query('SELECT current_balance FROM users WHERE id = $1', [userId]);
      openingBalance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].current_balance) || 0 : 0;
    }

    const closingBalance = openingBalance + parsedAmount;
    console.log('[addCredit] opening_balance:', openingBalance, 'closing_balance:', closingBalance);

    // 2. Insert into wallet_transactions
    const newTransaction = await client.query(
      `INSERT INTO wallet_transactions 
        (user_id, category_id, payment_mode_id, transaction_type, amount, description, expense_date, opening_balance, closing_balance) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [userId, null, payment_mode_id || null, 'credit', parsedAmount, description || 'Wallet Credit', txDate, openingBalance, closingBalance]
    );

    // 3. Update users.current_balance and has_added_initial_credit
    await client.query(
      'UPDATE users SET current_balance = current_balance + $1, has_added_initial_credit = true WHERE id = $2',
      [parsedAmount, userId]
    );

    await client.query('COMMIT');
    console.log('[addCredit] COMMITTED successfully');
    return res.status(201).json({ success: true, message: 'Credit added', data: newTransaction.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[addCredit] ERROR - ROLLBACK:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};

// Wallet History
exports.getWalletHistory = async (req, res) => {
  const userId = req.user.id;
  console.log('[getWalletHistory] START - userId:', userId);

  if (!userId) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const history = await db.query(
      `SELECT wt.*, 
              TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date,
              c.name as category_name
       FROM wallet_transactions wt
       LEFT JOIN categories c ON wt.category_id = c.id
       WHERE wt.user_id = $1 
       ORDER BY wt.expense_date DESC, wt.created_at DESC`,
      [userId]
    );
    console.log('[getWalletHistory] Found:', history.rows.length, 'records');
    return res.status(200).json({ success: true, data: history.rows });
  } catch (error) {
    console.error('[getWalletHistory] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Current Balance
exports.getCurrentBalance = async (req, res) => {
  const userId = req.user.id;
  console.log('[getCurrentBalance] START - userId:', userId);

  if (!userId) {
    return res.status(200).json({ success: true, data: { balance: 0 } });
  }

  try {
    const userResult = await db.query(
      "SELECT current_balance FROM users WHERE id = $1",
      [userId]
    );

    const currentBalance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].current_balance) || 0 : 0;
    console.log('[getCurrentBalance] Balance:', currentBalance);

    return res.status(200).json({ success: true, data: { balance: currentBalance } });
  } catch (error) {
    console.error('[getCurrentBalance] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
