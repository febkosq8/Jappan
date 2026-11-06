import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const authUserSchema = new Schema(
	{
		name: { type: String, required: true },
		username: { type: String },
		discordAccountId: { type: String },
		status: { type: String, enum: ["active", "blocked"], required: true, default: "active" },
		role: { type: String, enum: ["user", "admin"], required: true, default: "user" },
		email: { type: String, required: true },
		emailVerified: { type: Boolean, required: true, default: false },
		image: { type: String, default: null },
	},
	{
		collection: "authUsers",
		timestamps: true,
		versionKey: false,
	},
);

authUserSchema.index({ email: 1 }, { unique: true });

export type AuthUser = InferSchemaType<typeof authUserSchema>;
export type AuthUserDocument = HydratedDocument<AuthUser>;

const AuthUserModel =
	(models.AuthUser as mongoose.Model<AuthUser> | undefined) ?? model<AuthUser>("AuthUser", authUserSchema);

export default AuthUserModel;
