import { useId, useState, type ReactNode } from "react";
import { cx, partProps, useBoardSettings } from "./settings";

export function parseNumber(text: string): number | undefined {
	const value = Number(text.replace(",", "."));
	return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
}

export function parseOptionalNumber(text: string): number | null | undefined {
	return text.trim() === "" ? null : parseNumber(text);
}

interface FieldChrome {
	label: string;
	/** Keeps the label for assistive technology only: always, or only where a column header already names the field. */
	hideLabel?: "always" | "wide";
	/** Message under the field; also marks the control invalid. */
	error?: string | undefined;
	/** Marks the control invalid when the message is shown elsewhere, at `describedBy`. */
	invalid?: boolean;
	describedBy?: string;
	hint?: string;
	className?: string;
}

function labelClass(hidden: FieldChrome["hideLabel"], unstyled: boolean) {
	if (hidden === undefined || unstyled) return undefined;
	return hidden === "always"
		? "hb-visually-hidden"
		: "hb-scoring__column-label";
}

/** Input that keeps what is typed until it parses, and follows the value when it changes elsewhere. */
export function Field<T>(
	props: FieldChrome & {
		value: string;
		parse: (text: string) => T | undefined;
		onCommit: (value: T) => void;
		type?: "text" | "number";
		placeholder?: string;
		/** Text before and after the input, such as a unit. */
		prefix?: ReactNode;
		suffix?: ReactNode;
	},
) {
	const settings = useBoardSettings();
	const input = partProps(settings, "input", "hb-input");
	const [text, setText] = useState(props.value);
	const [seen, setSeen] = useState(props.value);
	const id = useId();
	const messageId = `${id}-message`;
	if (seen !== props.value) {
		setSeen(props.value);
		setText(props.value);
	}
	const messages = props.error ?? props.hint;
	const control = (
		<input
			id={id}
			className={input.className}
			style={input.style}
			type={props.type ?? "text"}
			step={props.type === "number" ? "any" : undefined}
			placeholder={props.placeholder}
			value={text}
			aria-invalid={props.error || props.invalid ? true : undefined}
			aria-describedby={messages ? messageId : props.describedBy}
			onChange={(event) => {
				setText(event.target.value);
				const parsed = props.parse(event.target.value);
				if (parsed !== undefined) props.onCommit(parsed);
			}}
		/>
	);
	return (
		<div
			className={cx(!settings.unstyled && "hb-scoring__field", props.className)}
		>
			<label
				htmlFor={id}
				className={labelClass(props.hideLabel, settings.unstyled)}
			>
				{props.label}
			</label>
			{props.suffix === undefined && props.prefix === undefined ? (
				control
			) : (
				<span className={cx(!settings.unstyled && "hb-scoring__control")}>
					{props.prefix}
					{control}
					{props.suffix}
				</span>
			)}
			<FieldMessage
				id={messageId}
				error={props.error}
				hint={props.hint}
				unstyled={settings.unstyled}
			/>
		</div>
	);
}

function FieldMessage(props: {
	id: string;
	error: string | undefined;
	hint: string | undefined;
	unstyled: boolean;
}) {
	const message = props.error ?? props.hint;
	if (!message) return null;
	return (
		<span
			id={props.id}
			className={cx(
				!props.unstyled &&
					(props.error ? "hb-scoring__error" : "hb-scoring__hint"),
			)}
		>
			{message}
		</span>
	);
}

export function SelectField(
	props: FieldChrome & {
		value: string;
		onChange: (value: string) => void;
		children: ReactNode;
	},
) {
	const settings = useBoardSettings();
	const select = partProps(settings, "select", "hb-select");
	const id = useId();
	const messageId = `${id}-message`;
	const messages = props.error ?? props.hint;
	return (
		<div
			className={cx(!settings.unstyled && "hb-scoring__field", props.className)}
		>
			<label
				htmlFor={id}
				className={labelClass(props.hideLabel, settings.unstyled)}
			>
				{props.label}
			</label>
			<select
				id={id}
				className={select.className}
				style={select.style}
				value={props.value}
				aria-invalid={props.error || props.invalid ? true : undefined}
				aria-describedby={messages ? messageId : props.describedBy}
				onChange={(event) => props.onChange(event.target.value)}
			>
				{props.children}
			</select>
			<FieldMessage
				id={messageId}
				error={props.error}
				hint={props.hint}
				unstyled={settings.unstyled}
			/>
		</div>
	);
}
