import mongoose, { type HydratedDocument, type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const authVerificationSchema = new Schema(
	{
		identifier: { type: String, required: true },
		value: { type: String, required: true, select: false },
		expiresAt: { type: Date, required: true },
	},
	{
		collection: "authVerifications",
		timestamps: true,
		versionKey: false,
	},
);

authVerificationSchema.index({ identifier: 1 });
authVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthVerification = InferSchemaType<typeof authVerificationSchema>;
export type AuthVerificationDocument = HydratedDocument<AuthVerification>;

const AuthVerificationModel =
	(models.AuthVerification as mongoose.Model<AuthVerification> | undefined) ??
	model<AuthVerification>("AuthVerification", authVerificationSchema);

export default AuthVerificationModel;
