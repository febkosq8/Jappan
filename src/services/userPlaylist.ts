import UserPlaylistModel, { type PlaylistEntry } from "../models/userPlaylist.js";

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listUserPlaylists(userId: string): Promise<PlaylistEntry[]> {
	const playlist = await UserPlaylistModel.findOne({ userId }, { queryList: 1, _id: 0 }).lean();
	return playlist?.queryList ?? [];
}

export async function removeUserPlaylist({ userId, listname }: { userId: string; listname: string }): Promise<boolean> {
	const playlist = await UserPlaylistModel.findOneAndUpdate(
		{
			userId,
			queryList: {
				$elemMatch: {
					listname: { $regex: `^${escapeRegex(listname)}$`, $options: "i" },
				},
			},
		},
		[
			{
				$set: {
					queryList: {
						$filter: {
							input: "$queryList",
							as: "playlist",
							cond: {
								$ne: [{ $toLower: "$$playlist.listname" }, listname.toLowerCase()],
							},
						},
					},
				},
			},
		],
		{ new: true, updatePipeline: true },
	);
	return Boolean(playlist);
}

export async function saveUserPlaylist({
	userId,
	username,
	entry,
}: {
	userId: string;
	username: string;
	entry: PlaylistEntry;
}): Promise<void> {
	await UserPlaylistModel.findOneAndUpdate(
		{ userId },
		[
			{
				$set: {
					username,
					queryList: {
						$let: {
							vars: {
								existing: { $ifNull: ["$queryList", []] },
							},
							in: {
								$concatArrays: [
									{
										$filter: {
											input: "$$existing",
											as: "playlist",
											cond: {
												$ne: [
													{ $toLower: "$$playlist.listname" },
													entry.listname.toLowerCase(),
												],
											},
										},
									},
									[entry],
								],
							},
						},
					},
				},
			},
		],
		{ upsert: true, new: true, runValidators: true, updatePipeline: true },
	);
}

export async function findUserPlaylist(userId: string, listname: string): Promise<PlaylistEntry | undefined> {
	const playlists = await listUserPlaylists(userId);
	const normalizedName = listname.toLowerCase();
	return playlists.find((entry) => entry.listname.toLowerCase() === normalizedName);
}
