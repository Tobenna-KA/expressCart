const express = require('express');
const router = express.Router();
const lipaNaMpesaController = require('./mpesa/LipaNaMpesaController');
const { fetchToken } = require('./mpesa/auth/auth');

router.post('/api/v1/stkpush/process',
    lipaNaMpesaController.initiateRequest,
    fetchToken, lipaNaMpesaController.processTransaction
);

router.post('/api/v1/callback', async (req, res) => {
  console.log(JSON.stringify(req.body.Body.stkCallback))
  // if (req.body.Body && req.body.Body.stkCallback && req.body.Body.stkCallback.CheckoutRequestID)
  console.log(req.app.db)
  const db = req.app.db
  // db.orders.find({orderPaymentId: req.body})
  res.status(200).send(req.body)
})

module.exports = router;