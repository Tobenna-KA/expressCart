const express = require('express');
const router = express.Router();
const lipaNaMpesaController = require('./mpesa/LipaNaMpesaController');
const { fetchToken } = require('./mpesa/auth/auth');

router.post('/api/v1/stkpush/process',
    lipaNaMpesaController.initiateRequest,
    fetchToken, lipaNaMpesaController.processTransaction
);

router.post('/api/v1/callback', (req, res) => {
  console.log(req.body)
  console.log(req.app)
  res.status(200).send(req.body)
})

module.exports = router;