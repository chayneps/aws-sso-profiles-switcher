import {createAPI} from './api.js';
import {searchProfiles, popupProfiles, groupProfilesByAccount} from '../core/model.js';
import {portalOriginPattern} from '../core/urls.js';
import {$, element, button, status, attempt, showDemo, replaceOptions} from './common.js';
import {renderMultiSession} from './multi-session.js';
import {monitorMultiSession} from './session-monitor.js';
import {createAccountGroup, accountHasSession} from './account-groups.js';
import {createSessionButton} from './session-button.js';
import {sortAccounts} from '../core/account-order.js';
import {createAccountReordering} from './account-reordering.js';
showDemo();
const api = createAPI();
let state, visible = [], selected = 0, launching = false, syncRequested = false;
let accountGroups=[];
const reordering=createAccountReordering({getGroups:()=>accountGroups,onEnd:()=>render(),move:async change=>{
  try { await api.send('REORDER_ACCOUNT',change);await refresh();status('');
    [...$('profiles').querySelectorAll('.account-group')].find(node=>node.dataset.accountKey===change.sourceKey)?.querySelector('legend').focus();
  } catch(error){status(error.message,true);render();}
}});
const closing = new Set();
function positionSessions() {
  const panel=$('session-panel');if(panel.hidden)return;
  const anchor=$('session-count').getBoundingClientRect();
  const width=Math.min(window.innerWidth,document.body.offsetWidth||window.innerWidth);
  const height=Math.min(window.innerHeight,document.body.offsetHeight||window.innerHeight);
  const panelWidth=Math.min(340,width-24);panel.style.width=`${panelWidth}px`;
  const natural=panel.scrollHeight,below=Math.max(0,height-anchor.bottom-12),above=Math.max(0,anchor.top-12);
  const down=natural<=below||below>=above,maxHeight=Math.max(40,down?below:above);
  panel.style.maxHeight=`${maxHeight}px`;
  panel.style.left=`${Math.max(12,Math.min(anchor.right-panelWidth,width-panelWidth-12))}px`;
  panel.style.top=`${down?anchor.bottom+6:Math.max(6,anchor.top-Math.min(natural,maxHeight)-6)}px`;
}
function showSessions(open,{returnFocus=false}={}) {
  $('session-panel').hidden=!open;$('session-count').setAttribute('aria-expanded',String(open));
  if(open){positionSessions();$('session-panel').focus({preventScroll:true});}
  else if(returnFocus)$('session-count').focus({preventScroll:true});
}
async function closeSession(item) {
  if(closing.has(item.key)) return;
  closing.add(item.key); status('Signing out of session…');render();
  try {
    const result=await api.send('CLOSE_SESSION',{key:item.key}); await refresh();
    status(result.confirmed?'Session signed out.':'Sign-out requested, but AWS has not confirmed it yet. The session is still counted until confirmed.',!result.confirmed);
  }
  catch(error) { status(error.message,true); }
  finally { closing.delete(item.key); render(); }
}
function renderSessions() {
  const sessions=state.sessions || {items:[],limit:5,complete:false};
  const pending=sessions.pendingProfileIds?.length || 0;
  $('session-count').textContent=`${sessions.items.length} / ${sessions.limit} sessions${sessions.complete?'':' detected'}${pending?` · ${pending} opening`:''}`;
  $('session-count').title=sessions.complete?'From the native AWS session list':'Detected in readable AWS console tabs; AWS may have additional sessions.';
  $('session-list').replaceChildren(...sessions.items.map(item=>{
    const profile=state.config.profiles.find(p=>p.id===item.profileId);
    const label=profile ? `${profile.accountName || profile.accountId} / ${profile.permissionSet}` : `${item.accountId} / ${item.permissionSet || 'Unknown role'}`;
    const row=element('div',null,'session-entry'); row.append(element('span',label));
    if(item.permissionSet){ const control=createSessionButton(item,label,closeSession); control.disabled=closing.has(item.key); row.append(control); }
    return row;
  }));
}

function select(index) {
  selected = Math.max(0, Math.min(index, visible.length - 1));
  const rows = [...$('profiles').querySelectorAll('.profile-row')];
  rows.forEach((row, i) => {
    row.classList.toggle('selected', i === selected);
    row.querySelector('.profile-open')?.setAttribute('aria-current', i === selected ? 'true' : 'false');
  });
  rows[selected]?.scrollIntoView({block: 'nearest'});
}
async function launch(profile) {
  if (launching) return;
  launching = true; status('Opening profile…');
  try {
    const result = await api.send('LAUNCH', {id: profile.id});
    if(result.sessionFull) { state.sessions=result.sessions;status('All 5 session slots are occupied or opening. Close a session with × before opening another profile.',true);render();showSessions(true);return; }
    if (result.launchBlocked) { state.multiSession = result.multiSession; status(''); render(); return; }
    if (result.warning) { status(result.warning,true); return; }
    if (globalThis.__SSO_DEMO__) status(result.focused ? 'Demo: existing tab focused.' : 'Demo: profile launch requested.'); else window.close();
  } catch (error) { status(error.message, true); }
  finally { launching = false; }
}
function render() {
  if (!state || reordering.dragging) return;
  const focusedAccount=document.activeElement?.closest('.account-group-legend')?.parentElement.dataset.accountKey;
  const catalog = popupProfiles(state.config.profiles);
  const groups = accountGroups = sortAccounts(groupProfilesByAccount(searchProfiles(catalog, $('search').value)),state.config);
  // Keyboard selection must follow rendered group/role order, not the flat
  // search sort before accounts were collected together.
  visible = groups.flatMap(group => group.profiles);
  $('count').textContent = $('search').value.trim() ? `${visible.length} of ${catalog.length}` : String(catalog.length);
  renderToolbar();
  renderSessions();
  renderPortalAlerts();
  renderMultiSession($('multi-session'), state.multiSession, api, refresh, true);
  if (!state.config.portals.length) $('multi-session').hidden = true;
  reordering.beginRender();
  $('profiles').replaceChildren(...groups.map(account => {
    const portal = state.config.portals.find(p => p.id === account.portalId);
    const {group, body} = createAccountGroup(account, {list:true, reordering, active:accountHasSession(account,state.sessions,state.config.profiles), portalLabel:state.config.portals.length > 1 ? portal?.label || new URL(account.portalId).hostname : ''});
    body.append(...account.profiles.map(profile => {
      const row = element('li', null, 'profile-row');
      const open = button('', () => launch(profile), 'profile-open');
      const swatch = element('span', null, 'swatch'); swatch.style.backgroundColor = profile.color;
      const copy = element('span', null, 'profile-copy');
      copy.append(element('strong', profile.label || profile.permissionSet));
      if (profile.label && profile.label !== profile.permissionSet) copy.append(element('small', profile.permissionSet));
      open.append(swatch, copy); open.title = profile.label ? `${profile.label} · ${profile.permissionSet}` : profile.permissionSet;
      // Let the worker reuse an existing matching tab even if multi-session is off.
      // Only new federation is gated; a cached UI check must not lock the tiles.
      row.append(open);
      const item=state.sessions?.items.find(item=>item.profileId===profile.id);
      if(item) { const control=createSessionButton(item,`${profile.accountName || profile.accountId} / ${profile.permissionSet}`,closeSession); control.disabled=closing.has(item.key); row.append(control); }
      return row;
    }));
    return group;
  }));
  const hasProfiles = catalog.length > 0, hasCatalog = state.config.profiles.length > 0;
  $('empty').hidden = visible.length > 0;
  $('list-heading').hidden = !hasProfiles && !state.sessions?.items.length;
  $('empty').replaceChildren(
    element('span', hasProfiles ? '⌕' : '↗', 'empty-icon'),
    element('strong', hasProfiles ? 'No matching profiles' : hasCatalog ? 'Choose your shortcuts.' : 'Your AWS workspace, ready.'),
    element('p', hasProfiles ? 'Try another account name, ID, or role.' : hasCatalog ? 'Choose which portal profiles appear in Manage.' : 'Connect your access portal, then synchronise your accounts and roles.')
  );
  $('empty').firstChild.setAttribute('aria-hidden', 'true');
  if (!hasProfiles) $('empty').append(button(hasCatalog ? 'Choose profiles' : state.config.portals.length ? 'Synchronise profiles' : 'Connect AWS portal', () => state.config.portals.length && !hasCatalog ? attempt(syncAction) : api.openOptions(), 'button primary connect-button'));
  select(selected);
  if(focusedAccount)[...$('profiles').querySelectorAll('.account-group')].find(node=>node.dataset.accountKey===focusedAccount)?.querySelector('legend').focus({preventScroll:true});
  positionSessions();
}
function renderToolbar() {
  const busy = syncRequested || state.config.portals.some(p => p.syncStatus === 'syncing');
  $('sync').disabled = busy || !state.config.portals.length;
  $('sync').classList.toggle('is-syncing', busy);
  $('sync').setAttribute('aria-label', busy ? 'Synchronising profiles' : 'Synchronise profiles');
  $('sync').title = busy ? 'Synchronising profiles…' : 'Synchronise profiles';
  $('sync-selected').disabled = busy;
  replaceOptions($('portal-picker'), state.config.portals);
  if (state.config.portals.length > 1) $('sync').setAttribute('aria-expanded', String(!$('sync-panel').hidden));
  else { $('sync').removeAttribute('aria-expanded'); $('sync-panel').hidden = true; }
}
function renderPortalAlerts() {
  const alerts = [];
  const names = {'sign-in-required':['Portal sign-in required','Reconnect'], 'permission-required':['Portal access permission needed','Grant access'],error:['Portal sync interrupted','Retry'],partial:['Some profiles could not be refreshed','Retry']};
  for (const portal of state.config.portals) {
    const access = state.portalAccess?.[portal.id];
    if (access === 'ready') continue;
    if (portal.syncStatus === 'syncing') {
      alerts.push(element('p', 'Synchronising profiles…', 'sync-progress'));
    } else if (names[portal.syncStatus]) {
      const [message, action] = portal.syncStatus === 'sign-in-required' && access !== 'sign-in-required'
        ? ['Portal sync needs a retry','Retry'] : names[portal.syncStatus];
      const alert = element('div', null, 'portal-alert');
      const copy = element('div'); copy.append(element('strong', message));
      if (state.config.portals.length > 1) copy.append(element('small', portal.label || new URL(portal.id).hostname));
      const retry = button(action, () => attempt(() => synchronise(portal.id)), 'text-button');
      retry.disabled = syncRequested || state.config.portals.some(p => p.syncStatus === 'syncing');
      alert.append(copy, retry);
      alerts.push(alert);
    }
  }
  $('portal-alerts').hidden = !alerts.length;
  $('portal-alerts').replaceChildren(...alerts);
}
function search(open) {
  $('search-panel').hidden = !open;
  $('toggle-search').setAttribute('aria-expanded', String(open));
  if (open) $('search').focus();
  else { $('search').value = ''; selected = 0; render(); $('toggle-search').focus(); }
}
async function syncAction() {
  if (!state.config.portals.length) return api.openOptions();
  if (state.config.portals.length === 1) return synchronise(state.config.portals[0].id);
  $('sync-panel').hidden = !$('sync-panel').hidden;
  renderToolbar();
  if (!$('sync-panel').hidden) $('portal-picker').focus();
}
async function synchronise(portalId) {
  if (syncRequested || state.config.portals.some(p => p.syncStatus === 'syncing')) return;
  syncRequested = true; renderToolbar(); status('');
  try {
    if (!await api.requestOrigin(portalOriginPattern(portalId))) throw new Error('Grant portal access to synchronise.');
    await api.send('SYNC_PORTAL', {portalId});
    $('sync-panel').hidden = true;
    await refresh();
  } finally { syncRequested = false; renderToolbar(); }
}
async function refresh() { state = await api.send('GET_STATE'); render(); }
$('toggle-search').addEventListener('click', () => search($('search-panel').hidden));
$('search').addEventListener('input', () => { selected = 0; render(); });
document.addEventListener('keydown', event => {
  const input = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (!input && event.key === '/')) { event.preventDefault(); search(true); return; }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!$('session-panel').hidden) showSessions(false,{returnFocus:true});
    else if (!$('search-panel').hidden) { if ($('search').value) { $('search').value = ''; selected = 0; render(); } else search(false); }
    else if (!$('sync-panel').hidden) { $('sync-panel').hidden = true; renderToolbar(); $('sync').focus(); }
    else window.close();
    return;
  }
  if (!$('session-panel').hidden) return;
  if (event.target !== document.body && event.target !== $('search') && !event.target.classList.contains('profile-open')) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); select(selected + (event.key === 'ArrowDown' ? 1 : -1)); }
  if (event.key === 'Enter' && visible[selected]) { event.preventDefault(); launch(visible[selected]); }
});
$('manage').addEventListener('click', () => api.openOptions());
$('session-count').addEventListener('click', () => showSessions($('session-panel').hidden));
$('close-sessions').addEventListener('click',()=>showSessions(false,{returnFocus:true}));
document.addEventListener('pointerdown',event=>{
  if(!$('session-panel').hidden&&!$('session-panel').contains(event.target)&&!$('session-count').contains(event.target))showSessions(false);
});
document.addEventListener('focusin',event=>{
  if(!$('session-panel').hidden&&!$('session-panel').contains(event.target)&&event.target!==$('session-count'))showSessions(false);
});
window.addEventListener('resize',positionSessions);
window.addEventListener('scroll',event=>{if(event.target!==$('session-panel'))positionSessions();},true);
$('sync').addEventListener('click', () => attempt(syncAction));
$('sync-selected').addEventListener('click', () => attempt(() => synchronise($('portal-picker').value)));
api.subscribe(() => attempt(refresh));
window.addEventListener('focus', () => { if (state) attempt(refresh); });
const monitor = monitorMultiSession(api, (mode,sessions) => {
  if (state && (JSON.stringify(mode) !== JSON.stringify(state.multiSession) || sessions && JSON.stringify(sessions)!==JSON.stringify(state.sessions))) { state.multiSession = mode; if(sessions)state.sessions=sessions; render(); }
});
window.addEventListener('pagehide', () => monitor.stop(), {once:true});
attempt(async () => {
  state = await api.send('UI_OPENED'); render();
  if (state.setupRequired) { await api.openOptions(); if (!globalThis.__SSO_DEMO__) window.close(); }
});
