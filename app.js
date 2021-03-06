const fs = require('fs');
const yenv = require('yenv');
if (fs.existsSync('./env.yaml')) {
  process.env = yenv('env.yaml', { strict: false });
}
const {
  MONGO_HOSTNAME,
  MONGO_PORT,
  MONGO_USERNAME,
  MONGO_PASSWORD,
  MONGO_DB,
} = process.env;

const path = require('path');
const express = require('express');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const moment = require('moment');
const _ = require('lodash');
const MongoStore = require('connect-mongodb-session')(session);
const numeral = require('numeral');
const helmet = require('helmet');
const colors = require('colors');
const cron = require('node-cron');
const crypto = require('crypto');
const {
  getConfig,
  getPaymentConfig,
  updateConfigLocal,
} = require('./lib/config');
const { runIndexing } = require('./lib/indexing');
const { addSchemas } = require('./lib/schema');
const { initDb, getDbUri } = require('./lib/db');
const { writeGoogleData } = require('./lib/googledata');
const { aggregateRatings } = require('./lib/modules/reviews-basic');
let handlebars = require('express-handlebars');
const i18n = require('i18n');

// Validate our settings schema
const Ajv = require('ajv');
const ajv = new Ajv({ useDefaults: true });

// get config
const config = getConfig();

const baseConfig = ajv.validate(require('./config/settingsSchema'), config);
if (baseConfig === false) {
  console.log(colors.red(`settings.json incorrect: ${ajv.errorsText()}`));
  process.exit(2);
}

// Validate the payment gateway config
_.forEach(config.paymentGateway, (gateway) => {
  if (
    ajv.validate(
      require(`./config/payment/schema/${gateway}`),
      require(`./config/payment/config/${gateway}`)
    ) === false
  ) {
    console.log(
      colors.red(`${gateway} config is incorrect: ${ajv.errorsText()}`)
    );
    process.exit(2);
  }
});

// require the routes
const index = require('./routes/index');
const admin = require('./routes/admin');
const product = require('./routes/product');
const customer = require('./routes/customer');
const order = require('./routes/order');
const user = require('./routes/user');
const reviews = require('./routes/reviews');
const mpesa = require('./lib/payments/mpesa');
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require('constants');

const app = express();

// Language initialize
i18n.configure({
  locales: config.availableLanguages,
  defaultLocale: config.defaultLocale,
  cookie: 'locale',
  queryParameter: 'lang',
  directory: `${__dirname}/locales`,
  directoryPermissions: '755',
  api: {
    __: '__', // now req.__ becomes req.__
    __n: '__n', // and req.__n can be called as req.__n
  },
});

// view engine setup
app.set('views', path.join(__dirname, '/views'));
app.engine(
  'hbs',
  handlebars({
    extname: 'hbs',
    layoutsDir: path.join(__dirname, 'views', 'layouts'),
    defaultLayout: 'layout.hbs',
    partialsDir: [path.join(__dirname, 'views')],
  })
);
app.set('view engine', 'hbs');

// helpers for the handlebar templating platform
handlebars = handlebars.create({
  helpers: {
    // equals helper
    ifEquals: function (arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    },
    // Language helper
    __: () => {
      return i18n.__(this, arguments);
    }, // eslint-disable-line no-undef
    __n: () => {
      return i18n.__n(this, arguments);
    }, // eslint-disable-line no-undef
    priceValue(val) {
      // console.log(val, this);
      if (!val || !this.session) return null;
      // console.log(val);
      if (
        !this.session.currency ||
        this.session.currency === 'KES' ||
        this.session.currency === 'productPriceKES'
      )
        return val.productPrice;

      return val[this.session.currency];
    },
    variantPriceValue(val) {
      if (!val || !this.session) return null;
      if (Array.isArray(val)) {
        if (
          !this.session.currency ||
          this.session.currency === 'KES' ||
          this.session.currency === 'productPriceKES'
        )
          return val[0].price;
        return val[0][this.session.currency];
      }
    },
    shopVariantPriceValues(parent) {
      // console.log(parent, this)
      if (!this || !parent.session) return null;
      if (
        !parent.session.currency ||
        parent.session.currency === 'KES' ||
        parent.session.currency === 'productPriceKES'
      )
        return this.variants[0].price;
      return this.variants[0][parent.session.currency];
    },
    otherVariantPriceValues(parent) {
      // console.log(parent, this)
      if (!this || !parent.session) return null;
      if (
        !parent.session.currency ||
        parent.session.currency === 'KES' ||
        parent.session.currency === 'productPriceKES'
      )
        return this.price;
      return this[parent.session.currency];
    },
    relatedProductsPriceValue(parent) {
      if (!this || !parent.session) return null;
      if (
        !parent.session.currency ||
        parent.session.currency === 'KES' ||
        parent.session.currency === 'productPriceKES'
      )
        return this.productPrice;
      return this[parent.session.currency];
    },
    getProductCapsize(size, arr) {
      return arr.includes(size);
    },
    getCheckedCategories(val1, val2) {
      const checked = [];
      const notChecked = [];
      val1.forEach((item) => {
        if ((item, val2.indexOf(item) >= 0)) {
          checked.push(item);
        } else {
          notChecked.push(item);
        }
      });
      return checked;
    },
    getUncheckedCategories(val1, val2) {
      const checked = [];
      const notChecked = [];
      val1.forEach((item) => {
        if ((item, val2.indexOf(item) >= 0)) {
          checked.push(item);
        } else {
          notChecked.push(item);
        }
      });
      return notChecked;
    },
    getCheckedColors(val1) {
      const checked = [];
      const notChecked = [];
      if (!this.session.productColors) {
        return val1;
      } else {
        val1.forEach((item) => {
          if (this.session.productColors.find((color) => color.name === item)) {
            checked.push(item);
          }
        });
        return checked;
      }
    },
    getUncheckedColors(val1) {
      const checked = [];
      const notChecked = [];
      if (!this.session.productColors) {
        return val1;
      } else {
        this.session.productColors.forEach((color) => {
          if (!val1.includes(color.name)) notChecked.push(color.name);
        });
        return notChecked;
      }
    },
    getCheckedCapsizes(val1) {
      const checked = [];
      const notChecked = [];
      if (!this.session.productCapsizes) {
        return val1;
      } else {
        val1.forEach((item) => {
          if (this.session.productCapsizes.includes(item)) {
            checked.push(item);
          }
        });
        return checked;
      }
    },
    getUncheckedCapsizes(val1) {
      const checked = [];
      const notChecked = [];
      if (!this.session.productCapsizes) {
        return val1;
      } else {
        this.session.productCapsizes.forEach((size) => {
          if (!val1.includes(size)) notChecked.push(size);
        });
        return notChecked;
      }
    },
    getSelectedRating(currentRating, filteredRating) {
      return currentRating == filteredRating;
    },
    getCurrencyRange(val) {
      const price = Number(val);
      if (this.session.currency === 'KES') {
        return price;
      } else if (this.session.currency === 'productPriceCFA') {
        return price * 4.86;
      } else if (this.session.currency === 'productPriceUSD') {
        return price * 0.009;
      } else if (this.session.currency === 'productPriceEUR') {
        return price * 0.0074;
      }
    },
    getActiveStars(n = 0) {
      let returnArr = [];
      for (let i = 0; i < n; i++) {
        returnArr.push(n);
      }
      return returnArr;
    },
    getInactiveStars(n = 0) {
      let returnArr = [];
      for (let i = n; i < 5; i++) {
        returnArr.push(n);
      }
      return returnArr;
    },
    availableLanguages: (block) => {
      let total = '';
      for (const lang of i18n.getLocales()) {
        total += block.fn(lang);
      }
      return total;
    },
    partial: (provider) => {
      console.log(provider);
      return `partials/payments/${provider}`;
    },
    perRowClass: (numProducts) => {
      if (parseInt(numProducts) === 1) {
        return 'col-12 col-md-12 product-item';
      }
      if (parseInt(numProducts) === 2) {
        return 'col-12 col-md-6 product-item';
      }
      if (parseInt(numProducts) === 3) {
        return 'col-12 col-md-4 product-item';
      }
      if (parseInt(numProducts) === 4) {
        return 'col-12 col-md-3 product-item';
      }

      return 'col-md-6 product-item';
    },
    menuMatch: (title, search) => {
      if (!title || !search) {
        return '';
      }
      if (title.toLowerCase().startsWith(search.toLowerCase())) {
        return 'class="navActive"';
      }
      return '';
    },
    getTheme: (view) => {
      return `themes/${config.theme}/${view}`;
    },
    formatAmount: (amt) => {
      if (amt) {
        return numeral(amt).format('0.00');
      }
      return '0.00';
    },
    amountNoDecimal: (amt) => {
      if (amt) {
        return handlebars.helpers.formatAmount(amt).replace('.', '');
      }
      return handlebars.helpers.formatAmount(amt);
    },
    getStatusColor: (status) => {
      switch (status) {
        case 'Paid':
          return 'success';
        case 'Approved':
          return 'success';
        case 'Approved - Processing':
          return 'success';
        case 'Failed':
          return 'danger';
        case 'Completed':
          return 'success';
        case 'Shipped':
          return 'success';
        case 'Pending':
          return 'warning';
        default:
          return 'danger';
      }
    },
    checkProductVariants: (variants) => {
      if (variants && variants.length > 0) {
        return 'true';
      }
      return 'false';
    },
    currencySymbol: (value, session) => {

      console.log(value, session.currency, 'valvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalvalval')
      if (session.currency && value !== session.currency) {
        console.log(value, session.currency, 'vattttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt')
        value = session.currency
      }

      if (value === 'EUR' || value === 'productPriceEUR') {
        return '€ ';
      } else if (value === 'GBP' || value === 'productPriceGBP') {
        return '£ ';
      } else if (value === 'CFA' || value === 'productPriceCFA') {
        return 'CFA ';
      } else if (value === 'USD' || value === 'productPriceUSD') {
        return '$ ';
      } else {
        return 'KES ';
      }
    },
    objectLength: (obj) => {
      if (obj) {
        return Object.keys(obj).length;
      }
      return 0;
    },
    stringify: (obj) => {
      if (obj) {
        return JSON.stringify(obj);
      }
      return '';
    },
    checkedState: (state) => {
      if (state === 'true' || state === true) {
        return 'checked';
      }
      return '';
    },
    selectState: (state, value) => {
      if (state === value) {
        return 'selected';
      }
      return '';
    },
    isNull: (value, options) => {
      if (typeof value === 'undefined' || value === '') {
        return options.fn(this);
      }
      return options.inverse(this);
    },
    toLower: (value) => {
      if (value) {
        return value.toLowerCase();
      }
      return null;
    },
    formatDate: (date, format) => {
      return moment(date).format(format);
    },
    discountExpiry: (start, end) => {
      return moment().isBetween(moment(start), moment(end));
    },
    ifCond: (v1, operator, v2, options) => {
      switch (operator) {
        case '==':
          return v1 === v2 ? options.fn(this) : options.inverse(this);
        case '!=':
          return v1 !== v2 ? options.fn(this) : options.inverse(this);
        case '===':
          return v1 === v2 ? options.fn(this) : options.inverse(this);
        case '<':
          return v1 < v2 ? options.fn(this) : options.inverse(this);
        case '<=':
          return v1 <= v2 ? options.fn(this) : options.inverse(this);
        case '>':
          return v1 > v2 ? options.fn(this) : options.inverse(this);
        case '>=':
          return v1 >= v2 ? options.fn(this) : options.inverse(this);
        case '&&':
          return v1 && v2 ? options.fn(this) : options.inverse(this);
        case '||':
          return v1 || v2 ? options.fn(this) : options.inverse(this);
        default:
          return options.inverse(this);
      }
    },
    isAnAdmin: (value, options) => {
      if (value === 'true' || value === true) {
        return options.fn(this);
      }
      return options.inverse(this);
    },
    paymentMessage: (status) => {
      if (status === 'Paid') {
        return '<h2 class="text-success">Your payment has been successfully processed</h2>';
      }
      if (status === 'Pending') {
        const paymentConfig = getPaymentConfig();
        if (config.paymentGateway === 'instore') {
          return `<h2 class="text-warning">${paymentConfig.resultMessage}</h2>`;
        }
        return '<h2 class="text-warning">The payment for this order is pending. We will be in contact shortly.</h2>';
      }
      if (status === 'Pending-mpesa') {
        return '<h2 class="text-warning">Payment pending.' +
            'Please use payment details below to complete purchase.</h2>' +
        '<h4 style="margin: .5%" class="text-warning">Ignore this message if you have already paid, you will be contacted shortly</h4>';
      }

      return '<h2 class="text-danger">Your payment has failed. Please try again or contact us.</h2>';
    },
    paymentOutcome: (status) => {
      if (status === 'Paid' || status === 'Pending') {
        return '<h5 class="text-warning">Please retain the details above as a reference of payment</h5>';
      }
      return '';
    },
    upperFirst: (value) => {
      if (value) {
        return value.replace(/^\w/, (chr) => {
          return chr.toUpperCase();
        });
      }
      return value;
    },
    math: (lvalue, operator, rvalue, options) => {
      lvalue = parseFloat(lvalue);
      rvalue = parseFloat(rvalue);

      return {
        '+': lvalue + rvalue,
        '-': lvalue - rvalue,
        '*': lvalue * rvalue,
        '/': lvalue / rvalue,
        '%': lvalue % rvalue,
      }[operator];
    },
    showCartButtons: (cart) => {
      if (!cart) {
        return 'd-none';
      }
      return '';
    },
    getCartInDollars: (session, currency) => {
      try {
        switch (currency) {
          case 'USD':
            return numeral(session.totalCartAmountUSD).format('0.00');
          case 'EUR':
            return numeral(session.totalCartAmountEUR).format('0.00');
          default: // if currency is not dollars or euros, use dollars to pay
            return numeral(session.totalCartAmountUSD).format('0.00');
        }

      } catch (e) {

      }
    },
    paypalPayCurrency: (currencyISO) => {
      // if we have any other currency, use dollars
      if (currencyISO !== 'USD' && currencyISO !== 'EUR') {
        return 'USD'
      }
      return  currencyISO
    },
    snip: (text) => {
      if (text && text.length > 155) {
        return `${text.substring(0, 155)}...`;
      }
      return text;
    },
    contains: (values, value, options) => {
      if (values.includes(value)) {
        return options.fn(this);
      }
      return options.inverse(this);
    },
    fixTags: (html) => {
      html = html.replace(/&gt;/g, '>');
      html = html.replace(/&lt;/g, '<');
      return html;
    },
    timeAgo: (date) => {
      return moment(date).fromNow();
    },
    feather: (icon) => {
      // eslint-disable-next-line keyword-spacing
      return `<svg
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="feather feather-${icon}"
                >
                <use xlink:href="/dist/feather-sprite.svg#${icon}"/>
            </svg>`;
    },
  },
});

console.log('Development = ', process.env.NODE_ENV)
console.log('Mongo = ', config.databaseConnectionString)
// session store
const store = new MongoStore({
  uri: getDbUri(
    /*process.env.NODE_ENV === 'production'
      ? `mongodb+srv://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOSTNAME}:/${MONGO_DB}`
      :*/ config.databaseConnectionString
  ),
  collection: 'sessions',
});

// Setup secrets
if (!config.secretCookie || config.secretCookie === '') {
  const randomString = crypto.randomBytes(20).toString('hex');
  config.secretCookie = randomString;
  updateConfigLocal({ secretCookie: randomString });
}
if (!config.secretSession || config.secretSession === '') {
  const randomString = crypto.randomBytes(20).toString('hex');
  config.secretSession = randomString;
  updateConfigLocal({ secretSession: randomString });
}

app.enable('trust proxy');
app.use(helmet());
app.set('port', process.env.PORT || 1111);
app.use(logger('dev'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser(config.secretCookie));
app.use(
  session({
    resave: true,
    saveUninitialized: true,
    secret: config.secretSession,
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: 900000,
    },
    store: store,
  })
);

app.use(
  bodyParser.json({
    // Only on Stripe URL's which need the rawBody
    verify: (req, res, buf) => {
      if (req.originalUrl === '/stripe/subscription_update') {
        req.rawBody = buf.toString();
      }
    },
  })
);

// Set locales from session
app.use(i18n.init);

// bind currency
app.use(async (req, res, next) => {
  try {
    req.session.menuTags = (await req.app.db.menutags.findOne({})) || {
      tags: [],
    };
  } catch (e) {
    console.log('no menu tab');
  }
  // set defaultCurrency if none
  if (!req.app.config.defaultCurrency)
    req.app.config.defaultCurrency = config.currencySymbol;

  // if no currency detail is set, reset it
  if (!req.cookies || !req.cookies.currency || !req.session || !req.session.currency) {
    req.session.currency = 'KES';
    req.cookies.currency = 'KES';
    req.app.config.currencySymbol = 'KES';
    req.app.config.currencyISO = 'KES';
  }

  // get currency from cookies
  req.session.currency = req.cookies.currency;
  if (req.cookies.currency === 'productPriceCFA') {
    req.app.config.currencySymbol = 'CFA';
    req.app.config.currencyISO = 'CFA';
  } else if (req.cookies.currency === 'productPriceEUR') {
    req.app.config.currencySymbol = 'EUR';
    req.app.config.currencyISO = 'EUR';
  } else if (req.cookies.currency === 'productPriceUSD') {
    req.app.config.currencySymbol = 'USD';
    req.app.config.currencyISO = 'USD';
  } else {
    req.app.config.currencySymbol = 'KES';
    req.app.config.currencyISO = 'KES';
  }
  next();
});

// serving static content
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views', 'themes')));
app.use(express.static(path.join(__dirname, 'node_modules', 'feather-icons')));

// Make stuff accessible to our router
app.use((req, res, next) => {
  req.handlebars = handlebars;
  next();
});

// Ran on all routes
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store');
  next();
});

// Setup the routes
app.use('/', index);
app.use('/', customer);
app.use('/', product);
app.use('/', order);
app.use('/', user);
app.use('/', admin);
app.use('/', reviews);
app.use('/', mpesa);

// Payment route(s)
_.forEach(config.paymentGateway, (gateway) => {
  app.use(`/${gateway}`, require(`./lib/payments/${gateway}`));
});

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use((err, req, res, next) => {
    console.error(colors.red(err.stack));
    if (err && err.code === 'EACCES') {
      res.status(400).json({ message: 'File upload error. Please try again.' });
      return;
    }
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err,
      helpers: handlebars.helpers,
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
  // console.error(colors.red(err.stack));
  if (err && err.code === 'EACCES') {
    res.status(400).json({ message: 'File upload error. Please try again.' });
    return;
  }
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {},
    helpers: handlebars.helpers,
  });
});

// Nodejs version check
const nodeVersionMajor = parseInt(
  process.version.split('.')[0].replace('v', '')
);
if (nodeVersionMajor < 7) {
  console.log(
    colors.red(
      `Please use Node.js version 7.x or above. Current version: ${nodeVersionMajor}`
    )
  );
  process.exit(2);
}

app.on('uncaughtException', (err) => {
  console.error(colors.red(err.stack));
  process.exit(2);
});

initDb(
  /*process.env.NODE_ENV === 'production'
    ? `mongodb+srv://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOSTNAME}:/${MONGO_DB}`
    :*/ config.databaseConnectionString,
  async (err, db) => {
    // console.log(`mongodb+srv://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_HOSTNAME}:/${MONGO_DB}`)
    // On connection error we display then exit
    if (err) {
      console.log(colors.red(`Error connecting to MongoDB: ${err}`));
      process.exit(2);
    }

    // add db to app for routes
    app.db = db;
    app.config = config;
    app.port = app.get('port');

    // Fire up the cron job to clear temp held stock
    cron.schedule('*/1 * * * *', async () => {
      const validSessions = await db.sessions.find({}).toArray();
      const validSessionIds = [];
      _.forEach(validSessions, (value) => {
        validSessionIds.push(value._id);
      });

      // Remove any invalid cart holds
      await db.cart.deleteMany({
        sessionId: { $nin: validSessionIds },
      });
    });

    // Fire up the cron job to create google product feed
    cron.schedule('0 * * * *', async () => {
      await writeGoogleData(db);
    });

    // aggregateRatings('5fa6956a514da53d5e06c6dd', db);

    // Create indexes on startup
    if (process.env.NODE_ENV !== 'test') {
      try {
        await runIndexing(app);
      } catch (ex) {
        console.error(colors.red(`Error setting up indexes: ${ex.message}`));
      }
    }

    // Start cron job to index
    if (process.env.NODE_ENV !== 'test') {
      cron.schedule('*/30 * * * *', async () => {
        try {
          await runIndexing(app);
        } catch (ex) {
          console.error(colors.red(`Error setting up indexes: ${ex.message}`));
        }
      });
    }

    // Set trackStock for testing
    if (process.env.NODE_ENV === 'test') {
      config.trackStock = true;
    }

    // Process schemas
    await addSchemas();

    // Start the app
    try {
      await app.listen(app.get('port'));
      app.emit('appStarted');
      if (process.env.NODE_ENV !== 'test') {
        console.log(
          colors.green(
            `expressCart running on host: http://localhost:${app.get('port')}`
          )
        );
      }
    } catch (ex) {
      console.error(colors.red(`Error starting expressCart app:${ex.message}`));
      process.exit(2);
    }
  }
);

module.exports = app;
