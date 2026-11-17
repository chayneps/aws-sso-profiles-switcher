export const $ = id => document.getElementById(id);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(label, action, className = 'button secondary') {
  const node = element('button', label, className); node.type = 'button';
  node.addEventListener('click', action); return node;
}
export function status(message, error = false) {
  const node = $('status'); node.textContent = message; node.classList.toggle('error', error);
  node.hidden = !message;
}
export async function attempt(action) {
  try { return await action(); } catch (error) { status(error.message, true); return null; }
}
export function replaceOptions(select, portals) {
  const value = select.value;
  select.replaceChildren(...portals.map(p => {
    const option = element('option', p.label || new URL(p.id).hostname); option.value = p.id; return option;
  }));
  if (portals.some(p => p.id === value)) select.value = value;
}
export function showDemo() {
  if (globalThis.__SSO_DEMO__) { const banner = element('div', 'Demo preview · sample data only · no AWS connection', 'demo-banner'); document.body.prepend(banner); }
}
