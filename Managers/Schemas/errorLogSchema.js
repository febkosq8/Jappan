const { Schema, model } = require("mongoose");

const errorLogSchema = new Schema({
	timeStamp: Date,
	botVersion: String,
	envMode: String,
	eventType: String,
	desc: String,
	event: String,
});

module.exports = model("ErrorLog", errorLogSchema);
