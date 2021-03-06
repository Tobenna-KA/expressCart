const express = require('express');
const router = express.Router();
const lipaNaMpesaController = require('./mpesa/LipaNaMpesaController');
const { fetchToken } = require('./mpesa/auth/auth');
const { registerRedirectUrl, isEmpty, simulateC2B } = require('./mpesa/utils/helper');
const { indexOrders } = require('../indexing');
const { getId, sendEmail, getEmailTemplate } = require('../common');
const { getPaymentConfig } = require('../config');
const { emptyCart } = require('../cart');

router.post('/api/v1/stkpush/process',
    lipaNaMpesaController.initiateRequest,
    fetchToken, lipaNaMpesaController.processTransaction
);

router.post('/api/v1/callback', async (req, res) => {
  console.log(JSON.stringify(req.body))
  const db = req.app.db
  //
  if (req.body.Body && req.body.Body.stkCallback
      && req.body.Body.stkCallback.CheckoutRequestID
      && req.body.Body.stkCallback.ResultCode === 0)
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

router.post('/api/v1/confirmation', async (req, res) => {
  console.log(JSON.stringify(req.body))
  const db = req.app.db

  if (!isEmpty(req.body) && !isEmpty(req.body.TransID)
      && !isEmpty(req.body.TransTime) && !isEmpty(req.body.BusinessShortCode)
      && !isEmpty(req.body.BillRefNumber) && !isEmpty(req.body.TransAmount))
  {
    req.body.BillRefNumber *= 1
    const order = await db.orders.findOne({
      mpesaPaymentAccount: req.body.BillRefNumber,
      orderStatus: 'Pending',
      orderTotal: req.body.TransAmount
    })

    if (order)  {
      console.log(JSON.stringify(order), 'ORDER')
      await db.orders.updateOne({
        mpesaPaymentAccount: req.body.BillRefNumber,
        orderStatus: 'Pending',
        orderTotal: req.body.TransAmount
      }, {
        $set: { orderStatus: 'Paid', mpesaCode: req.body.BillRefNumber}
      });
    } else {
      // order exists, but amount paid is not complete
      const order = await db.orders.findOne({ mpesaPaymentAccount: req.body.BillRefNumber })
      console.log(JSON.stringify(order), 'ORDER2', { mpesaPaymentAccount: req.body.BillRefNumber })
      if (order) {

        await db.orders.updateOne({
          mpesaPaymentAccount: req.body.BillRefNumber,
          orderStatus: 'Pending'
        }, {
          $set: { orderStatus: 'Mismatched', mpesaCode: req.body.BillRefNumber}
        });
      }
    }

  } else { // failed
    console.log(JSON.stringify(req.body), 'BODY')
    req.body.BillRefNumber *= 1
    await db.orders.updateOne({ mpesaPaymentAccount: req.body.mpesaPaymentAccount}, {
      $set: { orderStatus: 'Failed', ResultDesc: 'Payment Failed' }
    });
  }

  // db.orders.find({orderPaymentId: req.body})
  res.status(200).send({message: 'done'})
})

router.post('/mpesa/payment_code', async (req, res, next) => {
  if (req.body.code && req.body.order_id) {
    const db = req.app.db
    let order = await db.orders.findOne({_id: getId(req.body.order_id)})
    if (!order.orderPaymentId) {
      order = await db.orders.findOneAndUpdate({_id: getId(req.body.order_id)}, {$set: {orderPaymentId: req.body.code}})
      if (order) {
        req.session.message = 'Payment Id has been set for this payment';
        req.session.messageType = 'success';
        return res.redirect('/payment/' + req.body.order_id);
      } else {
        req.session.message = 'Error setting Payment Id';
        req.session.messageType = 'danger';
        return res.redirect('/payment/' + req.body.order_id);
      }
    } else {
      req.session.message = 'Payment Id already set for this payment';
      req.session.messageType = 'danger';
      return res.redirect('/payment/' + req.body.order_id);
    }
  } else {
    req.session.message = 'Form not well filled';
    req.session.messageType = 'danger';
    if (req.body.order_id) return res.redirect('/payment/' + req.body.order_id);
    return res.redirect('/checkout/payment');
  }
  // res.redirect('/')
})

router.post('/mpesa/simulate', fetchToken, registerRedirectUrl, simulateC2B, async (req, res, next) => {
  res.status(200).send({message: 'done'})
})

router.post('/mpesa/checkout_action', /*fetchToken, registerRedirectUrl,*/ async (req, res, next) => {
    // make sure mpesaPaymentAccount is unique across db
    // console.log(req.session)
    // if there is no items in the cart then render a failure
    req.session.message = '';
    req.session.messageType = '';
    if(!req.session.cart){
      req.session.message = 'The are no items in your cart. Please add some items before checking out';
      req.session.messageType = 'danger';
      res.redirect('/');
      return;
    }

    if (req.failedToAddRedirectUrl) {
      req.session.message = 'Failed to verify mpesa';
      req.session.messageType = 'danger';
      res.redirect('/checkout/payment');
      return;
    }

    if (
        !isEmpty(req.session.currency) && !isEmpty(req.session.totalCartAmount) && !isEmpty(req.session.totalCartShipping)
        && !isEmpty(req.session.totalCartItems) && !isEmpty(req.session.totalCartProducts) && !isEmpty(req.session.customerId)
        && !isEmpty(req.session.customerEmail)
    ) {
      const db = req.app.db;
      const config = req.app.config;
      let mpesaPaymentAccount = Math.floor(100000000 + Math.random() * 90000000);
      let order, i = 0

      do {
        order = await db.orders.findOne({mpesaPaymentAccount})
        mpesaPaymentAccount = Math.floor(100000000 + i + Math.random() * 90000000);
        i++;
      } while (order)
      // create payment

      // new order doc
      const orderDoc = {
        orderPaymentId: '',
        mpesaPaymentAccount: mpesaPaymentAccount,
        orderPaymentGateway: 'Mpesa',
        currency: req.session.currency,
        orderTotal: req.session.totalCartAmount,
        orderShipping: req.session.totalCartShipping,
        orderItemCount: req.session.totalCartItems,
        orderProductCount: req.session.totalCartProducts,
        orderCustomer: getId(req.session.customerId),
        orderEmail: req.session.customerEmail,
        orderCompany: req.session.customerCompany,
        orderFirstname: req.session.customerFirstname,
        orderLastname: req.session.customerLastname,
        orderAddr1: req.session.customerAddress1,
        orderAddr2: req.session.customerAddress2,
        orderCountry: req.session.customerCountry,
        orderState: req.session.customerState,
        orderPostcode: req.session.customerPostcode,
        orderPhoneNumber: req.session.customerPhone,
        orderComment: req.session.orderComment,
        orderStatus: 'Pending',
        orderDate: new Date(),
        orderProducts: req.session.cart,
        orderType: 'Single'
      };

      console.log(orderDoc)
      // no order ID so we create a new one
      db.orders.insertOne(orderDoc, (err, newDoc) => {
        // console.log(newDoc)
        console.log(err, 'Error')
        if (err) {
          req.session.message = 'There was an error processing your payment. You have not been charged and can try again.';
          req.session.messageType = 'danger';
          res.redirect('/checkout/payment');
        } else {
          // set the order ID in the session
          req.session.orderId = newDoc.insertedId;
          emptyCart(req, res, 'function');
          // send the order to Paypal
          res.redirect(`/payment/${newDoc.insertedId}`);
        }

      });
    } else  {
      req.session.message = 'You do not have some required fields to make this payment';
      req.session.messageType = 'danger';
      res.redirect('/checkout/payment');
    }
  });


module.exports = router;