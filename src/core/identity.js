export function permissionSetFromRole(value) {
  const match = value?.match(/(?:^|[\s:/])AWSReservedSSO_([\w+=,.@-]+)_([0-9a-f]{16})(?=\/|\s|$)/i);
  return match?.[1] || null;
}
// Self-contained for both content scripts and a fresh executeScript tab probe.
export function readConsoleIdentity(doc = document, href = location.href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !/^(?:[a-z0-9-]+\.)*console\.aws\.amazon\.com$/.test(url.hostname)) return null;
  const menu = doc.querySelector('#nav-usernameMenu, [data-testid$="awsc-nav-account-menu-button"]');
  if (!menu) return null;
  const visible = menu.textContent || '';
  const ids = [...new Set(visible.match(/\b\d{12}\b/g) || [])];
  const role = (menu.getAttribute('title') || '').match(/(?:^|[\s:/])AWSReservedSSO_([\w+=,.@-]+)_([0-9a-f]{16})(?=\/|\s|$)/i) || visible.match(/(?:^|[\s:/])AWSReservedSSO_([\w+=,.@-]+)_([0-9a-f]{16})(?=\/|\s|$)/i);
  const hostAccount = url.hostname.match(/^(\d{12})-[a-z0-9]+\./)?.[1];
  if (ids.length > 1 || !role || (!ids.length && !hostAccount) || (ids.length && hostAccount && ids[0] !== hostAccount)) return null;
  return {accountId: ids[0] || hostAccount, permissionSet: role[1], sessionHost: url.hostname};
}
export function resolveIdentity(identity, profiles) {
  if (!identity || !/^\d{12}$/.test(identity.accountId) || typeof identity.permissionSet !== 'string') return null;
  const matches = profiles.filter(p => p.accountId === identity.accountId && p.permissionSet === identity.permissionSet && (!identity.portalId || p.portalId === identity.portalId));
  return matches.length === 1 ? matches[0] : null;
}
