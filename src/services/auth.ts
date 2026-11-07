import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError } from "better-auth/api";
import mongoose from "mongoose";

import AuthAccountModel from "../models/authAccount.js";
import AuthSessionModel from "../models/authSession.js";
import AuthUserModel from "../models/authUser.js";
import AuthVerificationModel from "../models/authVerification.js";
import { getConfig } from "./config.js";
import DatabaseManager from "./database.js";
import { logger } from "./logger.js";

function createAuth() {
	const config = getConfig();
	return betterAuth({
		appName: "Jappan",
		baseURL: config.BACKEND_URL,
		basePath: "/api/v1/auth",
		secret: config.AUTH_SECRET,
		trustedOrigins: [...config.ALLOWED_ORIGINS],
		onAPIError: { errorURL: new URL("/auth/error", config.BOT_WEBSITE).href },
		database: mongodbAdapter(DatabaseManager.getDatabaseInstance()),
		socialProviders: {
			discord: {
				clientId: config.AUTH_DISCORD_CLIENT_ID,
				clientSecret: config.AUTH_DISCORD_CLIENT_SECRET,
				scope: ["identify", "email"],
				overrideUserInfoOnSignIn: true,
				mapProfileToUser: (profile) => {
					if (typeof profile.username !== "string" || !profile.username.trim()) {
						throw new Error("Discord profile does not include a username");
					}
					if (typeof profile.id !== "string" || !profile.id) {
						throw new Error("Discord profile does not include an account ID");
					}
					return { username: profile.username, discordAccountId: profile.id };
				},
			},
		},
		user: {
			modelName: AuthUserModel.collection.name,
			additionalFields: {
				username: { type: "string", required: false },
				discordAccountId: { type: "string", required: false, returned: false },
				status: { type: "string", required: false, defaultValue: "active", input: false },
				role: { type: "string", required: false, defaultValue: "user", input: false },
			},
		},
		session: {
			modelName: AuthSessionModel.collection.name,
			expiresIn: 30 * 60,
			updateAge: 20 * 60,
			freshAge: 5 * 60,
			cookieCache: { enabled: false },
		},
		account: {
			modelName: AuthAccountModel.collection.name,
			encryptOAuthTokens: true,
			storeStateStrategy: "database",
			additionalFields: { username: { type: "string", required: false, input: false } },
		},
		databaseHooks: {
			user: {
				update: {
					before: async (user, context) => {
						if (("username" in user || "discordAccountId" in user) && context?.path !== "/callback/:id") {
							throw new APIError("FORBIDDEN", {
								message: "Discord usernames can only be updated by Discord",
							});
						}
					},
				},
			},
			session: {
				create: {
					before: async (session, context) => {
						const userId = new mongoose.Types.ObjectId(session.userId);
						const user = await AuthUserModel.findById(userId)
							.select({ username: 1, discordAccountId: 1, status: 1 })
							.lean();
						if (!user) {
							throw new Error("User was not found while creating an authentication session");
						}
						if (user.status === "blocked") {
							throw new APIError("FORBIDDEN", {
								code: "USER_BLOCKED",
								message: "This account is blocked",
							});
						}
						if (context?.path === "/callback/:id") {
							if (!user?.username || !user.discordAccountId) {
								throw new Error(
									"Discord username or account ID is missing from the authenticated user",
								);
							}
							const result = await AuthAccountModel.updateOne(
								{ userId, providerId: "discord", accountId: user.discordAccountId },
								{ $set: { username: user.username } },
							);
							if (result.matchedCount !== 1) {
								throw new Error("Discord account was not found while synchronizing username");
							}
							const role = config.ADMIN_USER_IDS.includes(user.discordAccountId) ? "admin" : "user";
							const updatedUser = await AuthUserModel.updateOne({ _id: userId }, { $set: { role } });
							if (updatedUser.matchedCount !== 1) {
								throw new Error("User was not found while synchronizing role");
							}
						}
						await AuthSessionModel.deleteMany({ userId });
					},
				},
				delete: {
					after: async (session, context) => {
						if (context?.path !== "/sign-out") return;
						await AuthSessionModel.deleteMany({ userId: new mongoose.Types.ObjectId(session.userId) });
					},
				},
			},
		},
		verification: { modelName: AuthVerificationModel.collection.name },
		advanced: { cookiePrefix: "jappan" },
		logger: {
			level: "info",
			log: (level, message, ...args) => {
				const errors = args.filter((arg): arg is Error => arg instanceof Error).map((error) => error.message);
				logger[level]("HTTP", `Better Auth: ${message}`, errors.length ? { errors } : undefined);
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

let auth: Auth | undefined;

export async function initializeAuth(): Promise<void> {
	const adminAccounts = await AuthAccountModel.find({
		providerId: "discord",
		accountId: { $in: getConfig("ADMIN_USER_IDS") },
	})
		.select({ userId: 1 })
		.lean();
	const adminUserIds = adminAccounts.map((account) => account.userId);
	await AuthUserModel.updateMany({ _id: { $nin: adminUserIds }, role: { $ne: "user" } }, { $set: { role: "user" } });
	await AuthUserModel.updateMany({ _id: { $in: adminUserIds }, role: { $ne: "admin" } }, { $set: { role: "admin" } });
	const instance = createAuth();
	await instance.$context;
	auth = instance;
	logger.info("HTTP", "Dashboard authentication initialized");
}

export function getAuth(): Auth | undefined {
	if (!DatabaseManager.getDatabaseStatus() || !auth) {
		return undefined;
	}
	return auth;
}
