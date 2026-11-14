import { z } from "zod";

import { getLinkedDiscordAccountId, requireSession } from "../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../handlers/availability.js";
import { defineRouter, errorResponseSchema, type RouteDefinition } from "../../helpers/route.js";
import {
	authorizePurgeMessageJob,
	cancelPurgeMessageJob,
	PurgeMessageJobActionError,
	confirmPurgeMessageJob,
	preparePurgeMessageJob,
} from "../../services/purgeMessageJobs.js";
import { purgeMessagePreviewSchema } from "../../services/purgeMessagePreviews.js";
import type { AuthSession } from "../../services/auth.js";

const jobIdSchema = z.string().uuid();
const purgeMessageJobSchema = z.object({
	jobId: z.string().uuid(),
	version: z.number().int().nonnegative(),
	guildId: z.string(),
	guildName: z.string(),
	guildIcon: z.string().nullable(),
	channelName: z.string(),
	selectedChannelId: z.string().nullable(),
	targetUserId: z.string().nullable(),
	textFilter: z.string().nullable(),
	regex: z.boolean(),
	ignoreCase: z.boolean(),
	status: z.enum([
		"awaiting_preview",
		"previewing",
		"awaiting_confirmation",
		"running",
		"complete",
		"stopped",
		"failed",
		"cancelled",
	]),
	preview: purgeMessagePreviewSchema.nullable(),
	startedAtMs: z.number().int(),
	requestExpiresAtMs: z.number().int().describe("Confirmation deadline, 15 minutes after the job starts"),
	finishedAtMs: z.number().int().nullable(),
	serverTimestampMs: z
		.number()
		.int()
		.describe("Server clock at snapshot creation; use to anchor live elapsed time and preview expiry"),
	messageLimit: z.number().int().nonnegative(),
	channelCount: z.number().int().nonnegative(),
	completedChannels: z.number().int().nonnegative(),
	currentChannelId: z.string().nullable(),
	currentChannelName: z.string().nullable(),
	scannedMessages: z.number().int().nonnegative(),
	matchedMessages: z.number().int().nonnegative(),
	messagesToDelete: z.number().int().nonnegative(),
	messagesProcessed: z.number().int().nonnegative(),
	messageStatuses: z.record(z.string(), z.enum(["pending", "deleting", "deleted", "failed"])),
	deletedMessages: z.number().int().nonnegative(),
	failedMessages: z.number().int().nonnegative(),
	unprocessedMessages: z.number().int().nonnegative(),
	progressPercentage: z.number().min(0).max(100),
	timeLimitReached: z.boolean(),
	errors: z.array(z.string()),
	error: z.string().optional(),
});

const confirmSchema = z.object({ previewId: z.string().uuid(), confirm: z.literal(true) });
const actionRoutes: RouteDefinition[] = (["preview", "confirm", "cancel"] as const).map((action) => ({
	method: "post",
	path: `/:jobId/${action}`,
	tags: ["Guild"],
	summary:
		action === "preview"
			? "Prepare a purge job preview"
			: action === "confirm"
				? "Confirm the reviewed job preview"
				: "Cancel a purge job before deletion",
	errorMessage: `Failed to ${action} message purge job`,
	security: [{ sessionCookie: [] }],
	parameters: [{ name: "jobId", in: "path", required: true, schema: jobIdSchema }],
	...(action === "confirm"
		? { requestBody: { required: true, content: { "application/json": { schema: confirmSchema } } } }
		: {}),
	responses: {
		[action === "cancel" ? 200 : 202]: { description: "Updated job state", schema: purgeMessageJobSchema },
		400: { description: "Invalid request", schema: errorResponseSchema },
		401: { description: "Authentication required", schema: errorResponseSchema },
		403: { description: "Job creator and guild/channel access required", schema: errorResponseSchema },
		404: { description: "Job or channel not found", schema: errorResponseSchema },
		409: {
			description: "Job phase or preview changed, expired, or has no matching messages",
			schema: errorResponseSchema,
		},
		503: { description: "Guild or service unavailable", schema: errorResponseSchema },
		500: { description: "Job action failed", schema: errorResponseSchema },
	},
	middleware: [requireDatabase, requireDiscord, requireSession],
	errorHandler: (error, _request, response) => {
		response.status(error instanceof PurgeMessageJobActionError ? error.status : 500).json({
			error:
				error instanceof PurgeMessageJobActionError ? error.message : `Failed to ${action} message purge job`,
		});
	},
	handler: async (request, response) => {
		const jobId = jobIdSchema.safeParse(request.params.jobId);
		if (!jobId.success) return response.status(400).json({ error: "Invalid job ID" });
		const session: AuthSession | undefined = response.locals.authSession;
		if (!session) return response.status(401).json({ error: "Authentication required" });
		const discordUserId = await getLinkedDiscordAccountId(session, response);
		if (!discordUserId) return;
		const isBotAdmin = session.user.role === "admin";
		const access = await authorizePurgeMessageJob({
			jobId: jobId.data,
			discordUserId,
			isBotAdmin,
			requireCreator: true,
		});
		if (access.status === "not_found") return response.status(404).json({ error: "Message purge job not found" });
		if (access.status === "forbidden")
			return response
				.status(403)
				.json({ error: "Only the job creator with guild access can perform this action" });
		if (access.status === "unavailable") return response.status(503).json({ error: "Guild is unavailable" });
		if (action === "cancel") return response.status(200).json(cancelPurgeMessageJob(jobId.data));
		if (action === "preview")
			return response.status(202).json(await preparePurgeMessageJob({ jobId: jobId.data, isBotAdmin }));
		const body = confirmSchema.safeParse(request.body);
		if (!body.success) return response.status(400).json({ error: "Review the preview and confirm deletion" });
		return response
			.status(202)
			.json(await confirmPurgeMessageJob({ jobId: jobId.data, previewId: body.data.previewId, isBotAdmin }));
	},
}));

export default defineRouter("/purge-jobs", [
	...actionRoutes,
	{
		method: "get",
		path: "/:jobId",
		tags: ["Guild"],
		summary: "Get message purge job progress",
		errorMessage: "Failed to get message purge job",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "jobId",
				in: "path",
				required: true,
				description: "Message purge job ID",
				schema: jobIdSchema,
			},
		],
		responses: {
			200: { description: "Current message purge job state", schema: purgeMessageJobSchema },
			400: { description: "Invalid job ID", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Job access denied", schema: errorResponseSchema },
			404: { description: "Job not found", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get message purge job", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession],
		handler: async (request, response) => {
			const jobId = request.params.jobId;
			if (typeof jobId !== "string" || !jobIdSchema.safeParse(jobId).success) {
				return response.status(400).json({ error: "Invalid job ID" });
			}
			const session: AuthSession | undefined = response.locals.authSession;
			if (!session) return response.status(401).json({ error: "Authentication required" });
			const discordUserId = await getLinkedDiscordAccountId(session, response);
			if (!discordUserId) return;
			const result = await authorizePurgeMessageJob({
				jobId,
				discordUserId,
				isBotAdmin: session.user.role === "admin",
			});
			switch (result.status) {
				case "not_found":
					return response.status(404).json({ error: "Message purge job not found" });
				case "forbidden":
					return response.status(403).json({ error: "You cannot view this message purge job" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
				case "ok":
					return response.status(200).json(result.job);
			}
		},
	},
]);
