import type { ReactNode } from "react";

import GuildDisplay from "@jappan/components/display/GuildDisplay";

interface GuildPageHeaderProps {
	title: string;
	guild?: { id: string; name: string; icon?: string | null };
	rightContent?: ReactNode;
}

export default function GuildPageHeader({ title, guild, rightContent }: GuildPageHeaderProps) {
	return (
		<>
			<h1 className="mb-5 typography-heading-2 text-3xl font-bold tracking-tight">{title}</h1>
			{guild && (
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
					<GuildDisplay id={guild.id} name={guild.name} icon={guild.icon} />
					{rightContent}
				</div>
			)}
		</>
	);
}
