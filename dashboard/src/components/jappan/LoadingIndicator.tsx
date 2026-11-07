import { GridLoader, type GridLoaderCellShape } from "@febkosq8/arc";

const colors = ["var(--color-primary)", "var(--color-success)", "var(--color-warning)", "var(--color-destructive)"];
const shapes: GridLoaderCellShape[] = ["circle", "square", "diamond", "star", "heart", "hexagon"];
const symbols = [
	"*",
	"+",
	"×",
	"÷",
	"=",
	"~",
	"!",
	"?",
	"@",
	"#",
	"%",
	"&",
	"§",
	"¶",
	"※",
	"◇",
	"◆",
	"○",
	"●",
	"△",
	"▽",
	"□",
	"■",
	"♠",
	"♣",
	"♦",
	"♤",
	"♧",
	"♢",
	"♪",
	"♫",
	"∴",
	"∵",
];

export default function LoadingIndicator({
	label,
	inline = false,
	decorative = false,
	size = inline ? 24 : 100,
}: {
	label: string;
	inline?: boolean;
	decorative?: boolean;
	size?: number;
}) {
	const loader = (
		<GridLoader
			label={label}
			colors={colors}
			columns={3}
			maxSize={24}
			rows={3}
			shape="mixed"
			shapes={shapes}
			size={size}
			symbols={symbols}
			aria-hidden={decorative || undefined}
		/>
	);

	return inline ? loader : <div className="flex w-full items-center justify-center py-12">{loader}</div>;
}
