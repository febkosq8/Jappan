import { z } from "zod";

const guildBaseSchema = z.object({
	id: z.string(),
	name: z.string(),
	isActiveMember: z.boolean(),
	icon: z.string().nullable().optional(),
	memberCount: z.number().int().optional(),
	channelCount: z.number().int().nonnegative().optional(),
	createdAt: z.number().int().optional(),
	description: z.string().nullable().optional(),
	joinedTimestamp: z.number().int().optional(),
	systemChannel: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
	permissions: z.array(z.string()).optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: z.object({ userId: z.string(), avatarUrl: z.string(), username: z.string() }).optional(),
});

export const guildSchema = z.object({
	id: z.string(),
	name: z.string(),
	icon: z.string().nullable().optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: z.object({ userId: z.string(), avatarUrl: z.string(), username: z.string() }).optional(),
});

export const adminGuildSchema = guildBaseSchema.extend({
	guildCommandDeploymentState: z
		.object({ deployed: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
		.optional(),
});

const preferenceEntitySchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();

export const guildPreferencesSchema = z.object({
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

const guildDetailsFields = {
	discoveredAt: z.number().int().nullable(),
	preferences: guildPreferencesSchema,
};

export const guildDetailsSchema = guildSchema.extend(guildDetailsFields);

export const adminGuildDetailsSchema = adminGuildSchema.extend(guildDetailsFields);

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
