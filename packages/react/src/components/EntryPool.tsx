import { useCallback, useId, useMemo, useState } from "react";
import { type Bracket, type Entry, type Round } from "@heatboard/core";
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
	usePresentation,
	type AdminPermissions,
	type BoardSettings,
	type PresentationProps,
} from "./settings";

export interface EntryPoolProps<
	TRider = unknown,
> extends PresentationProps<TRider> {
	/** Round a rider dropped on the pool is taken out of; the first round by default. The list itself always holds the entries placed in no heat. */
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

function unplacedEntries(bracket: Bracket): Entry[] {
	return bracket.entries.filter(
		(entry) => !placedAnywhere(bracket, entry.riderId),
	);
}

/** Collapsible side panel (a strip when narrow) of the entries placed in no heat; draggable into heats when inside a `HeatboardDnd`. */
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
	const entries = useMemo(() => unplacedEntries(bracket), [bracket]);
	const entryCount = entries.length;
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

	const poolRoundId = round?.id ?? "";
	const items = entries.map((entry) => {
		const item = (
			<Item
				entry={entry}
				roundId={poolRoundId}
				rider={settings.riders?.[entry.riderId]}
			/>
		);
		return (
			<li key={entry.riderId} className={chip.className} style={chip.style}>
				{draggableItems ? (
					<PoolDraggable
						roundId={poolRoundId}
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
						{entryCount > 0 && (
							<ul className={list.className} style={list.style}>
								{draggableItems ? (
									<PoolList
										roundId={poolRoundId}
										riderIds={entries.map((e) => e.riderId)}
									>
										{items}
									</PoolList>
								) : (
									items
								)}
							</ul>
						)}
						<Form />
					</div>
				)}
			</section>
		</SettingsContext.Provider>
	);
}
