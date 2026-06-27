const db = require('../config/db');

// Get Categories
exports.getCategories = async (req, res) => {
  const { type } = req.query;
  console.log('[getCategories] START - type:', type || 'all');
  
  try {
    let query = 'SELECT * FROM categories';
    let params = [];
    
    if (type === 'income' || type === 'expense') {
      query += ' WHERE category_type = $1';
      params.push(type);
    }
    
    query += ' ORDER BY name ASC';
    
    const categories = await db.query(query, params);
    console.log('[getCategories] Found:', categories.rows.length, 'categories');
    return res.status(200).json({ success: true, count: categories.rows.length, data: categories.rows });
  } catch (error) {
    console.error('[getCategories] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Add Category
exports.addCategory = async (req, res) => {
  const { name, icon, color } = req.body;
  console.log('[addCategory] START - name:', name);

  try {
    const newCategory = await db.query(
      'INSERT INTO categories (name, icon, color) VALUES ($1, $2, $3) RETURNING *',
      [name, icon, color]
    );
    console.log('[addCategory] Created:', newCategory.rows[0].id);
    return res.status(201).json({ success: true, message: 'Category added', data: newCategory.rows[0] });
  } catch (error) {
    console.error('[addCategory] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
