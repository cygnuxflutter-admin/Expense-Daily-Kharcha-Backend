const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const verifyToken = require('../middleware/verifyToken');

// router.post('/', verifyToken, userController.createUser); // Handled by auth.route.js
router.get('/profile', verifyToken, userController.getProfile);
router.put('/profile', verifyToken, userController.updateProfile);
router.delete('/profile', verifyToken, userController.deleteAccount);

module.exports = router;
