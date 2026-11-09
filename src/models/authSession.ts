import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const authSessionSchema = new Schema(
	{
		userId: { type: Schema.Types.ObjectId, required: true, ref: "AuthUser" },
		token: { type: String, required: true, select: false },
		expiresAt: { type: Date, required: true },
		ipAddress: { type: String, select: false },
		userAgent: { type: String, select: false },
	},
	{
		collection: "authSessions",
		timestamps: true,
		versionKey: false,
	},
);

authSessionSchema.index({ token: 1 }, { unique: true });
authSessionSchema.index({ userId: 1 }, { unique: true });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthSession = InferSchemaType<typeof authSessionSchema>;
export type AuthSessionDocument = HydratedDocument<AuthSession>;

const AuthSessionModel =
	(models.AuthSession as mongoose.Model<AuthSession> | undefined) ??
	model<AuthSession>("AuthSession", authSessionSchema);

export default AuthSessionModel;
