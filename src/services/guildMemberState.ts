import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";

export async function getGuildMemberState(guildId: string, userId: string): Promise<GuildMemberStateDocument | null> {
	return GuildMemberStateModel.findOne({ guildId, userId }).exec();
}

export async function getOrCreateGuildMemberState({
	guildId,
	userId,
	username,
}: {
	guildId: string;
	userId: string;
	username: string;
}): Promise<GuildMemberStateDocument> {
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

export async function incrementGuildMemberLevelingPoints({
	guildId,
	userId,
	username,
	points,
}: {
	guildId: string;
	userId: string;
	username: string;
	points: number;
}): Promise<{ state: GuildMemberStateDocument; previousPoints: number }> {
	const state = await GuildMemberStateModel.findOneAndUpdate(
		{ guildId, userId },
		{
			$set: { username },
			$inc: { "leveling.points": points },
			$setOnInsert: { guildId, userId },
		},
		{ returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
	).exec();

	if (!state) {
		throw new Error("Failed to update guild member leveling state");
	}

	return { state, previousPoints: state.leveling.points - points };
}
