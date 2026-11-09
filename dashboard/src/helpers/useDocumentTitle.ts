import { useEffect } from "react";

const APP_NAME = "Jappan";

/**
 * Builds a tab title from the most specific part first, so a truncated tab still says what the page is:
 * `formatTitle("View Guild: 123", "Admin")` gives "View Guild: 123 - Admin - Jappan".
 */
export function formatTitle(page: string, ...sections: string[]): string {
	return [page, ...sections, APP_NAME].join(" - ");
}

/** Sets the browser tab title while the page is shown and updates it whenever `title` changes. */
export default function useDocumentTitle(title: string): void {
	useEffect(() => {
		document.title = title;
	}, [title]);
}
