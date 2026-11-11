import {
	useEffect,
	useId,
	useRef,
	type CSSProperties,
	type ReactNode,
} from "react";
import { NoteChipContent } from "./NoteChip";
import { partProps, useBoardSettings, type JudgeRowProps } from "./settings";

/** One rider on the judge page: lycra, rank and total on this judge's notes, one chip per note. */
export function JudgeRow(props: JudgeRowProps) {
	const { riderId, name, label, color, rank, total, notes, disabled } = props;
	const canAdd = props.canAdd ?? true;
	const settings = useBoardSettings();
	const { labels } = settings;
	const totalId = useId();
	const menuRef = useRef<HTMLDivElement>(null);

	const row = partProps(settings, "judgeRow", "hb-judge-row");
	const main = partProps(settings, "judgeRowMain", "hb-judge-row__main");
	const lycra = partProps(settings, "judgeRowLycra", "hb-judge-row__lycra");
	const nameProps = partProps(settings, "judgeRowName", "hb-judge-row__name");
	const totalProps = partProps(
		settings,
		"judgeRowTotal",
		"hb-judge-row__total",
	);
	const chips = partProps(settings, "judgeChips", "hb-judge-row__chips");
	const menu = partProps(settings, "judgeMenu", "hb-judge-row__menu");

	const button = partProps(settings, "button", "hb-button");
	const dangerButton = partProps(
		settings,
		"button",
		"hb-button",
		"hb-button--danger",
	);
	const inner = (name: string) => (settings.unstyled ? undefined : name);

	const menuNote = notes.find((n) => n.rideId === props.menuNoteId);
	const menuId = menuNote?.rideId;
	useEffect(() => {
		if (menuId !== undefined) menuRef.current?.querySelector("button")?.focus();
	}, [menuId]);

	const order = props.categories ?? [];
	const types = [
		...order,
		...notes.map((n) => n.type).filter((t) => !order.includes(t)),
	];
	const lines = [...new Set(types)]
		.map((type) => ({ type, notes: notes.filter((n) => n.type === type) }))
		.filter((line) => line.notes.length > 0);

	const describe = (type: string, figure: string | undefined) =>
		figure ? `${type}, ${figure}` : type;

	return (
		<div
			className={row.className}
			style={
				{
					...row.style,
					"--hb-judge-lycra": color ?? "transparent",
				} as CSSProperties
			}
			data-rider-id={riderId}
		>
			<button
				type="button"
				className={main.className}
				style={main.style}
				disabled={disabled || !canAdd}
				aria-label={labels.judgeRiderButton(label)}
				aria-describedby={totalId}
				onClick={(event) => props.onOpen(event.currentTarget)}
			>
				<span
					className={lycra.className}
					style={{ ...(color && { backgroundColor: color }), ...lycra.style }}
					aria-hidden="true"
				>
					<span className={inner("hb-judge-row__rank")}>
						{rank !== undefined ? `#${rank}` : "-"}
					</span>
				</span>
				<span className={nameProps.className} style={nameProps.style}>
					{name}
				</span>
				<span
					id={totalId}
					className={totalProps.className}
					style={totalProps.style}
				>
					<small>{labels.judgeTotal}</small>
					<span className={inner("hb-judge-row__figure")}>
						{labels.formatTotal(total)}
					</span>
					{canAdd && (
						<span className={inner("hb-judge-row__add")}>
							{labels.judgeAddNote}
						</span>
					)}
				</span>
			</button>
			<div className={chips.className} style={chips.style}>
				{notes.length === 0 && (
					<span className={inner("hb-judge-row__empty")}>
						{labels.judgeNoNotes}
					</span>
				)}
				{lines.map(({ type, notes: ofType }) => (
					<div
						key={type}
						className={inner("hb-judge-row__line")}
						role="group"
						aria-label={labels.categoryLine(type)}
						data-category={type}
					>
						<span className={inner("hb-judge-row__category")}>{type}</span>
						{ofType.map((note) => {
							const unseen = note.scores[0]?.value === null;
							const value = unseen ? "–" : labels.formatScore(note.value);
							const open = props.menuNoteId === note.rideId;
							return (
								<ChipButton
									key={note.rideId}
									counted={note.counted}
									disabled={disabled}
									expanded={open}
									label={
										unseen
											? labels.rideUnseenSummary(note.type, note.figure)
											: labels.judgeNoteChip(note.type, note.figure, value)
									}
									title={
										unseen
											? labels.rideUnseenSummary(note.type, note.figure)
											: labels.noteSummary(
													note.type,
													note.figure,
													value,
													note.counted,
												)
									}
									onPress={() => props.onNoteMenu(open ? null : note.rideId)}
								>
									<NoteChipContent
										type={note.type}
										figure={note.figure}
										value={value}
										showType={false}
									/>
								</ChipButton>
							);
						})}
					</div>
				))}
			</div>
			{menuNote && (
				<div
					ref={menuRef}
					role="menu"
					className={menu.className}
					style={menu.style}
					aria-label={labels.judgeNoteOptions(
						describe(menuNote.type, menuNote.figure),
					)}
				>
					<button
						type="button"
						role="menuitem"
						className={button.className}
						style={button.style}
						onClick={(event) =>
							props.onEditNote(menuNote.rideId, event.currentTarget)
						}
					>
						{labels.judgeEditNote}
					</button>
					<button
						type="button"
						role="menuitem"
						className={dangerButton.className}
						style={dangerButton.style}
						onClick={() => props.onDeleteNote(menuNote.rideId)}
					>
						{labels.judgeDeleteNote}
					</button>
				</div>
			)}
		</div>
	);
}

function ChipButton(props: {
	counted: boolean;
	disabled: boolean;
	expanded: boolean;
	label: string;
	title: string;
	onPress: () => void;
	children: ReactNode;
}) {
	const settings = useBoardSettings();
	const chip = partProps(
		settings,
		"judgeChip",
		"hb-judge-chip",
		props.counted && "hb-judge-chip--counted",
	);
	return (
		<button
			type="button"
			className={chip.className}
			style={chip.style}
			disabled={props.disabled}
			aria-haspopup="menu"
			aria-expanded={props.expanded}
			aria-label={props.label}
			title={props.title}
			data-counted={props.counted ? "true" : undefined}
			onClick={props.onPress}
		>
			{props.children}
		</button>
	);
}
