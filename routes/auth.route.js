const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const verifyToken = require('../middleware/verifyToken');

router.post('/google-login', authController.googleLogin);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/change-password-direct', authController.changePasswordDirect);
router.post('/reset-password', authController.changePasswordDirect); // Added for Flutter compatibility

module.exports = router;
