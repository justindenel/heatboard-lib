import {
	Fragment,
	useCallback,
	useId,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	findHeat,
	type Bracket,
	type Entry,
	type Round,
} from "@heatboard/core";
import { useHeatboardConfig } from "../config";
import { useBracketContext } from "../context";
import {
	PoolDraggable,
	PoolList,
	useDndState,
	usePoolDrop,
	usePoolDropZone,
} from "../dnd";
import {
	useThemeProps,
	type ColorSchemeSetting,
	type HeatboardTheme,
} from "../theme";
import { IconButton } from "./admin";
import { EntryForm } from "./EntryForm";
import { EntryMenu } from "./EntryMenu";
import { EntryPoolItem } from "./EntryPoolItem";
import { Heading } from "./Heading";
import { ChevronIcon, UsersIcon } from "./icons";
import {
	SettingsContext,
	cx,
	partProps,
	useBoardSettings,
	usePresentation,
	type AdminPermissions,
	type BoardSettings,
	type PresentationProps,
} from "./settings";

export interface EntryPoolProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	/** Round the entries are listed for. Without it, the entries are grouped by entry round: the first round, then each later round with riders entering there. */
	roundId?: string;
	theme?: HeatboardTheme;
	colorScheme?: ColorSchemeSetting;
	permissions?: AdminPermissions;
	createId?: () => string;
	/** Starts as a single line with the title and the count (default `true`); ignored when `collapsed` is set. */
	defaultCollapsed?: boolean;
	/** Makes the collapsed state controlled. */
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
}

function placedAnywhere(bracket: Bracket, riderId: string): boolean {
	return bracket.rounds.some((round) => roundHasRider(round, riderId));
}

function roundHasRider(round: Round, riderId: string): boolean {
	return round.heats.some((heat) =>
		heat.slots.some((slot) => slot.riderId === riderId),
	);
}

/**
 * Entries with no place in the round whose entry round is not later than it. For the first round a
 * rider placed in any round counts as placed: a seed put straight into a later round has no
 * entry round recorded, yet is not waiting for the first round.
 */
function unplacedEntries(
	bracket: Bracket,
	roundId: string | undefined,
): Entry[] {
	const roundIndex =
		roundId === undefined
			? 0
			: bracket.rounds.findIndex((round) => round.id === roundId);
	const round = bracket.rounds[roundIndex];
	if (!round) return [];
	return bracket.entries.filter((entry) => {
		const entryIndex =
			entry.entryRoundId === undefined
				? 0
				: bracket.rounds.findIndex((r) => r.id === entry.entryRoundId);
		return (
			entryIndex !== -1 &&
			entryIndex <= roundIndex &&
			(roundIndex === 0
				? !placedAnywhere(bracket, entry.riderId)
				: !roundHasRider(round, entry.riderId))
		);
	});
}

/** Entries that enter at `round` and have no place in it yet. */
function entriesEnteringAt(bracket: Bracket, round: Round): Entry[] {
	const roundIndex = bracket.rounds.indexOf(round);
	return bracket.entries.filter((entry) => {
		const entryIndex =
			entry.entryRoundId === undefined
				? 0
				: bracket.rounds.findIndex((r) => r.id === entry.entryRoundId);
		return entryIndex === roundIndex && !roundHasRider(round, entry.riderId);
	});
}

interface PoolGroup {
	round: Round;
	entries: Entry[];
	titled: boolean;
}

/** Drop zone standing for the list of a later entry round, so a rider placed in that round can be put back. */
function PoolGroupZone(props: {
	roundId: string;
	enabled: boolean;
	children: ReactNode;
}) {
	const settings = useBoardSettings();
	const drop = usePoolDrop(props.roundId);
	const { setNodeRef } = usePoolDropZone(props.roundId, props.enabled);
	const zone = partProps(
		settings,
		"entryPoolZone",
		"hb-pool__zone",
		drop && `hb-drop--${drop.status}`,
	);
	return (
		<div
			ref={setNodeRef}
			className={zone.className}
			style={zone.style}
			data-drop={drop?.status}
			title={drop?.reason}
		>
			{props.children}
		</div>
	);
}

/** Collapsible side panel (a strip when narrow) of the entries not yet placed in a round; draggable into heats when inside a `HeatboardDnd`. */
export function EntryPool<TRider = unknown>(props: EntryPoolProps<TRider>) {
	const { bracket } = useBracketContext();
	const config = useHeatboardConfig();
	const dnd = useDndState();
	const titleId = useId();
	const bodyId = useId();
	const {
		roundId,
		permissions,
		createId,
		defaultCollapsed,
		collapsed: controlledCollapsed,
		onCollapsedChange,
	} = props;
	const [ownCollapsed, setOwnCollapsed] = useState(defaultCollapsed ?? true);
	const collapsed = controlledCollapsed ?? ownCollapsed;
	const toggle = useCallback(() => {
		if (controlledCollapsed === undefined) setOwnCollapsed(!collapsed);
		onCollapsedChange?.(!collapsed);
	}, [collapsed, controlledCollapsed, onCollapsedChange]);

	const presentation = usePresentation(props);
	const settings = useMemo(
		(): BoardSettings => ({
			...presentation,
			permissions: permissions ?? presentation.permissions,
			createId: createId ?? presentation.createId,
		}),
		[presentation, permissions, createId],
	);

	const round =
		bracket.rounds.find((r) => r.id === roundId) ?? bracket.rounds[0];
	const groups = useMemo((): PoolGroup[] => {
		if (roundId !== undefined) {
			const target = bracket.rounds.find((r) => r.id === roundId);
			return target
				? [
						{
							round: target,
							entries: unplacedEntries(bracket, roundId),
							titled: false,
						},
					]
				: [];
		}
		return bracket.rounds.flatMap((r, index): PoolGroup[] => {
			const entries =
				index === 0
					? unplacedEntries(bracket, r.id)
					: entriesEnteringAt(bracket, r);
			const entersHere =
				index > 0 && bracket.entries.some((e) => e.entryRoundId === r.id);
			return index === 0 || entries.length > 0 || entersHere
				? [{ round: r, entries, titled: index > 0 }]
				: [];
		});
	}, [bracket, roundId]);
	const draggedFromRound =
		dnd?.active?.kind === "slot"
			? findHeat(bracket, dnd.active.heatId)?.round.id
			: undefined;
	const shownGroups = groups.filter(
		(group) =>
			group.entries.length > 0 ||
			(group.titled && group.round.id === draggedFromRound),
	);
	const entryCount = groups.reduce((sum, g) => sum + g.entries.length, 0);
	const Item = settings.components.EntryPoolItem ?? EntryPoolItem;
	const Form = settings.components.EntryForm ?? EntryForm;
	const draggableItems = dnd?.hasAdminBoard === true;
	const themeProps = useThemeProps(props.theme, props.colorScheme);

	const poolDrop = usePoolDrop(round?.id);
	const { setNodeRef } = usePoolDropZone(round?.id, draggableItems);

	const root = partProps(
		settings,
		"entryPool",
		"hb-pool",
		poolDrop && `hb-drop--${poolDrop.status}`,
	);
	const header = partProps(settings, "entryPoolHeader", "hb-pool__header");
	const title = partProps(settings, "entryPoolTitle", "hb-pool__title");
	const count = partProps(
		settings,
		"entryPoolCount",
		"hb-badge",
		"hb-pool__count",
	);
	const body = partProps(settings, "entryPoolBody", "hb-pool__body");
	const chip = partProps(settings, "entryPoolChip", "hb-pool__chip");
	const empty = partProps(settings, "entryPoolEmpty", "hb-pool__empty");
	const list = partProps(settings, "entryPoolList", "hb-pool__list");
	const draggable = partProps(settings, "draggable", "hb-draggable");

	const renderItems = (group: PoolGroup) =>
		group.entries.map((entry) => {
			const item = (
				<Item
					entry={entry}
					roundId={group.round.id}
					rider={settings.riders?.[entry.riderId]}
				/>
			);
			return (
				<li key={entry.riderId} className={chip.className} style={chip.style}>
					{draggableItems ? (
						<PoolDraggable
							roundId={group.round.id}
							riderId={entry.riderId}
							className={draggable.className}
							style={draggable.style}
							roleDescription={settings.labels.dndRoleDescription}
							preview={
								<SettingsContext.Provider value={settings}>
									{item}
								</SettingsContext.Provider>
							}
						>
							{item}
						</PoolDraggable>
					) : (
						item
					)}
					<EntryMenu entry={entry} />
				</li>
			);
		});

	return (
		<SettingsContext.Provider value={settings}>
			<section
				ref={setNodeRef}
				className={root.className}
				{...themeProps}
				style={{ ...themeProps.style, ...root.style }}
				data-round-id={round?.id}
				data-collapsed={collapsed ? "true" : undefined}
				data-drop={poolDrop?.status}
				title={poolDrop?.reason}
				lang={config.locale}
				aria-labelledby={titleId}
			>
				<div className={header.className} style={header.style}>
					<IconButton
						label={settings.labels.toggleEntryPool}
						aria={{ "aria-expanded": !collapsed, "aria-controls": bodyId }}
						onPress={toggle}
					>
						<ChevronIcon up={!collapsed} />
					</IconButton>
					<span className={cx(!settings.unstyled && "hb-pool__icon")}>
						<UsersIcon />
					</span>
					<Heading
						depth={0}
						id={titleId}
						className={title.className}
						style={title.style}
					>
						{settings.labels.entryPoolTitle}
					</Heading>
					<span className={count.className} style={count.style}>
						{entryCount}
					</span>
				</div>
				{!collapsed && (
					<div id={bodyId} className={body.className} style={body.style}>
						{entryCount === 0 && (
							<p className={empty.className} style={empty.style}>
								{settings.labels.entryPoolEmpty}
							</p>
						)}
						{shownGroups.map((group) => {
							const items = renderItems(group);
							const content = (
								<>
									{group.titled && (
										<Heading
											depth={1}
											className={cx(!settings.unstyled && "hb-pool__group")}
										>
											{group.round.name}
										</Heading>
									)}
									{group.entries.length > 0 ? (
										<ul className={list.className} style={list.style}>
											{draggableItems ? (
												<PoolList
													roundId={group.round.id}
													riderIds={group.entries.map((e) => e.riderId)}
												>
													{items}
												</PoolList>
											) : (
												items
											)}
										</ul>
									) : (
										<p className={empty.className} style={empty.style}>
											{settings.labels.entryPoolDropHere}
										</p>
									)}
								</>
							);
							// The first group is the whole panel; each later one is a zone of its own.
							return group.titled && roundId === undefined ? (
								<PoolGroupZone
									key={group.round.id}
									roundId={group.round.id}
									enabled={draggableItems}
								>
									{content}
								</PoolGroupZone>
							) : (
								<Fragment key={group.round.id}>{content}</Fragment>
							);
						})}
						<Form
							entryRoundId={
								round && round !== bracket.rounds[0] ? round.id : undefined
							}
						/>
					</div>
				)}
			</section>
		</SettingsContext.Provider>
	);
}
