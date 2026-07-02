const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
  console.log(`[verifyToken] Hit for: ${req.method} ${req.originalUrl}`);
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[verifyToken] No token provided');
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    console.log('[verifyToken] Verifying custom JWT...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey1234567890');
    
    // Check if ID is present in the token
    if (!decoded.id) {
      return res.status(401).json({ success: false, message: 'Invalid token structure' });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    
    console.log(`[verifyToken] JWT verified - User ID: ${req.user.id}`);
    next();
  } catch (error) {
    console.error('[verifyToken] ERROR:', error.name, error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired',
        isExpired: true
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;
