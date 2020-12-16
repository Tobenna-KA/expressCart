const ObjectId = require('mongodb').ObjectID;
const badwordsList = require('badwords-list');

const createReview = async (req) => {
    const db = req.app.db;

    // Check if user has made an existing review
    const existingReview = await db.reviews.countDocuments({
        product: ObjectId(req.body.product),
        customer: ObjectId(req.session.customerId)
    });
    if(existingReview){
        return {
            error: 'Review already submitted'
        };
    }

    // Check for bad words in review
    const badWordTitle = badwordsList.array.some(r => req.body.title.split(' ').indexOf(r) >= 0);
    const badWordDescription = badwordsList.array.some(r => req.body.description.split(' ').indexOf(r) >= 0);
    if(badWordTitle || badWordDescription){
        return {
            error: 'Review was declined. Please check inputs'
        };
    }

    // Create new review
    const review = {
        product: ObjectId(req.body.product),
        title: req.body.title,
        description: req.body.description,
        rating: req.body.rating,
        customer: ObjectId(req.session.customerId),
        date: new Date()
    };

    try {
        const newReview = await db.reviews.insertOne(review);
        await updateRatings(review.product, db);
        return newReview;
    }catch(ex){
        console.log('Create review', ex);
        return {
            error: 'Unable to create review'
        };
    }
};

const getRatingHtml = (rating) => {
    let ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
    switch(rating){
        case 1:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
            break;
        case 2:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
            break;
        case 3:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
            break;
        case 4:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star"></i></div>';
            break;
        case 5:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i><i data-feather="star" class="rating-fill"></i></div>';
            break;
        default:
            ratingHtml = '<div class="ratingWrapper"><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i><i data-feather="star"></i></div>';
    }
    return ratingHtml;
};


function precise(x) {
    return parseFloat(Number.parseFloat(x).toPrecision(4));
}

const updateRatings = async (productId , db) => {

    try {
        // fetch reviews for the product
        const reviews = await db.reviews.find({product: ObjectId(productId)}).toArray();
        let ratings = 0;
        for (const review of reviews) {
            ratings += review.rating; // add up the ratings and get the average
        }

        if (reviews.length > 0 && ratings) {
            // update reviews
            await db.products.updateOne({_id: ObjectId(productId)}, {
                $set: {avgRatings: precise(ratings/reviews.length)}
            })
        }
    } catch (e) {
        console.log(e)
    }
}

const aggregateRatings = async (db) => {
    // get products
    // iterate through products
    // fetch reviews for the product
    // add up the ratings and get the average
    // add object to array for bulk update
    // update reviews
}

module.exports = {
    createReview,
    getRatingHtml,
    aggregateRatings
};
