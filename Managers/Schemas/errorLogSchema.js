const { Schema, model } = require("mongoose");

const errorLogSchema = new Schema(
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

module.exports = model("ErrorLog", errorLogSchema);
