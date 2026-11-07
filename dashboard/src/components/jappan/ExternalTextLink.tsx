import { TextLink } from "@febkosq8/arc";
import { FiExternalLink } from "react-icons/fi";

export default function ExternalTextLink({ href, text }: { href: string; text: string }) {
	return (
		<span>
			<TextLink href={href} text={text} aria-label={`${text} (opens in a new tab)`} />
			<FiExternalLink className="ml-1 inline-block size-3.5 align-baseline text-primary" aria-hidden="true" />
		</span>
	);
}
