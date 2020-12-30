const express = require('express');
const router = express.Router();
const lipaNaMpesaController = require('./mpesa/LipaNaMpesaController');
const { fetchToken } = require('./mpesa/auth/auth');

router.post('/api/v1/stkpush/process',
    lipaNaMpesaController.initiateRequest,
    fetchToken, lipaNaMpesaController.processTransaction
);

router.post('/api/v1/callback', async (req, res) => {
  console.log(JSON.stringify(req.body))
  console.log(req.app)
  const db = req.app.db
  // db.orders.find({orderPaymentId: req.body})
  res.status(200).send(req.body)
})

module.exports = router;