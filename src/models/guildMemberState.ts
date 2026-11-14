import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const levelingStateSchema = new Schema(
	{
		points: { type: Number, required: true, min: 0, default: 0 },
		level: { type: Number, required: true, min: 0, default: 0 },
	},
	{ _id: false },
);

const warningRecordSchema = new Schema({
	issuedAt: { type: Date, default: null },
	reason: { type: String, required: true, trim: true, maxlength: 500 },
	issuerId: { type: String, default: null },
	thresholdAction: {
		type: String,
		enum: ["unknown", "pending", "none", "banned", "timed_out", "ban_failed", "timeout_failed"],
		required: true,
	},
});

const voiceRegionLockSchema = new Schema(
	{
		channelId: { type: String, required: true },
		channelName: { type: String, required: true, trim: true },
		region: { type: String, required: true, trim: true },
		fallbackRegion: { type: String, default: null },
	},
	{ _id: false },
);

const guildMemberStateSchema = new Schema(
	{
		guildId: { type: String, required: true, immutable: true },
		userId: { type: String, required: true, immutable: true },
		username: { type: String, required: true, trim: true },
		leveling: { type: levelingStateSchema, required: true, default: () => ({}) },
		warnings: { type: [warningRecordSchema], required: true, default: [] },
		voiceRegionLock: { type: voiceRegionLockSchema, default: null },
	},
	{
		collection: "guildMemberStates",
		timestamps: true,
		strict: "throw",
	},
);

guildMemberStateSchema.index({ guildId: 1, userId: 1 }, { unique: true });

guildMemberStateSchema.index({ guildId: 1, "leveling.points": -1 });

guildMemberStateSchema.index({ guildId: 1, "voiceRegionLock.channelId": 1 });

export type GuildMemberState = InferSchemaType<typeof guildMemberStateSchema>;
export type GuildMemberStateDocument = HydratedDocument<GuildMemberState>;

const GuildMemberStateModel =
	(models.GuildMemberState as mongoose.Model<GuildMemberState> | undefined) ??
	model<GuildMemberState>("GuildMemberState", guildMemberStateSchema);

export default GuildMemberStateModel;
