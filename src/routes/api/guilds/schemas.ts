import { z } from "zod";

import { apiUserSchema } from "../schemas.js";

const guildBaseSchema = z.object({
	id: z.string(),
	name: z.string(),
	isActiveMember: z.boolean(),
	icon: z.string().nullable().optional(),
	memberCount: z.number().int().optional(),
	channelCount: z.number().int().nonnegative().optional(),
	createdTimestampMs: z.number().int().optional(),
	description: z.string().optional(),
	joinedTimestampMs: z.number().int().optional(),
	systemChannel: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
	permissions: z.array(z.string()).optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: apiUserSchema.optional(),
});

export const guildSchema = z.object({
	id: z.string(),
	name: z.string(),
	icon: z.string().nullable().optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: apiUserSchema.optional(),
});

export const adminGuildSchema = guildBaseSchema.extend({
	guildCommandDeploymentState: z
		.object({ deployed: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
		.optional(),
});

const preferenceEntitySchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();

export const servicePreferencesSchema = z.object({
	auditLog: z.object({
		enabled: z.boolean(),
		channel: preferenceEntitySchema,
		fullVerbosity: z.boolean(),
	}),
	leveling: z.object({
		enabled: z.boolean(),
		threshold: z.number().nullable(),
		role: preferenceEntitySchema,
	}),
	memberAnnouncements: z.object({
		joinEnabled: z.boolean(),
		leaveEnabled: z.boolean(),
		joinChannel: preferenceEntitySchema,
		leaveChannel: preferenceEntitySchema,
	}),
	warnings: z.object({
		timeoutThreshold: z.number().nullable(),
		timeoutDurationHours: z.number().nullable(),
		banThreshold: z.number().nullable(),
		auditChannel: preferenceEntitySchema,
	}),
});

export const guildDetailsSchema = guildSchema.extend({
	isActiveMember: z.boolean(),
	servicePreferences: servicePreferencesSchema,
	createdTimestampMs: z.number().int().optional(),
	joinedTimestampMs: z.number().int().optional(),
	permissions: z.array(z.string()).optional(),
});

export const guildLeaderboardEntrySchema = apiUserSchema.extend({
	rank: z.number().int().positive(),
	points: z.number().int().nonnegative(),
});

export const guildLeaderboardSchema = z.object({
	guildName: z.string(),
	guildIcon: z.string().url().nullable(),
	enabled: z.boolean(),
	reward: z
		.object({
			threshold: z.number().int().positive(),
			role: z.object({ id: z.string(), name: z.string().nullable() }),
		})
		.nullable(),
	items: z.array(guildLeaderboardEntrySchema),
	pagination: z.object({
		page: z.number().int().positive(),
		perPageLimit: z.number().int().min(0).max(1000),
		total: z.number().int().nonnegative(),
		totalPages: z.number().int().nonnegative(),
	}),
});

export const adminGuildDetailsSchema = adminGuildSchema.extend({
	servicePreferences: servicePreferencesSchema,
	discoveredTimestampMs: z.number().int().nullable(),
});

const snowflake = (label: string) => z.string().regex(/^\d{17,20}$/u, `Invalid ${label} ID`);
const threshold = z.number().int().min(1).max(1000);

export const auditLogPreferenceSchema = z.object({
	enabled: z.boolean(),
	channelId: snowflake("channel").nullable(),
	fullVerbosity: z.boolean(),
});

export const levelingPreferenceSchema = z.object({
	enabled: z.boolean(),
	threshold: threshold.nullable(),
	roleId: snowflake("role").nullable(),
});

export const memberAnnouncementsPreferenceSchema = z.object({
	joinEnabled: z.boolean(),
	joinChannelId: snowflake("channel").nullable(),
	leaveEnabled: z.boolean(),
	leaveChannelId: snowflake("channel").nullable(),
});

export const warningsPreferenceSchema = z.object({
	timeoutThreshold: threshold.nullable(),
	timeoutDurationHours: z
		.number()
		.int()
		.min(1)
		.max(24 * 28)
		.nullable(),
	banThreshold: threshold.nullable(),
	auditChannelId: snowflake("channel").nullable(),
});

export const warningMemberSchema = apiUserSchema.extend({ id: snowflake("user") });

export const warningMemberDetailsSchema = warningMemberSchema.extend({
	isGuildMember: z.boolean(),
	warningCount: z.number().int().nonnegative(),
	warnings: z.array(
		z.object({
			id: z.string().regex(/^[\da-f]{24}$/iu),
			issuedAt: z.string().datetime().nullable(),
			reason: z.string(),
			issuerId: snowflake("issuer").nullable(),
			issuer: apiUserSchema.extend({ id: snowflake("issuer") }).nullable(),
			thresholdAction: z.enum([
				"unknown",
				"pending",
				"none",
				"banned",
				"timed_out",
				"ban_failed",
				"timeout_failed",
			]),
		}),
	),
});

const guildMemberRoleAccessSchema = z.object({
	id: snowflake("role"),
	name: z.string(),
	position: z.number().int(),
	color: z.string().nullable(),
	managed: z.boolean(),
	permissions: z.array(z.string()),
});

export const guildMemberAccessSchema = z.object({
	member: warningMemberSchema.extend({
		bot: z.boolean(),
		joinedTimestampMs: z.number().int().nullable(),
		isOwner: z.boolean(),
		permissions: z.array(z.string()),
	}),
	roles: z.object({
		assigned: z.array(guildMemberRoleAccessSchema),
		manageable: z.array(guildMemberRoleAccessSchema),
		assignable: z.array(guildMemberRoleAccessSchema),
	}),
	permissionSources: z.array(
		z.object({
			permission: z.string(),
			roles: z.array(
				z.object({
					id: snowflake("role"),
					name: z.string(),
					color: z.string().nullable(),
				}),
			),
		}),
	),
	channels: z.array(
		z.object({
			id: snowflake("channel"),
			name: z.string(),
			typeName: z.string(),
			parentName: z.string().nullable(),
			canAccess: z.boolean().nullable(),
			permissions: z.array(z.string()).nullable(),
			overrides: z.array(
				z.object({
					targetType: z.enum(["member", "role"]),
					targetId: snowflake("override target"),
					targetName: z.string(),
					targetColor: z.string().nullable(),
					allow: z.array(z.string()),
					deny: z.array(z.string()),
				}),
			),
		}),
	),
});

export const warnedMemberSchema = apiUserSchema.extend({
	id: snowflake("user"),
	warningCount: z.number().int().min(1),
});

export const warningIssueSchema = z.object({
	reason: z.string().trim().max(500).optional(),
});

export const warningIdSchema = z.string().regex(/^[\da-f]{24}$/iu, "Invalid warning ID");

export const warningActionResultSchema = z.object({
	warningCount: z.number().int().nonnegative(),
	action: z.enum(["none", "banned", "timed_out", "ban_failed", "timeout_failed"]),
});

export const voiceRegionLockSchema = apiUserSchema.extend({
	id: snowflake("user"),
	channelId: snowflake("channel"),
	channelName: z.string(),
	region: z.string(),
	fallbackRegion: z.string().nullable(),
});

export const voiceRegionLocksSchema = z.object({
	locks: z.array(voiceRegionLockSchema),
	regions: z.array(z.string()),
});

export const voiceRegionLockInputSchema = z.object({
	userId: snowflake("user"),
	channelId: snowflake("channel"),
	region: z.string().trim().min(1).max(100),
});
