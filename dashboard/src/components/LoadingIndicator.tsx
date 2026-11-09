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
	rows = 3,
	columns = 3,
}: {
	label: string;
	inline?: boolean;
	decorative?: boolean;
	size?: number;
	rows?: number;
	columns?: number;
}) {
	const loader = (
		<GridLoader
			label={label}
			colors={colors}
			columns={columns}
			rows={rows}
			shape="mixed"
			shapes={shapes}
			size={size}
			style={{ height: size * (rows / Math.max(rows, columns)) }}
			symbols={symbols}
			aria-hidden={decorative || undefined}
		/>
	);

	return inline ? loader : <div className="flex w-full items-center justify-center py-12">{loader}</div>;
}
