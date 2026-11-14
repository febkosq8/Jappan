import { FiLink } from "react-icons/fi";

export default function GuildSectionLink({ id, label }: { id: string; label: string }) {
	return (
		<a
			href={`#${id}`}
			aria-label={`Link to ${label}`}
			title={`Link to ${label}`}
			className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<FiLink className="size-4" aria-hidden="true" />
		</a>
	);
}
