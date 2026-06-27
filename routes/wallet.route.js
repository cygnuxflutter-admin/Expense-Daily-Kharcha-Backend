const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const verifyToken = require('../middleware/verifyToken');

router.post('/credit', verifyToken, walletController.addCredit);
router.get('/history', verifyToken, walletController.getWalletHistory);
router.get('/balance', verifyToken, walletController.getCurrentBalance);

module.exports = router;
