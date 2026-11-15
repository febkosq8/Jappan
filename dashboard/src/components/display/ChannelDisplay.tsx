import ExternalTextLink from "@jappan/components/ExternalTextLink";
import CopyIdButton from "@jappan/components/display/CopyIdButton";

interface ChannelDisplayProps {
	guildId: string;
	id: string;
	name: string;
	showId?: boolean;
}

export default function ChannelDisplay({ guildId, id, name, showId = true }: ChannelDisplayProps) {
	return (
		<span className="inline-flex min-w-0 flex-col">
			<span className="wrap-break-word leading-tight">
				<ExternalTextLink
					href={`https://discord.com/channels/${encodeURIComponent(guildId)}/${encodeURIComponent(id)}`}
					text={name}
				/>
			</span>
			{showId && (
				<span className="inline-flex max-w-full items-center gap-1 text-xs leading-tight text-muted-foreground">
					<span className="min-w-0 break-all">{id}</span>
					<CopyIdButton id={id} label="Channel ID" />
				</span>
			)}
		</span>
	);
}
