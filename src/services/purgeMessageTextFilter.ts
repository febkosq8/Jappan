import { RE2JS, RE2JSCompileException, RE2JSSyntaxException } from "re2js";

export const purgeMessageTextFilterMaxLength = 2000;
const maxRegexProgramSize = 1000;

export class PurgeMessageTextFilterError extends Error {}

export function createPurgeMessageTextFilter({
	text,
	regex = false,
	ignoreCase = false,
}: {
	text?: string;
	regex?: boolean;
	ignoreCase?: boolean;
}): { text: string | null; matches: (content: string) => boolean } {
	if (text && text.length > purgeMessageTextFilterMaxLength) {
		throw new PurgeMessageTextFilterError("Text filter must be 2000 characters or fewer.");
	}
	const filter = regex ? (text ?? "") : (text?.trim() ?? "");
	if (!filter) {
		if (regex) throw new PurgeMessageTextFilterError("Enter a regex pattern or turn off Regex.");
		return { text: null, matches: () => true };
	}
	if (!regex && !ignoreCase) {
		return { text: filter, matches: (content) => content.includes(filter) };
	}
	let pattern: RE2JS;
	try {
		pattern = RE2JS.compile(regex ? filter : RE2JS.quote(filter), ignoreCase ? RE2JS.CASE_INSENSITIVE : 0);
	} catch (error: unknown) {
		if (!(error instanceof RE2JSSyntaxException) && !(error instanceof RE2JSCompileException)) throw error;
		throw new PurgeMessageTextFilterError(
			"Invalid or unsupported regex. Lookarounds and backreferences are not supported.",
			{ cause: error },
		);
	}
	if (regex && pattern.programSize() > maxRegexProgramSize) {
		throw new PurgeMessageTextFilterError("This regex is too complex. Use a simpler pattern.");
	}
	return { text: filter, matches: (content) => pattern.matcher(content).find() };
}
