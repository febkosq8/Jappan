import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { useQuery } from "@tanstack/react-query";

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

export const sessionQueryKey = ["session"] as const;

export async function fetchSession() {
	const { data, error } = await authClient.getSession();
	if (error) {
		throw new Error(error.message ?? "Session unavailable");
	}
	return data;
}

export function useSessionQuery() {
	return useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession });
}

export function isAdminSession(session: Awaited<ReturnType<typeof fetchSession>> | undefined): boolean {
	return session?.user.role === "admin" && (session.user.status === "active" || session.user.status === undefined);
}
