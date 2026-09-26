import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";

export async function getGuildMemberState(guildId: string, userId: string): Promise<GuildMemberStateDocument | null> {
	return GuildMemberStateModel.findOne({ guildId, userId }).exec();
}

export async function getOrCreateGuildMemberState(
	guildId: string,
	userId: string,
	username: string,
): Promise<GuildMemberStateDocument> {
	let storedMemberStateData = await getGuildMemberState(guildId, userId);
	if (!storedMemberStateData) {
		return await GuildMemberStateModel.create({ guildId, userId, username });
	}
	if (storedMemberStateData.username !== username) {
		storedMemberStateData.username = username;
		await storedMemberStateData.save();
	}
	return storedMemberStateData;
}
