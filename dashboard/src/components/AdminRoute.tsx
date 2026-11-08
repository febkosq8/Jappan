import axios from "axios";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import { authErrorURL } from "@jappan/handlers/authRedirect";
import LoadingIndicator from "./LoadingIndicator";

export function AccessRedirect({ status }: { status: 401 | 403 }) {
	const { data: session } = useSessionQuery();
	return (
		<AuthErrorRedirect
			errorCode={status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN"}
			rejectedSessionId={session?.session.id}
		/>
	);
}

function AuthErrorRedirect({
	errorCode,
	rejectedSessionId,
}: {
	errorCode: "UNAUTHENTICATED" | "FORBIDDEN" | "SESSION_UNAVAILABLE";
	rejectedSessionId?: string;
}) {
	const location = useLocation();
	const returnTo = `${location.pathname}${location.search}${location.hash}`;
	const errorURL = new URL(authErrorURL(window.location.origin, returnTo, errorCode));
	return <Navigate to={`${errorURL.pathname}${errorURL.search}`} replace state={{ rejectedSessionId }} />;
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
	if (sessionQuery.isError)
		return <AuthErrorRedirect errorCode="SESSION_UNAVAILABLE" rejectedSessionId={sessionQuery.data?.session.id} />;
	if (!sessionQuery.data) return <AccessRedirect status={401} />;
	if (!isAdminSession(sessionQuery.data)) return <AccessRedirect status={403} />;
	return <Outlet />;
}

export function AuthRoute() {
	const sessionQuery = useSessionQuery();

	if (sessionQuery.isPending) return <LoadingIndicator label="Checking session" />;
	if (sessionQuery.isError)
		return <AuthErrorRedirect errorCode="SESSION_UNAVAILABLE" rejectedSessionId={sessionQuery.data?.session.id} />;
	if (!sessionQuery.data) return <AccessRedirect status={401} />;
	return <Outlet />;
}
