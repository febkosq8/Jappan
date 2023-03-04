const { Schema, model } = require("mongoose");

const logSchema = new Schema({
	timeStamp: Date,
	botVersion: String,
	envMode: String,
	eventType: String,
	desc: String,
	event: Object,
});

module.exports = model("EventLog", logSchema);
