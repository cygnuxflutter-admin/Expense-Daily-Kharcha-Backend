const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'supersecretjwtkey1234567890',
    { expiresIn: '2d' } // Access Token set to 2 days as requested
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET || 'refreshsecretkey987654321',
    { expiresIn: '30d' } // Long-lived Refresh Token
  );
};

// Google Login
exports.googleLogin = async (req, res) => {
  try {
    console.log("API HIT: /auth/google-login");
    console.log("req.body:", req.body);
    let { firebase_uid, email, name, photo_url } = req.body;

    console.log('name', name);
    console.log('email', email);
    console.log('photo_url', photo_url);
    console.log('firebase_uid', firebase_uid);

    if (!firebase_uid || !email) {
      return res.status(400).json({ success: false, message: 'Missing firebase_uid or email' });
    }

    email = email.trim().toLowerCase(); // Security/UX: Normalize email

    console.log("QUERY START");

    // 1. Check if user already exists (including deleted ones)
    let userResult = await db.query('SELECT * FROM users WHERE email = $1 OR firebase_uid = $2 LIMIT 1', [email, firebase_uid]);
    console.log("result.rows:", userResult.rows);

    if (userResult.rows.length > 0) {
      const existingUser = userResult.rows[0];

      if (existingUser.is_deleted) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deleted.'
        });
      }

      if (existingUser.is_active === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated by the administrator.'
        });
      }

      // SECURITY CONDITION: If user registered manually (with password) and tries to Google Login
      if (existingUser.auth_provider === 'email' && !existingUser.firebase_uid) {
         console.log('[googleLogin] Blocked: User registered manually, tried Google Login');
         return res.status(400).json({ 
           success: false, 
           message: 'This email is already registered with a password. Please login manually using your Email and Password.' 
         });
      }

      // Update firebase_uid if it's a google auth user but firebase_uid was missing/changed
      if (existingUser.firebase_uid !== firebase_uid) {
        await db.query('UPDATE users SET firebase_uid = $1 WHERE id = $2', [firebase_uid, existingUser.id]);
        existingUser.firebase_uid = firebase_uid;
      }

      const accessToken = generateAccessToken(existingUser);
      const refreshToken = generateRefreshToken(existingUser);

      // Store refresh token in DB
      await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, existingUser.id]);

      console.log("BEFORE RESPONSE");
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token: accessToken,
        refreshToken,
        data: existingUser
      });
    }

    // 2. User does not exist, create new
    console.log('[googleLogin] Creating new user');
    const newUserResult = await db.query(
      'INSERT INTO users (firebase_uid, name, email, photo_url, auth_provider, current_balance, is_active) VALUES ($1, $2, $3, $4, $5, 0, true) RETURNING *',
      [firebase_uid, name, email, photo_url, 'google']
    );

    const newUser = newUserResult.rows[0];
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    // Store refresh token in DB
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, newUser.id]);

    console.log("BEFORE RESPONSE");
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
    console.log("API HIT: /auth/register");
    console.log("req.body:", req.body);
    let { name, email, password, mobile, phone } = req.body;
    const userMobile = mobile || phone; // Handle both keys

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    email = email.trim().toLowerCase(); // Security/UX: Normalize email

    console.log("QUERY START");

    // Check Duplicate
    const existingEmail = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log("result.rows:", existingEmail.rows);

    if (existingEmail.rows.length > 0) {
      const existingUser = existingEmail.rows[0];

      if (existingUser.is_deleted) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deleted.'
        });
      }

      if (existingUser.is_active === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated by the administrator.'
        });
      }

      return res.status(409).json({
        success: false,
        message: 'User already registered with this email.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserResult = await db.query(
      'INSERT INTO users (name, email, password, mobile, auth_provider, current_balance, is_active) VALUES ($1, $2, $3, $4, $5, 0, true) RETURNING *',
      [name, email, hashedPassword, userMobile, 'email']
    );

    const newUser = newUserResult.rows[0];
    delete newUser.password; // Don't send password back

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    // Store refresh token in DB
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, newUser.id]);

    console.log("BEFORE RESPONSE");
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: accessToken,
      refreshToken,
      data: newUser
    });
  } catch (error) {
    console.log("API ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Email Login
exports.login = async (req, res) => {
  try {
    console.log("API HIT: /auth/login");
    console.log("req.body:", req.body);
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    email = email.trim().toLowerCase(); // Security/UX: Normalize email

    console.log("QUERY START");
    // Find user by email (including deleted ones to check status)
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log("result.rows:", userResult.rows);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_deleted) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deleted.'
      });
    }

    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated by the administrator.'
      });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, message: 'Please login with Google' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    delete user.password;
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in DB
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    console.log("BEFORE RESPONSE");
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      data: user
    });
  } catch (error) {
    console.log("API ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// REFRESH TOKEN API
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh Token required' });
  }

  try {
    // 1. Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refreshsecretkey987654321');

    // 2. Check if token exists in DB and user is active
    const userResult = await db.query(
      'SELECT * FROM users WHERE id = $1 AND refresh_token = $2 AND is_active = true AND is_deleted = false',
      [decoded.id, refreshToken]
    );

    if (userResult.rows.length === 0) {
      // Return 401 as requested for invalid/revoked tokens
      return res.status(401).json({ success: false, message: 'Invalid or revoked refresh token' });
    }

    const user = userResult.rows[0];

    // 3. Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // 4. Update new refresh token in DB
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id]);

    return res.status(200).json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('[refreshToken] ERROR:', error.message);
    // Return 401 for expired or invalid token to trigger logout/re-login in app
    return res.status(401).json({ success: false, message: 'Token expired or invalid' });
  }
};

// Change Password (Direct - No OTP)
exports.changePasswordDirect = async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Flexible Condition: Allow password change if provider is NOT google
    const result = await db.query(
      "UPDATE users SET password = $1 WHERE email = $2 AND (auth_provider != 'google' OR auth_provider IS NULL) RETURNING id",
      [hashedPassword, email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Password cannot be changed. (User not found or is a Google user)'
      });
    }

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.log("API ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
