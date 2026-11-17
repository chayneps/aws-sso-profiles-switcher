# Profile color palette — v1

The chooser has four fixed colors and four shared custom slots. These colors
identify profiles; they do not automatically assign production/development or
health meanings. The extension's orange/black branding stays independent.

## Research and tone selection

The selected tones come from [IBM Carbon's official color tokens](https://www.carbondesignsystem.com/building-blocks/foundations/color/tokens).
These midtone red, green, and blue accents have similar measured luminance; the
warmer golden yellow avoids a fluorescent pure yellow. Using the same hex in
both themes preserves each profile's visual identity.

| Choice | Carbon tone | Hex | Black text contrast |
| --- | --- | --- | --- |
| Red | Red 50 | `#FA4D56` | 6.26:1 |
| Yellow | Yellow 30 | `#F1C21B` | 12.47:1 |
| Green | Green 50 | `#24A148` | 6.27:1 |
| Blue | Blue 50 | `#4589FF` | 6.28:1 |

Ratios are calculated locally from sRGB relative luminance. These are text-on-fill
ratios, not a claim that every pair of colors is distinguishable to every user.
The existing console adapter chooses black or white foreground for arbitrary
custom colors; all four presets select black.

[W3C's Use of Color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
requires additional cues. The chooser displays names, selected checkmarks,
underlined selected labels, and `aria-pressed`, rather than relying on hue alone.
[W3C's Non-text Contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
also informs the visible neutral swatch boundary (`#767676`), particularly for
yellow on light surfaces. Profile/account text still identifies each console.

## Interaction and persistence

- The compact Color button opens the same chooser from a card or Edit dialog.
- Clicking a preset applies it. In Edit it changes the draft until Save profile.
- Click + in an empty custom slot to use Chrome's native color picker. Choosing
  a color saves that slot and applies it. Canceling the picker writes nothing.
- Clicking a saved custom swatch applies it immediately. Its pencil opens the
  native picker to edit it. Four custom slots are available across all profiles.
- Slots live in local `config.ui.customColors` as four nullable hex values. Old
  configuration gets four empty slots. Sync/reload preserve them; JSON export
  includes them. Import merges populated slots, preserving existing values when
  an incoming slot is empty (including INI imports).
- Applying a color copies the hex to the profile. Editing a custom slot later
  does not recolor other profiles that previously used its old value.
- Existing colors, including colors outside the palette, remain intact until the
  user selects another color. New profiles default to the Blue preset.
- Version, schema version, permissions, and authentication flow stay unchanged.
