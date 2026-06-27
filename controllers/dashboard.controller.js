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
  const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
  const todayString = localToday.toISOString().split('T')[0];
  const currentMonthId = today.getMonth() + 1;
  const currentYearId = today.getFullYear();
  
  try {
    // Current Balance from users table
    const userResult = await db.query("SELECT current_balance FROM users WHERE id = $1", [userId]);
    const currentBalance = userResult.rows.length > 0 ? parseFloat(userResult.rows[0].current_balance) || 0 : 0;
    console.log('[getDashboardSummary] currentBalance:', currentBalance);

    // Current Month DEBIT total (from wallet_transactions)
    const currentMonthResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'debit' AND EXTRACT(MONTH FROM expense_date) = $2 AND EXTRACT(YEAR FROM expense_date) = $3",
      [userId, currentMonthId, currentYearId]
    );
    const monthlyExpense = parseFloat(currentMonthResult.rows[0].total) || 0;
    console.log('[getDashboardSummary] monthlyExpense:', monthlyExpense);

    // Current Year DEBIT total (from wallet_transactions)
    const currentYearResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'debit' AND EXTRACT(YEAR FROM expense_date) = $2",
      [userId, currentYearId]
    );
    const yearlyExpense = parseFloat(currentYearResult.rows[0].total) || 0;
    console.log('[getDashboardSummary] yearlyExpense:', yearlyExpense);

    // Monthly CREDIT total (income) (from wallet_transactions)
    const monthlyIncomeResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type IN ('credit', 'initial_balance') AND EXTRACT(MONTH FROM expense_date) = $2 AND EXTRACT(YEAR FROM expense_date) = $3",
      [userId, currentMonthId, currentYearId]
    );
    const monthlyIncome = parseFloat(monthlyIncomeResult.rows[0].total) || 0;
    console.log('[getDashboardSummary] monthlyIncome:', monthlyIncome);

    // Today's DEBIT total (from wallet_transactions)
    const todayResult = await db.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'debit' AND DATE(expense_date) = $2",
      [userId, todayString]
    );
    const todayExpense = parseFloat(todayResult.rows[0].total) || 0;
    console.log('[getDashboardSummary] todayExpense:', todayExpense);

    // Recent 5 transactions (from wallet_transactions, joined with categories)
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
    console.log('[getDashboardSummary] recentTransactions:', recentTransactions.rows.length);

    console.log('[getDashboardSummary] SENDING RESPONSE');
    return res.status(200).json({
      success: true,
      data: {
        currentBalance,
        todayExpense,
        monthlyExpense,
        yearlyExpense,
        monthlyIncome,
        recentTransactions: recentTransactions.rows
      }
    });
  } catch (error) {
    console.error('[getDashboardSummary] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
