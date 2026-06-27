const db = require('../config/db');

// Get Payment Modes
exports.getPaymentModes = async (req, res) => {
  console.log('[getPaymentModes] START');
  try {
    const modes = await db.query('SELECT * FROM payment_modes ORDER BY id ASC');
    console.log('[getPaymentModes] Found:', modes.rows.length, 'modes');
    return res.status(200).json({ success: true, count: modes.rows.length, data: modes.rows });
  } catch (error) {
    console.error('[getPaymentModes] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};
