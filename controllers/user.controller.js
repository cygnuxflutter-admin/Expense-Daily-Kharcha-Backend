const db = require('../config/db');

// Create User
exports.createUser = async (req, res) => {
  const { name, email, phone, photo_url } = req.body;
  const id = req.user.id;
  console.log('[createUser] START - id:', id);

  try {
    const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length > 0) {
      console.log('[createUser] User already exists');
      return res.status(200).json({ success: true, message: 'User already exists', data: existingUser.rows[0] });
    }

    const newUser = await db.query(
      'INSERT INTO users (id, name, email, mobile, photo_url, current_balance) VALUES ($1, $2, $3, $4, $5, 0) RETURNING *',
      [id, name, email, phone, photo_url]
    );

    console.log('[createUser] User created:', newUser.rows[0].id);
    return res.status(201).json({ success: true, message: 'User created', data: newUser.rows[0] });
  } catch (error) {
    console.error('[createUser] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Get Profile
exports.getProfile = async (req, res) => {
  const id = req.user.id;
  console.log('[getProfile] START - id:', id);

  try {
    const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) {
      console.log('[getProfile] User not found for id:', id);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('[getProfile] Found user:', user.rows[0].email);
    const userData = user.rows[0];

    // Handle local photo URL
    if (userData.photo_url && !userData.photo_url.startsWith('http')) {
      userData.photo_url = `${process.env.APP_URL || ''}/uploads/${userData.photo_url}`;
    }

    return res.status(200).json({ success: true, data: userData });
  } catch (error) {
    console.error('[getProfile] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  const id = req.user.id;
  const { name, phone, mobile, photo_url } = req.body;
  const userMobile = mobile || phone; // Handle both keys
  console.log('[updateProfile] START - id:', id);

  try {
    const updatedUser = await db.query(
      'UPDATE users SET name = COALESCE($1, name), mobile = COALESCE($2, mobile), photo_url = COALESCE($3, photo_url) WHERE id = $4 RETURNING *',
      [name, userMobile, photo_url, id]
    );

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('[updateProfile] Updated:', updatedUser.rows[0].email);
    const userData = updatedUser.rows[0];

    // Handle local photo URL
    if (userData.photo_url && !userData.photo_url.startsWith('http')) {
      userData.photo_url = `${process.env.APP_URL || ''}/uploads/${userData.photo_url}`;
    }

    return res.status(200).json({ success: true, message: 'Profile updated', data: userData });
  } catch (error) {
    console.error('[updateProfile] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Soft Delete User Account
exports.deleteAccount = async (req, res) => {
  const id = req.user.id;
  console.log('[deleteAccount] START - id:', id);

  try {
    const result = await db.query(
      'UPDATE users SET is_deleted = true, is_active = false, deleted_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('[deleteAccount] Account soft-deleted for id:', id);
    return res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('[deleteAccount] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// Update Ad Settings (Per-User)
exports.updateAdSettings = async (req, res) => {
  const { show_ads } = req.body;
  const userId = req.params.id || req.user.id; // Use ID from URL if provided (Admin), else use logged-in user

  if (show_ads === undefined) {
    return res.status(400).json({ success: false, message: 'show_ads field is required' });
  }

  try {
    const result = await db.query(
      'UPDATE users SET show_ads = $1 WHERE id = $2 RETURNING id, email, show_ads',
      [show_ads, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`[updateAdSettings] Updated User ${userId}: show_ads = ${show_ads}`);
    return res.status(200).json({
      success: true,
      message: `Ads ${show_ads ? 'enabled' : 'disabled'} for user successfully`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[updateAdSettings] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
