const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const verifyToken = require('../middleware/verifyToken');

router.post('/', verifyToken, expenseController.addExpense);
router.get('/history', verifyToken, expenseController.getExpenseHistory);
router.get('/day', verifyToken, expenseController.getDayWiseExpense);
router.get('/month', verifyToken, expenseController.getMonthWiseExpense);
router.get('/year', verifyToken, expenseController.getYearWiseExpense);
router.delete('/:id', verifyToken, expenseController.deleteExpense);

module.exports = router;
