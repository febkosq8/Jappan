const { Schema, model } = require("mongoose");

const debugLogSchema = new Schema(
	{
		botVersion: String,
		envMode: String,
		eventType: String,
		desc: String,
		event: Object || String,
	},
	{
		timestamps: true,
	},
);

module.exports = model("DebugLog", debugLogSchema);
