const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const verifyToken = require('../middleware/verifyToken');

// Unified Transaction Routes
router.post('/add', verifyToken, transactionController.addTransaction);
router.get('/all', verifyToken, transactionController.getAllTransactions);
router.get('/history', verifyToken, transactionController.getTransactionHistory);
router.get('/search', verifyToken, transactionController.searchTransactions);
router.put('/:id', verifyToken, transactionController.updateTransaction);
router.delete('/:id', verifyToken, transactionController.deleteTransaction);

module.exports = router;
