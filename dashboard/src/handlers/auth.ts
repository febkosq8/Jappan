import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import { apiBaseURL } from "./APIHandler";

export const authClient = createAuthClient({
	baseURL: apiBaseURL,
	fetchOptions: { credentials: "include" },
	plugins: [
		inferAdditionalFields({
			user: {
				username: { type: "string", required: false },
				status: { type: "string", required: false },
				role: { type: "string", required: false },
			},
		}),
	],
});
