const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'supersecretjwtkey1234567890',
    { expiresIn: '2d' } // Access Token set to 2 days
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET || 'refreshsecretkey987654321',
    { expiresIn: '30d' } // Refresh Token set to 30 days
  );
};

// Helper to update tokens and expiry in DB
const updateTokensInDB = async (userId, accessToken, refreshToken) => {
  const accessTokenExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
  const refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.query(
    `UPDATE users SET
     access_token = $1,
     refresh_token = $2,
     token_expiry = $3,
     refresh_token_expiry = $4
     WHERE id = $5`,
    [accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry, userId]
  );
};

// Google Login
exports.googleLogin = async (req, res) => {
  try {
    console.log("API HIT: /auth/google-login");
    let { firebase_uid, email, name, photo_url } = req.body;

    if (!firebase_uid || !email) {
      return res.status(400).json({ success: false, message: 'Missing firebase_uid or email' });
    }

    email = email.trim().toLowerCase();

    // 1. Check if user already exists
    let userResult = await db.query('SELECT * FROM users WHERE email = $1 OR firebase_uid = $2 LIMIT 1', [email, firebase_uid]);

    if (userResult.rows.length > 0) {
      const existingUser = userResult.rows[0];

      if (existingUser.is_deleted) return res.status(403).json({ success: false, message: 'Account deleted' });
      if (existingUser.is_active === false) return res.status(403).json({ success: false, message: 'Account deactivated' });

      const accessToken = generateAccessToken(existingUser);
      const refreshToken = generateRefreshToken(existingUser);

      await updateTokensInDB(existingUser.id, accessToken, refreshToken);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token: accessToken,
        refreshToken,
        data: existingUser
      });
    }

    // 2. Create new user
    const newUserResult = await db.query(
      'INSERT INTO users (firebase_uid, name, email, photo_url, auth_provider, current_balance, is_active) VALUES ($1, $2, $3, $4, $5, 0, true) RETURNING *',
      [firebase_uid, name, email, photo_url, 'google']
    );

    const newUser = newUserResult.rows[0];
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    await updateTokensInDB(newUser.id, accessToken, refreshToken);

    return res.status(201).json({
      success: true,
      message: 'User created',
      token: accessToken,
      refreshToken,
      data: newUser
    });
  } catch (error) {
    console.log("API ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Email Register
exports.register = async (req, res) => {
  try {
    let { name, email, password, mobile, phone } = req.body;
    const userMobile = mobile || phone;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    email = email.trim().toLowerCase();

    const existingEmail = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserResult = await db.query(
      'INSERT INTO users (name, email, password, mobile, auth_provider, current_balance, is_active) VALUES ($1, $2, $3, $4, $5, 0, true) RETURNING *',
      [name, email, hashedPassword, userMobile, 'email']
    );

    const newUser = newUserResult.rows[0];
    delete newUser.password;

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    await updateTokensInDB(newUser.id, accessToken, refreshToken);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: accessToken,
      refreshToken,
      data: newUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Email Login
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    email = email.trim().toLowerCase();
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const user = userResult.rows[0];
    if (user.is_deleted) return res.status(403).json({ success: false, message: 'Account deleted' });
    if (user.is_active === false) return res.status(403).json({ success: false, message: 'Account deactivated' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    delete user.password;
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await updateTokensInDB(user.id, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      data: user
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// REFRESH TOKEN API
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh Token required' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refreshsecretkey987654321');

    const userResult = await db.query(
      'SELECT * FROM users WHERE id = $1 AND refresh_token = $2 AND is_active = true AND is_deleted = false',
      [decoded.id, refreshToken]
    );

    if (userResult.rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid token' });

    const user = userResult.rows[0];
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await                                                                                                 DB(user.id, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }
};

// Change Password
exports.changePasswordDirect = async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const result = await db.query(
      "UPDATE users SET password = $1 WHERE email = $2 AND (auth_provider != 'google' OR auth_provider IS NULL) RETURNING id",
      [hashedPassword, email]
    );

    if (result.rows.length === 0) return res.status(400).json({ success: false, message: 'Update failed' });

    return res.status(200).json({ success: true, message: 'Password updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
