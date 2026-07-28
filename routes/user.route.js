const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const verifyToken = require('../middleware/verifyToken');

// router.post('/', verifyToken, userController.createUser); // Handled by auth.route.js
router.get('/profile', verifyToken, userController.getProfile);
router.put('/profile', verifyToken, userController.updateProfile);
router.delete('/profile', verifyToken, userController.deleteAccount);

// Ad Settings (Per-User)
router.put('/ad-settings', verifyToken, userController.updateAdSettings); // Update self
router.put('/:id/ad-settings', verifyToken, userController.updateAdSettings); // Admin update by ID

module.exports = router;
