import GuildModel, { type GuildDocument } from "../models/guild.js";

export async function getGuildSettings(guildId: string, guildName: string): Promise<GuildDocument> {
	let guild = await GuildModel.findOne().where("guildId", guildId).exec();
	if (!guild) {
		guild = await GuildModel.create({ guildId, guildName });
	}

	if (guild.guildName !== guildName) {
		guild.guildName = guildName;
		await guild.save();
	}

	return guild;
}
