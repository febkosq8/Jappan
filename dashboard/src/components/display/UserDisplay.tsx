import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";
import CopyIdButton from "@jappan/components/display/CopyIdButton";

interface UserDisplayProps {
	id?: string;
	name: string;
	avatarUrl?: string | null;
	size?: "sm" | "md" | "lg" | "xl";
	showId?: boolean;
}

export default function UserDisplay({ id, name, avatarUrl, size = "lg", showId = true }: UserDisplayProps) {
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
				{showId && id && (
					<p className="flex items-center gap-1">
						<span className="min-w-0 break-all text-xs text-muted-foreground">{id}</span>
						<CopyIdButton id={id} label="User ID" />
					</p>
				)}
			</div>
		</div>
	);
}
