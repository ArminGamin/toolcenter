# Tool interiors: UI and UX review

Evaluated and implemented on 1 October 2026.

## Working direction

This is a creator's working desk: prepare media, write captions, review previews, run batches, and manage campaigns for two separate businesses. Keep the existing charcoal, brass and teal design. Give the editing controls the most space, keep previews alongside them when space permits, and keep every setting available.

## Evaluation and decisions

| Area | Finding | Implemented decision |
| --- | --- | --- |
| UGC editing | A narrow settings column and nested scrolling squeezed the actual editing work | Wide editing column, smaller sticky preview, one page scroll; larger copy and caption areas |
| Universal description | The supplied description needed an internal scroll just to see its hashtags | A 320px minimum caption box; the existing exact reuse and automatic generation options remain |
| UGC settings | Two copies of the AI model bar added height and duplicate control IDs | One shared model bar; settings grouped into readable cards |
| One-Shot | Fixed preview dimensions and tightly packed settings constrained the form | Responsive preview, wider fields, separate copy-generation and Discord cards; natural page flow for Batch |
| Outreach | Completed reports occupied most of the first screen before the form started | Expandable campaign activity; active workers and errors open it automatically; settings stay in the main page |
| Groups, Friend DMs, Profile Share | Separate settings scrollers and narrow columns made long forms difficult to use | Roomier sections and page scrolling; bounded activity logs remain alongside the form on wide screens |
| Reddit and SEO | Small labels and compressed field groups made settings hard to scan | Larger labels and controls, more separation between sections, single-column forms on smaller screens |
| Pipeline | Narrow contact details and a fitted page squeezed lower controls | Wider details column, natural page scroll, bounded contact lists |
| Notes | A 620px minimum height clipped the editor; fixed navigation widths left too little room on smaller screens | Fit desktop height; responsive navigation above a full-width editor; split panes stack on phones |
| Saving | Long page forms put the original save button out of view | A sticky save footer appears only for unsaved changes and uses the existing save callbacks |
| Markets | Dense quotes and tables support a different scanning task | Retained the existing table layout rather than applying creator-form spacing to market data |

## Verification

- An AST audit captured 592 existing control signatures across 54 components before these edits. All 592 remain, including labels, values, change handlers, actions, disabled states, options and validation attributes. Only presentation classes and styles are excluded from that comparison.
- 25 focused tests across seven suites passed: directory behavior, universal descriptions on client/server, business profiles, One-Shot rendering/video and server behavior.
- Component lint and the Vite production bundle pass. Full TypeScript checking still reports the pre-existing UGC renderer and server errors; it is not a clean full build.
- Inspected UGC Create/Settings, One-Shot Create/Batch/Settings, Outreach Find, SEO Settings, Groups, Friend DMs, Profile Share, Reddit Settings, Notes and Pipeline through the local browser.
- Checked desktop, tablet and phone layouts. At 1440px, the UGC editing column is 869px and the preview is 360px. At 390px, settings fields fit within the page and the last Category ID field is reachable at the bottom of the page scroll.
- Verified both mobile preview shortcuts: they scroll between editing and preview without changing the active tool route.
- Verified the sticky save footer on desktop and mobile using a temporary brief edit, then restored the exact original brief without saving. The final page reports all changes saved.
- Confirmed Kalėdų Kampelis retains the existing universal description and Tavo Knyga retains its separate controls. No generation, posting, outreach sending or job interruption was used for validation.
- Browser console showed no errors in the final UGC view.

## Visual evidence

- `tool-interior-desktop.jpg`: Christmas UGC caption editor, with the complete universal description visible.
- `tool-interior-mobile.jpg`: mobile UGC preview and return-to-editing control.
- `tool-interior-settings.jpg`: the grouped UGC settings on desktop.

The baseline is stored in `tool-interior-controls.json`. Recheck with `node scripts/verify-tool-controls.mjs`; do not replace that baseline when verifying this change.
