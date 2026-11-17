// Fixed profile accents, selected from the IBM Carbon palette. See docs/COLORS.md.
export const PRESET_COLORS = Object.freeze([
  Object.freeze({name:'Red',value:'#fa4d56'}),
  Object.freeze({name:'Yellow',value:'#f1c21b'}),
  Object.freeze({name:'Green',value:'#24a148'}),
  Object.freeze({name:'Blue',value:'#4589ff'})
]);
export const CUSTOM_COLOR_COUNT = 4;
export const isHexColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function customColors(value) {
  if (value == null) return Array(CUSTOM_COLOR_COUNT).fill(null);
  if (!Array.isArray(value) || value.length !== CUSTOM_COLOR_COUNT || value.some(color=>color!==null && !isHexColor(color))) throw new Error('Custom colors must have four hex colors or empty slots.');
  return Array.from(value,color=>color?.toLowerCase() || null);
}
