const db = require('../config/db');

// Dashboard Summary — ALL from wallet_transactions
exports.getDashboardSummary = async (req, res) => {
  const userId = req.user.id;
  console.log('[getDashboardSummary] START - userId:', userId);

  if (!userId) {
    console.log('[getDashboardSummary] No userId, returning defaults');
    return res.status(200).json({
      success: true,
      data: {
        currentBalance: 0,
        todayExpense: 0,
        monthlyExpense: 0,
        yearlyExpense: 0,
        monthlyIncome: 0,
        recentTransactions: []
      }
    });
  }

  const today = new Date();
  const queryMonth = req.query.month ? parseInt(req.query.month) : today.getMonth() + 1;
  const queryYear = req.query.year ? parseInt(req.query.year) : today.getFullYear();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonthLabel = `${monthNames[queryMonth - 1]} ${queryYear}`;

  const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
  const todayString = localToday.toISOString().split('T')[0];

  try {
    // Current Balance from users table
    const userResult = await db.query("SELECT current_balance, name FROM users WHERE id = $1", [userId]);
    const userData = userResult.rows[0];
    const currentBalance = userData ? parseFloat(userData.current_balance) || 0 : 0;
    const userName = userData ? userData.name : 'Unknown';

    console.log(`[getDashboardSummary] User: ${userName}, Showing for: ${currentMonthLabel}`);

    // Monthly DEBIT total (Filtered by Query Month/Year)
    const currentMonthResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'debit' AND EXTRACT(MONTH FROM expense_date) = $2 AND EXTRACT(YEAR FROM expense_date) = $3",
      [userId, queryMonth, queryYear]
    );
    const monthlyExpense = parseFloat(currentMonthResult.rows[0].total) || 0;

    // Monthly CREDIT total (Filtered by Query Month/Year)
    const monthlyIncomeResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type IN ('credit', 'initial_balance') AND EXTRACT(MONTH FROM expense_date) = $2 AND EXTRACT(YEAR FROM expense_date) = $3",
      [userId, queryMonth, queryYear]
    );
    const monthlyIncome = parseFloat(monthlyIncomeResult.rows[0].total) || 0;

    // Yearly INCOME total (For the query year)
    const yearlyIncomeResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type IN ('credit', 'initial_balance') AND EXTRACT(YEAR FROM expense_date) = $2",
      [userId, queryYear]
    );
    const yearlyIncome = parseFloat(yearlyIncomeResult.rows[0].total) || 0;

    // Yearly EXPENSE total (For the query year)
    const yearlyExpenseResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'debit' AND EXTRACT(YEAR FROM expense_date) = $2",
      [userId, queryYear]
    );
    const yearlyExpense = parseFloat(yearlyExpenseResult.rows[0].total) || 0;

    // Today's DEBIT total
    const todayResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'debit' AND DATE(expense_date) = $2",
      [userId, todayString]
    );
    const todayExpense = parseFloat(todayResult.rows[0].total) || 0;

    // Recent 5 transactions (All time)
    const recentTransactions = await db.query(
      `SELECT wt.*, 
              c.name as category_name, c.icon as category_icon, c.color as category_color,
              TO_CHAR(wt.expense_date, 'YYYY-MM-DD') as date
       FROM wallet_transactions wt 
       LEFT JOIN categories c ON wt.category_id = c.id 
       WHERE wt.user_id = $1 AND wt.transaction_type != 'initial_balance'
       ORDER BY wt.expense_date DESC, wt.created_at DESC 
       LIMIT 5`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        currentMonthLabel,
        currentBalance,
        todayExpense,
        monthlyExpense,
        monthlyIncome,
        yearlyExpense,
        yearlyIncome,
        recentTransactions: recentTransactions.rows
      }
    });
  } catch (error) {
    console.error('[getDashboardSummary] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
