import { Button } from "@febkosq8/arc";
import { FiTag } from "react-icons/fi";

import CopyIdButton from "@jappan/components/display/CopyIdButton";

interface RoleDisplayProps {
	id: string;
	name: string | null;
	color?: string | null;
	showId?: boolean;
	onSelect?: () => void;
}

export default function RoleDisplay({ id, name, color, showId = true, onSelect }: RoleDisplayProps) {
	if (onSelect) {
		return (
			<span className="inline-flex min-w-0 flex-col">
				<Button
					type="button"
					size="xs"
					variant="outline-secondary"
					aria-haspopup="dialog"
					onClick={onSelect}
					className="min-w-0 gap-2 whitespace-normal text-left"
				>
					<FiTag
						className="size-4 shrink-0 text-muted-foreground"
						style={color ? { color } : undefined}
						aria-hidden="true"
					/>
					<span className="wrap-break-word">{name ?? "Unavailable role"}</span>
				</Button>
				{showId && (
					<span className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground">
						<span className="min-w-0 break-all">{id}</span>
						<CopyIdButton id={id} label="Role ID" />
					</span>
				)}
			</span>
		);
	}

	return (
		<span className="inline-flex min-w-0 items-start gap-2">
			<FiTag
				className="mt-1 size-4 shrink-0 text-muted-foreground"
				style={color ? { color } : undefined}
				aria-hidden="true"
			/>
			<span className="min-w-0">
				<span className="block wrap-break-word font-medium">{name ?? "Unavailable role"}</span>
				{showId && (
					<span className="flex items-center gap-1">
						<span className="min-w-0 break-all text-xs text-muted-foreground">{id}</span>
						<CopyIdButton id={id} label="Role ID" />
					</span>
				)}
			</span>
		</span>
	);
}
