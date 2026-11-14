---
"@heatboard/core": minor
---

Manual advancement, cross-round placement and direct-entry limits.

- New actions `setAdvancement`, `advance`, `placeAll` and `placeRest`, new query `placeAllPlan`, and new error codes `ADVANCEMENT_LOCKED`, `NOT_LATER_ROUND`, `SOURCE_HEAT_RUNNING`, `PLACEMENT_LOCKED` and `SEED_SLOTS_FULL`. Code that switches exhaustively on `Action` or on error codes must handle them.
- New `Bracket.advancement` field, queries `advancementOf`, `hasStarted` and `awaitedRiders`, and the `lockPlacementOnceStarted` option.
- Breaking: `placeQualifiers` no longer refuses a judgment when the target heat is full. The heat grows by one seat and is flagged for review.
- Breaking: in automatic advancement a manual placement cannot take the seat of an awaited qualifier.
- Breaking: a rider can move to a heat of another round before the bracket starts, or in manual advancement, instead of being refused with `CROSS_ROUND_MOVE`.
