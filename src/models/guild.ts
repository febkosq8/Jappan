import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const auditLogSchema = new Schema(
	{
		enabled: { type: Boolean, required: true, default: false },
		channelId: { type: String, default: null },
		fullVerbosity: { type: Boolean, required: true, default: false },
	},
	{ _id: false },
);

const levelingSchema = new Schema(
	{
		enabled: { type: Boolean, required: true, default: true },
		threshold: { type: Number, min: 1, default: null },
		roleId: { type: String, default: null },
	},
	{ _id: false },
);

const memberAnnouncementsSchema = new Schema(
	{
		joinEnabled: { type: Boolean, required: true, default: false },
		leaveEnabled: { type: Boolean, required: true, default: false },
		joinChannelId: { type: String, default: null },
		leaveChannelId: { type: String, default: null },
	},
	{ _id: false },
);

const warningsSchema = new Schema(
	{
		timeoutThreshold: { type: Number, min: 1, default: null },
		timeoutDurationHours: { type: Number, min: 1, default: null },
		banThreshold: { type: Number, min: 1, default: null },
		auditChannelId: { type: String, default: null },
	},
	{ _id: false },
);

const guildSchema = new Schema(
	{
		guildId: { type: String, required: true, immutable: true },
		guildName: { type: String, required: true, trim: true },
		auditLog: { type: auditLogSchema, required: true, default: () => ({}) },
		leveling: { type: levelingSchema, required: true, default: () => ({}) },
		memberAnnouncements: {
			type: memberAnnouncementsSchema,
			required: true,
			default: () => ({}),
		},
		warnings: { type: warningsSchema, required: true, default: () => ({}) },
	},
	{
		collection: "guilds",
		timestamps: true,
		strict: "throw",
	},
);

guildSchema.index({ guildId: 1 }, { unique: true });

export type Guild = InferSchemaType<typeof guildSchema>;
export type GuildDocument = HydratedDocument<Guild>;

const GuildModel = models.Guild ?? model<Guild>("Guild", guildSchema);

export default GuildModel;
