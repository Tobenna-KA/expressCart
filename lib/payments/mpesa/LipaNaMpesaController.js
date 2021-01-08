const moment = require('moment')
const { sendTranscationToDarajaAPI } = require('./utils/helper')
const LIPA_NA_MPESA_STK = 'STK-PUSH'
require('dotenv').config()

exports.initiateRequest = function (req, res, next) {
  req.service = LIPA_NA_MPESA_STK
  let _this = req.body
  if (!(_this.amount || _this.phoneNumber || _this.callBackURL || _this.accountReference || _this.description)) {
    return res.status(500).send({
      message: 'Invalid Request Parameters'
    })
  }
  let BusinessShortCode = process.env.STK_SHORTCODE
  let timeStamp = moment().format('YYYYMMDDHHmmss')
  let rawPassword = BusinessShortCode + process.env.AUTHENTICATION_KEY + timeStamp

  req.mpesaTransaction = {
    BusinessShortCode: BusinessShortCode,
    Password: Buffer.from(rawPassword).toString('base64'),
    Timestamp: timeStamp,
    TransactionType: _this.transactionType || 'CustomerPayBillOnline',
    Amount: _this.amount,
    PartyA: _this.phoneNumber,
    PartyB: BusinessShortCode,
    PhoneNumber: _this.phoneNumber,
    CallBackURL: _this.callBackURL || process.env.CALLBACK_URL,
    AccountReference: _this.accountReference || 'test',
    TransactionDesc: _this.description
  }
  next()
}
exports.processTransaction = function (req, res, next) {
  sendTranscationToDarajaAPI({
    url: process.env.SAFARICOM_DARAJA_PROCESS_REQUEST_STK,
    auth: 'Bearer ' + req.transactionToken,
    transaction: req.mpesaTransaction
  }, req, res, next)
}
