const express = require('express');
const router = express.Router();
const paymentModeController = require('../controllers/payment_mode.controller');

// Public route for payment modes
router.get('/', paymentModeController.getPaymentModes);

module.exports = router;
