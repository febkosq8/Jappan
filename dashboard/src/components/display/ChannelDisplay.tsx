import ExternalTextLink from "@jappan/components/ExternalTextLink";

interface ChannelDisplayProps {
	guildId: string;
	id: string;
	name: string;
	showId?: boolean;
}

export default function ChannelDisplay({ guildId, id, name, showId = true }: ChannelDisplayProps) {
	return (
		<span className="inline-flex min-w-0 flex-col">
			<span className="wrap-break-word">
				<ExternalTextLink
					href={`https://discord.com/channels/${encodeURIComponent(guildId)}/${encodeURIComponent(id)}`}
					text={name}
				/>
			</span>
			{showId && <span className="break-all text-xs text-muted-foreground">{id}</span>}
		</span>
	);
}
