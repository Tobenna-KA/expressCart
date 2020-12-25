const moment = require('moment');
const request = require('request');
const STK_PUSH = 'STK_PUSH';
const TOKEN_INVALIDITY_WINDOW = 240;
const GENERIC_SERVER_ERROR_CODE = '01';

fetchToken = (req,res,next)=>{
  console.log('Getting Token');
  let serviceName = req.service;
  console.log(serviceName)
  setNewAccessToken(req, res, serviceName,true, next);
};

let isTokenValid = function(service){
   let tokenAge = moment.duration(moment(new Date()).diff(service.lastUpdated)).asSeconds() + TOKEN_INVALIDITY_WINDOW;
   return (tokenAge < service.timeout)
};

let setNewAccessToken = function(req,res,serviceName,newInstance,next){
  let consumerKey =  '';
  let consumerSecret = '';
  let token = {};
  let authenticationUrl = process.env.SAFARICOM_DARAJA_AUTH_URL;

  switch (serviceName) {

    case STK_PUSH:
     consumerKey = process.env.CONSUMER_KEY;
     consumerSecret = process.env.CONSUMER_SECRET;
     break;

    default:
      consumerKey = process.env.CONSUMER_KEY;
      consumerSecret = process.env.CONSUMER_SECRET;
      break;
  }
  let auth = 'Basic ' + Buffer.from(consumerKey + ':' + consumerSecret).toString('base64');

  request({url:authenticationUrl, headers:{'Authorization': auth}}, async (error,response,body) => {
    console.log(body)
    let tokenResponse = JSON.parse(body);
    const db = req.app.db

    if (!error || !tokenResponse.errorCode){
      let newToken = {
        lastUpdated: moment().format('YYYY-MM-DD HH:mm:ss'),
        accessToken: tokenResponse.access_token,
        timeout: tokenResponse.expires_in,
        service: serviceName
      };
      if (newInstance){
        /*token = new Token(newToken);
        token.save()
          .then(result=>{

          })
          .catch(err=>{
            console.log('Error Saving Record',err.message);
            return res.status(500)
              .send({
                message:'Error Saving Token Record',
                error:err.message
              })
          });*/
        token = await db.mpesaTokens.insertOne(newToken)
        if (token) {
          req.transactionToken = newToken.accessToken;
          next();
        } else {
          return res.status(500)
              .send({
                message:'Error Saving Token Record',
                error:err.message
              })
        }
      } else{
        let conditions = {service:serviceName};
        let options = {multi:true};

        db.update(conditions,newToken,options,function(err,record){
          if(err){
            console.log('Unable to Update Token ',err.message);
            return res.status(500).send({
              message:'Error Handling Update Tokens',
              error:err.message
            })
          }else{
            if(record){
              req.transactionToken = newToken.accessToken;
            }
          }
          next();
        })
      }
    } else{
      console.log('Error Fetching Response',tokenResponse.errorCode);
      return res.status(500).send({
        message:'Error Getting Daraja Response',
        error:tokenResponse.error.message
      })
    }
  });

};
module.exports = {
  fetchToken: fetchToken
};