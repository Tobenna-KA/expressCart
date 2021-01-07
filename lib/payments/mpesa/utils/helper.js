const request = require('request')
const { getId, sendEmail, getEmailTemplate } = require('../../../common');
const { indexOrders } = require('../../../indexing');
const { emptyCart } = require('../../../cart');

const createOrder = async (req, res) => {

  try{
    const orderDoc = {
      orderPaymentId: req.CheckoutRequestID,
      orderPaymentGateway: 'Mpesa',
      currency: 'KES',
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
      orderStatus: req.ResponseCode === '0'? 'Pending' : 'Failed',
      orderDate: new Date(),
      orderProducts: req.session.cart,
      orderType: 'Single'
    };

    if (
        !req.CheckoutRequestID || isEmpty(req.session.totalCartAmount) || isEmpty(req.session.totalCartShipping)
        || isEmpty(req.session.totalCartItems) || isEmpty(req.session.totalCartProducts) || !req.session.customerId
        || !req.session.customerEmail || !req.session.customerFirstname || !req.session.customerLastname
    )  return {error: true, p: 1, goto: '/checkout/payment'}
    // insert order into DB
    try{
      const newDoc = await req.app.db.orders.insertOne(orderDoc);

      // get the new ID
      const newId = newDoc.insertedId;

      // add to lunr index
      await indexOrders(req.app);
      // if approved, send email etc

      if (req.ResponseCode === '0') {
        // set the results
        req.session.messageType = 'success';
        req.session.message = 'Your payment was successfully completed';
        req.session.paymentEmailAddr = newDoc.ops[0].orderEmail;
        req.session.paymentApproved = true;
        req.session.paymentDetails = `<p><strong>Order ID: </strong>${newId}</p>
                    <p><strong>Transaction ID: </strong>${orderDoc.orderPaymentId}</p>`;

        // set payment results for email
        const paymentResults = {
          message: req.session.message,
          messageType: req.session.messageType,
          paymentEmailAddr: req.session.paymentEmailAddr,
          paymentApproved: true,
          paymentDetails: req.session.paymentDetails
        };

        // clear the cart
        if(req.session.cart){
          emptyCart(req, res, 'function');
        }

        // send the email with the response
        // TODO: Should fix this to properly handle result
        // sendEmail(req.session.paymentEmailAddr, `Your payment with ${req.app.config.cartTitle}`, getEmailTemplate(paymentResults));

        // redirect to outcome
        // res.redirect(`/payment/${newId}`);
        return {goto: `/payment/${newId}`}
      } else {
        // redirect to failure
        req.session.messageType = 'danger';
        req.session.message = 'Your payment has declined. Please try again';
        req.session.paymentApproved = false;
        req.session.paymentDetails = `<p><strong>Order ID: </strong>${newId}
                    </p><p><strong>Transaction ID: </strong> ${req.CheckoutRequestID}</p>`;
        // res.redirect(`/payment/${newId}`);
        return {error: true, goto: `/payment/${newId}`}
      }
    } catch(ex) {
      console.log('Error sending payment to API', ex);
      return {error: true, p: 2, goto: '/checkout/payment'};
    }
  } catch(ex) {
    console.info('Exception processing payment', ex);
    req.session.messageType = 'danger';
    req.session.message = 'Your payment has declined. Please try again';
    req.session.paymentApproved = false;
    req.session.paymentDetails = '';
    return {error: true, p: 3, goto: '/checkout/payment'}
  }
}

function sendTranscationToDarajaAPI (transactionDetails, req, res, next) {
  request({
    method: 'POST',
    url: transactionDetails.url,
    headers: {
      'Authorization': transactionDetails.auth
    },
    json: transactionDetails.transaction
  }, function (error, response, body) {

    console.log(transactionDetails.transaction)
    console.log(body)
    req.CheckoutRequestID = body.CheckoutRequestID;
    req.ResponseCode = body.ResponseCode;

    httpResponseBodyProcessor({
      body: body,
      error: error
    }, req, res, next)
  })
}

function registerRedirectUrl (req, res, next) {
  const url = process.env.SAFARICOM_DARAJA_REGISTER_C2B_URL,
      auth = "Bearer " + req.transactionToken;
   console.log({
    method: 'POST',
    url : url,
    headers : {
      "Authorization" : auth
    },
    json : {
      "ShortCode": process.env.PAYBILL_SHORTCODE,
      "ResponseType": " ",
      "ConfirmationURL": process.env.CALLBACK_URL
      // "ValidationURL": "http://ip_address:port/validation_url"
    }
  })
  request(
      {
        method: 'POST',
        url : url,
        headers : {
          "Authorization" : auth
        },
        json : {
          "ShortCode": process.env.PAYBILL_SHORTCODE,
          "ResponseType": " ",
          "ConfirmationURL": process.env.CALLBACK_URL,
          "ValidationURL": process.env.CALLBACK_URL
        }
      },
      function (error, response, body) {
        // TODO: Use the body object to extract the
        console.log(body.Envelope.Body.Fault.detail)
        console.log(error, response.body)
        next()
      }
  )
}

const httpResponseBodyProcessor = async (responseData, req, res, next)  => {
  // console.log('HttpResponseBodyProcessor ' + JSON.stringify(responseData))
  // console.log(!responseData.body.fault && !responseData.body.errorCode && !responseData.error && !isEmpty(responseData.body.status))
  // console.log(!responseData.body.fault, !responseData.body.errorCode, !responseData.error, !isEmpty(responseData.body.status))
  if (!responseData.body.fault && !responseData.body.errorCode && !responseData.error/* && !isEmpty(responseData.body.status)*/) {
    console.log('POST Response ' + JSON.stringify(responseData.body))
    if (responseData.body.ResponseCode === '0') { // success
      let result = await createOrder(req, res) // create order
      if (!result.error) {
        req.transactionResponse = responseData.body
        return res.status(200).send(result)
      } else {
        return res.status(400).send(result)
      }
    } else {
      return res.status(400).send({ error: true, message: 'Request Failed' })
    }
  } else {
    return res.status(400).send({ error: true, message: 'Request Sent for Failed' })
  }
}

function isEmpty (val) {
  return (val === undefined || val == null || val.length <= 0)
}

module.exports = {
  sendTranscationToDarajaAPI,
  registerRedirectUrl,
  isEmpty
}