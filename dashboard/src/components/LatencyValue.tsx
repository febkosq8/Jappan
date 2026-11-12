import { FiAlertCircle, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";

export default function LatencyValue({ value }: { value: number | null | undefined }) {
	if (value == null) {
		return <>Unavailable</>;
	}

	const status =
		value >= 800
			? { Icon: FiAlertCircle, color: "text-destructive", label: "High latency" }
			: value >= 300
				? { Icon: FiAlertTriangle, color: "text-warning", label: "Elevated latency" }
				: { Icon: FiCheckCircle, color: "text-success", label: "Low latency" };

	return (
		<span className="inline-flex items-center gap-2 whitespace-nowrap">
			<status.Icon className={`size-4 shrink-0 ${status.color}`} aria-hidden="true" />
			<span className="sr-only">{status.label}: </span>
			{value.toLocaleString()} ms
		</span>
	);
}
