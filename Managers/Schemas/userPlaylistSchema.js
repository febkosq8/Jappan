const { Schema, model } = require("mongoose");

const userPlaylistSchema = new Schema(
	{
		userId: String,
		username: String,
		queryList: Object,
	},
	{
		timestamps: true,
	},
);

module.exports = model("userPlaylist", userPlaylistSchema);
