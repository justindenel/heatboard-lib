import type { BracketStatus } from "@heatboard/core";
import { useBracketContext } from "../context";
import { ActionButton, useAdmin } from "./admin";
import { partProps, useBoardSettings } from "./settings";
import { ViewerDisplayControl } from "./ViewerDisplayControl";

type StatusLabel =
	| "publishBracket"
	| "unpublishBracket"
	| "validateBracket"
	| "unvalidateBracket";

// Running and finished follow the heats (the core refuses them by hand): only draft <-> ready and finished <-> validated are offered.
const TRANSITIONS: Record<
	BracketStatus,
	{ status: BracketStatus; label: StatusLabel }[]
> = {
	draft: [{ status: "published", label: "publishBracket" }],
	published: [{ status: "draft", label: "unpublishBracket" }],
	running: [],
	finished: [{ status: "validated", label: "validateBracket" }],
	validated: [{ status: "finished", label: "unvalidateBracket" }],
};

/** Bracket-wide controls: status transitions, visibility and reset. Reset asks for confirmation only inside a `Board`. */
export function BracketToolbar() {
	const { bracket } = useBracketContext();
	const settings = useBoardSettings();
	const { allowed } = useAdmin();
	const { labels } = settings;
	const root = partProps(settings, "toolbar", "hb-toolbar");

	const transitions = allowed("bracketStatus")
		? TRANSITIONS[bracket.status]
		: [];
	const visibility = allowed("visibility");
	const reset = allowed("reset");
	const viewerDisplay =
		allowed("viewerDisplay") && bracket.scoring !== undefined;
	if (transitions.length === 0 && !visibility && !reset && !viewerDisplay) {
		return null;
	}

	const isPublic = bracket.visibility === "public";
	return (
		<div
			className={root.className}
			style={root.style}
			role="group"
			aria-label={bracket.name}
		>
			{transitions.map(({ status, label }) => (
				<ActionButton
					key={status}
					action={{ type: "setBracketStatus", status }}
				>
					{labels[label]}
				</ActionButton>
			))}
			{visibility && (
				<ActionButton
					action={{
						type: "setVisibility",
						visibility: isPublic ? "private" : "public",
					}}
				>
					{isPublic ? labels.makePrivate : labels.makePublic}
				</ActionButton>
			)}
			{viewerDisplay && <ViewerDisplayControl />}
			{reset && (
				<ActionButton action={{ type: "reset" }} danger>
					{labels.resetBracket}
				</ActionButton>
			)}
		</div>
	);
}
