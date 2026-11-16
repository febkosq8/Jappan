import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";
import CopyIdButton from "@jappan/components/display/CopyIdButton";
import type { User } from "@jappan/handlers/APIHandler";

type UserDisplayProps = {
	size?: "xs" | "sm" | "md" | "lg" | "xl";
	showId?: boolean;
	linkUsername?: boolean;
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
	const { size = "lg", showId = true, linkUsername = true, keepFocusOnCopy = false } = props;
	const identity = props.user
		? {
				id: props.user.id,
				displayName: props.user.displayName,
				username: props.user.username,
				avatarUrl: props.user.avatarUrl,
			}
		: {
				id: props.id,
				displayName: props.name,
				username: props.username,
				avatarUrl: props.avatarUrl,
			};
	const avatarName = identity.displayName ?? `@${identity.username}`;

	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar name={avatarName} image={identity.avatarUrl} size={size} aria-hidden="true" />
			<div className="min-w-0">
				<p className="flex min-w-0 items-center gap-1 font-medium leading-tight">
					{identity.displayName !== null && (
						<span className="min-w-0 truncate">
							{identity.id && !identity.username && linkUsername ? (
								<ExternalTextLink
									href={`https://discord.com/users/${encodeURIComponent(identity.id)}`}
									text={identity.displayName}
								/>
							) : (
								identity.displayName
							)}
						</span>
					)}
					{identity.username && (
						<span className="shrink-0 font-normal text-muted-foreground">
							{identity.displayName !== null && "("}
							{identity.id && linkUsername ? (
								<ExternalTextLink
									href={`https://discord.com/users/${encodeURIComponent(identity.id)}`}
									text={`@${identity.username}`}
								/>
							) : (
								`@${identity.username}`
							)}
							{identity.displayName !== null && ")"}
						</span>
					)}
				</p>
				{showId && identity.id && (
					<p className="flex items-center gap-1 text-xs leading-tight">
						<span className="min-w-0 break-all text-muted-foreground">{identity.id}</span>
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
