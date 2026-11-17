# AWS SSO Profiles Switcher — product specification

## Session occupancy and closing (v1)

- Place the session-count disclosure on the PROFILES heading row. Open its list
  in an anchored floating overlay without moving profiles or growing the popup.
  Constrain it to the popup bounds and scroll long lists. Support Escape, outside
  click, focus leaving, and a close button; Escape/close returns focus to the count.
  Keep inactive
  account borders and IDs muted; use orange only for accounts with a resolved
  active session, including a session for a hidden role. Keep portals distinct.

- Show native session occupancy out of five in the popup; deduplicate service,
  region, and duplicate tabs by AWS session key. Include retained native sessions
  without tabs and identities not saved or visible in the profile catalog.
- Place a session dot at the end of each active profile row. Hover and
  keyboard focus reveal ×; its accessible label names the session to close.
- Expand the count to access all detected sessions, including hidden profiles.
- Recheck capacity in the worker before federation. At capacity, alert and expand
  the close list; leave existing-tab focus and native-session reuse available.
- Discover AWS's verified, session-specific sign-out link in a disposable inactive
  console tab. Navigate only that tab, without activating an AWS window or
  navigating working tabs. Never use sign-out-all or text-only action matching.
- Confirm removal using a fresh complete native registry. A last-session redirect
  to AWS sign-in can confirm it only if Chrome exposes that URL. Keep unconfirmed
  requests counted and clearly labelled. Errors stay in the popup. Always clean
  up disposable tabs, and ignore stale pre-closure menus after confirmed removal.
- Read the native registry on open/focus and every 30 seconds while visible.
  Unavailable registries yield an explicitly partial “detected” count, not a claim
  of verified authentication. No cookie/token access or new permissions.

Status: implementation baseline. Updated: 2026-11-09.

## Purpose

Build a Chrome extension that makes AWS accounts and permission sets easy to find,
open, and distinguish visually. The primary user has one Microsoft-backed AWS IAM
Identity Center login and many account/permission-set assignments. An extension
profile represents one assignment, not an independent identity-provider login.

The user requested a specification and design followed by implementation delegated
to a GPT-6.1 Sol agent with high reasoning. Local development and tests are
authorized. Commits, pushes, pull requests, deployments, and AWS resource or
permission changes are outside this work.

## Established facts

- AWS supports up to five simultaneous console identities per browser when native
  multi-session is enabled. Saved extension profiles are not limited to five.
- IAM Identity Center supports account/permission-set console shortcut links.
- On the user's signed-in portal, all 28 account links were present on one page.
  Expanding all account rows through the browser revealed 29 account/permission-set
  pairs with four distinct permission-set names, including one account with two
  permission sets. This verified the source DOM, not the installed importer.
- Permission-set links use `#/console?account_id=…&role_name=…` and can be read
  from the page. Import does not require opening the Access keys dialog.
- AWS Extend Switch Roles supplies a useful compact popup, color markers, search,
  keyboard navigation, and region preferences. It does not directly switch SSO
  account assignments. Its extension UI's dark mode is not per-console theming.
- Independent console themes remain a compatibility concern: AWS service pages
  and embedded frames do not all use the same theme implementation.

## MVP scope

### 1. Portal onboarding

The user connects an HTTPS AWS access-portal URL at the top of Manage. Accept the `awsapps.com` and
Identity Center `portal.<region>.app.aws` portal forms, including their required
base paths. Ignore the portal's current route/query when storing its base URL.
Reject unrelated domains, credentials in URLs, unsupported protocols, and malformed
addresses. Request access only to the configured portal's concrete origin.

Provide an Open portal action. The user signs in normally, including Microsoft
SSO and MFA, in that tab. The extension neither reads nor fills Microsoft pages.
Show an actionable message if the portal is not signed in or permission is absent.

### 2. Portal as the source of truth

Portal setup comes first in Manage. With no portal, opening the popup opens Manage
and focuses the portal URL field. With a saved portal, opening either view reads
cached profiles without initiating sync, navigation, or permission prompts.
Reuse an active sync or pending sign-in rather than starting duplicates when
manually requested. Connecting a named portal starts initial synchronisation;
**Synchronise** refreshes it manually. Read every account/permission-set pair from
its rendered Accounts view and persist the full discovered catalog automatically.
There is no separate save step. **Show in popup** controls shortcuts independently
from discovery, persistence, saved order, and appearance. New profiles are shown by
default. Hiding one never deletes it or affects AWS access.

Use an extension-owned sync tab and clear its filters/start from page one, leaving
user portal tabs intact. Handle delayed role disclosure, pagination, bounded work,
progress, and cancellation. The inactive sync tab closes after success; sign-in
and active tabs remain open. Never launch roles or open Access keys during sync.

An alarm checks due portals every five minutes. The default interval is 30 minutes,
with 15 minutes, hourly, and manual-only choices. Alarms can be delayed by Chrome
or device sleep and do not run when Chrome is closed. Recreate the alarm after
extension reload/startup. Persist intervals, sync state, and catalog in local
storage; only live jobs/tab connections are temporary session state.

When access is unavailable, navigate the sync tab to the normal portal once so
AWS/Microsoft can renew SSO. If interactive sign-in is required, show that status,
keep the existing catalog, and wait for the user to complete credentials/MFA.
Resume when that tab returns to the portal. Pause periodic retries while sign-in
or host access is missing; avoid repeated login tabs. Do not read Microsoft pages.

Stable keys are `(portal, account ID, permission set)`. Sync updates account names
and last-seen metadata while preserving labels, themes, colors, regions,
and popup visibility. Partial or interrupted results cannot mark unseen profiles
missing. Complete syncs mark absent profiles not-seen and omit them from the popup,
while retaining their settings for a later return. This is not proof of revocation.

### 3. Profile picker

A compact toolbar popup is the main entry point. It works from any website and
shows saved profiles without requiring the current tab to be AWS.

- Show a compact icon toolbar: magnifying glass for search, circular arrow for
  profile sync, and gear for Manage. Give each button a name and tooltip.
- Hide the search field until requested. Support Ctrl/Command+K and `/` to open it.
  Search by display name, account name, account ID, and permission-set name.
- Filter out profiles with Show in popup disabled or marked absent by a complete sync.
- Group roles by account in a bordered fieldset, with account name and number in
  the border legend. Show the number once per group, never as repeated tile text.
  Each tile shows its permission set or custom label, profile color
  and any observed open-tab state. Keep full account/role context in
  accessible action names. Distinguish observed tabs from verified live sessions.
- Apply the same account grouping to Manage, retaining every role's appearance,
  visibility, and launch controls. Portal/account pairs remain separate when
  multiple portals contain the same account, with the portal label disambiguating.
  In Manage, stack the full account name above its number in the border legend.
  Place an unlabeled visibility checkbox at the top right, with a descriptive
  hover title and accessible name. Put Edit and Color together below the
  theme metadata. Remove the Open button: double-clicking a tile or pressing
  Enter on the focused tile opens/focuses its profile. Nested control interaction
  must never launch a profile. Pack account groups in responsive columns without
  stretching small groups or reserving row space beneath them.
- Arrow keys move selection; Enter opens/focuses it; Escape clears search, then
  collapses the search field, then closes. Sync exposes a portal chooser only
  when multiple portals exist. A healthy single portal needs no permanent row.
- Saved manual account order applies; roles use alphabetical order. Labels and secondary text remain readable at popup width.
- Account name/number headers initiate drag-and-drop reordering in both views.
  Move the whole account with all roles, before/after another group. Persist one
  shared account order. Any account can move before/after any other account.
  Legacy pin flags do not affect ordering or restrict movement.
  Alt+Up/Down on a focused header provides keyboard reordering. Retain hidden
  accounts and exact portal/account identity; never mutate role appearance or
  launch a profile while reordering. Sync/reload/JSON transfer preserve order.
- Group after searching/filtering; omit empty groups and keep keyboard selection
  aligned with the displayed account/role order, including manually reordered groups.
- Hide healthy status; expose reconnect/grant/retry only for portal problems and
  show a progress indicator during sync. Keep imports and setup in Manage.

### 4. Launch and focus

Build a validated, URL-encoded Identity Center shortcut for a selected profile.
Use its preferred region when set. Focus an existing confidently matched console
tab; otherwise open the shortcut in a new tab and let AWS handle authentication.
Do not invent AWS session subdomains or silently evict existing sessions.

Treat unknown multi-session state separately from a verified disabled state.
Show setup instructions and Open AWS console / Recheck actions in Manage and the
popup only when explicitly disabled. Recheck every 30 seconds in a visible UI
and when returning to it; never trigger portal sync from that check. Hide the
alert again on recovery. Revalidate before a new federation; only an explicit
disabled result prevents it. An unknown result permits the initial console to
open. Existing confidently matched tabs can be focused in any mode.
Detect the documented account/session hostname or visible multi-session controls
on open console pages. A normal regional hostname alone is unknown. Explicit
native session evidence wins over stale Enable controls in another tab. With no
observable console, remain unknown without locking the picker. Do not persist a
user-confirmed enabled preference.
Document that page evidence may be stale and English control detection may not
recognize localized UI; session-host detection is independent of display language.
Explain the five-active-identity limit in onboarding.
Open new profiles in a named Chrome tab group (default AWS SSO, orange), configurable
in Manage. Reuse an exact-name group in the new tab's window. Focus and expand an
existing matching tab, preserving a group the user already assigned. Repeated
clicks during an owned pending sign-in reuse that tab. Group failures cannot
discard the new tab or cause a duplicate on retry.
Do not present counts based on open tabs as authoritative AWS session counts.
Session expiry, denied access, and native session-capacity prompts remain visible
to the user. AWS, not the extension, enforces authorization.

### 5. Per-profile appearance

Expose a compact Color chooser on each configuration card, with its hex value
available in the chooser/tooltip. Offer exactly four fixed named presets (Red,
Yellow, Green, Blue) and four shared custom slots; only custom-slot editing opens
the native color picker. A saved custom swatch applies immediately; its pencil
edits the slot. Save only that profile's color, preserving its other preferences
and portal metadata; notify matched consoles after changes. Use the same chooser
in Edit, updating the draft until Save. Existing colors remain intact and custom
slot edits do not recolor other profiles. New profiles default to Blue.
Colors mark cards, popup entries, the AWS account menu, and header accents,
including the native full-width top color strip. Do not add a floating profile
badge. Suppress the native inner account-color corner shadows and use flat upper
button corners so the menu joins the strip cleanly.

Matched AWS console tabs also use a locally generated thought-cloud favicon in the
profile color. Keep the existing favicon links and restore them on identity loss
or adapter cleanup. Changes to color, favicon attributes, replacement icon nodes,
and document head replacement must reapply the appearance without observer loops.
Sign-in and unmatched pages retain native icons. No new host or tab permissions.

Save `light`, `dark`, or `system` plus an accent color for each profile. The popup
and settings page have a separate system-following appearance.

Apply console appearance only after resolving the page to the correct account
and permission set. Two permission sets in one account must remain distinct.
Use a page-local adapter for existing AWS/Cloudscape mode classes and supported
attributes. Use native account/role labels and profile accents; add no floating
profile overlay. Do not write global
AWS user preferences or use color inversion of the entire page.

Use the exact profile hex color for the native account-button background,
overriding the nested AWS account-color strip. Pick black or white text for
contrast. Scope CSS to marked account/header elements, preserve their original
inline properties, and remove all extension accent state on cleanup. Detect a
replaced account button/header even when account/role text is unchanged.

Reapply on supported client-side navigation and root replacement without an
unbounded mutation loop. Follow system mode changes. Remove extension styling
when a mapping becomes invalid. If identity is uncertain, leave the page unstyled;
report unsupported theme capability through adapter metadata without an overlay.
Embedded service frames and unsupported consoles may retain their native theme.

### 6. Management and portability

Provide add/edit/delete, drag ordering, theme/color/region controls, JSON export
and import with schema validation, and pasted/uploaded AWS INI configuration.
Support modern `[sso-session name]` references and legacy inline SSO fields.
Recognize AWS Extend Switch Roles profile fields where they can be mapped; clearly
report IAM assume-role entries that cannot become SSO assignments without portal
and permission-set information. Imports must allowlist fields and discard credential
values; exports contain configuration only. Do not read local AWS files implicitly.

## Initial boundaries

- Chrome Manifest V3 and the standard commercial AWS partition.
- Browser-local configuration; browser sync is deferred.
- One portal is sufficient for onboarding; keys include portal identity to avoid
  collisions if additional portals are added.
- No backend, telemetry, credential store, cookie swapping, token extraction,
  token-based background SSO renewal, policy enumeration, or AWS resource operations.
- Microsoft login is completed through the normal browser UI.
- No promise of independent Microsoft users or more than five native sessions.
- Custom profile images are an optional later enhancement.

## Acceptance criteria

1. A user can import a paginated portal containing accounts with multiple roles;
   every account/role pair is persisted once, and the picker shows only visible, present profiles.
2. Sync waits for delayed role loading, auto-saves results, and reports partial/failed scans honestly.
3. Synchronisation preserves appearance, visibility, and saved account order; cancellation/authentication failure
   cannot delete the previous catalog.
4. Search and keyboard navigation work, including an empty result set.
5. Launch links retain the configured portal base path and encode role/destination
   values; invalid hosts, account IDs, regions, and unsafe payloads are rejected.
6. Two roles in one account cannot be incorrectly deduplicated or themed together.
7. Light and dark profiles remain independent in supported simultaneous console
   tabs. Unknown identities are not automatically assigned a profile.
8. Settings and catalog survive service-worker suspension and browser restart;
   tab mappings are revalidated and stale mappings discarded.
9. A production build loads as an unpacked MV3 extension and contains only local
   executable code and the permissions needed for its features.
10. Tests cover parsing, merge semantics, URL validation, async portal discovery,
    identity matching, and appearance cleanup. Browser checks cover the popup and
    settings UI. Actual Chrome/AWS checks are reported separately from fixtures.
11. Explicitly disabled multi-session status prevents new federation, including
    keyboard and direct-message paths. Unknown checks do not disable tiles.
12. A profile color can be changed on its configuration card; popup and matched
    console appearance update, and resync/reload preserve it.
13. Matching open tabs are reused without an observation-cache dependency, and
    new tabs use the configured group. Distinct permission sets stay distinct.
14. Reconnect is shown only for observed sign-in requirements. A readable Accounts
    page clears stale saved auth errors without changing the catalog or sync time.

## Delivery

Supply readable source, a reproducible build, automated tests, an unpacked `dist/`
extension, and a README covering installation, portal import, native multi-session,
testing, troubleshooting, privacy, and theme compatibility. Report verification
limits; do not call a simulated browser test a live AWS/Chrome extension test.

## References

- https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/multisession.html
- https://docs.aws.amazon.com/singlesignon/latest/userguide/createshortcutlink.html
- https://docs.aws.amazon.com/singlesignon/latest/PortalAPIReference/API_ListAccounts.html
- https://docs.aws.amazon.com/singlesignon/latest/PortalAPIReference/API_ListAccountRoles.html
- https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html
- https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/edit-unified-settings.html
- https://github.com/tilfinltd/aws-extend-switch-roles
- https://github.com/tilfinltd/aws-extend-switch-roles/blob/main/LICENSE
