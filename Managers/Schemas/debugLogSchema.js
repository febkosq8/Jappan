const { Schema, model } = require("mongoose");

const debugLogSchema = new Schema({
	timeStamp: Date,
	botVersion: String,
	envMode: String,
	eventType: String,
	desc: String,
	event: Object,
});

module.exports = model("DebugLog", debugLogSchema);
