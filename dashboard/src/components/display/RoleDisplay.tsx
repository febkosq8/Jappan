import { FiShield } from "react-icons/fi";

interface RoleDisplayProps {
	id: string;
	name: string | null;
}

export default function RoleDisplay({ id, name }: RoleDisplayProps) {
	return (
		<span className="inline-flex min-w-0 items-start gap-2">
			<FiShield className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span className="min-w-0">
				<span className="block wrap-break-word font-medium">{name ?? "Unavailable role"}</span>
				<span className="block break-all text-xs text-muted-foreground">{id}</span>
			</span>
		</span>
	);
}
