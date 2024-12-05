const guildList = require("../Managers/Schemas/guildListSchema");

class GuildHandler {
	static async initGuild(guildId, guildName) {
		if (!(await guildList.exists({ guildId: guildId }))) {
			let guildData = {
				guildId: guildId,
				guildName: guildName,
				levelActive: true,
				levelThreshold: "",
				levelRoleId: "",
				levelRoleName: "",
				announceActive: false,
				announceChannelId: "",
				announceChannelName: "",
				auditActive: false,
				auditChannelId: "",
				auditChannelName: "",
				auditFullVerbosity: false,
				warnTimeoutThreshold: -1,
				warnTimeoutDuration: -1,
				warnBanThreshold: -1,
				warnAuditChannelId: "",
				warnAuditChannelName: "",
				memberList: [],
				regionWatchMembers: [],
			};
			new guildList(guildData).save();
		}
	}
	static getGuildPreferences(guildId) {
		return guildList.findOne({ guildId }).lean();
	}
	static updateGuildPreferences(guildId, updateObject) {
		return guildList.updateOne({ guildId }, updateObject).lean();
	}
	static async updateGuild() {
		let status = await guildList.updateMany(
			{},
			{
				regionWatchMembers: [],
			},
		);
		return status;
	}
}

module.exports = GuildHandler;
