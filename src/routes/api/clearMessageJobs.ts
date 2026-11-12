import { z } from "zod";

import { getLinkedDiscordAccountId, requireSession } from "../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../helpers/route.js";
import { authorizeClearMessageJob } from "../../services/clearMessageJobs.js";
import type { AuthSession } from "../../services/auth.js";

const jobIdSchema = z.string().uuid();
const clearMessageJobSchema = z.object({
	jobId: z.string().uuid(),
	guildId: z.string(),
	guildName: z.string(),
	channelName: z.string(),
	selectedChannelId: z.string().nullable(),
	targetUserId: z.string().nullable(),
	textFilter: z.string().nullable(),
	status: z.enum(["running", "complete", "stopped", "failed"]),
	startedAtMs: z.number().int(),
	finishedAtMs: z.number().int().nullable(),
	messageLimit: z.number().int().nonnegative(),
	channelCount: z.number().int().nonnegative(),
	completedChannels: z.number().int().nonnegative(),
	currentChannelName: z.string().nullable(),
	scannedMessages: z.number().int().nonnegative(),
	matchedMessages: z.number().int().nonnegative(),
	messagesToDelete: z.number().int().nonnegative(),
	messagesProcessed: z.number().int().nonnegative(),
	deletedMessages: z.number().int().nonnegative(),
	failedMessages: z.number().int().nonnegative(),
	unprocessedMessages: z.number().int().nonnegative(),
	progressPercentage: z.number().min(0).max(100),
	timeLimitReached: z.boolean(),
	errors: z.array(z.string()),
	error: z.string().optional(),
});

export default defineRouter("/clear-jobs", [
	{
		method: "get",
		path: "/:jobId",
		tags: ["Guild"],
		summary: "Get message clear job progress",
		errorMessage: "Failed to get message clear job",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "jobId",
				in: "path",
				required: true,
				description: "Message clear job ID",
				schema: jobIdSchema,
			},
		],
		responses: {
			200: { description: "Current message clear job state", schema: clearMessageJobSchema },
			400: { description: "Invalid job ID", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Job access denied", schema: errorResponseSchema },
			404: { description: "Job not found", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get message clear job", schema: errorResponseSchema },
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
			const result = await authorizeClearMessageJob({
				jobId,
				discordUserId,
				isBotAdmin: session.user.role === "admin",
			});
			switch (result.status) {
				case "not_found":
					return response.status(404).json({ error: "Message clear job not found" });
				case "forbidden":
					return response.status(403).json({ error: "You cannot view this message clear job" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
				case "ok":
					return response.status(200).json(result.job);
			}
		},
	},
]);
