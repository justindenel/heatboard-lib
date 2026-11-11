import { useState } from "react";
import {
	partProps,
	useBoardSettings,
	type EditableNameProps,
} from "./settings";

/** Text field for a name; Enter or blur submits the edit, Escape drops it. */
export function EditableName(props: EditableNameProps) {
	const { value, placeholder, allowEmpty, onSubmit } = props;
	const settings = useBoardSettings();
	const [draft, setDraft] = useState<string | null>(null);
	const input = partProps(settings, "input", "hb-input");

	const commit = () => {
		if (draft === null) return;
		const name = draft.trim();
		setDraft(null);
		if (name === value) return;
		if (name === "" && !allowEmpty) return;
		onSubmit(name);
	};

	return (
		<input
			type="text"
			className={input.className}
			style={input.style}
			aria-label={settings.labels.nameField}
			placeholder={placeholder}
			value={draft ?? value}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					commit();
				} else if (event.key === "Escape" && draft !== null) {
					event.stopPropagation();
					setDraft(null);
				}
			}}
		/>
	);
}
