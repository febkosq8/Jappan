import { z } from "zod";

import { isBotConnected } from "../bot.js";
import { defineRouter } from "../helpers/route.js";
import { isDatabaseConnected } from "../services/database.js";
import { isPlayerAvailable } from "../services/player.js";

const serviceHealthSchema = z.object({ healthy: z.boolean() });

export default defineRouter("/public/health", [
	{
		method: "get",
		path: "/db",
		tags: ["Health"],
		summary: "Database health",
		errorMessage: "Something went wrong while returning database health check",
		responses: { 200: { description: "Database health status", schema: serviceHealthSchema } },
		handler: (_request, response) => response.status(200).json({ healthy: isDatabaseConnected() }),
	},
	{
		method: "get",
		path: "/discord",
		tags: ["Health"],
		summary: "Discord health",
		errorMessage: "Something went wrong while returning discord health check",
		responses: { 200: { description: "Discord health status", schema: serviceHealthSchema } },
		handler: (_request, response) => response.status(200).json({ healthy: isBotConnected() }),
	},
	{
		method: "get",
		path: "/player",
		tags: ["Health"],
		summary: "Player health",
		errorMessage: "Something went wrong while returning player health check",
		responses: { 200: { description: "Player health status", schema: serviceHealthSchema } },
		handler: (_request, response) => response.status(200).json({ healthy: isPlayerAvailable() }),
	},
	{
		method: "get",
		path: "/",
		tags: ["Health"],
		summary: "Overall service health",
		errorMessage: "Something went wrong while returning health check",
		responses: {
			200: {
				description: "Overall health status",
				schema: z.object({
					healthy: z.boolean(),
					services: z.object({ db: z.boolean(), discord: z.boolean(), player: z.boolean() }),
				}),
			},
		},
		handler: (_request, response) => {
			const services = {
				db: isDatabaseConnected(),
				discord: isBotConnected(),
				player: isPlayerAvailable(),
			};
			const healthy = Object.values(services).every(Boolean);
			return response.status(200).json({ healthy, services });
		},
	},
]);
