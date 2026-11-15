import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";
import CopyIdButton from "@jappan/components/display/CopyIdButton";
import type { User } from "@jappan/handlers/APIHandler";

type UserDisplayProps = {
	size?: "sm" | "md" | "lg" | "xl";
	showId?: boolean;
	linkName?: boolean;
	keepFocusOnCopy?: boolean;
} & (
	| { user: User }
	| {
			user?: undefined;
			id?: string;
			name: string;
			username?: string;
			avatarUrl?: string | null;
	  }
);

export default function UserDisplay(props: UserDisplayProps) {
	const { size = "lg", showId = true, linkName = true, keepFocusOnCopy = false } = props;
	const identity = props.user
		? {
				id: props.user.id,
				name: props.user.displayName,
				username: props.user.username,
				avatarUrl: props.user.avatarUrl,
			}
		: {
				id: props.id,
				name: props.name,
				username: props.username,
				avatarUrl: props.avatarUrl,
			};

	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar name={identity.name} image={identity.avatarUrl} size={size} aria-hidden="true" />
			<div className="min-w-0">
				<p className="flex min-w-0 items-center gap-1 font-medium">
					<span className="min-w-0 truncate">
						{identity.id && linkName ? (
							<ExternalTextLink
								href={`https://discord.com/users/${encodeURIComponent(identity.id)}`}
								text={identity.name}
							/>
						) : (
							identity.name
						)}
					</span>
					{identity.username && (
						<span className="shrink-0 font-normal text-muted-foreground">(@{identity.username})</span>
					)}
				</p>
				{showId && identity.id && (
					<p className="flex items-center gap-1">
						<span className="min-w-0 break-all text-xs text-muted-foreground">{identity.id}</span>
						{keepFocusOnCopy ? (
							<span
								className="shrink-0"
								onPointerDown={(event) => {
									event.preventDefault();
									event.stopPropagation();
								}}
								onClick={(event) => event.stopPropagation()}
							>
								<CopyIdButton id={identity.id} label="User ID" />
							</span>
						) : (
							<CopyIdButton id={identity.id} label="User ID" />
						)}
					</p>
				)}
			</div>
		</div>
	);
}
