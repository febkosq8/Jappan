export const playerSections = [
	{ id: "now-playing", label: "Now playing" },
	{ id: "queue", label: "Queue" },
];

export function readSectionFromHash(): string {
	const id = window.location.hash.slice(1);
	return playerSections.some((section) => section.id === id) ? id : playerSections[0].id;
}
