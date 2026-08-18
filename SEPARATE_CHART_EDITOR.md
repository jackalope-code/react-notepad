# Scrapped Design: Separate Chart Editor Page

This design was considered and rejected in favor of an inline editable mini-view
(fixed-size thumbnail + floating popover) directly in the markdown overlay editor.
Kept here for reference only.

## Summary

Charts (e.g. Mermaid) would be stored as fenced code blocks in the document
(e.g. a `mermaid` fence). Inserting one would be GUI-driven (no hand-typed fence
syntax) via a toolbar action that placed a starter block at a tapped/clicked
location in the document.

## Navigation

A button/icon would appear near a chart fence block when the caret was on it,
linking to a dedicated route (e.g. `/chart/<document-id>/<block-index>`) opened
via the app's existing router. That route rendered a split view: a text editor
for the chart's raw source on one side, and a live rendered preview on the other.
Saving in that view would write the edited fence text back into the parent
document and navigate back.

## Why it was scrapped

- Required leaving the main document (a full navigation/route change) just to
  edit a chart, which the user found less desirable than editing in place.
- Introduced a second, mostly-duplicate editor surface (route + component tree)
  purely for chart text, increasing maintenance surface for no clear benefit
  once an inline popover approach was shown to be feasible.
- The inline fixed-size-thumbnail + floating-popover approach achieves the same
  goal (dedicated space to edit chart text plus a live preview) without a route
  change and without any risk of breaking the caret/overlay line-alignment
  invariant, since the popover sits outside document flow entirely.
