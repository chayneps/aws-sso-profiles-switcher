import {readConsoleIdentity} from '../core/identity.js';
import {createAppearance} from '../core/appearance.js';
const media = matchMedia('(prefers-color-scheme: dark)'), appearance = createAppearance(document, media);
let lastSignature = '', timer, stopped = false;
const observer = new MutationObserver(mutations => {
  // Our mutations run while disconnected. Watch identity, native strip and icon resets.
  if (mutations.some(m => m.type !== 'attributes' || m.target.matches?.('#nav-usernameMenu, #awsc-nav-header, [data-testid$="awsc-nav-account-menu-button"], [data-aws-sso-account-accent], [data-aws-sso-header-accent], [data-aws-sso-top-accent], link[rel~="icon" i], #aws-sso-profile-favicon') || m.target === document.body || m.target === document.documentElement)) schedule();
});
function observe() { observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'class', 'style', 'href', 'rel', 'type', 'sizes', 'media']}); }
function schedule() { if (!stopped && !timer) timer = setTimeout(() => { timer = null; update(); }, 350); }
async function update() {
  if (stopped) return;
  const identity = readConsoleIdentity(document, location.href);
  try {
    const response = await chrome.runtime.sendMessage({type: 'CONSOLE_IDENTITY', identity});
    if (!response?.ok) throw new Error('Disconnected');
    const profile = response.profile || null;
    const signature = JSON.stringify([profile, media.matches, identity, document.body?.className]);
    if (signature === lastSignature && (!profile || appearance.isCurrent())) return;
    observer.disconnect(); appearance.apply(profile); lastSignature = JSON.stringify([profile, media.matches, identity, document.body?.className]); observe();
  } catch {
    observer.disconnect(); appearance.clear(); stopped = true;
  }
}
chrome.runtime.onMessage.addListener(message => { if (message.type === 'RECHECK_CONSOLE') { lastSignature = ''; schedule(); } });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.config) { lastSignature = ''; schedule(); } });
media.addEventListener('change', () => { lastSignature = ''; schedule(); });
window.addEventListener('hashchange', schedule); window.addEventListener('popstate', schedule);
observe(); schedule();
