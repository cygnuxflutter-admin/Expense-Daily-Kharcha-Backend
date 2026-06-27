const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const verifyToken = require('../middleware/verifyToken');

router.get('/summary', verifyToken, reportController.getSummary);
router.get('/categories', verifyToken, reportController.getCategories);
router.get('/monthly', verifyToken, reportController.getMonthly);

module.exports = router;
