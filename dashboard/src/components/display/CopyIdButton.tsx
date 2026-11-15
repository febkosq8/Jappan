import { Button } from "@febkosq8/arc";
import { FiCopy } from "react-icons/fi";
import { toast } from "sonner";

export default function CopyIdButton({ id, label }: { id: string | null | undefined; label: string }) {
	const copyId = async () => {
		if (!id) {
			toast.error(`${label} is unavailable.`);
			return;
		}

		try {
			await navigator.clipboard.writeText(id);
			toast.success(`${label} copied: ${id}`);
		} catch {
			toast.error(`Could not copy ${label.toLowerCase()}. Please try again.`);
		}
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			className="shrink-0"
			aria-label={id ? `Copy ${label} ${id}` : `${label} unavailable`}
			title={id ? `Copy ${label}` : `${label} unavailable`}
			disabled={!id}
			onClick={() => void copyId()}
		>
			<FiCopy className="size-3" aria-hidden="true" />
		</Button>
	);
}
