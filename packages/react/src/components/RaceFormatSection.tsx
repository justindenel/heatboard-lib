import type { ReactNode } from "react";
import { Heading } from "./Heading";
import { cx, partProps, useBoardSettings } from "./settings";

/** Titled block of the race format panel, badged "Modified" or with its number of errors. */
export function RaceFormatSection(props: {
	title: string;
	changed?: boolean;
	errors?: number;
	children: ReactNode;
}) {
	const settings = useBoardSettings();
	const { labels } = settings;
	const title = partProps(
		settings,
		"inspectorSectionTitle",
		"hb-format-section__title",
	);
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	const errors = props.errors ?? 0;
	return (
		<section className={inner("hb-format-section")}>
			<div className={inner("hb-format-section__head")}>
				<Heading depth={1} className={title.className} style={title.style}>
					{props.title}
				</Heading>
				{errors > 0 ? (
					<span className={inner("hb-format-tag hb-format-tag--error")}>
						{labels.raceFormatEditor.errors(errors)}
					</span>
				) : (
					props.changed === true && (
						<span className={inner("hb-format-tag")}>
							{labels.raceFormatEditor.modified}
						</span>
					)
				)}
			</div>
			{props.children}
		</section>
	);
}
