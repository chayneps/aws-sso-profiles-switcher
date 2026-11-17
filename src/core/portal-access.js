// Self-contained read-only probe for an already open, permitted portal page.
export function readPortalAccess(doc = document) {
  const visible = node => !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length && doc.defaultView.getComputedStyle(node).visibility === 'visible';
  const messages = [...doc.querySelectorAll('h1, h2, [role="alert"], form')].filter(visible).map(node => (node.textContent || '').replace(/\s+/g,' ').trim());
  if (messages.some(value => /^(?:sign in|sign in to (?:the )?AWS access portal|your session (?:has )?expired|session expired)(?:[.!]|$)/i.test(value))) return {status:'sign-in-required'};
  const rows = doc.querySelectorAll('tr[aria-level="1"], [role="row"][aria-level="1"]');
  if ([...rows].some(row => visible(row) && row.querySelector('a[href*="account_id="]'))) return {status:'ready'};
  if ([...doc.querySelectorAll('[role="treegrid"]')].some(node => visible(node) && /\bno (?:AWS )?accounts\b/i.test(node.textContent || ''))) return {status:'ready'};
  return {status:'unknown'};
}
