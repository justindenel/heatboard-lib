import { viewerDisplayOf, type ViewerDisplay } from "@heatboard/core";
import { useBracketContext } from "../context";
import { useAdmin } from "./admin";
import { cx, partProps, useBoardSettings } from "./settings";

type Option = keyof ViewerDisplay;

/** Options of the spectator view that mean something for the scoring method. */
export function viewerDisplayOptions(
	method: "placings" | "points" | "rideMeans",
): Option[] {
	const options: Option[] = [];
	if (method !== "placings") options.push("typeSubtotals");
	options.push("rides");
	if (method === "placings") options.push("judgePlaces");
	options.push("judges");
	return options;
}

/** Popover of the toolbar where an admin picks what spectators see beyond rank and total. */
export function ViewerDisplayControl() {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { run, refusal, labels } = useAdmin();
	const root = partProps(settings, "viewerDisplay", "hb-viewer-display");
	if (!bracket.scoring) return null;
	const method = bracket.scoring.method;
	const current = viewerDisplayOf(bracket);
	const inner = (cls: string) => cx(!settings.unstyled && cls);
	return (
		<details className={root.className} style={root.style}>
			<summary className={inner("hb-button")}>{labels.viewerDisplay}</summary>
			<div className={inner("hb-viewer-display__options")}>
				{viewerDisplayOptions(method).map((option) => {
					const text =
						option === "rides" && method !== "rideMeans"
							? `${labels.viewerDisplayOptions[option]} (${labels.indicative})`
							: labels.viewerDisplayOptions[option];
					const reason = refusal({
						type: "setViewerDisplay",
						display: { [option]: !current[option] },
					});
					return (
						<label key={option} className={inner("hb-viewer-display__option")}>
							<input
								type="checkbox"
								checked={current[option]}
								disabled={reason !== undefined}
								onChange={(event) =>
									run({
										type: "setViewerDisplay",
										display: { [option]: event.target.checked },
									})
								}
							/>{" "}
							{text}
						</label>
					);
				})}
			</div>
		</details>
	);
}
