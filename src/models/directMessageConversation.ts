import mongoose, { type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const readerSchema = new Schema(
	{ id: { type: String, required: true }, username: { type: String, required: true } },
	{ _id: false },
);

const directMessageConversationSchema = new Schema(
	{
		botUserId: { type: String, required: true, immutable: true },
		userId: { type: String, required: true, immutable: true },
		channelId: { type: String, required: true },
		lastReceivedAt: { type: Date, required: true },
		// Decimal128 preserves Discord snowflake ordering without losing integer precision.
		lastReceivedMessageId: { type: Schema.Types.Decimal128, default: null },
		lastReadMessageId: { type: Schema.Types.Decimal128, default: null },
		lastReadAt: { type: Date, default: null },
		lastReadBy: { type: readerSchema, default: null },
	},
	{ collection: "directMessageConversations", strict: "throw" },
);

directMessageConversationSchema.index({ botUserId: 1, userId: 1 }, { unique: true });
directMessageConversationSchema.index({ botUserId: 1, lastReceivedAt: -1, userId: 1 });

type DirectMessageConversation = InferSchemaType<typeof directMessageConversationSchema>;

const DirectMessageConversationModel =
	(models.DirectMessageConversation as mongoose.Model<DirectMessageConversation> | undefined) ??
	model<DirectMessageConversation>("DirectMessageConversation", directMessageConversationSchema);

export default DirectMessageConversationModel;
