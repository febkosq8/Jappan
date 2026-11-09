import type { PlayerTrack } from "@jappan/handlers/APIHandler";

export default function TrackTitle({ track }: { track: PlayerTrack }) {
	// Plain anchor: the session ID is part of this page's URL, so never leak it through the Referer header.
	return track.url ? (
		<a
			href={track.url}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-primary underline-offset-2 hover:underline"
		>
			{track.title}
		</a>
	) : (
		<span className="font-medium">{track.title}</span>
	);
}
