import { defineRouter, type RouterDefinition } from "../helpers/route.js";
import type { OpenApiOptions } from "../docs/openapi.js";
import authRouter from "./api/auth/auth.js";
import base from "./base.js";
import publicRoutes from "./public/index.js";

const v1 = defineRouter("/api/v1", [publicRoutes]);

export const routers: RouterDefinition[] = [v1, base];
// Auth is mounted separately (before body parsing) but must still be documented
export const documentedRouters: RouterDefinition[] = [authRouter, ...routers];
export const openApiOptions: OpenApiOptions = {
	securitySchemes: {
		sessionCookie: {
			type: "apiKey",
			in: "cookie",
			name: "jappan.session_token",
			description: "Better Auth session cookie; HTTPS uses the __Secure- prefix.",
		},
	},
};
