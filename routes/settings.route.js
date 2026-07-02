const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const verifyToken = require('../middleware/verifyToken');

// Public route for the app to check ads status
router.get('/ads-status', settingsController.getAdsStatus);

// Protected route for Admin to update status
router.put('/update-ads', verifyToken, settingsController.updateAdsStatus);

module.exports = router;
