import { useState } from "react";
import {
	exportFormat,
	parseFormat,
	type FormatIssue,
	type FormatSettings,
} from "@heatboard/core";
import { RefusableButton } from "./admin";
import { cx, partProps, useBoardSettings } from "./settings";

/**
 * Import and export of a format as JSON. `onLoad` receives a valid format and
 * may answer with a message when it cannot use it, which is shown as is.
 */
export function FormatJson(props: {
	/** Format to export; export is refused while absent. */
	format: FormatSettings | null;
	onLoad: (format: FormatSettings) => string | undefined;
	onExport?: ((json: string) => void) | undefined;
}) {
	const { format, onLoad, onExport } = props;
	const settings = useBoardSettings();
	const { labels } = settings;
	const [json, setJson] = useState<string | null>(null);
	const [issues, setIssues] = useState<string[]>([]);
	const button = partProps(settings, "button", "hb-button");
	const input = partProps(settings, "input", "hb-input");
	const inner = (cls: string) => cx(!settings.unstyled && cls);

	const issueText = (issue: FormatIssue) =>
		labels.formatProblem(issue.path, issue.message);

	const load = () => {
		const result = parseFormat(json ?? "");
		if (!result.ok) {
			setIssues(result.errors.map(issueText));
			return;
		}
		const refusal = onLoad(result.format);
		if (refusal !== undefined) {
			setIssues([refusal]);
			return;
		}
		setIssues([]);
		setJson(null);
	};

	const exportJson = () => {
		if (!format) return;
		const text = exportFormat(format);
		setIssues([]);
		setJson(text);
		onExport?.(text);
	};

	const close = () => {
		setJson(null);
		setIssues([]);
	};

	return (
		<div className={inner("hb-format__json")}>
			<div className={inner("hb-scoring__actions")}>
				<button
					type="button"
					className={button.className}
					style={button.style}
					onClick={() => {
						setIssues([]);
						setJson("");
					}}
				>
					{labels.formatImport}
				</button>
				<RefusableButton
					reason={format ? undefined : labels.formatEmpty}
					className={button.className}
					style={button.style}
					onPress={exportJson}
				>
					{labels.formatExport}
				</RefusableButton>
			</div>
			{json !== null && (
				<>
					<label className={inner("hb-scoring__field")}>
						<span>{labels.formatJson}</span>
						<textarea
							className={input.className}
							style={input.style}
							rows={10}
							spellCheck={false}
							value={json}
							onChange={(event) => setJson(event.target.value)}
						/>
					</label>
					{issues.length > 0 && (
						<ul className={inner("hb-scoring__problems")} role="alert">
							{issues.map((text, i) => (
								<li key={i}>{text}</li>
							))}
						</ul>
					)}
					<div className={inner("hb-scoring__actions")}>
						<button
							type="button"
							className={button.className}
							style={button.style}
							onClick={load}
						>
							{labels.formatLoadJson}
						</button>
						<button
							type="button"
							className={button.className}
							style={button.style}
							onClick={close}
						>
							{labels.formatCloseJson}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
