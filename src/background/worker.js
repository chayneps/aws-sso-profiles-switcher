import {emptyConfig, sanitizeConfig, sanitizeProfile, normalizePortal, cleanText} from '../core/model.js';
import {isConsoleUrl, portalOriginPattern} from '../core/urls.js';
import {resolveIdentity} from '../core/identity.js';
import {createSync, scanActive, SYNC_ALARM} from './sync.js';
import {checkMultiSession, openMultiSessionSetup} from './multi-session.js';
import {createLauncher} from './launch.js';
import {getSessions, closeSession} from './sessions.js';
import {isHexColor,CUSTOM_COLOR_COUNT} from '../core/colors.js';
import {moveAccount} from '../core/account-order.js';
let mutation = Promise.resolve();
function serialized(task) { const result = mutation.then(task); mutation = result.catch(() => {}); return result; }
async function config() { const raw = (await chrome.storage.local.get('config')).config; return raw ? sanitizeConfig(raw) : emptyConfig(); }
async function session() { return chrome.storage.session.get(['draft', 'observed', 'connections', 'launches', 'closedSessions']); }
async function store(value) { await chrome.storage.local.set({config: sanitizeConfig(value)}); }
function uiSender(sender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try { const url = new URL(sender.url), own = new URL(chrome.runtime.getURL('')); return url.protocol === own.protocol && url.host === own.host && ['options.html', 'popup.html'].includes(url.pathname.slice(1)); } catch { return false; }
}
const sync = createSync({config, store, session, notifyConsoles});
const launcher = createLauncher({session});
function scanProgress(input) {
  if (!input || ['accounts', 'profiles', 'pages'].some(k => !Number.isInteger(input[k]) || input[k] < 0 || input[k] > 10000)) throw new Error('Invalid scan progress.');
  return {accounts: input.accounts, profiles: input.profiles, pages: input.pages, accountName: cleanText(input.accountName || '')};
}
async function notifyConsoles() {
  const tabs = await chrome.tabs.query({url: ['https://*.console.aws.amazon.com/*', 'https://console.aws.amazon.com/*']});
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {type: 'RECHECK_CONSOLE'})));
}
function validJobSender(sender, draft, message) {
  if (!draft || draft.jobId !== message.jobId || !scanActive(draft) || sender.id !== chrome.runtime.id || sender.tab?.id !== draft.tabId || sender.frameId !== 0 || !sender.url) return false;
  try { return normalizePortal(sender.url) === draft.portalId; } catch { return false; }
}
async function handle(message, sender) {
  if (!message || typeof message.type !== 'string') throw new Error('Invalid request.');
  if (message.type === 'CONSOLE_IDENTITY') {
    if (sender.id !== chrome.runtime.id || !sender.tab?.id || !isConsoleUrl(sender.url) || sender.frameId !== 0) throw new Error('Untrusted console report.');
    const identity = message.identity;
    if (identity && (!/^\d{12}$/.test(identity.accountId) || typeof identity.permissionSet !== 'string' || identity.permissionSet.length > 128 || identity.sessionHost !== new URL(sender.url).hostname)) throw new Error('Invalid console identity.');
    const c = await config(), p = resolveIdentity(identity, c.profiles);
    const {observed = {}} = await session();
    if (p) observed[sender.tab.id] = {tabId: sender.tab.id, profileId: p.id, accountId: p.accountId, permissionSet: p.permissionSet, sessionHost: identity.sessionHost, observedAt: Date.now()};
    else delete observed[sender.tab.id];
    await chrome.storage.session.set({observed});
    return {profile: p};
  }
  if (['SCAN_PROGRESS', 'SCAN_RESULT'].includes(message.type)) {
    const {draft} = await session();
    if (!validJobSender(sender, draft, message)) throw new Error('Stale or untrusted portal scan.');
    if (message.type === 'SCAN_PROGRESS') {
      draft.progress = scanProgress(message.progress);
      draft.updatedAt = Date.now();
    } else {
      const result = message.result;
      if (!result || !Array.isArray(result.candidates) || result.candidates.length > 10000 || !Array.isArray(result.warnings)) throw new Error('Invalid scan result.');
      draft.candidates = result.candidates.map(p => { const clean = sanitizeProfile(p); if (clean.portalId !== draft.portalId) throw new Error('Wrong portal.'); return clean; });
      const cancelled = result.cancelled || draft.status === 'cancelling';
      draft.complete = result.complete === true && !cancelled && !result.accessUnavailable;
      draft.warnings = result.warnings.slice(0, 200).map(w => cleanText(w, 1024));
      draft.status = cancelled ? 'cancelled' : 'ready';
      draft.progress = scanProgress(result.progress);
      draft.updatedAt = Date.now();
    }
    await chrome.storage.session.set({draft});
    if (message.type === 'SCAN_RESULT') await sync.finish(draft, draft.status !== 'cancelled' && message.result.accessUnavailable === true);
    return {};
  }
  if (!uiSender(sender)) throw new Error('This action is available only in the extension.');
  const c = await config();
  switch (message.type) {
    case 'UI_OPENED': {
      const result = await sync.opened(), state = await session();
      const portalAccess = await sync.reconcileAccess();
      return {...result, config: await config(), draft: state.draft || null, observed: Object.values(state.observed || {}), portalAccess, multiSession: await checkMultiSession(), sessions:await getSessions(await config(),state)};
    }
    case 'GET_STATE': {
      await sync.recover();
      const state = await session();
      const portalAccess = await sync.reconcileAccess();
      return {config: await config(), draft: state.draft || null, observed: Object.values(state.observed || {}), portalAccess, multiSession: await checkMultiSession(), sessions:await getSessions(await config(),state)};
    }
    case 'CHECK_MULTI_SESSION': return {multiSession: await checkMultiSession(),sessions:await getSessions(c,await session())};
    case 'CLOSE_SESSION': return closeSession(message.key,c,await session());
    case 'OPEN_MULTI_SESSION_SETUP': await openMultiSessionSetup(); return {};
    case 'SET_TAB_GROUP': {
      const name = cleanText(message.name,80);
      if (!name) throw new Error('Enter a tab group name.');
      c.ui.tabGroupName = name; await store(c); return {};
    }
    case 'SAVE_PORTAL': {
      const id = normalizePortal(message.url), label = cleanText(message.label || '', 128);
      const old = c.portals.find(p => p.id === id);
      c.portals = c.portals.filter(p => p.id !== id); c.portals.push({...old, id, baseUrl: id, label, syncIntervalMinutes: message.syncIntervalMinutes ?? old?.syncIntervalMinutes ?? 30}); await store(c); return {portalId: id};
    }
    case 'OPEN_PORTAL': {
      const portal = c.portals.find(p => p.id === message.portalId); if (!portal) throw new Error('Save a portal first.');
      const tabs = await chrome.tabs.query({url: portalOriginPattern(portal.id)});
      const existing = tabs.find(tab => { try { return normalizePortal(tab.url) === portal.id; } catch { return false; } });
      if (existing) { await chrome.tabs.update(existing.id, {active: true}); await chrome.windows.update(existing.windowId, {focused: true}); return {}; }
      await chrome.tabs.create({url: portal.baseUrl}); return {};
    }
    case 'SAVE_PROFILE': {
      const p = sanitizeProfile(message.profile, c.portals);
      c.profiles = c.profiles.filter(x => x.id !== p.id && x.id !== message.previousId); c.profiles.push(p);
      await store(c); await notifyConsoles(); return {};
    }
    case 'DELETE_PROFILE': {
      if (!c.profiles.some(p => p.id === message.id)) throw new Error('Profile no longer exists.');
      c.profiles = c.profiles.filter(p => p.id !== message.id); await store(c); await notifyConsoles(); return {};
    }
    case 'IMPORT_CONFIG': {
      const input = sanitizeConfig(message.config);
      const portals = [...new Map([...c.portals, ...input.portals].map(p => [p.id, p])).values()];
      // Explicit configuration import preserves exported appearance, and never deletes existing profiles.
      const profiles = [...new Map([...c.profiles, ...input.profiles].map(p => [p.id, p])).values()];
      const ui = {...c.ui,customColors:c.ui.customColors.map((color,i)=>input.ui.customColors[i]||color),accountOrder:[...new Set([...input.ui.accountOrder,...c.ui.accountOrder])]};
      await store({...c, portals, profiles,ui}); await notifyConsoles(); return {};
    }
    case 'SYNC_PORTAL': case 'START_SCAN': { await sync.start(message.portalId); return {}; }
    case 'SET_VISIBILITY': {
      const p = c.profiles.find(p => p.id === message.id);
      if (!p || typeof message.show !== 'boolean') throw new Error('Invalid profile visibility.');
      p.showInPopup = message.show; await store(c); return {};
    }
    case 'SET_COLOR': {
      const p = c.profiles.find(p => p.id === message.id);
      if (!p) throw new Error('Profile no longer exists.');
      if (typeof message.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(message.color)) throw new Error('Choose a six-digit hex profile color.');
      p.color = message.color; await store(c); await notifyConsoles(); return {};
    }
    case 'SET_CUSTOM_COLOR': {
      if (!Number.isInteger(message.index) || message.index<0 || message.index>=CUSTOM_COLOR_COUNT || !isHexColor(message.color)) throw new Error('Choose a valid custom color slot and hex color.');
      c.ui.customColors[message.index]=message.color.toLowerCase(); await store(c); return {};
    }
    case 'REORDER_ACCOUNT': await store(moveAccount(c,message)); return {};
    case 'SET_SYNC_INTERVAL': {
      const p = c.portals.find(p => p.id === message.portalId);
      if (!p) throw new Error('Unknown portal.');
      p.syncIntervalMinutes = message.minutes; await store(c); return {};
    }
    case 'CANCEL_SCAN': {
      const {draft} = await session();
      if (draft?.status === 'scanning') {
        try { await chrome.tabs.sendMessage(draft.tabId, {type: 'PORTAL_CANCEL', jobId: draft.jobId}); draft.status = 'cancelling'; }
        catch { draft.status = 'interrupted'; draft.warnings.push('Portal is unavailable. Existing saved profiles were kept.'); }
        draft.complete = false; draft.updatedAt = Date.now(); await chrome.storage.session.set({draft});
        if (draft.status === 'interrupted') await sync.finish(draft);
      }
      return {};
    }
    case 'LAUNCH': {
      const p = c.profiles.find(p => p.id === message.id); if (!p) throw new Error('Profile no longer exists.');
      return launcher.launch(p,c);
    }
    default: throw new Error('Unknown extension action.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  serialized(() => handle(message, sender)).then(result => reply({ok: true, ...result}), error => reply({ok: false, error: error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => serialized(async () => {
  const {observed = {}, launches = {}, draft} = await session(); delete observed[tabId]; delete launches[tabId];
  const update = {observed,launches};
  if (draft?.tabId === tabId && scanActive(draft)) update.draft = {...draft, status: 'interrupted', complete: false, warnings: [...draft.warnings, 'Portal tab closed. Retry to scan again.']};
  await chrome.storage.session.set(update);
  await sync.removed(tabId);
}));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  return serialized(async () => {
    if (change.url || change.status === 'loading') {
      const {observed = {}} = await session(); delete observed[tabId]; await chrome.storage.session.set({observed});
    }
    if (change.status === 'loading') await sync.navigating(tabId);
    if (change.status === 'complete') await sync.tabReady(tabId, tab);
  }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => serialized(async () => { await chrome.storage.session.set({observed: {}, draft: null, connections: {}}); await sync.ensureAlarm(); await sync.tick(); await notifyConsoles(); }).catch(() => {}));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SYNC_ALARM) return serialized(() => sync.tick()).catch(() => {});
});
// Recreate the alarm after reload, update or browser restart. Reconcile transient
// state without ever clearing the persistent portal catalog or user preferences.
serialized(async () => { await sync.ensureAlarm(); await sync.recover(); }).catch(() => {});
notifyConsoles().catch(() => {});
chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).catch(() => {});
