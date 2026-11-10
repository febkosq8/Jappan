import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";

interface UserDisplayProps {
	id?: string;
	name: string;
	avatarUrl?: string | null;
	size?: "sm" | "md" | "lg" | "xl";
	showId?: boolean;
}

export default function UserDisplay({ id, name, avatarUrl, size = "sm", showId = true }: UserDisplayProps) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar name={name} image={avatarUrl} size={size} aria-hidden="true" />
			<div className="min-w-0">
				<p className="truncate font-medium">
					{id ? (
						<ExternalTextLink href={`https://discord.com/users/${encodeURIComponent(id)}`} text={name} />
					) : (
						name
					)}
				</p>
				{showId && id && <p className="break-all text-xs text-muted-foreground">{id}</p>}
			</div>
		</div>
	);
}
