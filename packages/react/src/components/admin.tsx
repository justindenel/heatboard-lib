import {
	createContext,
	useContext,
	useId,
	type AriaAttributes,
	type CSSProperties,
	type ReactNode,
} from "react";
import type { Action, Bracket } from "@heatboard/core";
import { useBracketContext } from "../context";
import { errorMessage, type Labels } from "../labels";
import type { DispatchResult } from "../useBracket";
import { heatLabel } from "./heatLabel";
import {
	cx,
	partProps,
	useBoardSettings,
	type AdminPermission,
	type BoardPart,
} from "./settings";

/** Dispatcher that opens a confirmation when the core asks for one. */
export const RunContext = createContext<
	((action: Action) => DispatchResult) | null
>(null);

export interface AdminApi {
	allowed: (permission: AdminPermission) => boolean;
	/** Translated reason when the core refuses `action`; a request for confirmation is not a refusal. */
	refusal: (action: Action) => string | undefined;
	run: (action: Action) => DispatchResult;
	labels: Labels;
}

export function useAdmin(): AdminApi {
	const settings = useBoardSettings();
	const { canApply, dispatch } = useBracketContext();
	const confirming = useContext(RunContext);
	const admin = settings.mode === "admin";
	return {
		allowed: (permission) =>
			admin && settings.permissions[permission] !== false,
		refusal: (action) => {
			const result = canApply(action);
			if (result.ok || result.error.code === "DESTRUCTIVE_CHANGE") {
				return undefined;
			}
			return errorMessage(settings.labels, result.error);
		},
		run: confirming ?? dispatch,
		labels: settings.labels,
	};
}

/**
 * Button that stays focusable when refused: it is `aria-disabled`, its click
 * does nothing, and the reason is exposed through `title` and `aria-describedby`.
 */
export function RefusableButton(props: {
	reason: string | undefined;
	onPress?: (button: HTMLButtonElement) => void;
	type?: "button" | "submit";
	role?: string;
	ariaLabel?: string;
	/** Tooltip while the button is not refused; the reason takes its place otherwise. */
	title?: string;
	aria?: AriaAttributes;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	const { reason } = props;
	const reasonId = useId();
	const settings = useBoardSettings();
	return (
		<>
			<button
				{...props.aria}
				type={props.type ?? "button"}
				role={props.role}
				className={props.className}
				style={props.style}
				aria-label={props.ariaLabel}
				aria-disabled={reason !== undefined ? true : undefined}
				aria-describedby={reason !== undefined ? reasonId : undefined}
				title={reason ?? props.title}
				onClick={(event) => {
					if (reason !== undefined) {
						event.preventDefault();
						return;
					}
					props.onPress?.(event.currentTarget);
				}}
			>
				{props.children}
			</button>
			{reason !== undefined && (
				<span
					id={reasonId}
					className={cx(!settings.unstyled && "hb-visually-hidden")}
				>
					{reason}
				</span>
			)}
		</>
	);
}

export function ActionButton(props: {
	action: Action;
	children: ReactNode;
	part?: BoardPart;
	danger?: boolean;
	ariaLabel?: string;
	/** Builds the dispatched action on click (fresh ids); `action` then only serves the refusal lookup. */
	build?: () => Action;
}) {
	const { action, children, danger, ariaLabel, build } = props;
	const settings = useBoardSettings();
	const { refusal, run } = useAdmin();
	const { className, style } = partProps(
		settings,
		props.part ?? "button",
		"hb-button",
		danger && "hb-button--danger",
	);
	return (
		<RefusableButton
			reason={refusal(action)}
			className={className}
			style={style}
			ariaLabel={ariaLabel}
			onPress={() => run(build ? build() : action)}
		>
			{children}
		</RefusableButton>
	);
}

/** Square icon button; `label` is both its accessible name and its tooltip. */
export function IconButton(props: {
	label: string;
	reason?: string | undefined;
	onPress: (button: HTMLButtonElement) => void;
	aria?: AriaAttributes;
	className?: string;
	children: ReactNode;
}) {
	const settings = useBoardSettings();
	const { className, style } = partProps(
		settings,
		"iconButton",
		"hb-button",
		"hb-icon-button",
		props.className,
	);
	return (
		<RefusableButton
			reason={props.reason}
			ariaLabel={props.label}
			title={props.label}
			className={className}
			style={style}
			onPress={props.onPress}
			{...(props.aria && { aria: props.aria })}
		>
			{props.children}
		</RefusableButton>
	);
}

/** Icon button that runs a bracket action, refused with the reason from the core. */
export function ActionIconButton(props: {
	action: Action;
	label: string;
	className?: string;
	/** Builds the dispatched action on click (fresh ids); `action` then only serves the refusal lookup. */
	build?: () => Action;
	children: ReactNode;
}) {
	const { action, build } = props;
	const { refusal, run } = useAdmin();
	return (
		<IconButton
			label={props.label}
			reason={refusal(action)}
			onPress={() => run(build ? build() : action)}
			{...(props.className && { className: props.className })}
		>
			{props.children}
		</IconButton>
	);
}

/** Whole number >= 1, `null` when empty, `undefined` when invalid. */
export function parseSeed(text: string): number | null | undefined {
	const trimmed = text.trim();
	if (trimmed === "") return null;
	const value = Number(trimmed);
	return Number.isInteger(value) && value >= 1 ? value : undefined;
}

export function heatDisplayName(
	bracket: Bracket,
	labels: Labels,
	heat: { id: string },
): string {
	return heatLabel(bracket, heat.id, labels);
}
