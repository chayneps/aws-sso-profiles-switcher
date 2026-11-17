import {normalizePortal, sanitizeProfile, validAccount, validRegion} from './model.js';
export function buildShortcut(input) {
  const p = sanitizeProfile(input);
  const url = new URL(p.portalId);
  const params = new URLSearchParams({account_id: p.accountId, role_name: p.permissionSet});
  if (p.region) {
    const destination = new URL('https://console.aws.amazon.com/console/home');
    destination.searchParams.set('region', p.region);
    params.set('destination', destination.href);
  }
  url.hash = `/console?${params}`;
  return url.href;
}
export function parseRoleLink(href, portalId) {
  try {
    const base = normalizePortal(portalId), url = new URL(href, base);
    if (url.origin !== new URL(base).origin || url.pathname !== new URL(base).pathname) return null;
    const match = url.hash.match(/^#\/console\?(.+)$/);
    if (!match) return null;
    const q = new URLSearchParams(match[1]);
    if (q.getAll('account_id').length !== 1 || q.getAll('role_name').length !== 1) return null;
    const accountId = q.get('account_id'), permissionSet = q.get('role_name');
    if (!validAccount(accountId) || !permissionSet || permissionSet.length > 128 || /[\u0000-\u001f\u007f]/.test(permissionSet)) return null;
    return {accountId, permissionSet};
  } catch { return null; }
}
export function isConsoleUrl(input) {
  try { const u = new URL(input); return u.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*console\.aws\.amazon\.com$/.test(u.hostname) && !u.port && !u.username && !u.password; } catch { return false; }
}
export function isMultiSessionUrl(input) {
  return isConsoleUrl(input) && /^\d{12}-[a-z0-9]+\./.test(new URL(input).hostname);
}
export function portalOriginPattern(id) { return `${new URL(normalizePortal(id)).origin}/*`; }
