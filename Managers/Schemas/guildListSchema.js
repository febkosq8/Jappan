const { Schema, model } = require("mongoose");

const guildListSchema = new Schema({
	timeStamp: Date,
	guildId: String,
	guildName: String,
	levelActive: Boolean,
	levelThreshold: String,
	levelRoleId: String,
	levelRoleName: String,
	announceActive: Boolean,
	announceChannelId: String,
	announceChannelName: String,
	auditActive: Boolean,
	auditChannelId: String,
	auditChannelName: String,
	warnTimeoutThreshold: Number,
	warnTimeoutDuration: Number,
	warnBanThreshold: Number,
	warnAuditChannelId: String,
	warnAuditChannelName: String,
	memberList: Object,
});

module.exports = model("guildList", guildListSchema);
