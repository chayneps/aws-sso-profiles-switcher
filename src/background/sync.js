import {normalizePortal, mergeCandidates} from '../core/model.js';
import {portalOriginPattern} from '../core/urls.js';
import {readPortalAccess} from '../core/portal-access.js';

export const SYNC_ALARM = 'portal-sync-check';
export const scanActive = draft => ['scanning', 'cancelling'].includes(draft?.status);
const accountsUrl = portal => `${portal}#/?tab=accounts`;

// All entry points are called through the worker's serialized queue. Connections
// track only tabs created by sync; user portal tabs are never refreshed or closed.
export function createSync({config, store, session, notifyConsoles}) {
  async function updatePortal(portalId, fields) {
    const c = await config(), portal = c.portals.find(p => p.id === portalId);
    if (portal) { Object.assign(portal, fields); await store(c); }
  }
  async function connections() { return (await session()).connections || {}; }
  async function recover() {
    const {draft} = await session();
    if (scanActive(draft) && Date.now() - draft.updatedAt > 180000) {
      draft.status = 'interrupted'; draft.complete = false;
      draft.warnings.push('Synchronisation was interrupted. Retry to continue.');
      await chrome.storage.session.set({draft});
      await updatePortal(draft.portalId, {syncStatus: 'error', syncMessage: draft.warnings.at(-1)});
    }
    const c = await config(), all = await connections();
    for (const portal of c.portals) if (portal.syncStatus === 'syncing' && !(scanActive(draft) && draft.portalId === portal.id) && (!all[portal.id] || Date.now() - (portal.lastAttemptAt || 0) > 180000)) {
      await updatePortal(portal.id, {syncStatus: 'error', syncMessage: 'Synchronisation interrupted by a reload. Saved profiles were kept; synchronise again.'});
    }
  }
  async function signInRequired(portalId, connection, message) {
    await updatePortal(portalId, {syncStatus: 'sign-in-required', syncMessage: message});
    if (connection.interactive) {
      const tab = await chrome.tabs.update(connection.tabId, {active: true}).catch(() => null);
      if (tab) await chrome.windows.update(tab.windowId, {focused: true});
    }
  }
  async function scan(portalId, connection) {
    const old = (await session()).draft;
    if (scanActive(old)) return;
    const draft = {jobId: crypto.randomUUID(), portalId, tabId: connection.tabId, status: 'scanning', complete: false, candidates: [], warnings: [], progress: {accounts: 0, profiles: 0, pages: 0}, startedAt: Date.now(), updatedAt: Date.now()};
    const all = await connections(); all[portalId] = {...connection, awaiting: false};
    await chrome.storage.session.set({draft, connections: all});
    await updatePortal(portalId, {syncStatus: 'syncing', syncMessage: 'Reading accounts and permission sets…'});
    try {
      await chrome.scripting.executeScript({target: {tabId: connection.tabId}, files: ['portal.js']});
      const response = await chrome.tabs.sendMessage(connection.tabId, {type: 'PORTAL_SCAN', portalId, jobId: draft.jobId, fullSync: true});
      if (!response?.ok) throw new Error(response?.error || 'Unable to start synchronisation.');
    } catch {
      draft.status = 'interrupted'; draft.warnings = ['Portal unavailable. Complete sign-in, then retry synchronisation.'];
      all[portalId].awaiting = true;
      await chrome.storage.session.set({draft, connections: all});
      await signInRequired(portalId, connection, draft.warnings[0]);
    }
  }
  async function tabReady(tabId, tab) {
    const all = await connections();
    const pair = Object.entries(all).find(([, c]) => c.tabId === tabId && c.awaiting);
    if (!pair) return;
    const [portalId, connection] = pair;
    let atPortal = false;
    try { atPortal = normalizePortal(tab.url) === portalId; } catch { /* Identity-provider URLs remain outside host access. */ }
    if (!atPortal) {
      await signInRequired(portalId, connection, 'Sign in to your access portal. Synchronisation resumes when you return.');
      return;
    }
    await updatePortal(portalId, {syncStatus: 'syncing', syncMessage: 'Portal connected. Waiting to synchronise…'});
    await scan(portalId, connection);
  }
  async function navigating(tabId) {
    const all = await connections();
    const pair = Object.entries(all).find(([, c]) => c.tabId === tabId);
    if (!pair) return;
    const [portalId, connection] = pair;
    all[portalId] = {...connection, awaiting: true};
    const {draft} = await session();
    if (scanActive(draft) && draft.tabId === tabId) {
      draft.status = 'interrupted'; draft.complete = false;
      draft.warnings.push('Portal navigated. Synchronisation will resume after sign-in.');
      await chrome.storage.session.set({draft});
    }
    await chrome.storage.session.set({connections: all});
  }
  async function start(portalId, {interactive = true} = {}) {
    await recover();
    const c = await config(), portal = c.portals.find(p => p.id === portalId);
    if (!portal) throw new Error('Save an access portal first.');
    if (scanActive((await session()).draft)) throw new Error('Synchronisation is already running.');
    if (!await chrome.permissions.contains({origins: [portalOriginPattern(portalId)]})) {
      await updatePortal(portalId, {syncStatus: 'permission-required', lastAttemptAt: Date.now(), syncMessage: 'Grant access to this portal to synchronise.'});
      throw new Error('Portal access is missing. Use Synchronise and grant access to reconnect.');
    }
    await updatePortal(portalId, {syncStatus: 'syncing', lastAttemptAt: Date.now(), syncMessage: 'Opening the access portal…'});
    const all = await connections();
    let tab;
    if (all[portalId]) tab = await chrome.tabs.get(all[portalId].tabId).catch(() => null);
    if (tab) {
      all[portalId] = {...all[portalId], awaiting: true, interactive, reauthTried: false};
      await chrome.storage.session.set({connections: all});
      await chrome.tabs.update(tab.id, {url: accountsUrl(portalId), active: interactive});
    } else {
      tab = await chrome.tabs.create({url: accountsUrl(portalId), active: interactive});
      all[portalId] = {tabId: tab.id, awaiting: true, interactive, reauthTried: false};
      await chrome.storage.session.set({connections: all});
    }
    // Covers tabs which finished loading before onUpdated reached this queue.
    const current = await chrome.tabs.get(tab.id).catch(() => null);
    if (current?.status === 'complete') await tabReady(tab.id, current);
  }
  async function finish(draft, accessUnavailable = false) {
    const cancelled = draft.status === 'cancelled';
    const c = await config();
    const merged = mergeCandidates(c, draft.candidates, {portalId: draft.portalId, complete: draft.complete});
    const portal = merged.portals.find(p => p.id === draft.portalId);
    if (!portal) return;
    // Never replace a good complete-sync timestamp with an authentication failure.
    if (accessUnavailable) { portal.lastImportAt = c.portals.find(p => p.id === portal.id)?.lastImportAt; portal.lastImportComplete = false; }
    portal.syncStatus = accessUnavailable ? 'sign-in-required' : draft.complete ? 'synced' : 'partial';
    portal.syncMessage = accessUnavailable ? 'Portal access expired or unavailable. Sign in to reconnect.' : cancelled ? 'Synchronisation cancelled. Profiles already discovered were saved.' : draft.complete ? `${draft.candidates.length} profiles synchronised automatically.` : 'Partial synchronisation. Discovered profiles saved; previous profiles kept.';
    await store(merged);
    draft.status = accessUnavailable ? 'interrupted' : cancelled ? 'cancelled' : 'saved';
    await chrome.storage.session.set({draft});
    await notifyConsoles();
    const all = await connections(), connection = all[draft.portalId];
    if (!connection) return;
    if (accessUnavailable && !connection.reauthTried) {
      // One normal portal navigation lets AWS/Microsoft renew an existing sign-in.
      // Stop retrying automatically if interactive authentication is still needed.
      all[draft.portalId] = {...connection, awaiting: true, reauthTried: true};
      await chrome.storage.session.set({connections: all});
      await chrome.tabs.update(connection.tabId, {url: accountsUrl(draft.portalId), active: connection.interactive}).catch(() => {});
    } else if (accessUnavailable) {
      all[draft.portalId].awaiting = true;
      await chrome.storage.session.set({connections: all});
      await signInRequired(draft.portalId, connection, portal.syncMessage);
    } else {
      delete all[draft.portalId];
      await chrome.storage.session.set({connections: all});
      const tab = await chrome.tabs.get(connection.tabId).catch(() => null);
      if (tab && !tab.active) await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
  async function tick() {
    await recover();
    if (scanActive((await session()).draft)) return;
    const c = await config();
    // Another portal may have finished signing in while a scan was running.
    for (const [id, connection] of Object.entries(await connections())) {
      const p = c.portals.find(p => p.id === id);
      if (connection.awaiting && p?.syncStatus === 'syncing') {
        const tab = await chrome.tabs.get(connection.tabId).catch(() => null);
        if (tab?.status === 'complete') { await tabReady(tab.id, tab); return; }
      }
    }
    const portal = c.portals.find(p => p.syncIntervalMinutes > 0 && !['sign-in-required','permission-required'].includes(p.syncStatus) && Date.now() - (p.lastAttemptAt || 0) >= p.syncIntervalMinutes * 60000);
    if (portal) await start(portal.id, {interactive: false});
  }
  async function opened() {
    await recover();
    const c = await config();
    // Opening either view reads the cached catalog. Sync starts only from an
    // explicit action, connecting a new portal, or the configured alarm schedule.
    return {setupRequired: c.portals.length === 0};
  }
  async function reconcileAccess() {
    const c = await config();
    const access = {};
    for (const portal of c.portals) {
      if (portal.syncStatus !== 'sign-in-required' && portal.syncStatus !== 'permission-required') continue;
      const origin = portalOriginPattern(portal.id);
      if (!await chrome.permissions.contains({origins:[origin]})) continue;
      if (portal.syncStatus === 'permission-required') {
        await updatePortal(portal.id,{syncStatus:'idle',syncMessage:''});
        continue;
      }
      const tabs = await chrome.tabs.query({url:origin});
      let observed = 'unknown';
      for (const tab of tabs) {
        try {
          if (normalizePortal(tab.url) !== portal.id) continue;
          const result = (await chrome.scripting.executeScript({target:{tabId:tab.id},func:readPortalAccess}))[0]?.result;
          if (result?.status === 'ready') { observed = 'ready'; break; }
          if (result?.status === 'sign-in-required') observed = 'sign-in-required';
        } catch { /* Missing/unreadable pages are not proof that sign-in expired. */ }
      }
      access[portal.id] = observed;
      if (observed === 'ready') await updatePortal(portal.id,{syncStatus:'idle',syncMessage:''});
    }
    return access;
  }
  async function removed(tabId) {
    const all = await connections();
    for (const [id, connection] of Object.entries(all)) if (connection.tabId === tabId) {
      delete all[id];
      await updatePortal(id, {syncStatus: 'error', syncMessage: 'Portal tab closed before synchronisation finished. Retry to continue.'});
    }
    await chrome.storage.session.set({connections: all});
  }
  async function ensureAlarm() {
    if (!await chrome.alarms.get(SYNC_ALARM)) await chrome.alarms.create(SYNC_ALARM, {periodInMinutes: 5});
  }
  return {start, finish, tick, opened, reconcileAccess, tabReady, navigating, removed, recover, ensureAlarm};
}
