import { defineRouter, type RouterDefinition } from "../helpers/route.js";
import type { OpenApiOptions } from "../docs/openapi.js";
import adminRoutes from "./api/admin/index.js";
import authRouter from "./api/auth/auth.js";
import purgeMessageJobRoutes from "./api/purgeMessageJobs.js";
import guildRoutes from "./api/guilds/index.js";
import guildPurgeMessageRoutes from "./api/guilds/purgeMessages.js";
import playerRoutes from "./api/player/index.js";
import playlistRoutes from "./api/playlists/index.js";
import base from "./base.js";
import publicRoutes from "./public/index.js";

const v1 = defineRouter("/api/v1", [
	publicRoutes,
	adminRoutes,
	purgeMessageJobRoutes,
	guildPurgeMessageRoutes,
	guildRoutes,
	playerRoutes,
	playlistRoutes,
]);

export const routers: RouterDefinition[] = [v1, base];
// Auth is mounted separately (before body parsing) but must still be documented
export const documentedRouters: RouterDefinition[] = [authRouter, ...routers];
export const openApiOptions: OpenApiOptions = {
	securitySchemes: {
		sessionBearer: {
			type: "http",
			scheme: "bearer",
			description: "Better Auth bearer token from the set-auth-token response header.",
		},
	},
};
