const localShippingAmount = 300;
const domesticShippingAmount = 1000;
const internationalShippingAmount = 2000;
const freeThreshold = 1000000000;
const shippingFromCountry = 'Kenya';
const shippingFromState = 'Nairobi';

const calculateShipping = (amount, config, req) => {
    console.log()
    if(amount >= freeThreshold){
        req.session.shippingMessage = 'FREE shipping';
        req.session.totalCartShipping = 0;
        req.session.totalCartAmount = req.session.totalCartAmount + 0;
        return;
    }

    // If there is no country set, we estimate shipping
    if(!req.session.customerCountry){
        req.session.shippingMessage = 'Estimated shipping';
        req.session.totalCartShipping = domesticShippingAmount;
        req.session.totalCartAmount = amount + domesticShippingAmount;
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

module.exports = {
    calculateShipping
};
