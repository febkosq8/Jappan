import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import { apiBaseURL } from "./APIHandler";

export const authClient = createAuthClient({
	baseURL: `${apiBaseURL}/api/v1/auth`,
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
