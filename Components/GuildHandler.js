const guildList = require("../Managers/Schemas/guildListSchema");

class GuildHandler {
	static async initGuild(guildId, guildName) {
		let guildFound = await guildList.findOne({
			guildId: guildId,
		});
		if (!guildFound) {
			let guildData = {
				timeStamp: new Date().toISOString(),
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
				warnTimeoutThreshold: -1,
				warnTimeoutDuration: -1,
				warnBanThreshold: -1,
				warnAuditChannelId: "",
				warnAuditChannelName: "",
				memberList: [],
			};
			new guildList(guildData).save();
		}
	}
	static async updateGuild() {
		let status = await guildList.updateMany(
			{},
			{
				warnTimeoutThreshold: -1,
				warnTimeoutDuration: -1,
				warnBanThreshold: -1,
				warnAuditChannelId: "",
				warnAuditChannelName: "",
			},
		);
		return status;
	}
}

module.exports = GuildHandler;
