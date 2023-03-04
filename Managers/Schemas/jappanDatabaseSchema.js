const { Schema, model } = require("mongoose");

const jappanDatabaseSchema = new Schema({
	timeStamp: Date,
});

module.exports = model("jappanDatabase", jappanDatabaseSchema);
