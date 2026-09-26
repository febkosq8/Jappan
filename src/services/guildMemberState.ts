import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";

export async function getGuildMemberState(guildId: string, userId: string): Promise<GuildMemberStateDocument | null> {
	return GuildMemberStateModel.findOne({ guildId, userId }).exec();
}

export async function getOrCreateGuildMemberState(
	guildId: string,
	userId: string,
	username: string,
): Promise<GuildMemberStateDocument> {
	let state = await getGuildMemberState(guildId, userId);
	if (!state) {
		return await GuildMemberStateModel.create({ guildId, userId, username });
	}
	if (state.username !== username) {
		state.username = username;
		await state.save();
	}
	return state;
}
