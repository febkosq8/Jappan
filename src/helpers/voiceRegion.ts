export function formatVoiceRegion(region: string): string {
	return region.replace(/-/g, " ").replace(/(^|\s)\S/gu, (initial) => initial.toUpperCase());
}
