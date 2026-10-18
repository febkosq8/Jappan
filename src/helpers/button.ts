export function parseButtonCustomId(customId: string): Map<string, string> {
	return new Map(
		customId
			.split("|")
			.slice(1)
			.flatMap((payload) => payload.split(":"))
			.filter((field) => field.includes("#"))
			.map((field) => {
				const separatorIndex = field.indexOf("#");
				return [field.slice(0, separatorIndex), field.slice(separatorIndex + 1)] as const;
			}),
	);
}
