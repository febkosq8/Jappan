import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";
import CopyIdButton from "@jappan/components/display/CopyIdButton";

interface UserDisplayProps {
	id?: string;
	name: string;
	username?: string;
	avatarUrl?: string | null;
	size?: "sm" | "md" | "lg" | "xl";
	showId?: boolean;
	linkName?: boolean;
	keepFocusOnCopy?: boolean;
}

export default function UserDisplay({
	id,
	name,
	username,
	avatarUrl,
	size = "lg",
	showId = true,
	linkName = true,
	keepFocusOnCopy = false,
}: UserDisplayProps) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar name={name} image={avatarUrl} size={size} aria-hidden="true" />
			<div className="min-w-0">
				<p className="flex min-w-0 items-center gap-1 font-medium">
					<span className="min-w-0 truncate">
						{id && linkName ? (
							<ExternalTextLink
								href={`https://discord.com/users/${encodeURIComponent(id)}`}
								text={name}
							/>
						) : (
							name
						)}
					</span>
					{username && <span className="shrink-0 font-normal text-muted-foreground">(@{username})</span>}
				</p>
				{showId && id && (
					<p className="flex items-center gap-1">
						<span className="min-w-0 break-all text-xs text-muted-foreground">{id}</span>
						{keepFocusOnCopy ? (
							<span
								className="shrink-0"
								onPointerDown={(event) => {
									event.preventDefault();
									event.stopPropagation();
								}}
								onClick={(event) => event.stopPropagation()}
							>
								<CopyIdButton id={id} label="User ID" />
							</span>
						) : (
							<CopyIdButton id={id} label="User ID" />
						)}
					</p>
				)}
			</div>
		</div>
	);
}
