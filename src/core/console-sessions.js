// Self-contained probes: public navigation DOM only, never cookies or tokens.
export function readConsoleSessions(doc = document, href = location.href) {
  const parse = value => {
    try { const u = new URL(value); if (u.protocol !== 'https:' || u.port || u.username || u.password || !/^(?:[a-z0-9-]+\.)*console\.aws\.amazon\.com$/.test(u.hostname)) return null;
      const m = u.hostname.match(/^(\d{12}-[a-z0-9]+)\./); return m ? {key:m[1],accountId:m[1].slice(0,12),url:u.href} : null;
    } catch { return null; }
  };
  const role = text => text?.match(/AWSReservedSSO_([\w+=,.@-]+)_[0-9a-f]{16}(?=\/|\s|$)/i)?.[1];
  const menu = doc.querySelector('#nav-usernameMenu, [data-testid$="awsc-nav-account-menu-button"]');
  if (!menu) return {items:[],complete:false};
  const current = parse(href), permissionSet = role([menu.title,menu.getAttribute('aria-label'),menu.textContent].join(' '));
  if (!current) return {items:[],complete:false};
  current.permissionSet = permissionSet || '';
  const items = [current];
  for (const link of doc.querySelectorAll('a[data-testid^="awsc-account-menu-other-session-tile_"]')) {
    const item = parse(link.href); if (!item) continue;
    item.permissionSet = role(link.getAttribute('data-testid')) || '';
    items.push(item);
  }
  const scope = doc.getElementById(menu.getAttribute('aria-controls')) || menu.closest('li');
  const text = scope?.textContent || '';
  const count = text.match(/(\d+) other active sessions/i)?.[1] ?? text.match(/Sign out of (\d+) sessions?/i)?.[1];
  const expected = count == null ? null : /other active sessions/i.test(text) ? Number(count)+1 : Number(count);
  return {current,items,complete:expected === new Set(items.map(i=>i.key)).size,loadedAt:doc.defaultView?.performance.timeOrigin || 0};
}

// Runs only in an extension-created temporary tab. Opening native menus is safe;
// this adapter never submits sign-out or guesses a logout URL from a session key.
export async function prepareConsoleSession(expected, {needLogout=true,attempts=60,delayMs=150}={}) {
  const visible = n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && !n.closest('[hidden],[aria-hidden="true"],[inert]');
  for (let i=0;i<attempts;i++) {
    if (location.hostname.split('.')[0] !== expected.key) return {reason:'Session identity changed. Refresh the session list and try again.'};
    // AWS can mount the header late and replace nodes while opening a menu.
    const menu = document.querySelector('#nav-usernameMenu, [data-testid$="awsc-nav-account-menu-button"]');
    const text = [menu?.title,menu?.getAttribute('aria-label'),menu?.textContent].join(' ');
    const role = text.match(/AWSReservedSSO_([\w+=,.@-]+)_[0-9a-f]{16}(?=\/|\s|$)/i)?.[1];
    if (role && role !== expected.permissionSet) return {reason:'Session identity changed. Refresh the session list and try again.'};
    if (!menu || !role) { await new Promise(r=>setTimeout(r,delayMs)); continue; }
    if (menu.getAttribute('aria-expanded') !== 'true') menu.click();
    const scope = document.getElementById(menu.getAttribute('aria-controls'));
    if (!needLogout && scope && visible(scope)) return {ready:true};
    // The submenu may be portalled outside the account panel. Only an exact,
    // native link for the verified session is accepted, never a text-only action.
    const nodes = [...(scope?.querySelectorAll('a[href]') || []),...document.querySelectorAll('a[role="menuitem"][href]')];
    const link = nodes.find(n => {
      try { const u=new URL(n.href); return visible(n) && u.protocol==='https:' && !u.port && !u.username && !u.password && /^(?:[a-z0-9-]+\.)?signin\.aws\.amazon\.com$/.test(u.hostname) && u.pathname===`/sessions/${expected.key}/v1/logout` && !u.search && !u.hash; } catch { return false; }
    });
    if (link) return {ready:true,logoutUrl:link.href};
    const main = [...(scope?.querySelectorAll('button') || [])].find(n=>visible(n) && /^Sign out of \d+ sessions?$/.test(n.textContent.trim()));
    const toggle = main?.closest('[role="group"]')?.querySelector('button[aria-expanded][aria-haspopup]');
    if (needLogout && toggle && visible(toggle) && toggle.getAttribute('aria-expanded')!=='true') toggle.click();
    await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  return {reason:needLogout?'AWS did not expose a verified sign-out link for this session. Use its account menu to sign out.':'AWS session list is not available yet.'};
}
