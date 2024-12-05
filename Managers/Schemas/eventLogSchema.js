const { Schema, model } = require("mongoose");
const eventsSchema = {
	type: { type: String, required: true },
	desc: { type: String, required: true },
	event: { type: Object, required: false },
	timestamp: { type: Date, required: true },
};
const eventLogSchema = new Schema(
	{
		botVersion: {
			type: String,
			required: true,
		},
		envMode: {
			type: String,
			required: true,
			default: process.env.envMode,
		},
		date: {
			type: String,
			required: true,
		},
		events: {
			type: [eventsSchema],
			required: true,
			default: [],
		},
	},
	{
		timestamps: true,
	},
).index({ date: 1 });

module.exports = model("EventLog", eventLogSchema);
