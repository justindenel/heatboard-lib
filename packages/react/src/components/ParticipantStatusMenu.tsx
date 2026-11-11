import {
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
} from "react";
import type { Action, HeatSlot, ParticipantStatus } from "@heatboard/core";
import { RefusableButton, useAdmin } from "./admin";
import { MoreIcon } from "./icons";
import { cx, partProps, useBoardSettings } from "./settings";

const STATUSES: readonly ParticipantStatus[] = ["DNF", "DSQ", "DNS"];

const GAP = 4;

interface Position {
	top: number;
	left: number;
}

/** Popover to set or clear the DNF/DSQ/DNS status of a rider. */
export function ParticipantStatusMenu(props: {
	heatId: string;
	slot: HeatSlot;
	name: string;
}) {
	const { heatId, slot, name } = props;
	const settings = useBoardSettings();
	const { refusal, run, labels } = useAdmin();
	const [open, setOpen] = useState(false);
	const [position, setPosition] = useState<Position | null>(null);
	const rootRef = useRef<HTMLSpanElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuId = useId();

	const trigger = partProps(
		settings,
		"statusMenuButton",
		"hb-button",
		"hb-icon-button",
	);
	const menu = partProps(settings, "statusMenu", "hb-status-menu");
	const itemPart = partProps(
		settings,
		"statusMenuItem",
		"hb-button",
		"hb-status-menu__item",
	);

	const current = slot.status ?? null;

	const closeAndRestoreFocus = () => {
		setOpen(false);
		rootRef.current?.querySelector("button")?.focus();
	};

	const outsidePress = useRef<(event: PointerEvent) => void>(() => undefined);
	useEffect(() => {
		outsidePress.current = (event) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
	});
	useEffect(() => {
		if (!open) return;
		const press = (event: PointerEvent) => outsidePress.current(event);
		const dismiss = () => setOpen(false);
		document.addEventListener("pointerdown", press, true);
		window.addEventListener("resize", dismiss);
		document.addEventListener("scroll", dismiss, true);
		return () => {
			document.removeEventListener("pointerdown", press, true);
			window.removeEventListener("resize", dismiss);
			document.removeEventListener("scroll", dismiss, true);
		};
	}, [open]);

	// Fixed coordinates: the inspector body scrolls and would clip an absolute menu.
	useLayoutEffect(() => {
		const panel = menuRef.current;
		const button = rootRef.current?.querySelector("button");
		if (!open || !panel || !button) {
			setPosition(null);
			return;
		}
		const anchor = button.getBoundingClientRect();
		const size = panel.getBoundingClientRect();
		const fitsBelow = anchor.bottom + GAP + size.height <= window.innerHeight;
		setPosition({
			top: fitsBelow ? anchor.bottom + GAP : anchor.top - GAP - size.height,
			left: Math.max(GAP, anchor.right - size.width),
		});
	}, [open]);

	// A hidden element cannot take focus, so wait for the measured position.
	const placed = position !== null;
	useEffect(() => {
		const panel = menuRef.current;
		if (!placed || !panel) return;
		(
			panel.querySelector<HTMLElement>('[aria-checked="true"]') ??
			panel.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
		)?.focus({ preventScroll: true });
	}, [placed]);

	const onKeyDown = (event: KeyboardEvent) => {
		if (!open) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			closeAndRestoreFocus();
			return;
		}
		if (event.key === "Tab") {
			closeAndRestoreFocus();
			return;
		}
		const items = Array.from(
			menuRef.current?.querySelectorAll<HTMLElement>(
				'[role="menuitemcheckbox"]',
			) ?? [],
		);
		const index = items.indexOf(document.activeElement as HTMLElement);
		const target =
			event.key === "ArrowDown"
				? items[(index + 1) % items.length]
				: event.key === "ArrowUp"
					? items[(index - 1 + items.length) % items.length]
					: event.key === "Home"
						? items[0]
						: event.key === "End"
							? items.at(-1)
							: undefined;
		if (target) {
			event.preventDefault();
			target.focus();
		}
	};

	const menuStyle: CSSProperties = {
		position: "fixed",
		top: position?.top ?? 0,
		left: position?.left ?? 0,
		visibility: position ? undefined : "hidden",
		...menu.style,
	};
	const label = labels.participantStatusOf(name);

	// The row listens for pointer gestures to start a drag; none may start here.
	const keepOutOfDrag = (event: { stopPropagation: () => void }) =>
		event.stopPropagation();

	return (
		<span
			ref={rootRef}
			className={cx(!settings.unstyled && "hb-status-menu-root")}
			onKeyDown={onKeyDown}
			onMouseDown={keepOutOfDrag}
			onTouchStart={keepOutOfDrag}
			onPointerDown={keepOutOfDrag}
		>
			<RefusableButton
				reason={undefined}
				ariaLabel={label}
				title={label}
				className={trigger.className}
				style={trigger.style}
				aria={{
					"aria-haspopup": "menu",
					"aria-expanded": open,
					"aria-controls": open ? menuId : undefined,
				}}
				onPress={() => setOpen((value) => !value)}
			>
				<MoreIcon />
			</RefusableButton>
			{open && (
				<div
					ref={menuRef}
					id={menuId}
					role="menu"
					aria-label={label}
					className={menu.className}
					style={menuStyle}
				>
					{STATUSES.map((status) => {
						const checked = current === status;
						const action: Action = {
							type: "setStatus",
							heatId,
							riderId: slot.riderId,
							status: checked ? null : status,
						};
						const text = `${status} — ${labels.participantStatus[status]}`;
						return (
							<RefusableButton
								key={status}
								role="menuitemcheckbox"
								className={itemPart.className}
								style={itemPart.style}
								aria={{ "aria-checked": checked }}
								reason={refusal(action)}
								onPress={() => {
									run(action);
									closeAndRestoreFocus();
								}}
							>
								{text}
							</RefusableButton>
						);
					})}
				</div>
			)}
		</span>
	);
}
