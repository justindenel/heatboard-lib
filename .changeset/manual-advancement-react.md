---
"@heatboard/react": minor
---

Drag and drop leaves the placement rules to the core.

- Dropping a rider of a heat onto a heat of a later round now emits `advance` instead of `place`; the drop shows as a copy only when the core accepts it and the rider stays in its source heat.
- Breaking: the `OTHER_POOL_ROUND` refusal and its label are gone. Drops between lists and heats are accepted or refused by the core, and a removal is offered whichever list is hovered.
- The riders of a judged or locked heat can be dragged to a later round in manual advancement.
- Manual advancement shows no "comes from / goes to" routes, and the warning when starting a heat counts the riders the core still awaits.
- New labels for the new core error codes, in English and French.
