const _ = require('lodash');

const getEmailList = (db) => {
    return db.emailList.find()
};

const addToList = async (req, res) => {
    const db = req.app.db;
    getEmailList(db).then(list => {

    })
    .catch(error => {

    })
}
