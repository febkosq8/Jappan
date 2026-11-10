import { Avatar } from "@febkosq8/arc";

import ExternalTextLink from "@jappan/components/ExternalTextLink";

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
				<p className="break-all text-sm text-muted-foreground">{id}</p>
			</div>
		</div>
	);
}
