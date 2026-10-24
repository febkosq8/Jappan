import febProfile from "@jappan/assets/jappan/febkosq8Profile.gif";
import inconProfile from "@jappan/assets/jappan/inconsistentProfile.jpg";
import rinProfile from "@jappan/assets/jappan/rinzaiProfile.jpeg";
import { Card, PillLink } from "@febkosq8/arc";
import { FiUsers } from "react-icons/fi";

const teamMembers = [
	{ role: "Lead Developer", name: "febkosq8", image: febProfile, href: "https://www.febkosq8.me" },
	{ role: "Senior Developer", name: "rinzai", image: rinProfile, href: "https://www.rinzai.dev" },
	{
		role: "QA Tester",
		name: "akhilpv2334768",
		image: inconProfile,
		href: "https://discord.com/users/290033269821407235",
	},
];

export default function Team() {
	return (
		<section id="team" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-24">
			<div className="mx-auto max-w-6xl">
				<div className="mb-10">
					<p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">The people behind the bot</p>
					<h2 className="typography-heading-2 flex items-center gap-3 text-4xl">
						Team <FiUsers className="size-8 text-primary" aria-hidden="true" />
					</h2>
				</div>
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{teamMembers.map((member) => (
						<Card className="flex flex-col items-center gap-5 p-6 text-center" key={member.name}>
							<Card.Content className="flex w-full flex-col items-center gap-5">
								<img
									className="size-36 rounded-full object-cover ring-4 ring-primary/10"
									src={member.image}
									alt={`${member.name} profile`}
									loading="lazy"
								/>
								<div>
									<p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{member.role}</p>
									<p className="mt-1 text-xl font-semibold text-card-foreground">{member.name}</p>
								</div>
								<PillLink
									className="w-full"
									variant="outline"
									href={member.href}
									target="_blank"
									rel="noreferrer"
								>
									View profile
								</PillLink>
							</Card.Content>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}
