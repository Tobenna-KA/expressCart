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
  const db = req.app.db
  console.log(req.body.Body , req.body.Body.stkCallback
      , req.body.Body.stkCallback.CheckoutRequestID
      , req.body.Body.stkCallback.ResultCode === '0')

  if (req.body.Body && req.body.Body.stkCallback
      && req.body.Body.stkCallback.CheckoutRequestID
      && req.body.Body.stkCallback.ResultCode === '0')
  {
    await db.orders.updateOne({ orderPaymentId: req.body.Body.stkCallback.CheckoutRequestID}, {
      $set: { orderStatus: 'Paid', mpesaCode: req.body.Body.stkCallback.Value}
    });
  } else { // failed
    await db.orders.updateOne({ orderPaymentId: req.body.Body.stkCallback.CheckoutRequestID}, {
      $set: { orderStatus: 'Failed', ResultDesc: req.body.Body.stkCallback.ResultDesc }
    });
  }

  // db.orders.find({orderPaymentId: req.body})
  res.status(200).send({message: 'done'})
})

module.exports = router;