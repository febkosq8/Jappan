import { fromNodeHeaders } from "better-auth/node";
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";
import type { Request, RequestHandler } from "express";

import { getClient } from "../bot.js";
import { documentMiddlewareResponses } from "../helpers/middleware.js";
import AuthUserModel from "../models/authUser.js";
import { getAuth, type AuthSession } from "../services/auth.js";
import { logger } from "../services/logger.js";

const authenticationRequired = "Authentication required";
const authenticationUnavailable = "Authentication is unavailable";
const sessionValidationFailed = "Session validation failed";
const adminAccessRequired = "Admin access required";
const guildManagerAccessRequired = "Manage Server access required";
const invalidGuildId = "Invalid guild ID";
const authorizationValidationFailed = "Authorization validation failed";

type AuthorizationResult = "allowed" | "denied" | "invalidGuildId";
export type AuthorizationCheck = {
	(request: Request, session: AuthSession): AuthorizationResult | Promise<AuthorizationResult>;
	readonly accessRequired: string;
};

function authorizationCheck(
	accessRequired: string,
	check: (request: Request, session: AuthSession) => AuthorizationResult | Promise<AuthorizationResult>,
): AuthorizationCheck {
	return Object.assign(check, { accessRequired });
}

function isValidGuildId(guildId: unknown): guildId is string {
	return typeof guildId === "string" && /^\d{17,20}$/u.test(guildId);
}

export const requireSession: RequestHandler = documentMiddlewareResponses(
	async (request, response, next) => {
		const auth = getAuth();
		if (!auth) {
			response.status(503).json({ error: authenticationUnavailable });
			return;
		}
		try {
			const { response: session, headers } = await auth.api.getSession({
				headers: fromNodeHeaders(request.headers),
				returnHeaders: true,
			});
			for (const cookie of headers.getSetCookie()) {
				response.append("Set-Cookie", cookie);
			}
			if (!session) {
				response.status(401).json({ error: authenticationRequired });
				return;
			}
			response.locals.authSession = session;
			next();
		} catch (error: unknown) {
			logger.error("HTTP", "Session validation failed", {
				method: request.method,
				path: request.path,
				error: error instanceof Error ? error.message : String(error),
			});
			response.status(500).json({ error: sessionValidationFailed });
		}
	},
	{ 401: authenticationRequired, 500: sessionValidationFailed, 503: authenticationUnavailable },
);

export const requireValidGuildId: RequestHandler = documentMiddlewareResponses(
	(request, response, next) => {
		if (!isValidGuildId(request.params.guildId)) {
			response.status(400).json({ error: invalidGuildId });
			return;
		}
		next();
	},
	{ 400: invalidGuildId },
);

export function requireAnyAuthorization(
	checks: readonly [AuthorizationCheck, ...AuthorizationCheck[]],
	accessRequired: string = checks[0].accessRequired,
): RequestHandler {
	return documentMiddlewareResponses(
		async (request, response, next) => {
			const session: AuthSession | undefined = response.locals.authSession;
			if (!session) {
				response.status(401).json({ error: authenticationRequired });
				return;
			}
			if (session.user.status !== "active" && session.user.status !== undefined) {
				response.status(403).json({ error: accessRequired });
				return;
			}
			try {
				for (const check of checks) {
					const result = await check(request, session);
					if (result === "invalidGuildId") {
						response.status(400).json({ error: invalidGuildId });
						return;
					}
					if (result === "allowed") {
						next();
						return;
					}
				}
				response.status(403).json({ error: accessRequired });
			} catch (error: unknown) {
				logger.error("HTTP", "Authorization validation failed", {
					method: request.method,
					path: request.path,
					error: error instanceof Error ? error.message : String(error),
				});
				response.status(500).json({ error: authorizationValidationFailed });
			}
		},
		{
			400: invalidGuildId,
			401: authenticationRequired,
			403: accessRequired,
			500: authorizationValidationFailed,
		},
	);
}

export const isBotAdmin: AuthorizationCheck = authorizationCheck(adminAccessRequired, (_request, session) =>
	session.user.role === "admin" ? "allowed" : "denied",
);

export const isGuildManager: AuthorizationCheck = authorizationCheck(
	guildManagerAccessRequired,
	async (request, session) => {
		const { guildId } = request.params;
		if (!isValidGuildId(guildId)) return "invalidGuildId";

		const user = await AuthUserModel.findById(session.user.id).select({ discordAccountId: 1 }).exec();
		const guild = getClient().guilds.cache.get(guildId);
		if (!user?.discordAccountId || !guild?.available) return "denied";

		try {
			const member = await guild.members.fetch(user.discordAccountId);
			return member.permissions.has(PermissionFlagsBits.ManageGuild) ? "allowed" : "denied";
		} catch (error: unknown) {
			if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return "denied";
			throw error;
		}
	},
);

export const requireAdmin: RequestHandler = requireAnyAuthorization([isBotAdmin]);
export const requireGuildManager: RequestHandler = requireAnyAuthorization([isGuildManager]);
