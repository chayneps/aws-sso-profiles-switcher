// Self-contained so Chrome can serialize this function for executeScript.
// Read public page state only; AWS does not expose a documented preference API.
export function readMultiSession(doc = document, href = location.href) {
  let url;
  try { url = new URL(href); } catch { return {status: 'unknown'}; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !/^(?:[a-z0-9-]+\.)*console\.aws\.amazon\.com$/.test(url.hostname)) return {status: 'unknown'};
  const labels = [];
  for (const node of doc.querySelectorAll('button, a, [role="button"], [role="menuitem"], input[type="button"]')) {
    if (node.closest('[hidden], [inert], [aria-hidden="true"]') || !node.getClientRects().length) continue;
    const style = doc.defaultView.getComputedStyle(node);
    if (style.visibility !== 'visible' || style.display === 'none') continue;
    labels.push(...[node.textContent, node.getAttribute('aria-label'), node.value].filter(value => typeof value === 'string').map(value => value.replace(/\s+/g, ' ').trim()));
  }
  // Explicit opt-in controls override even an old session URL after opting out.
  if (labels.some(label => /^(?:Turn on|Enable) multi-session$/i.test(label))) return {status: 'disabled', source: 'console-control'};
  if (labels.some(label => /^Disable multi-session$/i.test(label))) return {status: 'enabled', source: 'console-control'};
  // AWS documents <12-digit-account>-<session-id> as the multi-session host.
  if (/^\d{12}-[a-z0-9]+\.(?:[a-z0-9-]+\.)*console\.aws\.amazon\.com$/.test(url.hostname)) return {status: 'enabled', source: 'session-url'};
  return {status: 'unknown'};
}
