const db = require('../config/db');

// Helper to generate date filter for reports
const getDateFilter = (filter, startDate, endDate) => {
  let whereClause = '';
  let params = [];

  if (filter === 'custom' && startDate && endDate) {
    whereClause = `AND DATE(wt.expense_date) BETWEEN $2 AND $3`;
    params = [startDate, endDate];
  } else if (filter === 'month') {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    whereClause = `AND EXTRACT(MONTH FROM wt.expense_date) = $2 AND EXTRACT(YEAR FROM wt.expense_date) = $3`;
    params = [currentMonth, currentYear];
  } else if (filter === 'year') {
    const today = new Date();
    const currentYear = today.getFullYear();
    whereClause = `AND EXTRACT(YEAR FROM wt.expense_date) = $2`;
    params = [currentYear];
  } else if (filter === 'week') {
    // Basic approximate current week: last 7 days
    const today = new Date();
    const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
    const todayStr = localToday.toISOString().split('T')[0];
    
    const weekAgo = new Date(localToday);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    whereClause = `AND DATE(wt.expense_date) BETWEEN $2 AND $3`;
    params = [weekAgoStr, todayStr];
  } else if (filter === 'today') {
    const today = new Date();
    const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
    const todayStr = localToday.toISOString().split('T')[0];
    whereClause = `AND DATE(wt.expense_date) = $2`;
    params = [todayStr];
  } else {
    // Default to this month
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    whereClause = `AND EXTRACT(MONTH FROM wt.expense_date) = $2 AND EXTRACT(YEAR FROM wt.expense_date) = $3`;
    params = [currentMonth, currentYear];
  }

  return { whereClause, params };
};


// 1. SUMMARY API
// GET /api/v1/reports/summary?filter=today&startDate=...
exports.getSummary = async (req, res) => {
  const userId = req.user.id;
  const { filter, startDate, endDate } = req.query;
  console.log('[getSummary] START - filter:', filter);

  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const { whereClause, params } = getDateFilter(filter, startDate, endDate);
    
    // We include 'initial_balance' as credit in Analytics
    const query = `
      SELECT 
        COALESCE(SUM(CASE WHEN wt.transaction_type IN ('credit', 'initial_balance') THEN wt.amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN wt.transaction_type = 'debit' THEN wt.amount ELSE 0 END), 0) AS total_expense
      FROM wallet_transactions wt
      WHERE wt.user_id = $1 ${whereClause}
    `;

    const result = await db.query(query, [userId, ...params]);
    
    const total_income = parseFloat(result.rows[0].total_income);
    const total_expense = parseFloat(result.rows[0].total_expense);
    const savings = total_income - total_expense;

    // We also return their absolute current_balance
    const userResult = await db.query('SELECT current_balance FROM users WHERE id = $1', [userId]);
    const current_balance = parseFloat(userResult.rows[0]?.current_balance || 0);

    console.log('[getSummary] result:', { current_balance, total_income, total_expense, savings });
    
    return res.status(200).json({
      success: true,
      data: {
        current_balance,
        total_income,
        total_expense,
        savings
      }
    });
  } catch (error) {
    console.error('[getSummary] ERROR:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// 2. CATEGORY ANALYTICS API
// GET /api/v1/reports/categories?filter=today
exports.getCategories = async (req, res) => {
  const userId = req.user.id;
  const { filter, startDate, endDate } = req.query;

  try {
    const { whereClause, params } = getDateFilter(filter, startDate, endDate);

    const query = `
      SELECT 
        c.name as category,
        c.color,
        c.icon,
        SUM(wt.amount) AS total
      FROM wallet_transactions wt
      JOIN categories c ON wt.category_id = c.id
      WHERE wt.user_id = $1 AND wt.transaction_type = 'debit' ${whereClause}
      GROUP BY c.name, c.color, c.icon
      ORDER BY total DESC
    `;

    const result = await db.query(query, [userId, ...params]);
    
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[getCategories] ERROR:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// 3. MONTHLY REPORT API (For Bar Chart Trends)
// GET /api/v1/reports/monthly
// Returns last 6-12 months of income/expense ignoring the specific date filter
exports.getMonthly = async (req, res) => {
  const userId = req.user.id;

  try {
    // Generate report for the last 6 months dynamically based on expense_date
    const query = `
      SELECT 
        TO_CHAR(wt.expense_date, 'Mon') AS month,
        EXTRACT(MONTH FROM wt.expense_date) AS month_num,
        COALESCE(SUM(CASE WHEN wt.transaction_type IN ('credit', 'initial_balance') THEN wt.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN wt.transaction_type = 'debit' THEN wt.amount ELSE 0 END), 0) AS expense
      FROM wallet_transactions wt
      WHERE wt.user_id = $1
        AND wt.expense_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
      GROUP BY month, month_num
      ORDER BY month_num ASC
    `;

    const result = await db.query(query, [userId]);
    
    // If no transactions in past 6 months, result is empty. Let flutter handle it.
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[getMonthly] ERROR:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
