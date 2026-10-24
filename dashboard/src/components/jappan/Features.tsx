import { Card } from "@febkosq8/arc";
import FunCommand1 from "@jappan/assets/jappan/FunCommand1.png";
import FunCommand2 from "@jappan/assets/jappan/FunCommand2.png";
import Level1 from "@jappan/assets/jappan/Level1.png";
import Level2 from "@jappan/assets/jappan/Level2.png";
import Mod1 from "@jappan/assets/jappan/Mod1.png";
import Mod2 from "@jappan/assets/jappan/Mod2.png";
import Mod3 from "@jappan/assets/jappan/Mod3.png";
import MusicPlay1 from "@jappan/assets/jappan/MusicPlay1.png";
import MusicPlay2 from "@jappan/assets/jappan/MusicPlay2.png";
import { FiActivity, FiLayers, FiMusic, FiShield, FiSmile } from "react-icons/fi";

const featureItems = [
	{
		title: "Music Playback",
		icon: <FiMusic />,
		img: [
			{ img: MusicPlay1, title: "Set your playlist with an easy-to-remember name" },
			{ img: MusicPlay2, title: "Play your playlist using its name in any server" },
		],
	},
	{
		title: "Fun Commands",
		icon: <FiSmile />,
		img: [
			{ img: FunCommand1, title: "Clone a user and make them say something you choose" },
			{ img: FunCommand2, title: "Pick from a refined selection of audio clips" },
		],
	},
	{
		title: "Leveling System",
		icon: <FiActivity />,
		img: [
			{ img: Level1, title: "See who is active in your server" },
			{ img: Level2, title: "Level up as you interact" },
		],
	},
	{
		title: "Moderation Tools",
		icon: <FiShield />,
		img: [
			{ img: Mod1, title: "Audit events" },
			{ img: Mod2, title: "Clear messages" },
			{ img: Mod3, title: "Member join and leave announcements" },
		],
	},
];

export default function Features() {
	return (
		<section id="features" className="scroll-mt-20 border-y border-border bg-muted/30 px-4 py-20 sm:px-6 lg:py-24">
			<div className="mx-auto max-w-6xl">
				<div className="mb-10 max-w-2xl">
					<p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Everything in one bot</p>
					<h2 className="typography-heading-2 flex items-center gap-3 text-4xl">
						Features <FiLayers className="size-8 text-primary" aria-hidden="true" />
					</h2>
					<p className="mt-3 text-lg text-muted-foreground">
						Tools that help your community have fun, stay active, and keep things running smoothly.
					</p>
				</div>
				<div className="grid gap-5 md:grid-cols-2">
					{featureItems.map((category) => (
						<Card className="flex h-full flex-col p-5 sm:p-6" key={category.title}>
							<Card.Header className="flex-row items-center gap-3 pb-4 text-xl font-semibold">
								<span
									className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
									aria-hidden="true"
								>
									{category.icon}
								</span>
								<span>{category.title}</span>
							</Card.Header>
							<Card.Content className="flex flex-1 flex-col gap-4 pt-4">
								{category.img.map((image) => (
									<div
										className="grid gap-4 border-b border-border/70 pb-4 last:border-0 last:pb-0 sm:grid-cols-[0.8fr_1.2fr] sm:items-center"
										key={image.title}
									>
										<p className="text-sm leading-6 text-muted-foreground">{image.title}</p>
										<img
											className="w-full rounded-md border border-border object-cover"
											src={image.img}
											alt={`${category.title}: ${image.title}`}
											loading="lazy"
										/>
									</div>
								))}
							</Card.Content>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}
