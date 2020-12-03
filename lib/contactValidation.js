const Joi = require('joi');

const name = Joi.string().min(3).max(128).trim().required();
const email = Joi.string()
.email()
.min(8)
.max(254)
.lowercase()
.trim()
.required();
const subject = Joi.string().min(10).max(128).trim().required();
const message = Joi.string().min(10).trim().required();

const contactFormSchema = Joi.object({
  name,
  email,
  subject,
  message
});

module.exports = {
  contactFormSchema,
};
