import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const authAccountSchema = new Schema(
	{
		userId: { type: Schema.Types.ObjectId, required: true, ref: "AuthUser" },
		accountId: { type: String, required: true },
		providerId: { type: String, required: true },
		username: { type: String },
		accessToken: { type: String, select: false },
		refreshToken: { type: String, select: false },
		idToken: { type: String, select: false },
		accessTokenExpiresAt: { type: Date },
		refreshTokenExpiresAt: { type: Date },
		scope: { type: String },
		password: { type: String, select: false },
	},
	{
		collection: "authAccounts",
		timestamps: true,
		versionKey: false,
	},
);

authAccountSchema.index({ providerId: 1, accountId: 1 }, { unique: true });
authAccountSchema.index({ userId: 1 });

export type AuthAccount = InferSchemaType<typeof authAccountSchema>;
export type AuthAccountDocument = HydratedDocument<AuthAccount>;

const AuthAccountModel =
	(models.AuthAccount as mongoose.Model<AuthAccount> | undefined) ??
	model<AuthAccount>("AuthAccount", authAccountSchema);

export default AuthAccountModel;
