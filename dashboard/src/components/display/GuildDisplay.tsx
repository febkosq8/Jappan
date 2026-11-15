import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";
import CopyIdButton from "@jappan/components/display/CopyIdButton";

interface GuildDisplayProps {
	id: string;
	name: string;
	icon?: string | null;
}

export default function GuildDisplay({ id, name, icon }: GuildDisplayProps) {
	return (
		<div className="flex min-w-0 items-center gap-4">
			<Avatar name={name} image={icon} size="lg" aria-hidden="true" />
			<div className="min-w-0">
				<h2 className="wrap-break-word text-xl font-bold">
					<ExternalTextLink href={`https://discord.com/channels/${encodeURIComponent(id)}`} text={name} />
				</h2>
				<p className="flex items-center gap-1 text-sm text-muted-foreground">
					<span className="min-w-0 break-all">{id}</span>
					<CopyIdButton id={id} label="Guild ID" />
				</p>
			</div>
		</div>
	);
}
