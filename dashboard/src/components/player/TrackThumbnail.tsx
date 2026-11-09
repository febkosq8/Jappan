import type { PlayerTrack } from "@jappan/handlers/APIHandler";

export default function TrackThumbnail({ track, className }: { track: PlayerTrack; className: string }) {
	return track.thumbnailUrl ? (
		<img
			src={track.thumbnailUrl}
			alt=""
			referrerPolicy="no-referrer"
			loading="lazy"
			className={`${className} shrink-0 rounded-md object-cover`}
		/>
	) : (
		<div className={`${className} shrink-0 rounded-md bg-muted`} aria-hidden="true" />
	);
}
