# Implementation validation

## Remove console badge and unify native top accent — 2026-11-10, v1

- Removed the bottom-right extension profile box, including cleanup of a legacy
  box. Identity remains in AWS's native top-right menu; no extra overlay is added.
- Read-only live AWS inspection identified the 4 px top strip as the direct
  `role=img` child of `#awsc-nav-header` with an `Account color:` label. The native
  inner menu corners used gray ±4 px pseudo-element box shadows matching the
  user's artifact. No live page styles, AWS preferences, or resources were changed.
- The adapter colors that strip, removes the redundant inner corner shadows,
  and uses flat upper menu corners. Existing native styles restore on mismatch;
  strip replacement/reset detection remains idempotent without a badge element.
- 124 tests pass. Build passes and version remains `1.0.0`. Tests cover top-strip
  coloring/cleanup, style and node replacement, legacy overlay removal, absence
  on unsupported pages, and existing favicon/theme behavior.
- Browser sample: strip and button both computed `rgb(36,161,72)`; both corner
  pseudo shadows were `none`, radius was `0 0 4px 4px`, and badge count was zero.
  Clearing restored native gray strip/corner shadows and retained no overlay.


## Remove profile pins — 2026-11-10, v1

- Removed pin controls from popup rows, configuration cards, and the profile
  editor. Removed pin commands, schema fields, and sorting/tier restrictions.
  Legacy favorite/pin timestamps are ignored during configuration sanitization.
- Saved manual account order remains unchanged. Any account can move above any
  other account; roles use alphabetical order. Visibility, colors, custom palette,
  sessions, portal sync, JSON transfer, and account identities retain their behavior.
- 122 tests pass and build passes. Updated former pin tests to check legacy-field
  compatibility, absent controls, unrestricted account moves, and retired-command
  rejection. Version remains `1.0.0`.
- Browser sample verified zero pin controls in both views/editor and moved the
  formerly pinned Development account below Staging. Both views showed the same
  saved order. No AWS sessions or resources were changed.



## Floating session list — 2026-11-10, v1

- 122 tests pass; production build passes; version remains `1.0.0`.
- Replaced the flow-expanded session list with a fixed overlay anchored to the
  count. Its bounded height scrolls internally. Existing close-session actions
  and capacity warnings use the same list. Added dismissal/focus tests; profile
  keyboard launch is suppressed while the overlay is open.
- Browser sample confirmed profile top stayed `124.296875` px and popup height
  stayed 297 px before/after opening. A five-session panel stayed within the
  popup (bottom 291 px) and scrolled internally. Escape restored count focus;
  the close button collapsed the panel. No AWS resources or sessions changed.


## Thought-cloud tab icon — 2026-11-10, v1

- Replaced the circle with a compact vector silhouette of the logo's main
  thought cloud. No lettering or detached dots. The saved profile color fills
  the cloud; a thin neutral outline remains visible against tab backgrounds.
- 121 tests pass and build passes; version remains `1.0.0`. Existing update and
  native-icon restoration behavior is unchanged. The SVG test checks one path
  without circles, text, image resources, or injected markup.
- Browser sample verified a blue cloud SVG loads at 32 px under the existing
  data-image content policy. No live AWS settings were changed.


## Profile-colored tab icons — 2026-11-10, v1

- 121 tests pass; production build passes; version remains `1.0.0`. No new
  permissions, network calls, account preferences, or AWS resources were changed.
- Read-only inspection of the signed-in AWS console confirmed a declared
  `img-src` policy allowing `data:` images. No live favicon replacement or
  installed-extension reload was performed on that AWS tab.
- The actual appearance adapter was browser-tested in a local sample under
  `img-src 'self' data:`. Red and blue tabs retained independent colors; both SVG
  resources loaded successfully. Clearing the profile restored the native sample
  square icon. The pictured tab layout is a sample using the actual favicon image,
  not a screenshot of Chrome's browser chrome or a live AWS session.
- Tests cover safe SVG generation, original icon nodes/attributes/order,
  multiple icon sizes, untouched touch icons, head replacement, removed/changed
  favicon links, media resets, color updates, identity loss, and idempotent cleanup.
  A bundled content-script test verifies mutation-driven repairs without a loop.


## Shared draggable account order — 2026-11-10, v1

- 117 tests pass; production build passes; release and schema remain v1.
- Tests cover whole-group relative movement, hidden accounts, independent portal
  keys, pinned tiers, invalid/external actions, worker reload, sync, JSON transfer,
  import preservation, native drag/cancel handlers, keyboard moves in both views,
  popup role-navigation order, and header focus across refreshes.
- Actual browser drag in the sample popup moved Staging ahead of Production.
  Manage loaded that order. A drag from Production's config header into Staging's
  group body moved Production ahead again; the popup reflected it. Header-only
  targeting initially did not complete that config drag; the full group drop
  target worked. Alt+Up on Staging then reordered both views and kept header focus
  through the debounced refresh. No AWS sessions or resources were changed.
- Account order is shared and persistent. Pinned accounts remain above unpinned
  accounts. Reordering moves account groups, not individual role tiles.



## Four presets and four custom colors — 2026-11-10, v1

- 111 tests pass; production build passes. App and schema versions remain v1.
- Presets are Carbon Red 50, Yellow 30, Green 50 and Blue 50. Locally calculated
  black-text contrast exceeds 6:1 for all four; see [color research](COLORS.md).
  Names/checkmarks and a neutral boundary support both themes.
- Cards and the Edit dialog use the same modal chooser. Exactly four custom
  slots use native color inputs. Saved custom slots are shared across profiles;
  applying one copies its hex instead of linking other profiles to later edits.
- Tests cover choice/selection indicators, custom save and reuse, draft-only
  editor changes, legacy migration, invalid inputs and senders, worker reload,
  synchronization, JSON transfer, and import merging without clearing old slots.
- Browser-tested local sample UI in light/dark modes: preset applies immediately,
  native color-input changes save a custom slot, another profile can reuse it,
  and editing that slot does not recolor earlier users of its previous value.
  No live AWS changes were made.



## Compact configuration cards and packed columns — 2026-11-10, v1

- 104 automated tests pass; production build passes; version stays `1.0.0`.
- New configuration-page tests cover tooltip/accessibility labels, visibility
  persistence, pin changes, Edit dialog opening, double-click versus single click,
  nested-control exclusion, Enter from the tile only, and capacity alerts.
- Browser-tested the local sample config UI: double-click reused a sample session,
  checkbox changes saved, and Edit opened/closed its dialog. No AWS account changes.
- Layout sample includes 15 roles across 11 accounts with uneven group sizes and
  a long full account name. Three responsive columns showed 10 px gaps within
  each column, account name above number, and no row-height gaps. Sample cards
  measured about 104 px, down from 136 px. Account groups remain intact.
- Popup layout and native session behavior retain their existing controls.


## Active account emphasis and shared heading — 2026-11-09, v1

- 101 tests pass; production build passed; release remains `1.0.0`.
- In both views, account borders and IDs are muted unless a native session maps
  to that account and portal. Hidden roles still activate their account border.
  Added coverage for portal separation and removing emphasis after session polling.
- Popup session count now shares the PROFILES/catalog-count row. Its accessible
  disclosure button opens the existing close-session list. Capacity alerts still
  expand it; it remains available when no saved profiles are visible.
- Browser sample preview verified inactive borders `rgb(54,54,54)` and active
  orange `rgb(255,153,0)`, aligned heading controls, and disclosure toggling.
  The sample popup shrank from 348 px to 327 px. No live AWS actions performed.


## Session count, close controls, and capacity — 2026-11-09, v1

- 100 tests pass; production build passed. Version remains `1.0.0`; no permissions
  were added. Tests cover native registry parsing, session deduplication, hidden
  identities, capacity guards, pending reservations, existing-tab/session reuse,
  close targeting, changed identities, portalled native menus, and exclusion of
  sign-out-all. Popup tests cover count/marker updates and capacity warnings.
- Read-only inspection of the signed-in AWS menu confirmed its other-session
  tiles, native count, legacy session-scoped logout link, and current sign-out
  submenu. Menu panels were restored closed. No live sign-out was executed.
- Browser-tested the sample popup: 2/5 count, dots beside pins, keyboard focus
  replacing a dot with ×, closing a sample reducing the count, and a 5/5 capacity
  warning expanding all sessions including unsaved identities. Production logout
  requires installed-extension testing; automated tests and sample UI are not
  evidence of an actual AWS sign-out.



## Native console accents and compact pins — 2026-11-09, v1

- All 91 automated checks passed; production build passed. Extension/package
  version remains `1.0.0`; no new permissions or AWS API calls were added.
- Inspected the actual Chrome AWS console header read-only. Confirmed
  `#nav-usernameMenu` is a button, its nested account-color strip paints gray,
  and `#awsc-nav-header` is the navigation header. No native account preferences
  or AWS resources were changed.
- The actual appearance adapter was browser-tested on a clearly labeled local
  fixture using that observed structure. Orange produced `rgb(255,153,0)` with
  black text; `#123456` produced white text. Nested backgrounds were transparent,
  and the header had the matching inset accent. Clearing restored the original
  gray `rgb(125,137,152)` and removed the stylesheet. Replacing the account
  button reapplied the accent with exactly one stylesheet.
- Added tests for native-style cleanup, profile/color changes, header replacement,
  inline style resets, known test IDs, safe color fallback, and foreground choice.
  Actual installed-extension styling still requires extension reload and console
  refresh; the local fixture is not evidence of a deployed AWS setting change.
- Account borders are orange in both views. Popup single-line rows reduced from
  43 px to 30 px, and sample settings cards from about 215 px to 136 px. The same
  four-role popup reduced from 418 px to about 319 px including its demo banner.
- Pin icons replace stars. Browser preview verified that pinning Staging moved
  its account and role first. Existing favorite flags become pins; new pin order
  timestamps persist through editor saves, worker reload, sync, and JSON transfer.
  Tests cover pin/unpin, ordering, unchanged preferences, and keyboard launch.



## Account grouping in both views — 2026-11-09, v1

- 84 automated checks passed. Added popup coverage for multiple roles inside one
  account border, account-number search, no account ID in role-tile text, keyboard
  launch order across interleaved favorites, and overlapping accounts from two
  portals retaining their distinct launch IDs.
- Both views use shared fieldset/legend markup with account name and number in
  the border. Popup tiles and Manage cards show role/custom-label titles, while
  each role retains color, favorite, visibility, and launch controls. Saved data
  and Chrome tab grouping behavior are unchanged.
- Browser preview verified a four-profile catalog rendered as three account
  groups, with Developer and ReadOnly together under Development. Searching by
  its account number kept only that group and its two roles. Manage rendered
  three groups/four cards and zero account-number labels inside those cards.
- Dark-mode previews were visually checked. The production build passed, and
  extension/package version remains `1.0.0`. Preview uses sample accounts; no
  AWS portal or resources were changed.



## False warnings, clickable tiles, and tab groups — 2026-11-09, v1

This supersedes the earlier policy that blocked all unknown multi-session checks.

- 82 automated checks passed. `npm run build` passed and release metadata remains
  `1.0.0`. Added only the `tabGroups` permission; no broad `tabs`, cookies, or
  Microsoft access is used. Group API behavior follows Chrome's
  [tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-group)
  and [tabGroups](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) APIs.
- Unknown multi-session status no longer shows setup or disables tiles. Native
  session URLs are recognized without needing a successful script injection and
  take precedence over stale Enable controls in another tab. Explicit disabled
  evidence still blocks new federation. Existing matched tabs may be focused.
  Tiles themselves remain clickable so the worker can discover and focus an
  existing tab even when the UI currently reports multi-session disabled.
- A read-only portal probe distinguishes rendered Accounts content, explicit
  sign-in/expiry UI, and unknown loading/network state. Readable Accounts content
  clears stale saved reconnect state without changing the catalog or sync time.
  Unconfirmed failures offer Retry, not an unsupported expiry assertion.
- Read-only browser inspection of the real signed-in portal found one treegrid
  and 28 account rows. No login settings, accounts, or resources were changed.
- Worker tests cover creating/reusing/naming groups within a window, exact role
  matching without cached observations, two roles in one account, repeated
  clicks during SSO, hidden IdP URLs, group expansion, literal name matching,
  validation, group API failures, and cleanup. They run with mocked Chrome APIs;
  native tab grouping has not been verified in an installed extension.
- DOM and popup tests cover the screenshot's combination of unknown multi-session
  plus a ready portal, visible expiry versus hidden sign-in text, conflicting
  account identity, unreadable console scripts, and stale reconnect state.
- Browser preview (sample data) verified clickable tiles with unknown status,
  no setup/reconnect warning for a ready portal, and a successful launch request.
  Saved `AWS SSO Work` as the group name and verified it survived reopening Manage.

The native group/SSO lifecycle still needs the Chrome smoke test after reloading
the unpacked extension. The preview simulates launch and access state; it is not
evidence of live Chrome grouping. Portal and multi-session checks observe public
page evidence, not tokens or an authoritative authentication/preference API.

## Compact popup and explicit sync — 2026-11-09, v1

This supersedes the earlier sync-on-opening behavior recorded below.

- 70 automated checks passed and `npm run build` succeeded. Version stays
  `1.0.0`. Updated worker tests verify that opening either view never initiates
  portal navigation or requests permission; manually requested and scheduled
  syncs retain their existing coordinator behavior.
- Added tests against the actual bundled popup UI: healthy-state panels hidden,
  icon search/keyboard behavior, explicit sync and duplicate suppression, portal
  reconnect/permission failures, selecting one of multiple portals, and setup
  routing with no portal. Multi-session tests cover 30-second polling, recovery,
  hidden views, cleanup, worker errors, and a lost session between polls.
- Browser preview: the healthy three-profile popup measured 380 px wide and
  about 308 px high including the demo banner, compared with roughly 600 px
  previously. Search and the portal chooser are collapsed by default. The former
  portal status row and footer are removed; Search, Synchronise, and Manage are
  accessible icon buttons in the header.
- In the preview, the actual 30-second monitor revealed the multi-session warning
  and disabled all three launches after the simulated status changed from enabled
  to disabled, without showing a portal alert or starting sync. Unit checks also
  verify that recovery hides the alert again and that unchanged checks don't
  trigger profile sync.
- Manual toolbar sync showed temporary progress and a disabled refresh icon.
  The healthy portal shows no sign-in button; the sign-in-required fixture shows
  Reconnect. Search filtering and Escape clear/collapse behavior worked.

Polling occurs only while a popup or Manage view is visible, and also on return
to a view. Every launch still rechecks in the worker. The configured periodic
profile-sync schedule remains independent; choose Manual only in Manage to
disable it. Browser preview uses sample data and simulated authentication state;
installed Chrome/AWS integration remains a manual smoke test.



## Orange-and-black interface — 2026-11-09, v1

- Updated shared light/dark palettes, black sidebar, buttons, links, navigation,
  focus rings, checkboxes, progress, notices, favorites, counts, selected rows,
  empty states, and popup styling. Removed the prior product blue/navy palette.
- New profiles default to orange (`#ff9900`); saved profile colors remain intact.
  The console badge uses a neutral black base and its profile's chosen accent.
- All 61 existing automated checks passed. `npm run build` passed; release
  metadata remains `1.0.0`. The packaged extension contains the updated styles.
- Browser preview verified light and dark palettes, orange buttons with black
  text, the profile editor's orange default, saved custom profile colors, and
  disabled launches while multi-session status is unknown. Popup width remained
  380 px and height stayed below 600 px.
- Primary button text contrast is 8.37:1. Checked action/secondary text pairs in
  both palettes exceed 4.5:1. Light focus rings use the darker orange for contrast.
- The preview server supports `scheme=light` / `scheme=dark` to force the existing
  CSS media branch for review. This helper is excluded from the extension; the
  installed UI continues to follow the system appearance. Preview uses sample
  accounts and does not validate live Chrome/AWS behavior.




## Thought-cloud icon — 2026-11-09, v1

- Replaced the generated blue grid with orange/white/navy `sso` thought-cloud
  artwork, including the user's requested two much smaller lower-left dots.
  The master and final generation prompt are documented in [ICON.md](ICON.md).
- Exported transparent PNGs at 16, 32, 48, and 128 pixels. The build validates
  dimensions and copies reviewed source images; manifest listing and toolbar
  icons both refer to the new files.
- `npm run build` and script syntax checks passed. Verified source/package/build
  release metadata remains `1.0.0`; no version increase.
- Browser preview loaded the actual image asset successfully in the 30 px popup
  header and 44 px Manage header. Popup width remains 380 px. This verifies the
  UI asset, not the installed Chrome toolbar; reload the extension to update it.

## Release naming — 2026-11-09, v1

The user designated the current implementation **v1** (`1.0.0`). Manifest and
package metadata now use that version, and the unpacked extension was rebuilt.
Future work must keep the version unchanged unless the user explicitly requests
a version change. The implementation checks below remain applicable; their
earlier version labels record when those checks were performed.

## Multi-session prerequisite and profile colors — 2026-11-09, version 0.3.0

- 61 automated checks passed; `npm run build` produced the unpacked extension in
  `dist/`. No new permissions or configuration schema changes.
- New detector checks cover documented session hosts, ordinary/ambiguous hosts,
  visible opt-in/opt-out controls, hidden help controls, accessible button labels,
  unsafe origins, and explicit disabled evidence overriding a stale session URL.
- Actual worker modules with mocked Chrome APIs verify launch blocking for
  disabled/unknown status, rechecking after opting out or closing tabs, failed
  injection, spoofed requests, setup navigation without federation, and exact
  identity rechecks when launches are allowed. These are not installed Chrome
  integration tests.
- Profile color changes preserve other preferences and survive resynchronisation.
  Existing appearance tests also verify that changing the color updates the
  console badge's accent.
- Browser preview (sample data): disabled and unknown states lock every profile
  launch button; keyboard Enter stays on the popup and reports setup required.
  Recheck keeps the unknown state locked. The enabled fixture unlocks launches.
- Changed Production's card color to `#a855f7`, reopened settings (triggering a
  new sample sync), and observed that it persisted. The popup's matching swatch
  also displayed `rgb(168, 85, 247)`. Portal sync and editing remain available
  while launch setup is incomplete. Popup width was 380 px and height under
  600 px; content scrolls internally when necessary.

The browser preview simulates multi-session status; it does not verify an actual
AWS preference. Live detection uses only current console page evidence. There is
no documented preference API used here, no cookie inspection, and no persisted
"I enabled it" override. No open/inspectable console means unknown. A stale page
can require refreshing; unrecognized/localized controls fall back to session-host
evidence. Actual unpacked extension and AWS opt-in/out testing still requires
the manual Chrome smoke test in README.



## Opening behavior — 2026-11-09, version 0.2.1

- 53 automated checks passed. Added cases for setup without a portal, immediate
  sync on opening despite a recent sync/manual-only periodic setting, duplicate
  opening views during tab loading or an active scan, reuse of pending sign-in,
  and missing host permission with the saved catalog still returned.
- Browser preview verified that opening a no-portal popup opens the matching setup
  page and focuses the URL field. Opening with a configured portal starts sync
  immediately. The preview uses sample data; actual unpacked Chrome behavior
  remains a manual verification step.
- The opening request is separate from storage-change refreshes. The latter only
  read state, so sync completion does not start another automatic sync.
- After completion, changing a favorite in the preview kept the portal Up to date
  rather than restarting sync. Popup error logs were empty. The auto-opened setup
  tab reported two Electron preload errors from `node:electron/js2c/sandbox_bundle`;
  its setup UI loaded and the portal URL field received focus as expected.



## Portal-first synchronisation — 2026-11-09, version 0.2.0

The current flow supersedes the manual import-preview/save behavior described in
the historical results below. Portal setup is now first, all discovered profiles
auto-save, and Show in popup is an independent persisted preference.

- 48 automated checks passed. New coverage includes automatic saving, clearing
  session state during a simulated reload, visibility-preserving resync and JSON
  export, interval/manual-only scheduling, alarm recreation, unavailable access,
  SSO redirect/return, navigation interrupting a scan, safe owned-tab cleanup,
  complete/partial absence semantics, and empty versus signed-out portal pages.
- The actual worker and sync coordinator run with mocked Chrome APIs in these
  checks. They do not validate Chrome event timing or live Microsoft redirects.
- Browser preview: connected a sample portal from an empty catalog and observed
  four profiles appear automatically without a save step. Hid Developer, selected
  15-minute automatic sync, reloaded, and synced again. The catalog stayed at four
  and Developer remained hidden; the popup showed the other three profiles.
- The access portal is the first section. The compact popup fits at 320 px with
  portal status and Synchronise. Browser error logs were empty.
- `npm run build` produced the version 0.2.0 unpacked extension. Added permission:
  `alarms`, for periodic due checks. Existing version 1 configs retain their data
  and receive defaults for interval (30 minutes) and visibility (shown).

Live unpacked-extension scheduling, login return events, and real portal sync
still require Chrome verification. The test browser cannot load this extension.
Automatic sync may open an inactive portal tab; when authentication is needed it
stays available for normal user sign-in. One normal SSO navigation is attempted,
then periodic retries pause. There is no unattended credential/MFA completion.



## Popup redesign — 2026-11-09

Rebuilt `dist/` after separating popup sizing and layout into `popup.css`.
All 37 automated checks passed. Browser preview checks at 380 px and 320 px
confirmed a single-line header, a usable search field, and no horizontal overflow.
The first-run Connect AWS portal action opened the manager. A populated list,
role search, arrow/Enter launch dispatch, no-match state, and Escape clearing
worked; browser error logs were empty. These checks used the sample-data
transport. Installed Chrome popup sizing remains subject to a manual reload check.


Date: 2026-11-06. Build: 0.1.0. Runtime used for local checks: Node.js 22.23.0.

## Results

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm test` | 37 passed, 0 failed | Core behavior, DOM adapters, and coordinator with mocked Chrome APIs |
| `npm run build` | Passed | Five bundled entry points, manifest, UI assets, and generated icons in `dist/` |
| Package validation | Passed | Manifest V3, required asset paths, local UI scripts, packaged-script CSP, no preview transport in HTML |
| Signed-in portal investigation | Completed | All 28 account rows expanded through browser controls; 29 account/permission-set pairs observed |
| Development console investigation | Completed | Visible account/role header and native theme-root classes inspected |
| Options UI preview | Passed | Edit/save, reload persistence, selectable import preview, appearance-preserving merge, URL validation |
| Popup UI preview | Passed | Search by permission set, two roles in one account, no-match state, arrow/Enter action, Escape clearing |
| Preview browser error logs | Empty | No application errors reported during the observed flows |
| Installed unpacked Chrome extension | Pending | Not exercised by the in-app preview browser |
| Live extension scan, launch, and simultaneous console themes | Pending | Require installation and native multi-session setup in Chrome |

The portal inspection was DOM research through the authenticated browser. It was
not an installed-extension scan. No AWS resources, account assignments, global
appearance settings, or multi-session settings were changed. Access keys were
not opened. The development console was opened using its existing permission-set
link to inspect the visible navigation header and DOM classes.

## Automated coverage

- Accepted portal forms and unsafe URL rejection; canonical profile keys and
  encoded shortcuts; credential and email-field exclusion.
- Complete versus partial catalog merge, full-inventory absence tracking with
  selected imports, preserved customization, modern/legacy INI, and JSON roundtrip.
- Delayed multi-role disclosure, pagination and restoration, filters, account
  failures, timeouts, explicit empty assignments, and cancellation.
- Complete AWSReservedSSO role-name extraction, underscore handling, exact
  account/role matching, and cross-portal ambiguity refusal.
- Native root modes, system mode, appearance cleanup, unsupported-page messaging,
  and labels rendered as text.
- UI/content sender separation, extension-host validation, frame/job/tab checks,
  malformed result rejection, stale-tab revalidation, mocked worker recreation,
  and cancellation retaining partial results for review.

The tests intentionally use anonymized accounts and DOM fixtures. They do not
claim full AWS service coverage or validate Chrome permission prompts, worker
suspension behavior, or actual session isolation.

## Browser preview observations

The preview serves the real popup/options modules with a separate sample-data
Chrome API transport. Its banner says **Demo preview · sample data only · no AWS
connection**. No launch from that preview contacted AWS.

1. Edited the Development/Developer profile to label `Development workspace` and
   theme `dark`. Saving updated the profile card; reload retained the values.
2. Started the sample portal import, reviewed four candidates, deselected all,
   and verified Save became disabled. Selected all and saved; the customized
   label, dark mode preference, and favorite remained.
3. Searched the popup for `readOnly`, which returned both matching accounts.
   ArrowDown and Enter dispatched the demo launch. A nonexistent query showed
   the empty state; Escape restored the full list.
4. Tried `https://example.com/start` as a portal URL. The UI rejected the host
   before a portal was saved.
5. Inspected the rendered dark-system-mode layout and captured the screenshots
   below. Preview browser error logs were empty.



## Remaining manual acceptance

Follow the Chrome/AWS smoke test in [README](../README.md). In particular, verify
optional portal permissions, the real scanner against all portal rows, shortcut
launch/focus, an actual worker restart, and two native multi-session tabs assigned
different light/dark modes. Native theme compatibility is service-dependent;
nested components or embedded frames may retain AWS's styling.

The current account/role header matcher deliberately leaves unknown or ambiguous
identities unstyled. New AWS portal layouts may require a selector update. The
scanner relies on the current English loading/error/pagination labels for its
fallbacks; non-English portal compatibility is not verified. GovCloud and China
partitions are outside the current scope.
