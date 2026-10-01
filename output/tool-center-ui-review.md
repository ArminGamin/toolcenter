# Tool Center UI and UX review

Evaluated on 30 September 2026 against the local application and the creator, downloader, outreach, and two-business workflows.

## Direction

Keep the familiar charcoal console and brass navigation. Make finding a tool, identifying the business, and understanding its state the primary tasks. The directory complements the existing orbit and uses the existing profile-scoped sidebar.

Domain: UGC slides, short video batches, captions, metadata cleanup, Discord delivery, lead campaigns, business workspaces.

Color references: charcoal desk surface, brass console controls, teal ready indicators, amber pending changes, coral stop controls, paper-light text. Existing tokens and fonts are retained.

Signature: one business-scoped launch desk connecting content creation, media preparation, and publishing tools.

Avoid: decorative statistics cards in place of navigation; another assistant panel; important actions available only through right-click.

Component choices: bordered grouped rows for the directory, existing raised surfaces for menus, brass for selected filters and pins, existing Sora body type and mono status labels, shared spacing and rounded control tokens. Descriptions wrap; status remains secondary to tool names.

## Evaluation and decisions

| Area | Observed friction | Decision |
| --- | --- | --- |
| Finding tools | 21 orbit labels competed for space; long metadata names overlapped | Searchable directory, grouped by workflow; retain Orbit with shorter display labels |
| Creator access | Built-in workspaces were spread between sidebar and search | Put UGC, One-Shot, Pipeline, and SEO first; route to existing panels |
| Downloaders | Users need to find a platform inside one combined downloader | Search platform names; keep the platform selector and output controls |
| Sidebar customization | Pinning depended on right-click; Favorite toggled an unrelated status field | Visible pin buttons using the real sidebar state; explicit unsaved changes and Save sidebar |
| Tool state | An idle downloader displayed a Bridge offline warning while the bridge was reachable | Separate bridge health from Running, Idle, and In app |
| Tool controls | Stop was enabled on idle tools; combined downloader offered a misleading relaunch | Disable idle Stop; explain stopping before changing downloader platform |
| Business identity | Profile name disappeared on smaller screens | Keep the current business name visible and provide an explicit accessible name |
| Header density | Status, date, and actions wrapped or clipped at desktop widths | Keep core actions visible; put secondary actions and date in More |
| Mobile layout | Tool detail header reduced its name and description to a narrow sliver | Stack the header controls; constrain directory columns and preserve wrapped text |
| Mobile navigation | Fixed bottom rail overlapped the application; panel padding compensated inconsistently | Reserve the rail height in the application shell and reduce redundant padding |
| Search correctness | Previous requests could replace newer query results | Ignore superseded responses and clear stale matches |
| Search duplication | Embedded creators appeared as both a hub and an external tool | Show one destination per embedded tool |
| Keyboard navigation | Off-screen panels remained focusable; selection could move outside the visible search list | Inert inactive panels and modal backgrounds; contain search focus and scroll selection into view |
| Keyboard shortcuts | Closing a dialog could also trigger global navigation | Stop handled Escape events; support Ctrl/Cmd+K; avoid leaving a form on Escape |
| Configuration terminology | Tool Profiles could be confused with business workspaces; empty profiles appeared for tools with no settings | Rename to Saved tool configurations and hide empty configuration sections for tools without settings |
| Hidden tools | Hiding also removed a tool from every route to its Restore button | Add a Hidden tools view with direct Restore controls |
| Empty searches | Recovery relied on manually deleting the query | Clear search and View all tools actions |
| Motion | Existing reduced-motion rules already cover transitions and orbit animation | Keep the current reduced-motion support |

No new assistant, marketing widgets, AI artwork, or automatic launching behavior was added. Native configuration selectors were retained to keep the existing forms stable. Existing batch engines and profile data boundaries remain the source of truth.

## Validation

- 11 focused directory, rail-order, and universal-description tests pass.
- Lint of all changed TypeScript files is clean; the production Vite bundle succeeds.
- Desktop, tablet, and narrow viewport checks, including full business names, wrapped tool detail text, and header overflow.
- Combined downloader found by YouTube and Medal; unmatched search recovery.
- Pin/unpin updates and unsaved-sidebar feedback; temporary pin changes restored.
- Both business profiles show their separate sidebar choices; Christmas UGC reaches its existing universal description.
- Search contains focus, removes duplicate UGC destinations, scrolls keyboard selection, and restores focus on close.
- Hidden downloader restored through the recovery view; original visibility restored after testing.
- At 390px, the header stays within the viewport and the application ends exactly where the bottom rail begins (772px). Desktop checked at 1280px, tablet header at 900px, and compact header at 320px.
- Browser reported no console errors in the final check.
- Existing UGC batch observed; validation did not start, stop, or publish a batch.

Full TypeScript checking remains blocked by existing UGC renderer and server type errors outside this UI change. The Vite production bundle succeeds.

Screenshots: [desktop](D:/toolsai/control-center/output/tool-center-desktop.jpg), [mobile](D:/toolsai/control-center/output/tool-center-mobile.jpg).
