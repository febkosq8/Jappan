import { Button } from "@febkosq8/arc";
import axios from "axios";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import LoadingIndicator from "./LoadingIndicator";

export function AccessRedirect({ status }: { status: 401 | 403 }) {
	const location = useLocation();
	return (
		<Navigate
			to={`/auth/error?error=${status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN"}`}
			replace
			state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }}
		/>
	);
}

export function accessErrorStatus(error: unknown): 401 | 403 | undefined {
	if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
		return error.response.status;
	}
	return undefined;
}

export default function AdminRoute() {
	const sessionQuery = useSessionQuery();

	if (sessionQuery.isPending) return <LoadingIndicator label="Checking session" />;
	if (sessionQuery.isError) {
		return (
			<main className="mx-auto w-full max-w-6xl px-4 py-10" role="alert">
				<p>Session unavailable.</p>
				<Button size="sm" variant="outline-primary" onClick={() => void sessionQuery.refetch()}>
					Retry
				</Button>
			</main>
		);
	}
	if (!sessionQuery.data) return <AccessRedirect status={401} />;
	if (!isAdminSession(sessionQuery.data)) return <AccessRedirect status={403} />;
	return <Outlet />;
}
