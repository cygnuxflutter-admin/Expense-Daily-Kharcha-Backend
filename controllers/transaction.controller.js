const db = require('../config/db');

// ============================================================
// ADD TRANSACTION (Unified: credit + debit)
// POST /api/v1/transactions/add
// ============================================================
exports.addTransaction = async (req, res) => {
  const userId = req.user.id;
  console.log('[addTransaction] START - userId:', userId);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const { transaction_type, amount, category_id, payment_mode_id, description, expense_date } = req.body;
  
  // Requested Debug Logs
  console.log(req.body);
  console.log(transaction_type);
  
  console.log('[addTransaction] Parsed Body:', { transaction_type, amount, category_id, payment_mode_id, description, expense_date });

  // Handle Initial Balance logic
  let txType = transaction_type;
  if (description === 'Initial Balance' && txType === 'credit') {
    txType = 'initial_balance';
  }

  // Validation
  if (!txType || !['credit', 'debit', 'initial_balance'].includes(txType)) {
    return res.status(400).json({ success: false, message: 'transaction_type must be "credit", "debit", or "initial_balance"' });
  }
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
  }

  const parsedAmount = parseFloat(amount);
  const txDate = expense_date || new Date().toISOString().split('T')[0];

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Get current balance from users table (This is the source of truth)
    const userResult = await client.query('SELECT current_balance FROM users WHERE id = $1', [userId]);
    const currentBalance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].current_balance) || 0 : 0;

    // 2. Use currentBalance as the opening_balance for this new transaction
    const openingBalance = currentBalance;

    // 3. Calculate closing_balance
    let closingBalance;
    if (txType === 'credit' || txType === 'initial_balance') {
      closingBalance = openingBalance + parsedAmount;
    } else {
      closingBalance = openingBalance - parsedAmount;
    }

    // Requested Debug Logs
    const opening_balance = openingBalance;
    const closing_balance = closingBalance;
    console.log(opening_balance);
    console.log(closing_balance);
    
    console.log('[addTransaction] opening_balance:', openingBalance, 'closing_balance:', closingBalance);

    // 4. Insert into wallet_transactions
    const newTransaction = await client.query(
      `INSERT INTO wallet_transactions 
        (user_id, category_id, payment_mode_id, transaction_type, amount, description, expense_date, opening_balance, closing_balance) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [userId, category_id || null, payment_mode_id || null, txType, parsedAmount, description || '', txDate, openingBalance, closingBalance]
    );
    
    // Requested Debug Logs
    const result = newTransaction;
    console.log(result.rows);
    
    console.log('[addTransaction] Inserted id:', newTransaction.rows[0]?.id);

    // 5. Update users.current_balance
    if (txType === 'credit' || txType === 'initial_balance') {
      await client.query(
        'UPDATE users SET current_balance = current_balance + $1, has_added_initial_credit = true WHERE id = $2',
        [parsedAmount, userId]
      );
    } else {
      await client.query(
        'UPDATE users SET current_balance = current_balance - $1 WHERE id = $2',
        [parsedAmount, userId]
      );
    }

    await client.query('COMMIT');
    console.log('[addTransaction] COMMITTED successfully');

    // Fetch category name for the response
    let categoryName = '';
    if (category_id) {
      const catResult = await db.query('SELECT name FROM categories WHERE id = $1', [category_id]);
      categoryName = catResult.rows.length > 0 ? catResult.rows[0].name : '';
    }

    const responseData = {
      ...newTransaction.rows[0],
      category_name: categoryName,
    };

    return res.status(201).json({ success: true, message: 'Transaction added', data: responseData });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[addTransaction] ERROR - ROLLBACK:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};

// ============================================================
// DELETE TRANSACTION
// DELETE /api/v1/transactions/:id
// ============================================================
exports.deleteTransaction = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  console.log('[deleteTransaction] START - userId:', userId, 'txId:', id);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Get the transaction to delete
    const txResult = await client.query(
      'SELECT * FROM wallet_transactions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (txResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const tx = txResult.rows[0];
    const txAmount = parseFloat(tx.amount) || 0;
    const txType = tx.transaction_type;

    // 2. Delete the transaction
    await client.query('DELETE FROM wallet_transactions WHERE id = $1 AND user_id = $2', [id, userId]);

    // 3. Reverse the balance effect on users.current_balance
    if (txType === 'credit' || txType === 'initial_balance') {
      await client.query(
        'UPDATE users SET current_balance = current_balance - $1 WHERE id = $2',
        [txAmount, userId]
      );
    } else {
      await client.query(
        'UPDATE users SET current_balance = current_balance + $1 WHERE id = $2',
        [txAmount, userId]
      );
    }

    await client.query('COMMIT');
    console.log('[deleteTransaction] COMMITTED - reversed:', txType, txAmount);
    return res.status(200).json({ success: true, message: 'Transaction deleted and balance updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[deleteTransaction] ERROR - ROLLBACK:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};

// ============================================================
// UPDATE TRANSACTION (Edit Income/Expense)
// PUT /api/v1/transactions/:id
// ============================================================
exports.updateTransaction = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { transaction_type, amount, category_id, payment_mode_id, description, expense_date } = req.body;

  console.log('[updateTransaction] START - userId:', userId, 'txId:', id);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Get the OLD transaction record
    const oldTxResult = await client.query(
      'SELECT * FROM wallet_transactions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (oldTxResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const oldTx = oldTxResult.rows[0];
    const oldAmount = parseFloat(oldTx.amount);
    const oldType = oldTx.transaction_type;

    // 2. REVERSE OLD TRANSACTION EFFECT on current_balance
    if (oldType === 'credit' || oldType === 'initial_balance') {
      await client.query('UPDATE users SET current_balance = current_balance - $1 WHERE id = $2', [oldAmount, userId]);
    } else {
      await client.query('UPDATE users SET current_balance = current_balance + $1 WHERE id = $2', [oldAmount, userId]);
    }

    // 3. APPLY NEW TRANSACTION EFFECT on current_balance
    const newAmount = parseFloat(amount) || oldAmount;
    const newType = transaction_type || oldType;

    if (newType === 'credit' || newType === 'initial_balance') {
      await client.query('UPDATE users SET current_balance = current_balance + $1 WHERE id = $2', [newAmount, userId]);
    } else {
      await client.query('UPDATE users SET current_balance = current_balance - $1 WHERE id = $2', [newAmount, userId]);
    }

    // 4. Update the wallet_transactions record
    const updatedTx = await client.query(
      `UPDATE wallet_transactions
       SET transaction_type = $1, amount = $2, category_id = $3, payment_mode_id = $4,
           description = $5, expense_date = $6
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        newType,
        newAmount,
        category_id !== undefined ? category_id : oldTx.category_id,
        payment_mode_id !== undefined ? payment_mode_id : oldTx.payment_mode_id,
        description !== undefined ? description : oldTx.description,
        expense_date || oldTx.expense_date,
        id,
        userId
      ]
    );

    await client.query('COMMIT');
    console.log('[updateTransaction] COMMITTED successfully');

    return res.status(200).json({ success: true, message: 'Transaction updated successfully', data: updatedTx.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[updateTransaction] ERROR - ROLLBACK:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};

// ============================================================
// GET ALL TRANSACTIONS (replaces getExpenses + getCredits)
// GET /api/v1/transactions/all
// ============================================================
exports.getAllTransactions = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  console.log(`[getAllTransactions] START - userId: ${userId}, page: ${page}, limit: ${limit}`);

  if (!userId) {
    return res.status(200).json({
      success: true,
      data: { transactions: [], pagination: { currentPage: page, totalPages: 0, totalRecords: 0, limit, hasMore: false } }
    });
  }

  try {
    // 1. Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM wallet_transactions WHERE user_id = $1 AND transaction_type != \'initial_balance\'',
      [userId]
    );
    const totalRecords = parseInt(countResult.rows[0].count) || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    // 2. Get paginated data
    const result = await db.query(
      `SELECT wt.*, 
              c.name as category_name, c.icon as category_icon, c.color as category_color,
              TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date
       FROM wallet_transactions wt
       LEFT JOIN categories c ON wt.category_id = c.id
       WHERE wt.user_id = $1 AND wt.transaction_type != 'initial_balance'
       ORDER BY wt.expense_date DESC, wt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    console.log('[getAllTransactions] Found:', result.rows.length, 'transactions');

    return res.status(200).json({
      success: true,
      data: {
        transactions: result.rows,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords,
          limit,
          hasMore: page < totalPages
        }
      }
    });
  } catch (error) {
    console.error('[getAllTransactions] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// ============================================================
// UNIFIED TRANSACTION HISTORY (supports date, month, range filters)
// GET /api/v1/history OR /api/v1/transactions/history
// ============================================================
exports.getTransactionHistory = async (req, res) => {
  const userId = req.user.id;
  console.log('[getTransactionHistory] START - userId:', userId);
  console.log('[getTransactionHistory] req.query:', req.query);

  if (!userId) {
    console.log('[getTransactionHistory] No userId');
    return res.status(200).json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        openingBalance: 0,
        totalCredit: 0,
        totalExpense: 0,
        closingBalance: 0,
        transactions: []
      }
    });
  }

  const { type, date, month, startDate, endDate, page: queryPage, limit: queryLimit } = req.query;
  const page = parseInt(queryPage) || 1;
  const limit = parseInt(queryLimit) || 20;
  const offset = (page - 1) * limit;

  console.log('[getTransactionHistory] Params - type:', type, 'date:', date, 'month:', month, 'startDate:', startDate, 'endDate:', endDate, 'page:', page, 'limit:', limit);

  try {
    // ========== Determine filter mode ==========
    let filterMode = 'single_date';
    let filterLabel = '';
    let dateWhereClause = '';
    let dateParams = [userId]; // $1 is always userId
    let openingBalanceWhereClause = '';
    let openingBalanceParams = [userId];

    if (startDate && endDate) {
      // ---- DATE RANGE MODE ----
      filterMode = 'date_range';
      filterLabel = `${startDate} to ${endDate}`;
      dateWhereClause = `AND DATE(wt.expense_date) BETWEEN $2 AND $3`;
      dateParams.push(startDate, endDate);
      openingBalanceWhereClause = `AND DATE(expense_date) >= $2`;
      openingBalanceParams.push(startDate);
      console.log('[getTransactionHistory] Mode: DATE RANGE', startDate, 'to', endDate);

    } else if (month) {
      // ---- MONTH MODE ----
      filterMode = 'month';
      filterLabel = month;
      dateWhereClause = `AND TO_CHAR(wt.expense_date, 'YYYY-MM') = $2`;
      dateParams.push(month);
      const monthStart = `${month}-01`;
      openingBalanceWhereClause = `AND DATE(expense_date) >= $2`;
      openingBalanceParams.push(monthStart);
      console.log('[getTransactionHistory] Mode: MONTH', month);

    } else {
      // ---- SINGLE DATE MODE ----
      filterMode = 'single_date';
      let targetDateStr = '';

      if (type === 'today') {
        const today = new Date();
        const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
        targetDateStr = localToday.toISOString().split('T')[0];
      } else if (type === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const localYesterday = new Date(yesterday.getTime() - (yesterday.getTimezoneOffset() * 60000));
        targetDateStr = localYesterday.toISOString().split('T')[0];
      } else if (date) {
        targetDateStr = date;
      } else {
        const today = new Date();
        const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
        targetDateStr = localToday.toISOString().split('T')[0];
      }

      filterLabel = targetDateStr;
      dateWhereClause = `AND DATE(wt.expense_date) = $2`;
      dateParams.push(targetDateStr);
      openingBalanceWhereClause = `AND DATE(expense_date) >= $2`;
      openingBalanceParams.push(targetDateStr);
      console.log('[getTransactionHistory] Mode: SINGLE DATE', targetDateStr);
    }

    // ========== 1. Get current balance of user ==========
    const userResult = await db.query('SELECT current_balance FROM users WHERE id = $1', [userId]);
    const currentBalance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].current_balance) || 0 : 0;
    console.log('[getTransactionHistory] currentBalance:', currentBalance);

    // ========== 2. Calculate Opening Balance ==========
    // We EXCLUDE initial_balance here so it doesn't get subtracted when rewinding, making it the permanent opening balance
    const futureChangesQuery = `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount WHEN transaction_type = 'debit' THEN -amount ELSE 0 END), 0) as net_change FROM wallet_transactions WHERE user_id = $1 ${openingBalanceWhereClause}`;
    const futureChangesResult = await db.query(futureChangesQuery, openingBalanceParams);
    const futureNetChange = parseFloat(futureChangesResult.rows[0].net_change) || 0;
    let openingBalance = currentBalance - futureNetChange;
    console.log('[getTransactionHistory] openingBalance:', openingBalance);

    // ========== 3. Fetch Transactions (now with pagination) ==========
    const txQuery = `SELECT wt.id, wt.description as title, wt.amount, 
                            c.name as category_name,
                            TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date, 
                            TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as expense_date,
                             CASE WHEN wt.transaction_type = 'credit' THEN 'Credit' ELSE 'Expense' END as type, 
                             wt.description as notes,
                             wt.opening_balance, wt.closing_balance
                      FROM wallet_transactions wt
                      LEFT JOIN categories c ON wt.category_id = c.id
                      WHERE wt.user_id = $1 ${dateWhereClause} AND wt.transaction_type != 'initial_balance'
                      ORDER BY wt.expense_date DESC, wt.created_at DESC
                      LIMIT $${dateParams.length + 1} OFFSET $${dateParams.length + 2}`;

    const paginatedParams = [...dateParams, limit, offset];
    const txResult = await db.query(txQuery, paginatedParams);
    const transactions = txResult.rows;

    // ========== 4. Calculate totals for the FULL filtered period (not just the page) ==========
    const totalsQuery = `SELECT
                            SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) as total_credit,
                            SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) as total_expense,
                            COUNT(*) as total_records
                         FROM wallet_transactions wt
                         WHERE user_id = $1 ${dateWhereClause} AND transaction_type != 'initial_balance'`;
    const totalsResult = await db.query(totalsQuery, dateParams);
    const totalCredit = parseFloat(totalsResult.rows[0].total_credit) || 0;
    const totalExpense = parseFloat(totalsResult.rows[0].total_expense) || 0;
    const totalRecords = parseInt(totalsResult.rows[0].total_records) || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    let closingBalance = openingBalance + totalCredit - totalExpense;

    console.log('[getTransactionHistory] totalCredit:', totalCredit, 'totalExpense:', totalExpense, 'closingBalance:', closingBalance, 'totalRecords:', totalRecords);
    console.log('[getTransactionHistory] SENDING RESPONSE');

    return res.status(200).json({
      success: true,
      data: {
        date: filterLabel,
        filterMode,
        openingBalance,
        totalCredit,
        totalExpense,
        closingBalance,
        transactions,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords,
          limit,
          hasMore: page < totalPages
        }
      }
    });
  } catch (error) {
    console.error('[getTransactionHistory] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
