const { Schema, model } = require("mongoose");

const userPlaylistSchema = new Schema({
	timeStamp: Date,
	userId: String,
	username: String,
	discriminator: Number,
	queryList: Object,
});

module.exports = model("userPlaylist", userPlaylistSchema);
