const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
router.use(bodyParser.json());
const colors = require('colors');
const stripHtml = require('string-strip-html');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const ObjectId = require('mongodb').ObjectID;
const {
  getId,
  hooker,
  clearSessionValue,
  getImages,
  addSitemapProducts,
  getCountryList,
  getCurrencyField,
  sendEmail,
  parseCart,
  dateDiff,
} = require('../lib/common');
const { getSort, paginateProducts } = require('../lib/paginate');
const { getPaymentConfig } = require('../lib/config');
const {
  updateTotalCart,
  emptyCart,
  updateSubscriptionCheck,
  calculateTotalCart,
} = require('../lib/cart');
const { createReview, getRatingHtml } = require('../lib/modules/reviews-basic');
const { sortMenu, getMenu } = require('../lib/menu');
const countryList = getCountryList();

const { contactFormSchema } = require('../lib/contactValidation');

Object.defineProperty(Array.prototype, 'flat', {
  value: function (depth = 1) {
    return this.reduce(function (flat, toFlatten) {
      return flat.concat(
        Array.isArray(toFlatten) && depth > 1
          ? toFlatten.flat(depth - 1)
          : toFlatten
      );
    }, []);
  },
});

// About us route
router.get('/about', async (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  const file_to_render = `${config.themeViews}about`;

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    if (req.query.json === 'true') {
      res.status(200).json(results.data);
      return;
    }

    res.render(file_to_render, {
      helpers: req.handlebars.helpers, // seems required
      config, // required
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

// Services route
router.get('/services', async (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  const file_to_render = `${config.themeViews}services`;

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    if (req.query.json === 'true') {
      res.status(200).json(results.data);
      return;
    }

    res.render(file_to_render, {
      helpers: req.handlebars.helpers, // seems required
      config, // required
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

// Contact route
router.get('/contact', async (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  const file_to_render = `${config.themeViews}contact`;

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    if (req.query.json === 'true') {
      res.status(200).json(results.data);
      return;
    }

    res.render(file_to_render, {
      helpers: req.handlebars.helpers, // seems required
      config, // required
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

// Send email body to common.sendEmail
router.get('/contact/:name/:email/:subject/:message', async (req, res) => {
  // Validate form entries
  try {
    await contactFormSchema.validateAsync(req.params, {
      abortEarly: false,
    });

    const body = `
      ${req.params.name} contacted you on ${new Date()}
      \n

      Message: ${req.params.message}.

      Reach them through ${req.params.email}
    `;

    // Send to sendEmail Module
    // sendEmail('marielynes@email.com', req.params.subject, body)

    res.json('OK!');
  } catch (err) {
    res.status(500).json({
      message: 'Something went wrong. Please try again later',
    });
  }
});

// Shop Route
router.get('/shop', async (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  // const numberProducts = config.productsPerPage ? config.productsPerPage : 12;
  const file_to_render = `${config.themeViews}shop`;

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([
    paginateProducts(true, db, req.params.pageNum, {}, getSort()),
    getMenu(db),
  ]).then(([results, menu]) => {
    if (req.query.json === 'true') {
      res.status(200).json(results.data);
      return;
    }

    const colors = [];
    const capsizes = [];
    const categories = results.data.map((product) => {
      if (product.productColors) {
        const colorsObj = JSON.parse(product.productColors);

        Object.keys(colorsObj).forEach((key) => {
          const color = {
            name: key,
            color: colorsObj[key],
          };

          if (colors.findIndex((c) => c.name == color.name) < 0)
            colors.push(color);
        });
      }

      if (product.productCapsizes) {
        const capsizesArr = product.productCapsizes.split(', ');

        capsizesArr.forEach((capsize) => {
          if (capsizes.findIndex((size) => size == capsize) < 0) {
            capsizes.push(capsize);
          }
        });
      }

      if (product.productTags.indexOf(',') >= 0) {
        const cats = product.productTags.split(', ');
        return cats;
      } else {
        return product.productTags;
      }
    });

    const productCategories = [...new Set(categories.flat())].filter(
      (cat) => cat.length > 0
    );

    req.session.productCategories = productCategories;
    req.session.productColors = colors;
    req.session.productCapsizes = capsizes;

    res.render(file_to_render, {
      session: req.session,
      helpers: req.handlebars.helpers,
      results: results.data,
      config: req.app.config,
      menu: sortMenu(menu),
      categories: productCategories,
      menuTags: menuTags.tags,
      colors: colors ? colors : null,
      capsizes: capsizes ? capsizes : null,
    });
  });
});

// Shop search route
router.get('/shop/search/:searchString', async (req, res) => {
  const searchStr = req.params.searchString;

  const searchArr = searchStr.split('-');

  let searchRegexStr = '';
  searchArr.map((word, i) => {
    if (i < searchArr.length - 1) searchRegexStr += `${word}|`;
    else searchRegexStr += `${word}`;
  });

  const searchRegex = new RegExp(`${searchRegexStr}`);

  const db = req.app.db;
  const config = req.app.config;
  const numberProducts = config.productsPerPage ? config.productsPerPage : 6;
  let pageNum = 1;
  if (req.params.pageNum) {
    pageNum = req.params.pageNum;
  }

  const menuTags = req.session.menuTags || { tags: [] };

  // DB Find price
  db.products
    .aggregate([
      {
        $match: {
          $or: [
            {
              productTags: {
                $regex: searchRegex,
                $options: 'ig',
              },
            },
            {
              productTitle: {
                $regex: searchRegex,
                $options: 'ig',
              },
            },
            {
              productDescription: {
                $regex: searchRegex,
                $options: 'ig',
              },
            },
            {
              productBrand: {
                $regex: searchRegex,
                $options: 'ig',
              },
            },
            {
              productColors: {
                $regex: searchRegex,
                $options: 'ig',
              },
            },
            {
              productCapsizes: {
                $regex: searchRegex,
                $options: 'ig',
              },
            },
          ],
        },
      },
    ])
    .toArray((err, productsList) => {
      if (err) {
        console.log(colors.red(`Error searching products ${err}`));
      }

      Promise.all([
        // Paginate function not working
        paginateProducts(
          true,
          db,
          pageNum,
          { _id: { $in: productsList } },
          getSort()
        ),
        getMenu(db),
      ])
        .then(([results, menu]) => {
          // If JSON query param return json instead
          if (req.query.json === 'true') {
            res.status(200).json(results.data);
            return;
          }
          // Page not rerendering
          res.render(`${config.themeViews}shop`, {
            title: 'Shop',
            results: productsList,
            session: req.session,
            message: clearSessionValue(req.session, 'message'),
            messageType: clearSessionValue(req.session, 'messageType'),
            productsPerPage: numberProducts,
            totalProductCount: productsList.length,
            pageNum: pageNum,
            paginateUrl: 'search',
            config: config,
            menu: sortMenu(menu),
            helpers: req.handlebars.helpers,
            showFooter: 'showFooter',
            menuTags: menuTags.tags,
          });
        })
        .catch((err) => {
          console.error(colors.red('Error searching for products', err));
        });
    });

  return;
});

// SHOP FILTER ROUTE

// Filter route gets filter criteria through url
router.get(
  '/shop/filter/:minPrice/:maxPrice/:categories/:rating/:colors/:capsizes',
  async (req, res) => {
    const filterObj = req.params;
    filterObj.maxPrice = Number(filterObj.maxPrice);
    filterObj.minPrice = Number(filterObj.minPrice);

    // Set the currency used in aggregation
    let searchCurrency = '$productPrice';

    if (
      (req.session.currency && req.session.currency != 'KES') ||
      req.session.currency != 'productPriceKES'
    ) {
      if (req.session.currency) searchCurrency = `$${req.session.currency}`;
    }

    if (req.session.currency === 'KES') searchCurrency = '$productPrice';

    // Creating category regex.
    const filterCategories = filterObj.categories.split('-');
    filterObj.filterCategories = filterCategories;

    // creating colors regex
    const filterColors = filterObj.colors.split('-');
    filterObj.filterColors = filterColors;

    // creating capsizes regex
    const filterCapsizes = filterObj.capsizes.split('-');
    filterObj.filterCapsizes = filterCapsizes;

    const menuTags = req.session.menuTags || { tags: [] };

    let catRegexStr = '';
    filterCategories.map((cat, i) => {
      if (cat === 'none') catRegexStr += `.*`;
      else if (i < filterCategories.length - 1) catRegexStr += `${cat}|`;
      else catRegexStr += `${cat}`;
    });

    let colorRegexStr = '';
    filterColors.map((color, i) => {
      if (color === 'none') colorRegexStr = null;
      else if (i < filterColors.length - 1) colorRegexStr += `${color}|`;
      else colorRegexStr += `${color}`;
    });

    let capsizeRegexStr = '';
    filterCapsizes.map((capsize, i) => {
      if (capsize === 'none') capsizeRegexStr = null;
      else if (i < filterCapsizes.length - 1) capsizeRegexStr += `${capsize}|`;
      else capsizeRegexStr += `${capsize}`;
    });

    const categoriesFilterRegex = new RegExp(`${catRegexStr}`);
    const colorsFilterRegex = new RegExp(`${colorRegexStr}`);
    const capsizesFilterRegex = new RegExp(`${capsizeRegexStr}`);

    const db = req.app.db;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;
    let pageNum = 1;
    if (req.params.pageNum) {
      pageNum = req.params.pageNum;
    }

    let rating = Number(filterObj.rating);

    const aggregationArr = [
      {
        priceDouble: {
          $gte: filterObj.minPrice,
          $lte: filterObj.maxPrice,
        },
      },
      {
        productTags: {
          $regex: categoriesFilterRegex,
          $options: 'ig',
        },
      },
      {
        avgRatings: {
          $gte: rating,
        },
      },
    ];

    if (capsizeRegexStr) {
      aggregationArr.push({
        productCapsizes: {
          $regex: capsizesFilterRegex,
          $options: 'ig',
        },
      });
    }

    if (colorRegexStr) {
      aggregationArr.push({
        productColors: {
          $regex: colorsFilterRegex,
          $options: 'ig',
        },
      });
    }

    // DB Find price
    db.products
      .aggregate([
        {
          $addFields: {
            priceDouble: { $toDouble: searchCurrency },
            avgRatings: {
              $cond: {
                if: { $gte: ['$avgRatings', 0] },
                then: '$avgRatings',
                else: 0,
              },
            },
          },
        },
        {
          $match: {
            $and: aggregationArr,
          },
        },
      ])
      .toArray((err, productsList) => {
        if (err) {
          console.log(colors.red(`Error filtering products ${err}`));
        }

        Promise.all([
          // Paginate function not working
          paginateProducts(
            true,
            db,
            pageNum,
            { _id: { $in: productsList } },
            getSort()
          ),
          getMenu(db),
        ])
          .then(([results, menu]) => {
            // If JSON query param return json instead
            if (req.query.json === 'true') {
              res.status(200).json(results.data);
              return;
            }
            // Page not rerendering
            res.render(`${config.themeViews}shop`, {
              title: 'Shop',
              results: productsList,
              session: req.session,
              message: clearSessionValue(req.session, 'message'),
              messageType: clearSessionValue(req.session, 'messageType'),
              productsPerPage: numberProducts,
              totalProductCount: productsList.length,
              pageNum: pageNum,
              paginateUrl: 'search',
              config: config,
              menu: sortMenu(menu),
              helpers: req.handlebars.helpers,
              showFooter: 'showFooter',
              categories: req.session.productCategories,
              lastFilterObj: filterObj,
              menuTags: menuTags.tags,
            });
          })
          .catch((err) => {
            console.error(colors.red('Error searching for products', err));
          });
      });

    return;
  }
);

// Store Route
router.get('/store', (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  // const numberProducts = config.productsPerPage ? config.productsPerPage : 12;
  const file_to_render = `${config.themeViews}store`;

  Promise.all([
    paginateProducts(true, db, req.params.pageNum, {}, getSort()),
    getMenu(db),
  ]).then(([results, menu]) => {
    if (req.query.json === 'true') {
      res.status(200).json(results.data);
      return;
    }

    res.render(file_to_render, {
      session: req.session,
      helpers: req.handlebars.helpers,
      results: results.data,
      config: req.app.config,
      menu: sortMenu(menu),
    });
  });
});

// Google products
router.get('/googleproducts.xml', async (req, res, next) => {
  let productsFile = '';
  try {
    productsFile = fs.readFileSync(path.join('bin', 'googleproducts.xml'));
  } catch (ex) {
    console.log('Google products file not found');
  }
  res.type('text/plain');
  res.send(productsFile);
});

// These is the customer facing routes
router.get('/payment/:orderId', async (req, res, next) => {
  const db = req.app.db;
  const config = req.app.config;

  const menuTags = req.session.menuTags || { tags: [] };

  // Get the order
  const order = await db.orders.findOne({ _id: getId(req.params.orderId) });
  if (!order) {
    res.render('error', {
      title: 'Not found',
      message: 'Order not found',
      helpers: req.handlebars.helpers,
      config,
      menuTags: menuTags.tags,
    });
    return;
  }

  // If stock management is turned on payment approved update stock level
  if (config.trackStock && req.session.paymentApproved) {
    // Check to see if already updated to avoid duplicate updating of stock
    if (order.productStockUpdated !== true) {
      Object.keys(order.orderProducts).forEach(async (productKey) => {
        const product = order.orderProducts[productKey];
        const dbProduct = await db.products.findOne({
          _id: getId(product.productId),
        });
        let productCurrentStock = dbProduct.productStock;

        // If variant, get the stock from the variant
        if (product.variantId) {
          const variant = await db.variants.findOne({
            _id: getId(product.variantId),
            product: getId(product._id),
          });
          if (variant) {
            productCurrentStock = variant.stock;
          } else {
            productCurrentStock = 0;
          }
        }

        // Calc the new stock level
        let newStockLevel = productCurrentStock - product.quantity;
        if (newStockLevel < 1) {
          newStockLevel = 0;
        }

        // Update stock
        if (product.variantId) {
          // Update variant stock
          await db.variants.updateOne(
            {
              _id: getId(product.variantId),
            },
            {
              $set: {
                stock: newStockLevel,
              },
            },
            { multi: false }
          );
        } else {
          // Update product stock
          await db.products.updateOne(
            {
              _id: getId(product.productId),
            },
            {
              $set: {
                productStock: newStockLevel,
              },
            },
            { multi: false }
          );
        }

        // Add stock updated flag to order
        await db.orders.updateOne(
          {
            _id: getId(order._id),
          },
          {
            $set: {
              productStockUpdated: true,
            },
          },
          { multi: false }
        );
      });
      console.info('Updated stock levels');
    }
  }

  // If hooks are configured and the hook has not already been sent, send hook
  if (config.orderHook && !order.hookSent) {
    await hooker(order);
    await db.orders.updateOne(
      {
        _id: getId(order._id),
      },
      {
        $set: {
          hookSent: true,
        },
      },
      { multi: false }
    );
  }

  let paymentView = `${config.themeViews}payment-complete`;
  if (order.orderPaymentGateway === 'Blockonomics')
    paymentView = `${config.themeViews}payment-complete-blockonomics`;
  else if (order.orderPaymentGateway === 'Mpesa')
    paymentView = `${config.themeViews}payment-complete-mpesa`;

  res.render(paymentView, {
    title: 'Payment complete',
    config: req.app.config,
    session: req.session,
    result: order,
    message: clearSessionValue(req.session, 'message'),
    messageType: clearSessionValue(req.session, 'messageType'),
    helpers: req.handlebars.helpers,
    showFooter: 'showFooter',
    menu: sortMenu(await getMenu(db)),
    menuTags: menuTags.tags,
  });
});

router.get('/emptycart', async (req, res, next) => {
  emptyCart(req, res, '');
});

router.get('/checkout/information', async (req, res, next) => {
  const config = req.app.config;
  const db = req.app.db;
  req.session.cart = parseCart(req.session.cart, getCurrencyField(req));
  await updateTotalCart(req, res);

  // if there is no items in the cart then render a failure
  if (!req.session.cart) {
    req.session.message =
      'The are no items in your cart. Please add some items before checking out';
    req.session.messageType = 'danger';
    res.redirect('/');
    return;
  }

  let paymentType = '';
  if (req.session.cartSubscription) {
    paymentType = '_subscription';
  }

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    // render the payment page
    res.render(`${config.themeViews}checkout-information`, {
      title: 'Checkout - Information',
      config: req.app.config,
      session: req.session,
      paymentType,
      cartClose: false,
      page: 'checkout-information',
      countryList,
      message: clearSessionValue(req.session, 'message'),
      messageType: clearSessionValue(req.session, 'messageType'),
      helpers: req.handlebars.helpers,
      showFooter: 'showFooter',
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

router.get('/checkout/shipping', async (req, res, next) => {
  const config = req.app.config;
  const db = req.app.db;
  req.session.cart = parseCart(req.session.cart, getCurrencyField(req));
  await updateTotalCart(req, res);
  // if there is no items in the cart then render a failure
  if (!req.session.cart) {
    req.session.message =
      'The are no items in your cart. Please add some items before checking out';
    req.session.messageType = 'danger';
    res.redirect('/');
    return;
  }

  if (!req.session.customerEmail) {
    req.session.message =
      'Cannot proceed to shipping without customer information';
    req.session.messageType = 'danger';
    res.redirect('/checkout/information');
    return;
  }

  // Net cart amount
  const netCartAmount =
    req.session.totalCartAmount - req.session.totalCartShipping || 0;

  // Recalculate shipping
  config.modules.loaded.shipping.calculateShipping(netCartAmount, config, req);

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    // render the payment page
    res.render(`${config.themeViews}checkout-shipping`, {
      title: 'Checkout - Shipping',
      config: req.app.config,
      session: req.session,
      cartClose: false,
      cartReadOnly: true,
      page: 'checkout-shipping',
      countryList,
      message: clearSessionValue(req.session, 'message'),
      messageType: clearSessionValue(req.session, 'messageType'),
      helpers: req.handlebars.helpers,
      showFooter: 'showFooter',
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

router.get('/checkout/cart', async (req, res) => {
  const config = req.app.config;
  const db = req.app.db;
  req.session.cart = parseCart(req.session.cart, getCurrencyField(req));
  console.log(req.session.cart, 'CARRRRRRRRRRRRRRRRRRRRRRRT')
  await updateTotalCart(req, res);

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    res.render(`${config.themeViews}checkout-cart`, {
      title: 'Checkout - Cart',
      page: req.query.path,
      config,
      session: req.session,
      message: clearSessionValue(req.session, 'message'),
      messageType: clearSessionValue(req.session, 'messageType'),
      helpers: req.handlebars.helpers,
      showFooter: 'showFooter',
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

router.get('/checkout/cartdata', (req, res) => {
  const config = req.app.config;

  res.status(200).json({
    cart: req.session.cart,
    session: req.session,
    currencySymbol: config.currencySymbol || '$',
  });
});

router.get('/checkout/payment', async (req, res) => {
  const config = req.app.config;
  const db = req.app.db;
  const copyNoRef = (obj) => {
    return JSON.parse(JSON.stringify(obj || {}));
  };

  const cart = copyNoRef(req.session.cart);
  req.session.cart = parseCart(req.session.cart, getCurrencyField(req));
  await updateTotalCart(req, res);

  // generate
  req.session.totalCartAmountUSD = await calculateTotalCart(
    req,
    parseCart(copyNoRef(cart), 'productPriceUSD'),
    'productPriceUSD'
  );
  req.session.totalCartAmountEUR = await calculateTotalCart(
    req,
    parseCart(copyNoRef(cart), 'productPriceEUR'),
    'productPriceEUR'
  );
  req.session.totalCartAmountCFA = await calculateTotalCart(
    req,
    parseCart(copyNoRef(cart), 'productPriceCFA'),
    'productPriceCFA'
  );
  // if there is no items in the cart then render a failure
  if (!req.session.cart) {
    req.session.message =
      'The are no items in your cart. Please add some items before checking out';
    req.session.messageType = 'danger';
    res.redirect('/');
    return;
  }

  let paymentType = '';
  if (req.session.cartSubscription) {
    paymentType = '_subscription';
  }

  // update total cart amount one last time before payment
  await updateTotalCart(req, res);

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([getMenu(db)]).then(([menu]) => {
    res.render(`${config.themeViews}checkout-payment`, {
      title: 'Checkout - Payment',
      config: req.app.config,
      paymentConfig: getPaymentConfig(),
      session: req.session,
      paymentPage: true,
      paymentType,
      cartClose: true,
      cartReadOnly: true,
      page: 'checkout-information',
      countryList,
      message: clearSessionValue(req.session, 'message'),
      messageType: clearSessionValue(req.session, 'messageType'),
      helpers: req.handlebars.helpers,
      showFooter: 'showFooter',
      menu: sortMenu(menu),
      menuTags: menuTags.tags,
    });
  });
});

router.get('/blockonomics_payment', async (req, res, next) => {
  const config = req.app.config;
  let paymentType = '';
  if (req.session.cartSubscription) {
    paymentType = '_subscription';
  }

  const menuTags = req.session.menuTags || { tags: [] };

  // show bitcoin address and wait for payment, subscribing to wss
  res.render(`${config.themeViews}checkout-blockonomics`, {
    title: 'Checkout - Payment',
    config: req.app.config,
    paymentConfig: getPaymentConfig(),
    session: req.session,
    paymentPage: true,
    paymentType,
    cartClose: true,
    cartReadOnly: true,
    page: 'checkout-information',
    countryList,
    message: clearSessionValue(req.session, 'message'),
    messageType: clearSessionValue(req.session, 'messageType'),
    helpers: req.handlebars.helpers,
    showFooter: 'showFooter',
    menuTags: menuTags.tags,
  });
});

router.post('/checkout/adddiscountcode', async (req, res) => {
  const config = req.app.config;
  const db = req.app.db;

  // if there is no items in the cart return a failure
  if (!req.session.cart) {
    res.status(400).json({
      message: 'The are no items in your cart.',
    });
    return;
  }

  // Check if the discount module is loaded
  if (!config.modules.loaded.discount) {
    res.status(400).json({
      message: 'Access denied.',
    });
    return;
  }

  // Check defined or null
  if (!req.body.discountCode || req.body.discountCode === '') {
    res.status(400).json({
      message: 'Discount code is invalid or expired',
    });
    return;
  }

  // Validate discount code
  const discount = await db.discounts.findOne({ code: req.body.discountCode });
  if (!discount) {
    res.status(400).json({
      message: 'Discount code is invalid or expired',
    });
    return;
  }

  // Validate date validity
  if (!moment().isBetween(moment(discount.start), moment(discount.end))) {
    res.status(400).json({
      message: 'Discount is expired',
    });
    return;
  }

  // Set the discount code
  req.session.discountCode = discount.code;

  // Update the cart amount
  await updateTotalCart(req, res);

  // Return the message
  res.status(200).json({
    message: 'Discount code applied',
  });
});

router.post('/checkout/removediscountcode', async (req, res) => {
  // if there is no items in the cart return a failure
  if (!req.session.cart) {
    res.status(400).json({
      message: 'The are no items in your cart.',
    });
    return;
  }

  // Delete the discount code
  delete req.session.discountCode;

  // update total cart amount
  await updateTotalCart(req, res);

  // Return the message
  res.status(200).json({
    message: 'Discount code removed',
  });
});

// show an individual product
router.get('/product/:id', async (req, res) => {
  const db = req.app.db;
  const config = req.app.config;
  const productsIndex = req.app.productsIndex;

  const product = await db.products.findOne({
    $or: [{ _id: getId(req.params.id) }, { productPermalink: req.params.id }],
  });

  const colors = [];
  if (product.productColors) {
    const productColors = JSON.parse(product.productColors);

    Object.keys(productColors).forEach((key) => {
      const color = {
        name: key,
        color: productColors[key],
      };
      colors.push(color);
    });
  }
  product.productColors = colors;
  if (product.productCapsizes) {
    if (product.productCapsizes.length > 0) {
      product.productCapsizes = product.productCapsizes.split(', ');
    }
  }

  const menuTags = req.session.menuTags || { tags: [] };

  if (!product) {
    res.render('error', {
      title: 'Not found',
      message: 'Product not found',
      helpers: req.handlebars.helpers,
      config,
      menuTags: menuTags.tags,
    });
    return;
  }

  if (product.productPublished === false) {
    res.render('error', {
      title: 'Not found',
      message: 'Product not found',
      helpers: req.handlebars.helpers,
      config,
      menuTags: menuTags.tags,
    });
    return;
  }

  // Get variants for this product
  const variants = await db.variants
    .find({ product: product._id })
    .sort({ added: 1 })
    .toArray();

  // Grab review data
  const reviews = {
    reviews: [],
    average: 0,
    count: 0,
    featured: {},
    ratingHtml: '',
    highestRating: 0,
  };

  if (config.modules.enabled.reviews) {
    reviews.reviews = await db.reviews
      .find({ product: product._id })
      .sort({ date: 1 })
      .limit(5)
      .toArray();
    // only aggregate if reviews are found
    if (reviews.reviews.length > 0) {
      reviews.highestRating = await db.reviews
        .find({ product: product._id })
        .sort({ rating: -1 })
        .limit(1)
        .toArray();
      if (reviews.highestRating.length > 0) {
        reviews.highestRating = reviews.highestRating[0].rating;
      }
      const featuredReview = await db.reviews
        .find({ product: product._id })
        .sort({ date: -1 })
        .limit(1)
        .toArray();
      if (featuredReview.length > 0) {
        reviews.featured.review = featuredReview[0];
        reviews.featured.customer = await db.customers.findOne({
          _id: reviews.featured.review.customer,
        });
      }
      const reviewRating = await db.reviews
        .aggregate([
          {
            $match: {
              product: ObjectId(product._id),
            },
          },
          {
            $group: {
              _id: '$item',
              avgRating: { $avg: '$rating' },
            },
          },
        ])
        .toArray();
      reviews.count = await db.reviews.countDocuments({ product: product._id });
      // Assign if returned
      if (reviewRating.length > 0 && reviewRating[0].avgRating) {
        reviews.average = reviewRating[0].avgRating;
      }
    }
    // Set review html
    reviews.ratingHtml = getRatingHtml(Math.round(reviews.average));
  }

  // If JSON query param return json instead
  if (req.query.json === 'true') {
    res.status(200).json(product);
    return;
  }

  // show the view
  const images = await getImages(product._id, req, res);

  // Related products
  let relatedProducts = {};
  if (config.showRelatedProducts) {
    const lunrIdArray = [];
    const productTags = product.productTags.split(',');
    const productTitleWords = product.productTitle.split(' ');
    const searchWords = productTags.concat(productTitleWords);
    searchWords.forEach((word) => {
      try {
        const results = productsIndex.search(word);
        results.forEach((id) => {
          lunrIdArray.push(getId(id.ref));
        });
      } catch (e) {
        console.log('lunr search query error');
      }
    });
    relatedProducts = await db.products
      .find({
        _id: { $in: lunrIdArray, $ne: product._id },
      })
      .limit(4)
      .toArray();
  }

  relatedProducts.map((product) => {
    const dateDifference = dateDiff(product.productAddedDate, new Date());

    if (dateDifference.months < 1) product.new = true;
    else product.new = false;
    return product;
  });

  res.render(`${config.themeViews}product`, {
    title: product.productTitle,
    result: product,
    variants,
    reviews,
    images: images,
    relatedProducts,
    productDescription: stripHtml(product.productDescription),
    metaDescription: `${config.cartTitle} - ${product.productTitle}`,
    config: config,
    session: req.session,
    pageUrl: config.baseUrl + req.originalUrl,
    message: clearSessionValue(req.session, 'message'),
    messageType: clearSessionValue(req.session, 'messageType'),
    helpers: req.handlebars.helpers,
    showFooter: 'showFooter',
    menu: sortMenu(await getMenu(db)),
    menuTags: menuTags.tags,
  });
});

// Gets the current cart
router.get('/cart/retrieve', async (req, res, next) => {
  const db = req.app.db;

  // Get the cart from the DB using the session id
  let cart = await db.cart.findOne({ sessionId: getId(req.session.id) });

  // Check for empty/null cart
  if (!cart) {
    cart = [];
  }

  res.status(200).json({ cart: cart.cart });
});

// Updates a single product quantity
router.post('/product/updatecart', async (req, res, next) => {
  const db = req.app.db;
  const config = req.app.config;
  const cartItem = req.body;

  // Check cart exists
  if (!req.session.cart) {
    emptyCart(
      req,
      res,
      'json',
      'There are no items if your cart or your cart is expired'
    );
    return;
  }

  const product = await db.products.findOne({ _id: getId(cartItem.productId) });
  if (!product) {
    res.status(400).json({
      message: 'There was an error updating the cart',
      totalCartItems: Object.keys(req.session.cart).length,
    });
    return;
  }

  // Calculate the quantity to update
  let productQuantity = cartItem.quantity ? cartItem.quantity : 1;
  if (typeof productQuantity === 'string') {
    productQuantity = parseInt(productQuantity);
  }

  if (productQuantity === 0) {
    // quantity equals zero so we remove the item
    delete req.session.cart[cartItem.cartId];
    res.status(400).json({
      message: 'There was an error updating the cart',
      totalCartItems: Object.keys(req.session.cart).length,
    });
    return;
  }

  // Check for a cart
  if (!req.session.cart[cartItem.cartId]) {
    res.status(400).json({
      message: 'There was an error updating the cart',
      totalCartItems: Object.keys(req.session.cart).length,
    });
    return;
  }

  const cartProduct = req.session.cart[cartItem.cartId];

  // Set default stock
  let productStock = product.productStock;
  let productPrice = parseFloat(product[getCurrencyField(req)]).toFixed(2);

  // Check if a variant is supplied and override values
  if (cartProduct.variantId) {
    const variant = await db.variants.findOne({
      _id: getId(cartProduct.variantId),
      product: getId(product._id),
    });
    if (!variant) {
      res
        .status(400)
        .json({ message: 'Error updating cart. Please try again.' });
      return;
    }
    productPrice = parseFloat(variant[getCurrencyField(req)]).toFixed(2);
    productStock = variant.stock;
  }

  // If stock management on check there is sufficient stock for this product
  if (config.trackStock) {
    // Only if not disabled
    if (product.productStockDisable !== true && productStock) {
      // If there is more stock than total (ignoring held)
      if (productQuantity > productStock) {
        res
          .status(400)
          .json({ message: 'There is insufficient stock of this product.' });
        return;
      }

      // Aggregate our current stock held from all users carts
      const stockHeld = await db.cart
        .aggregate([
          { $match: { sessionId: { $ne: req.session.id } } },
          { $project: { _id: 0 } },
          { $project: { o: { $objectToArray: '$cart' } } },
          { $unwind: '$o' },
          {
            $group: {
              _id: {
                $ifNull: ['$o.v.variantId', '$o.v.productId'],
              },
              sumHeld: { $sum: '$o.v.quantity' },
            },
          },
        ])
        .toArray();

      // If there is stock
      if (stockHeld.length > 0) {
        const totalHeld = _.find(stockHeld, ['_id', getId(cartItem.cartId)])
          .sumHeld;
        const netStock = productStock - totalHeld;

        // Check there is sufficient stock
        if (productQuantity > netStock) {
          res
            .status(400)
            .json({ message: 'There is insufficient stock of this product.' });
          return;
        }
      }
    }
  }

  // Update the cart
  req.session.cart[cartItem.cartId].quantity = productQuantity;
  req.session.cart[cartItem.cartId].totalItemPrice =
    productPrice * productQuantity;

  // update total cart amount
  await updateTotalCart(req, res);

  // Update checking cart for subscription
  updateSubscriptionCheck(req, res);

  // Update cart to the DB
  await db.cart.updateOne(
    { sessionId: req.session.id },
    {
      $set: { cart: req.session.cart },
    }
  );

  res.status(200).json({
    message: 'Cart successfully updated',
    totalCartItems: Object.keys(req.session.cart).length,
  });
});

// Remove single product from cart
router.post('/product/removefromcart', async (req, res, next) => {
  const db = req.app.db;

  // Check for item in cart
  if (!req.session.cart[req.body.cartId]) {
    return res.status(400).json({ message: 'Product not found in cart' });
  }

  // remove item from cart
  delete req.session.cart[req.body.cartId];

  // If not items in cart, empty it
  if (Object.keys(req.session.cart).length === 0) {
    return emptyCart(req, res, 'json');
  }

  // Update cart in DB
  await db.cart.updateOne(
    { sessionId: req.session.id },
    {
      $set: { cart: req.session.cart },
    }
  );
  // update total cart
  await updateTotalCart(req, res);

  // Update checking cart for subscription
  updateSubscriptionCheck(req, res);

  return res.status(200).json({
    message: 'Product successfully removed',
    totalCartItems: Object.keys(req.session.cart).length,
  });
});

// Totally empty the cart
router.post('/product/emptycart', async (req, res, next) => {
  emptyCart(req, res, 'json');
});

// Add item to cart
router.post('/product/addtocart', async (req, res, next) => {
  const db = req.app.db;
  const config = req.app.config;
  let productQuantity = req.body.productQuantity
    ? parseInt(req.body.productQuantity)
    : 1;
  const productComment = req.body.productComment
    ? req.body.productComment
    : null;

  let productColor = req.body.productColor ? req.body.productColor : null;
  let productCapsize = req.body.productCapsize ? req.body.productCapsize : null;

  // If maxQuantity set, ensure the quantity doesn't exceed that value
  if (config.maxQuantity && productQuantity > config.maxQuantity) {
    return res.status(400).json({
      message:
        'The quantity exceeds the max amount. Please contact us for larger orders.',
    });
  }

  // Don't allow negative quantity
  if (productQuantity < 1) {
    productQuantity = 1;
  }

  // setup cart object if it doesn't exist
  if (!req.session.cart) {
    req.session.cart = {};
  }

  // Get the product from the DB
  const product = await db.products.findOne({ _id: getId(req.body.productId) });

  if (!productColor) {
    if (product.productColors) {
      if (product.productColors.length > 0) {
        const colors = JSON.parse(product.productColors);
        productColor = Object.keys(colors)[0];
      }
    }
  }

  if (!productCapsize) {
    if (product.productCapsizes) {
      if (product.productCapsizes.length > 0) {
        const capsizes = product.productCapsizes.split(', ');
        productCapsize = capsizes[0];
      }
    }
  }

  // No product found
  if (!product) {
    return res
      .status(400)
      .json({ message: 'Error updating cart. Please try again.' });
  }

  // If cart already has a subscription you cannot add anything else
  if (req.session.cartSubscription) {
    return res.status(400).json({
      message: 'Subscription already existing in cart. You cannot add more.',
    });
  }

  // If existing cart isn't empty check if product is a subscription
  if (Object.keys(req.session.cart).length !== 0) {
    if (product.productSubscription) {
      return res.status(400).json({
        message:
          'You cannot combine subscription products with existing in your cart. Empty your cart and try again.',
      });
    }
  }

  // Variant checks
  let productCartId = product._id.toString();
  let productPrice = parseFloat(product[getCurrencyField(req)]).toFixed(2);
  console.log('HERE')

  let productVariantId,
    productVariantTitle,
    productPriceCFA = 0,
    productPriceEUR = 0,
    productPriceUSD = 0,
    productPriceKES = (parseFloat(product['productPrice'] || '0.0').toFixed(2) || 0);

  console.log(req.session.cart[productCartId]);
  let productStock = product.productStock;

  productPriceUSD = parseFloat(product.productPriceUSD || '0.0').toFixed(2);
  productPriceEUR = parseFloat(product.productPriceEUR || '0.0').toFixed(2);
  productPriceCFA = parseFloat(product.productPriceCFA || '0.0').toFixed(2);

  // Check if a variant is supplied and override values
  if (req.body.productVariant) {
    const variant = await db.variants.findOne({
      _id: getId(req.body.productVariant),
      product: getId(req.body.productId),
    });
    if (!variant) {
      return res
        .status(400)
        .json({ message: 'Error updating cart. Variant not found.' });
    }
    productVariantId = getId(req.body.productVariant);
    productVariantTitle = variant.title;
    productCartId = req.body.productVariant;
    productPrice = parseFloat(variant[getCurrencyField(req, true)]).toFixed(2);
    productPriceKES = (parseFloat(variant['price'] || '0.0').toFixed(2) || 0);
    productPriceUSD = parseFloat(variant.productPriceUSD || '0.0').toFixed(2);
    productPriceEUR = parseFloat(variant.productPriceEUR || '0.0').toFixed(2);
    productPriceCFA = parseFloat(variant.productPriceCFA || '0.0').toFixed(2);
    console.log('HERE----', getCurrencyField(req, true), variant)
    productStock = variant.stock;
  }

  // If stock management on check there is sufficient stock for this product
  if (config.trackStock) {
    // Only if not disabled
    if (product.productStockDisable !== true && productStock) {
      // If there is more stock than total (ignoring held)
      if (productQuantity > productStock) {
        return res
          .status(400)
          .json({ message: 'There is insufficient stock of this product.' });
      }

      // Aggregate our current stock held from all users carts
      const stockHeld = await db.cart
        .aggregate([
          { $project: { _id: 0 } },
          { $project: { o: { $objectToArray: '$cart' } } },
          { $unwind: '$o' },
          {
            $group: {
              _id: {
                $ifNull: ['$o.v.variantId', '$o.v.productId'],
              },
              sumHeld: { $sum: '$o.v.quantity' },
            },
          },
        ])
        .toArray();

      // If there is stock
      if (stockHeld.length > 0) {
        const heldProduct = _.find(stockHeld, ['_id', getId(productCartId)]);
        if (heldProduct) {
          const netStock = productStock - heldProduct.sumHeld;

          // Check there is sufficient stock
          if (productQuantity > netStock) {
            return res.status(400).json({
              message: 'There is insufficient stock of this product.',
            });
          }
        }
      }
    }
  }

  // if exists we add to the existing value
  let cartQuantity = 0;
  if (req.session.cart[productCartId]) {
    if (
      req.session.cart[productCartId].productColor === productColor &&
      req.session.cart[productCartId].productCapsize === productCapsize
    ) {
      // if both are the same
      cartQuantity =
        parseInt(req.session.cart[productCartId].quantity) + productQuantity;
      req.session.cart[productCartId].quantity = cartQuantity;
      req.session.cart[productCartId].totalItemPrice =
        productPrice * parseInt(req.session.cart[productCartId].quantity);
      req.session.cart[productCartId].productPrice = +productPrice;
      req.session.cart[productCartId].productPriceKES = +productPriceKES;
      req.session.cart[productCartId].productPriceUSD = +productPriceUSD;
      req.session.cart[productCartId].productPriceEUR = +productPriceEUR;
      req.session.cart[productCartId].productPriceCFA = +productPriceCFA;
    } else {
      // Set the card quantity
      cartQuantity = productQuantity;

      // new product deets
      const productObj = {};
      productObj.productId = product._id;
      productObj.title = product.productTitle;
      productObj.quantity = productQuantity;
      productObj.totalItemPrice = productPrice * productQuantity;
      productObj.productImage = product.productImage;
      productObj.productComment = productComment;
      productObj.productSubscription = product.productSubscription;
      productObj.variantId = productVariantId;
      productObj.variantTitle = productVariantTitle;
      productObj.productPrice = +productPrice;
      productObj.productPriceUSD = +productPriceUSD;
      productObj.productPriceEUR = +productPriceEUR;
      productObj.productPriceCFA = +productPriceCFA;
      productObj.productColor = productColor;
      productObj.productCapsize = productCapsize;

      if (product.productPermalink) {
        productObj.link = product.productPermalink;
      } else {
        productObj.link = product._id;
      }

      // merge into the current cart
      req.session.cart[
        productCartId + productColor + productCapsize
      ] = productObj;
    }

    // Check if the product color is the same

    // Check if the product capsize is the same

    // if both are the same
    // cartQuantity =
    //   parseInt(req.session.cart[productCartId].quantity) + productQuantity;
    // req.session.cart[productCartId].quantity = cartQuantity;
    // req.session.cart[productCartId].totalItemPrice =
    //   productPrice * parseInt(req.session.cart[productCartId].quantity);
    // req.session.cart[productCartId].productPrice = +productPrice;
    // req.session.cart[productCartId].productPriceUSD = +productPriceUSD;
    // req.session.cart[productCartId].productPriceEUR = +productPriceEUR;
    // req.session.cart[productCartId].productPriceCFA = +productPriceCFA;
  } else {
    // Set the card quantity
    cartQuantity = productQuantity;

    // new product deets
    const productObj = {};
    productObj.productId = product._id;
    productObj.title = product.productTitle;
    productObj.quantity = productQuantity;
    productObj.totalItemPrice = productPrice * productQuantity;
    productObj.productImage = product.productImage;
    productObj.productComment = productComment;
    productObj.productSubscription = product.productSubscription;
    productObj.variantId = productVariantId;
    productObj.variantTitle = productVariantTitle;
    productObj.productPrice = +productPrice;
    productObj.productPriceKES = +productPriceKES;
    productObj.productPriceUSD = +productPriceUSD;
    productObj.productPriceEUR = +productPriceEUR;
    productObj.productPriceCFA = +productPriceCFA;
    productObj.productColor = productColor;
    productObj.productCapsize = productCapsize;

    if (product.productPermalink) {
      productObj.link = product.productPermalink;
    } else {
      productObj.link = product._id;
    }

    // merge into the current cart
    req.session.cart[productCartId] = productObj;
  }

  req.session.cart = parseCart(req.session.cart, getCurrencyField(req));
  // Update cart to the DB
  await db.cart.updateOne(
    { sessionId: req.session.id },
    {
      $set: { cart: req.session.cart },
    },
    { upsert: true }
  );

  // update total cart amount
  await updateTotalCart(req, res);

  // Update checking cart for subscription
  updateSubscriptionCheck(req, res);

  if (product.productSubscription) {
    req.session.cartSubscription = product.productSubscription;
  }

  return res.status(200).json({
    message: 'Cart successfully updated',
    cartId: productCartId,
    totalCartItems: req.session.totalCartItems,
  });
});

// Totally empty the cart
router.post('/product/addreview', async (req, res, next) => {
  const config = req.app.config;

  // Check if module enabled
  if (config.modules.enabled.reviews) {
    // Check if a customer is logged in
    if (!req.session.customerPresent) {
      return res.status(400).json({
        message: 'You need to be logged in to create a review',
      });
    }

    // Validate inputs
    if (!req.body.title) {
      return res.status(400).json({
        message: 'Please supply a review title',
      });
    }
    if (!req.body.description) {
      return res.status(400).json({
        message: 'Please supply a review description',
      });
    }
    if (!req.body.rating) {
      return res.status(400).json({
        message: 'Please supply a review rating',
      });
    }

    // Sanitize inputs
    req.body.title = stripHtml(req.body.title);
    req.body.description = stripHtml(req.body.description);

    // Validate length
    if (req.body.title.length > 50) {
      return res.status(400).json({
        message: 'Review title is too long',
      });
    }
    if (req.body.description.length > 200) {
      return res.status(400).json({
        message: 'Review description is too long',
      });
    }

    // Check rating is within range
    try {
      const rating = parseInt(req.body.rating);
      if (rating < 0 || rating > 5) {
        return res.status(400).json({
          message: 'Please supply a valid rating',
        });
      }

      // Check for failed Int conversion
      if (isNaN(rating)) {
        return res.status(400).json({
          message: 'Please supply a valid rating',
        });
      }

      // Set rating to be numeric
      req.body.rating = rating;
    } catch (ex) {
      return res.status(400).json({
        message: 'Please supply a valid rating',
      });
    }

    // Checks passed, create the review
    const response = await createReview(req);
    if (response.error) {
      return res.status(400).json({
        message: response.error,
      });
    }
    return res.json({
      message: 'Review successfully submitted',
    });
  }
  return res.status(400).json({
    message: 'Unable to submit review',
  });
});

// search products
router.get('/search/:searchTerm/:pageNum?', async (req, res) => {
  const db = req.app.db;
  const searchTerm = req.params.searchTerm;
  const productsIndex = req.app.productsIndex;
  const config = req.app.config;
  const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

  const lunrIdArray = [];
  productsIndex.search(searchTerm).forEach((id) => {
    lunrIdArray.push(getId(id.ref));
  });

  let pageNum = 1;
  if (req.params.pageNum) {
    pageNum = req.params.pageNum;
  }

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([
    paginateProducts(
      true,
      db,
      pageNum,
      { _id: { $in: lunrIdArray } },
      getSort()
    ),
    getMenu(db),
  ])
    .then(([results, menu]) => {
      // If JSON query param return json instead
      if (req.query.json === 'true') {
        res.status(200).json(results.data);
        return;
      }

      res.render(`${config.themeViews}index`, {
        title: 'Results',
        homePageProducts: results.data,
        filtered: true,
        session: req.session,
        metaDescription: `${req.app.config.cartTitle} - Search term: ${searchTerm}`,
        searchTerm: searchTerm,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        productsPerPage: numberProducts,
        totalProductCount: results.totalItems,
        pageNum: pageNum,
        paginateUrl: 'search',
        config: config,
        menu: sortMenu(menu),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menuTags: menuTags.tags,
      });
    })
    .catch((err) => {
      console.error(colors.red('Error searching for products', err));
    });
});

// search products
router.get('/category/:cat/:pageNum?', async (req, res) => {
  const db = req.app.db;
  const searchTerm = req.params.cat;
  const productsIndex = req.app.productsIndex;
  const config = req.app.config;
  const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

  const lunrIdArray = [];
  productsIndex.search(searchTerm).forEach((id) => {
    lunrIdArray.push(getId(id.ref));
  });

  let pageNum = 1;
  if (req.params.pageNum) {
    pageNum = req.params.pageNum;
  }

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([
    paginateProducts(
      true,
      db,
      pageNum,
      { _id: { $in: lunrIdArray } },
      getSort()
    ),
    getMenu(db),
  ])
    .then(([results, menu]) => {
      const sortedMenu = sortMenu(menu);

      // If JSON query param return json instead
      if (req.query.json === 'true') {
        res.status(200).json(results.data);
        return;
      }

      res.render(`${config.themeViews}index`, {
        title: `Category: ${searchTerm}`,
        results: results.data,
        filtered: true,
        session: req.session,
        searchTerm: searchTerm,
        metaDescription: `${req.app.config.cartTitle} - Category: ${searchTerm}`,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        productsPerPage: numberProducts,
        totalProductCount: results.totalItems,
        pageNum: pageNum,
        menuLink: _.find(sortedMenu.items, (obj) => {
          return obj.link === searchTerm;
        }),
        paginateUrl: 'category',
        config: config,
        menu: sortedMenu,
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menuTags: menuTags.tags,
      });
    })
    .catch((err) => {
      console.error(colors.red('Error getting products for category', err));
    });
});

// Language setup in cookie
router.get('/lang/:locale', (req, res) => {
  res.cookie('locale', req.params.locale, { maxAge: 900000, httpOnly: true });
  res.redirect('back');
});

// Language setup in cookie
router.get('/currency/:currency', (req, res) => {
  res.cookie('currency', req.params.currency, {
    maxAge: 900000,
    httpOnly: true,
  });
  res.send({ done: true });
});

// return sitemap
router.get('/sitemap.xml', (req, res, next) => {
  const sm = require('sitemap');
  const config = req.app.config;

  addSitemapProducts(req, res, (err, products) => {
    if (err) {
      console.error(colors.red('Error generating sitemap.xml', err));
    }
    const sitemap = sm.createSitemap({
      hostname: config.baseUrl,
      cacheTime: 600000,
      urls: [{ url: '/', changefreq: 'weekly', priority: 1.0 }],
    });

    const currentUrls = sitemap.urls;
    const mergedUrls = currentUrls.concat(products);
    sitemap.urls = mergedUrls;
    // render the sitemap
    sitemap.toXML((err, xml) => {
      if (err) {
        return res.status(500).end();
      }
      res.header('Content-Type', 'application/xml');
      res.send(xml);
      return true;
    });
  });
});

router.get('/page/:pageNum', async (req, res, next) => {
  const db = req.app.db;
  const config = req.app.config;
  const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

  const menuTags = req.session.menuTags || { tags: [] };

  Promise.all([
    paginateProducts(true, db, req.params.pageNum, {}, getSort()),
    getMenu(db),
  ])
    .then(([results, menu]) => {
      // If JSON query param return json instead
      if (req.query.json === 'true') {
        res.status(200).json(results.data);
        return;
      }

      res.render(`${config.themeViews}index`, {
        title: 'Shop',
        results: results.data,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        metaDescription: `${req.app.config.cartTitle} - Products page: ${req.params.pageNum}`,
        config: req.app.config,
        productsPerPage: numberProducts,
        totalProductCount: results.totalItems,
        pageNum: req.params.pageNum,
        paginateUrl: 'page',
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(menu),
        menuTags: menuTags.tags,
      });
    })
    .catch((err) => {
      console.error(colors.red('Error getting products for page', err));
    });
});

// The main entry point of the shop
router.get('/:page?', async (req, res, next) => {
  const db = req.app.db;
  const config = req.app.config;
  const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

  // if no page is specified, just render page 1 of the cart
  if (!req.params.page) {
    Promise.all([paginateProducts(true, db, 1, {}, getSort()), getMenu(db)])
      .then(async ([results, menu]) => {
        // If JSON query param return json instead
        if (req.query.json === 'true') {
          res.status(200).json(results.data);
          return;
        }

        // Fetch instagram posts from db
        const igPost = (await db.igposts.findOne({})) || {};
        let postsArr, showIGPosts, mainIGPosts;

        showIGPosts = !!igPost.posts;
        if (showIGPosts) postsArr = igPost && igPost.posts.split(',');

        if (postsArr)
          mainIGPosts = [
            postsArr[0].trim().split('/')[4],
            postsArr[1].trim().split('/')[4],
            postsArr[2].trim().split('/')[4],
          ];

        let showBottomCarousel = true;
        let bottomCarousel1, bottomCarousel2;
        if (results.data.length === 0) {
          showBottomCarousel = false;
        } else {
          bottomCarousel1 = results.data.slice(
            0,
            results.data.length >= 4 ? 4 : results.data.length
          );
          bottomCarousel2 = results.data.slice(
            results.data.length > 4 ? 4 : 0,
            results.data.length >= 8 ? 8 : results.data.length
          );
        }

        let carousel1, carousel2;
        if (bottomCarousel1) {
          while (bottomCarousel1.length < 4) {
            bottomCarousel1.push(bottomCarousel1[0]);
          }

          carousel1 = bottomCarousel1.sort(() => Math.random() - 0.5);
        }

        if (bottomCarousel2) {
          while (bottomCarousel2.length < 4) {
            bottomCarousel2.push(bottomCarousel2[0]);
          }

          carousel2 = bottomCarousel2.sort(() => Math.random() - 0.5);
        }

        const homePageProducts = results.data.slice(0, 4);
        homePageProducts.map((product) => {
          const dateDifference = dateDiff(product.productAddedDate, new Date());

          if (dateDifference.months < 1) product.new = true;
          else product.new = false;
          return product;
        });

        const menuTags = req.session.menuTags || { tags: [] };

        res.render(`${config.themeViews}index`, {
          title: `${config.cartTitle} - Shop`,
          theme: config.theme,
          results: results.data,
          homePageProducts: homePageProducts,
          session: req.session,
          message: clearSessionValue(req.session, 'message'),
          messageType: clearSessionValue(req.session, 'messageType'),
          config,
          productsPerPage: numberProducts,
          totalProductCount: results.totalItems,
          pageNum: 1,
          paginateUrl: 'page',
          helpers: req.handlebars.helpers,
          showFooter: 'showFooter',
          menu: sortMenu(menu),
          instaFeed: mainIGPosts,
          bottomCarousel1: carousel1 ? carousel1 : null,
          bottomCarousel2: carousel2 ? carousel2 : null,
          showBottomCarousel: showBottomCarousel,
          showIGPosts: showIGPosts,
          menuTags: menuTags.tags,
        });
      })
      .catch((err) => {
        console.error(colors.red('Error getting products for page', err));
      });
  } else {
    if (req.params.page === 'admin') {
      next();
      return;
    }
    // lets look for a page
    const page = await db.pages.findOne({
      pageSlug: req.params.page,
      pageEnabled: 'true',
    });
    // if we have a page lets render it, else throw 404
    if (page) {
      res.render(`${config.themeViews}page`, {
        title: page.pageName,
        page: page,
        searchTerm: req.params.page,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        config: req.app.config,
        metaDescription: `${req.app.config.cartTitle} - ${page}`,
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(await getMenu(db)),
      });
    } else {
      res.status(404).render('error', {
        title: '404 Error - Page not found',
        config: req.app.config,
        message: '404 Error - Page not found',
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(await getMenu(db)),
      });
    }
  }
});

module.exports = router;
