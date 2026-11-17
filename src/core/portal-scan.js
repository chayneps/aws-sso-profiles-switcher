import {normalizePortal, profileId} from './model.js';
import {parseRoleLink} from './urls.js';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = node => node?.textContent?.trim().replace(/\s+/g, ' ') || '';
export function accountRows(doc) {
  return [...doc.querySelectorAll('tr[aria-level="1"], [role="row"][aria-level="1"]')].filter(row =>
    [...row.querySelectorAll('a[href]')].some(a => { const q = a.getAttribute('href'); return /account_id=/.test(q) && !/role_name=/.test(q); }));
}
function accountIdentity(row, portalId) {
  for (const a of row.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.getAttribute('href'), portalId); } catch { continue; }
    if (u.origin !== new URL(portalId).origin) continue;
    const q = new URLSearchParams(u.hash.split('?')[1] || '');
    if (/^\d{12}$/.test(q.get('account_id')) && !q.has('role_name')) return {accountId: q.get('account_id'), accountName: text(row.querySelector('[data-testid="account-list-cell"]')) || text(row.querySelector('[role="button"]')) || text(a) || q.get('account_id')};
  }
  return null;
}
function childRows(row) {
  const out = [];
  for (let next = row.nextElementSibling; next && next.getAttribute('aria-level') !== '1'; next = next.nextElementSibling) out.push(next);
  return out;
}
function rowResult(row, portalId, accountId) {
  const children = childRows(row), roles = [];
  let expected = 0;
  for (const child of children) {
    expected = Math.max(expected, Number(child.getAttribute('aria-setsize')) || 0);
    for (const a of child.querySelectorAll('a[href]')) {
      const role = parseRoleLink(a.getAttribute('href'), portalId);
      if (role && role.accountId === accountId) roles.push(role);
    }
  }
  const unique = [...new Map(roles.map(r => [r.permissionSet, r])).values()];
  const content = children.map(text).join(' ');
  const busy = children.some(n => n.getAttribute('aria-busy') === 'true' || n.querySelector('[aria-busy="true"], [role="progressbar"], [data-testid*="loading"]')) || /loading|please wait/i.test(content);
  if (/session expired|sign in again/i.test(content)) return {done: true, error: 'Session expired. Sign in again.'};
  if (/failed|unable to load|error loading/i.test(content)) return {done: true, error: 'Permission sets could not be loaded.'};
  if (!busy && unique.length && (!expected || unique.length >= expected)) return {done: true, roles: unique};
  if (!busy && /no (?:permission sets|roles|applications)|no access assigned/i.test(content)) return {done: true, roles: []};
  return {done: false};
}
function pageButton(doc, label) {
  return [...doc.querySelectorAll('button, a[role="button"]')].find(n => {
    const name = `${n.getAttribute('aria-label') || ''} ${n.getAttribute('title') || ''} ${text(n)}`;
    return label.test(name) && !n.disabled && n.getAttribute('aria-disabled') !== 'true';
  });
}
function signature(doc, portalId) { return accountRows(doc).map(r => accountIdentity(r, portalId)?.accountId).join(','); }
// Only used in the extension-owned sync tab. Normal scans preserve user filters.
export async function preparePortalForSync({document: doc, portalId, timeout = 9000, interval = 100, cancelled = () => false}) {
  async function waitFor(test) {
    const end = Date.now() + timeout;
    while (Date.now() < end && !cancelled()) { if (test()) return true; await sleep(interval); }
    return false;
  }
  if (!await waitFor(() => doc.querySelector('[role="treegrid"]') || accountRows(doc).length)) return;
  const filters = doc.querySelectorAll('input[type="search"], input[placeholder*="filter" i], input[aria-label*="filter" i]');
  for (const input of filters) if (input.value) {
    Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new doc.defaultView.Event('input', {bubbles: true}));
    input.dispatchEvent(new doc.defaultView.Event('change', {bubbles: true}));
    await sleep(interval * 3);
  }
  for (let i = 0; i < 100 && !cancelled(); i++) {
    const previous = pageButton(doc, /\bprevious(?: page)?\b/i);
    if (!previous) break;
    const old = signature(doc, portalId); previous.click();
    if (!await waitFor(() => signature(doc, portalId) && signature(doc, portalId) !== old)) break;
  }
}
export async function scanPortal({document: doc, portalId, onProgress = () => {}, cancelled = () => false, timeout = 9000, interval = 100, maxPages = 100}) {
  portalId = normalizePortal(portalId);
  const warnings = [], candidates = new Map(), seenPages = new Set(), seenAccounts = new Set();
  let complete = true, pages = 0;
  const initialSignature = signature(doc, portalId);
  const filters = [...doc.querySelectorAll('input[type="search"], input[placeholder*="Search" i], input[aria-label*="search" i], input[placeholder*="Filter" i], input[aria-label*="filter" i]')];
  if (filters.some(n => n.value.trim())) { complete = false; warnings.push('A portal filter is active. Only visible results were scanned. Clear the filter and retry for a complete scan.'); }
  const check = () => { if (cancelled()) throw new Error('Scan cancelled.'); };
  async function waitUntil(test) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { check(); const result = test(); if (result) return result; await sleep(interval); }
    return null;
  }
  try {
    // The page may still be rendering after sign-in.
    const isEmpty = () => [...doc.querySelectorAll('[role="treegrid"]')].some(n => /\bno (?:AWS )?accounts\b/i.test(text(n)));
    await waitUntil(() => accountRows(doc).length || isEmpty());
    check();
    if (isEmpty() && !accountRows(doc).length) return {candidates: [], complete: true, cancelled: false, warnings: [], progress: {accounts: 0, profiles: 0, pages: 1}};
    if (!accountRows(doc).length) throw new Error('No account rows found. Sign in to the AWS portal, open the Accounts tab, and retry.');
    // A scan starting mid-pagination is necessarily partial.
    if (pageButton(doc, /\bprevious(?: page)?\b/i)) { complete = false; warnings.push('Scan started after the first page. Return to the first page and retry for a complete scan.'); }
    while (pages < maxPages) {
      check();
      const sig = signature(doc, portalId);
      if (seenPages.has(sig)) { complete = false; warnings.push('Pagination repeated a page; scanning stopped.'); break; }
      seenPages.add(sig); pages++;
      const rows = accountRows(doc);
      for (const row of rows) {
        check();
        const account = accountIdentity(row, portalId);
        if (!account) { complete = false; warnings.push('An account row could not be identified.'); continue; }
        seenAccounts.add(account.accountId);
        const disclosure = row.querySelector('button[aria-expanded], [role="button"][aria-expanded]');
        const wasExpanded = disclosure?.getAttribute('aria-expanded') === 'true';
        try {
          if (!wasExpanded && disclosure) disclosure.click();
          const result = await waitUntil(() => { const state = rowResult(row, portalId, account.accountId); return state.done ? state : null; });
          if (!result || result.error) { complete = false; warnings.push(`${account.accountName}: ${result?.error || 'Timed out waiting for permission sets.'}`); }
          else for (const role of result.roles) {
            const p = {...account, ...role, portalId}; p.id = profileId(portalId, p.accountId, p.permissionSet); candidates.set(p.id, p);
          }
        } finally {
          // Restore only controls that this scan expanded; never click role or Access keys links.
          if (!wasExpanded && disclosure?.isConnected && disclosure.getAttribute('aria-expanded') === 'true') disclosure.click();
        }
        await onProgress({accounts: seenAccounts.size, profiles: candidates.size, pages, accountName: account.accountName});
      }
      const next = pageButton(doc, /\bnext(?: page)?\b/i);
      if (!next) break;
      const previous = signature(doc, portalId);
      next.click();
      const changed = await waitUntil(() => signature(doc, portalId) && signature(doc, portalId) !== previous);
      if (!changed) { complete = false; warnings.push('Next page did not load.'); break; }
    }
    if (pages >= maxPages && pageButton(doc, /\bnext(?: page)?\b/i)) { complete = false; warnings.push('Page limit reached.'); }
  } catch (error) { complete = false; warnings.push(error.message); }
  finally {
    // Restore the starting page when the portal exposes a predictable Previous control.
    for (let i = 0; i < pages && initialSignature && signature(doc, portalId) !== initialSignature; i++) {
      const prev = pageButton(doc, /\bprevious(?: page)?\b/i); if (!prev) break;
      const old = signature(doc, portalId); prev.click();
      const until = Date.now() + timeout;
      while (Date.now() < until && signature(doc, portalId) === old) await sleep(interval);
      if (signature(doc, portalId) === old) { warnings.push('Could not restore the original portal page.'); break; }
    }
  }
  return {candidates: [...candidates.values()], complete, cancelled: cancelled(), accessUnavailable: !cancelled() && (!seenAccounts.size || warnings.some(w => /session expired|sign in again/i.test(w))), warnings, progress: {accounts: seenAccounts.size, profiles: candidates.size, pages}};
}
