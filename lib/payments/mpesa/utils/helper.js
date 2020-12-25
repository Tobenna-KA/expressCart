const request = require('request')

function sendTranscationToDarajaAPI (transactionDetails, req, res, next) {
  request({
    method: 'POST',
    url: transactionDetails.url,
    headers: {
      'Authorization': transactionDetails.auth
    },
    json: transactionDetails.transaction
  }, function (error, response, body) {
    return console.log(body)
    httpResponseBodyProcessor({
      body: body,
      error: error
    }, req, res, next)
  })
}

function httpResponseBodyProcessor (responseData, req, res, next) {
  console.log('HttpResponseBodyProcessor ' + JSON.stringify(responseData))
  console.log(!responseData.body.fault && !responseData.body.errorCode && !responseData.error && !isEmpty(responseData.body.status))
  console.log(!responseData.body.fault, !responseData.body.errorCode, !responseData.error, !isEmpty(responseData.body.status))
  if (!responseData.body.fault && !responseData.body.errorCode && !responseData.error/* && !isEmpty(responseData.body.status)*/) {
    console.log('POST Response ' + JSON.stringify(responseData.body))
    req.transactionResponse = responseData.body
    next()
  } else {
    console.log('Error Occurred', JSON.stringify(responseData.body))
    return res.status(200)
      .send({
        message: 'Request Sent for Processing'
      })
  }
}

function isEmpty (val) {
  return (val === undefined || val == null || val.length <= 0)
}

module.exports = {
  sendTranscationToDarajaAPI: sendTranscationToDarajaAPI
}