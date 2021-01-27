let localShippingAmount = 300;
let domesticShippingAmount = 1000;
let internationalShippingAmount = 2000;
const freeThreshold = 1000000000;
const shippingFromCountry = 'Kenya';
const shippingFromState = 'Nairobi';

const calculateCost = (currency) => {
    if (currency === 'productPriceCFA') {
        localShippingAmount = 1620.59;
        domesticShippingAmount = 5401.98;
        internationalShippingAmount = 10803.96;
    } else if (currency === 'productPriceUSD') {
        localShippingAmount = 3;
        domesticShippingAmount = 10;
        internationalShippingAmount = 20;
    } else if (currency === 'productPriceEUR') {
        localShippingAmount = 2.47;
        domesticShippingAmount = 8.22;
        internationalShippingAmount = 16.44;
    } else {
        localShippingAmount = 300;
        domesticShippingAmount = 1000;
        internationalShippingAmount = 2000;
    }
}

const calculateShipping = (amount, config, req) => {
    calculateCost(req.cookies.currency)
    if(amount >= freeThreshold){
        req.session.shippingMessage = 'FREE shipping';
        req.session.totalCartShipping = 0;
        req.session.totalCartAmount = req.session.totalCartAmount + 0;
        return;
    }

    // If there is no country set, we estimate shipping
    if(!req.session.customerCountry){
        req.session.shippingMessage = 'Estimated shipping (might change based on location)';
        req.session.totalCartShipping = localShippingAmount;
        req.session.totalCartAmount = amount + localShippingAmount;
        return;
    }

    // Check for instate
    if(
        req.session.customerState.toLowerCase() !== shippingFromState.toLowerCase() &&
        req.session.customerCountry.toLowerCase() === shippingFromCountry.toLowerCase()
    ){
        req.session.shippingMessage = 'Outside Nairobi shipping';
        req.session.totalCartShipping = domesticShippingAmount;
        req.session.totalCartAmount = amount + domesticShippingAmount;
        return;
    }

    // Check for international
    if(req.session.customerCountry.toLowerCase() !== shippingFromCountry.toLowerCase()){
        req.session.shippingMessage = 'International shipping';
        req.session.totalCartShipping = internationalShippingAmount;
        req.session.totalCartAmount = amount + internationalShippingAmount;
        return;
    }

    // Domestic shipping
    req.session.shippingMessage = 'Domestic shipping (Within Nairobi)';
    req.session.totalCartShipping = localShippingAmount;
    req.session.totalCartAmount = amount + localShippingAmount;
};

const calculateShippingCost = (amount, currency, config, req) => {
    calculateCost(currency)
    if(amount >= freeThreshold){
        return 0;
    }

    // If there is no country set, we estimate shipping
    if(!req.session.customerCountry){
        return localShippingAmount;
    }

    // Check for instate
    if(
        req.session.customerState.toLowerCase() !== shippingFromState.toLowerCase() &&
        req.session.customerCountry.toLowerCase() === shippingFromCountry.toLowerCase()
    ){
        return domesticShippingAmount;
    }

    // Check for international
    if(req.session.customerCountry.toLowerCase() !== shippingFromCountry.toLowerCase()){
        return internationalShippingAmount;
    }

    // Domestic shipping
    return localShippingAmount;
};

module.exports = {
    calculateShipping,
    calculateShippingCost
};
