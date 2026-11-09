export function safeCallbackPath(value: string | null, origin: string): string | null {
	if (!value?.startsWith("/") || value.startsWith("//") || !URL.canParse(value, origin)) return null;

	const url = new URL(value, origin);
	if (url.origin !== origin || url.pathname.startsWith("//") || /^\/auth\/error\/?$/i.test(url.pathname)) return null;
	return `${url.pathname}${url.search}${url.hash}`;
}

export function authErrorURL(origin: string, callbackPath: string, error?: string): string {
	const url = new URL("/auth/error", origin);
	if (error) url.searchParams.set("error", error);
	url.searchParams.set("callbackURL", callbackPath);
	return url.href;
}
