import { z } from "zod";

import { getBotVersion } from "../../helpers/utils.js";
import { defineRouter } from "../../helpers/route.js";
import type { RouteDefinition } from "../../helpers/route.js";
import healthRouter from "./health.js";

const aboutResponseSchema = z.object({
	version: z.string(),
	bootedAtMs: z.number(),
	bootedAtIso: z.iso.datetime(),
});

const publicRoutes: RouteDefinition[] = [
	{
		method: "get",
		path: "/about",
		tags: ["Public"],
		summary: "Bot version and process start time",
		errorMessage: "Something went wrong while returning bot information",
		responses: {
			200: {
				description: "Current bot version and process boot time as Unix milliseconds and ISO-8601",
				schema: aboutResponseSchema,
			},
		},
		handler: (_request, response) => {
			const bootedAtMs = Date.now() - Math.floor(process.uptime() * 1000);
			const bootedAtIso = new Date(bootedAtMs).toISOString();
			return response.status(200).json({ version: getBotVersion(), bootedAtMs, bootedAtIso });
		},
	},
];

export default defineRouter("/public", publicRoutes, [healthRouter]);
