import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const playlistEntrySchema = new Schema(
	{
		listname: { type: String, required: true, trim: true, maxlength: 100 },
		query: { type: String, required: true, trim: true, maxlength: 2000 },
		shuffle: { type: Boolean, required: true, default: false },
		loop: { type: Boolean, required: true, default: false },
	},
	{ _id: false },
);

const userPlaylistSchema = new Schema(
	{
		userId: { type: String, required: true, immutable: true },
		username: { type: String, required: true, trim: true },
		queryList: {
			type: [playlistEntrySchema],
			required: true,
			default: () => [],
			validate: {
				validator: (entries: Array<{ listname: string }>) => {
					const names = entries.map((entry) => entry.listname.toLowerCase());
					return new Set(names).size === names.length;
				},
				message: "Playlist names must be unique for each user.",
			},
		},
	},
	{
		collection: "userplaylists",
		timestamps: true,
		strict: "throw",
	},
);

userPlaylistSchema.index({ userId: 1 }, { unique: true });

export type PlaylistEntry = InferSchemaType<typeof playlistEntrySchema>;
export type UserPlaylist = InferSchemaType<typeof userPlaylistSchema>;
export type UserPlaylistDocument = HydratedDocument<UserPlaylist>;

const UserPlaylistModel =
	(models.UserPlaylist as mongoose.Model<UserPlaylist> | undefined) ??
	model<UserPlaylist>("UserPlaylist", userPlaylistSchema);

export default UserPlaylistModel;
