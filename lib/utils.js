module.exports = {
  processProductCurrency(products, currentCurrency) {
    let currency =
      currentCurrency == 'KES' ? 'productPriceKES' : currentCurrency;

    const processedProducts = [];

    products.forEach((product) => {
      if (product.variants) {
        product.variants = product.variants.map((variant) => {
          variant.displayPrice = variant[currency] || variant.price;
          return variant;
        });

        product.displayPrice = product[currency] || product.productPrice;
        processedProducts.push(product);
      }
    });

    return processedProducts;
  },
};
