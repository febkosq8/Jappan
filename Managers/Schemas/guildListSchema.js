const { Schema, model } = require("mongoose");

const guildListSchema = new Schema(
	{
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
		auditFullVerbosity: Boolean,
		warnTimeoutThreshold: Number,
		warnTimeoutDuration: Number,
		warnBanThreshold: Number,
		warnAuditChannelId: String,
		warnAuditChannelName: String,
		memberList: Object,
		regionWatchMembers: [Object],
	},
	{
		timestamps: true,
	},
);

module.exports = model("guildList", guildListSchema);
