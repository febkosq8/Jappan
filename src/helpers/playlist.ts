const URL_LIKE_PATTERN = /^(?:[a-z][a-z\d+.-]*:|www\.|(?:[a-z\d-]+\.)+[a-z]{2,}(?:[/:?#]|$))/i;

export function isValidPlaylistQuery(query: string): boolean {
	if (!URL_LIKE_PATTERN.test(query)) return true;

	const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(query);
	const candidate = hasScheme ? query : `https://${query}`;
	return URL.canParse(candidate) && ["http:", "https:"].includes(new URL(candidate).protocol);
}
