const EMPTY_TEXT = "No text content.";
const TRUNCATION_MARKER = "\n...\n";

export function trimString(text: string, length: number): string {
	if (!text.trim()) {
		return EMPTY_TEXT;
	}

	if (text.length <= length) {
		return text;
	}

	const availableTextLength = Math.max(0, length - TRUNCATION_MARKER.length);
	const firstHalfLength = Math.ceil(availableTextLength / 2);
	const lastHalfLength = Math.floor(availableTextLength / 2);

	return `${text.slice(0, firstHalfLength)}${TRUNCATION_MARKER}${lastHalfLength ? text.slice(-lastHalfLength) : ""}`;
}

export function splitString(text: string, length: number): string[] {
	if (!text) {
		return [""];
	}

	const chunks: string[] = [];
	for (let start = 0; start < text.length; start += length) {
		chunks.push(text.slice(start, start + length));
	}
	return chunks;
}
