const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const verifyToken = require('../middleware/verifyToken');

// Unified History API - supports ?date=, ?month=, ?startDate=&endDate=
router.get('/', verifyToken, transactionController.getTransactionHistory);

module.exports = router;
