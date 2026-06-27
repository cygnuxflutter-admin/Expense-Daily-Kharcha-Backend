const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const verifyToken = require('../middleware/verifyToken');

router.get('/', categoryController.getCategories);
router.post('/', verifyToken, categoryController.addCategory);

module.exports = router;
