import {createAPI} from './api.js';
import {normalizePortal, sanitizeProfile, searchProfiles, displayName, DEFAULT_COLOR, groupProfilesByAccount} from '../core/model.js';
import {portalOriginPattern} from '../core/urls.js';
import {parseJSON, parseINI, exportJSON} from '../core/imports.js';
import {$, element, button, status, attempt, replaceOptions, showDemo} from './common.js';
import {renderMultiSession} from './multi-session.js';
import {monitorMultiSession} from './session-monitor.js';
import {createAccountGroup, accountHasSession} from './account-groups.js';
import {createColorButton,createColorPalette} from './color-palette.js';
import {sortAccounts} from '../core/account-order.js';
import {createAccountReordering} from './account-reordering.js';
showDemo();
const api = createAPI();
let state, editedProfile, previewConfig, groupDirty = false;
let accountGroups=[];
const reordering=createAccountReordering({getGroups:()=>accountGroups,onEnd:()=>{if(state)render();},move:async change=>{
  try {await api.send('REORDER_ACCOUNT',change);await refresh();status('');
    [...$('profile-grid').querySelectorAll('.account-group')].find(node=>node.dataset.accountKey===change.sourceKey)?.querySelector('legend').focus();
  } catch(error){status(error.message,true);render();}
}});
const palette=createColorPalette({getCustomColors:()=>state.config.ui.customColors,saveCustomColor:async(index,color)=>{
  await api.send('SET_CUSTOM_COLOR',{index,color});state.config.ui.customColors[index]=color;
}});
const openingProfiles = new Set();
async function launchProfile(profile) {
  if (openingProfiles.has(profile.id)) return;
  openingProfiles.add(profile.id); status('Opening profile…');
  try {
    const result = await api.send('LAUNCH', {id: profile.id});
    if (result.sessionFull) { status('All 5 session slots are occupied or opening. Open the extension popup and close a session with × before opening another profile.',true); return; }
    if (result.launchBlocked) { state.multiSession = result.multiSession; status(''); render(); $('multi-session').scrollIntoView({block:'center'}); return; }
    status(result.warning || (result.focused ? 'Existing console tab focused.' : 'Profile opened in its tab group.'),Boolean(result.warning));
  } finally { openingProfiles.delete(profile.id); }
}
function render() { if(reordering.dragging)return;renderProfiles(); renderPortals(); renderScan(); renderMultiSession($('multi-session'), state.multiSession, api, refresh); if (!groupDirty) $('tab-group-name').value = state.config.ui.tabGroupName || 'AWS SSO'; }
async function refresh() { state = await api.send('GET_STATE'); render(); }
function renderProfiles() {
  if(reordering.dragging)return;
  const focusedAccount=document.activeElement?.closest('.account-group-legend')?.parentElement.dataset.accountKey;
  const profiles = searchProfiles(state.config.profiles, $('profile-search').value);
  $('profile-count').textContent = String(state.config.profiles.length);
  accountGroups=sortAccounts(groupProfilesByAccount(profiles),state.config);
  reordering.beginRender();
  $('profile-grid').replaceChildren(...accountGroups.map(account => {
    const portal = state.config.portals.find(p => p.id === account.portalId);
    const {group, body} = createAccountGroup(account, {reordering, active:accountHasSession(account,state.sessions,state.config.profiles), portalLabel:state.config.portals.length > 1 ? portal?.label || new URL(account.portalId).hostname : ''});
    body.append(...account.profiles.map(profile => {
      const card = element('article', null, 'profile-card'); card.style.setProperty('--accent', profile.color);
      card.tabIndex = 0;
      card.setAttribute('aria-label', `${displayName(profile)}. Double-click or press Enter to open.`);
      card.title = 'Double-click to open this profile. You can also focus the tile and press Enter.';
      card.addEventListener('dblclick', event => {
        if (!event.target.closest('button, input, label, select, textarea, a')) attempt(() => launchProfile(profile));
      });
      card.addEventListener('keydown', event => {
        if (event.target === card && event.key === 'Enter') { event.preventDefault(); attempt(() => launchProfile(profile)); }
      });
      const top = element('div', null, 'card-top');
      const controls = element('div', null, 'card-controls');
      const meta = element('div', null, 'card-meta');
      if (profile.label && profile.label !== profile.permissionSet) meta.append(element('span', profile.permissionSet, 'pill'));
      meta.append(element('span', `${profile.theme[0].toUpperCase()}${profile.theme.slice(1)} theme`, 'pill'));
      if (profile.region) meta.append(element('span', profile.region, 'pill'));
      if (profile.availability === 'not-seen') meta.append(element('span', 'Not present in latest sync', 'pill'));
      const visibility = element('label', null, 'visibility-toggle'), toggle = document.createElement('input');
      toggle.type = 'checkbox'; toggle.checked = profile.showInPopup !== false;
      toggle.setAttribute('aria-label', `Show ${displayName(profile)} in popup`);
      visibility.title = 'Show in popup — include this profile in the dropdown menu.';
      toggle.title = visibility.title;
      toggle.addEventListener('change', () => attempt(async () => { await api.send('SET_VISIBILITY', {id:profile.id, show:toggle.checked}); await refresh(); }));
      visibility.append(toggle);
      controls.append(visibility);
      top.append(element('h3', profile.label || profile.permissionSet), controls);
      const colorLabel = element('div', null, 'profile-color');
      const color=createColorButton(`Profile color for ${displayName(profile)}`,profile.color,()=>palette.open({value:profile.color,label:displayName(profile),onSelect:async color=>{
        await api.send('SET_COLOR', {id: profile.id, color});status('Profile color saved.');await refresh();
      }}));
      colorLabel.append(document.createTextNode('Color'), color);
      const edit = button('Edit', () => openEditor(profile), 'text-button'); edit.setAttribute('aria-label', `Edit ${displayName(profile)}`); edit.title = 'Edit appearance';
      const preferences = element('div',null,'card-preferences'); preferences.append(edit,colorLabel);
      card.append(top, meta, preferences); return card;
    }));
    return group;
  }));
  if (!profiles.length) {
    const empty = element('div', null, 'empty'); empty.append(element('strong', state.config.profiles.length ? 'No matches' : 'Bring your accounts together'), element('p', state.config.profiles.length ? 'Try a different name, account ID, or permission set.' : 'Connect your access portal above, then synchronise your accounts.'));
    $('profile-grid').append(empty);
  }
  if(focusedAccount)[...$('profile-grid').querySelectorAll('.account-group')].find(node=>node.dataset.accountKey===focusedAccount)?.querySelector('legend').focus({preventScroll:true});
}
function renderPortals() {
  const portals = state.config.portals;
  replaceOptions($('import-portal'), portals);
  $('portal-list').replaceChildren(...portals.map(portal => {
    const uncertainSignIn = portal.syncStatus === 'sign-in-required' && state.portalAccess?.[portal.id] !== 'sign-in-required';
    const row = element('div', null, 'portal-item'), copy = element('div', null, 'portal-copy');
    copy.append(element('strong', portal.label || new URL(portal.id).hostname), element('small', portal.baseUrl));
    const names = {idle:'Ready to synchronise',syncing:'Synchronising…',synced:'Up to date',partial:'Partial sync', 'sign-in-required':'Sign-in required','permission-required':'Access permission required',error:'Sync interrupted'};
    const info = element('p', uncertainSignIn ? 'Sync needs a retry' : names[portal.syncStatus] || names.idle, 'sync-state');
    if (portal.lastImportAt) info.append(document.createTextNode(` · Last synced ${new Date(portal.lastImportAt).toLocaleString()}`));
    copy.append(info);
    if (portal.syncMessage && !uncertainSignIn) copy.append(element('small', portal.syncMessage));
    const intervalLabel = element('label', 'Automatic sync'), interval = document.createElement('select');
    interval.setAttribute('aria-label', `Automatic sync for ${portal.label || new URL(portal.id).hostname}`);
    for (const [value, label] of [[30,'Every 30 minutes'],[15,'Every 15 minutes'],[60,'Every hour'],[0,'Manual only']]) {
      const option = element('option', label); option.value = value; interval.append(option);
    }
    interval.value = portal.syncIntervalMinutes ?? 30;
    interval.addEventListener('change', () => attempt(async () => { await api.send('SET_SYNC_INTERVAL', {portalId:portal.id, minutes:Number(interval.value)}); await refresh(); }));
    intervalLabel.append(interval);
    const actions = element('div', null, 'portal-actions');
    const sync = button(portal.syncStatus === 'permission-required' ? 'Grant access & sync' : portal.syncStatus === 'sign-in-required' && !uncertainSignIn ? 'Sign in & synchronise' : 'Synchronise', () => attempt(async () => {
      if (!await api.requestOrigin(portalOriginPattern(portal.id))) throw new Error('Grant portal access to synchronise. Your saved profiles are still available.');
      await api.send('SYNC_PORTAL', {portalId:portal.id}); status('Synchronising profiles. They are saved automatically; complete portal sign-in if prompted.'); await refresh();
    }), 'button primary');
    sync.disabled = portal.syncStatus === 'syncing';
    actions.append(intervalLabel, button('Open portal ↗', () => attempt(() => api.send('OPEN_PORTAL', {portalId:portal.id}))), sync);
    row.append(copy, actions); return row;
  }));
}
function renderScan() {
  const draft = state.draft;
  $('scan-panel').hidden = !draft || (draft.status === 'saved' && draft.complete && !draft.warnings?.length);
  if (!draft) return;
  const scanning = ['scanning', 'cancelling'].includes(draft.status);
  $('scan-title').textContent = draft.status === 'cancelling' ? 'Cancelling sync…' : scanning ? 'Synchronising profiles…' : 'Synchronisation results';
  const p = draft.progress || {};
  $('scan-progress').textContent = `${p.accounts || 0} accounts · ${p.profiles || 0} profiles · ${p.pages || 0} pages`;
  $('scan-loading').hidden = !scanning; $('cancel-scan').hidden = draft.status !== 'scanning';
  $('scan-warnings').replaceChildren(...(draft.warnings || []).map(w => element('p', w, 'notice')));
}
function openEditor(profile) {
  if (!state.config.portals.length) { status('Connect an access portal before adding a profile.'); $('portal-url').focus(); return; }
  editedProfile = profile || null;
  $('editor-title').textContent = profile ? 'Edit profile' : 'Add profile';
  replaceOptions($('edit-portal'), state.config.portals);
  if (profile) $('edit-portal').value = profile.portalId;
  for (const [field, property] of [['account-name','accountName'],['account','accountId'],['role','permissionSet'],['label','label'],['region','region']]) $(`edit-${field}`).value = profile?.[property] || '';
  $('edit-theme').value = profile?.theme || 'system'; $('edit-color').value = profile?.color || DEFAULT_COLOR;
  renderEditorColor();
  for (const id of ['edit-account-name','edit-account','edit-role']) $(id).readOnly = Boolean(profile?.lastSeenAt);
  $('edit-portal').disabled = Boolean(profile?.lastSeenAt); $('editor-error').hidden = true; $('profile-dialog').showModal();
}
function renderEditorColor() {
  const value=$('edit-color').value;
  $('editor-color-control').replaceChildren(createColorButton('Choose profile accent color',value,()=>palette.open({value:$('edit-color').value,label:editedProfile?displayName(editedProfile):'New profile',onSelect:color=>{ $('edit-color').value=color;renderEditorColor(); }})));
}
$('portal-form').addEventListener('submit', event => {
  event.preventDefault(); attempt(async () => {
    const id = normalizePortal($('portal-url').value.trim());
    const granted = await api.requestOrigin(portalOriginPattern(id));
    await api.send('SAVE_PORTAL', {url: id, label: $('portal-name').value.trim()});
    $('portal-form').reset();
    if (granted) await api.send('SYNC_PORTAL', {portalId:id});
    status(granted ? 'Portal connected. Sign in if prompted; profiles are saved automatically.' : 'Portal saved. Use Synchronise and grant access to connect.'); await refresh();
  });
});
$('profile-search').addEventListener('input', renderProfiles);
$('tab-group-name').addEventListener('input', () => { groupDirty = true; });
$('tab-group-form').addEventListener('submit', event => {
  event.preventDefault(); attempt(async () => {
    await api.send('SET_TAB_GROUP',{name:$('tab-group-name').value.trim()});
    groupDirty = false; status('Tab group saved.'); await refresh();
  });
});
$('add-profile').addEventListener('click', () => openEditor());
$('close-editor').addEventListener('click', () => $('profile-dialog').close());
$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const profile = sanitizeProfile({...editedProfile, portalId:$('edit-portal').value,accountName:$('edit-account-name').value,accountId:$('edit-account').value,permissionSet:$('edit-role').value,label:$('edit-label').value,theme:$('edit-theme').value,color:$('edit-color').value,region:$('edit-region').value}, state.config.portals);
    await api.send('SAVE_PROFILE', {profile, previousId: editedProfile?.id}); $('profile-dialog').close(); status('Profile saved.'); await refresh();
  } catch(error) { $('editor-error').textContent=error.message; $('editor-error').hidden=false; }
});
$('cancel-scan').addEventListener('click', () => attempt(async () => { await api.send('CANCEL_SCAN'); await refresh(); }));
function invalidateConfigPreview() { previewConfig = null; $('apply-config').hidden = true; $('config-preview').hidden = true; }
$('config-text').addEventListener('input', invalidateConfigPreview); $('import-portal').addEventListener('change', invalidateConfigPreview);
$('config-file').addEventListener('change', () => attempt(async () => {
  invalidateConfigPreview(); const file=$('config-file').files[0]; if(!file)return; if(file.size>5_000_000)throw new Error('Choose a file smaller than 5 MB.'); $('config-text').value=await file.text();
}));
$('preview-config').addEventListener('click', () => attempt(() => {
  invalidateConfigPreview(); const input=$('config-text').value.trim(); const parsed = input.startsWith('{') ? parseJSON(input) : parseINI(input,$('import-portal').value);
  previewConfig=parsed.config; $('config-preview').textContent=`${parsed.config.profiles.length} profiles across ${parsed.config.portals.length} portals. This merges profiles; matching IDs take the imported appearance.\n${parsed.warnings.join('\n')}`; $('config-preview').hidden=false; $('apply-config').hidden=false;
}));
$('apply-config').addEventListener('click', () => attempt(async () => { if(!previewConfig)return; await api.send('IMPORT_CONFIG',{config:previewConfig}); invalidateConfigPreview(); $('config-text').value=''; $('config-file').value=''; status('Configuration imported. Grant portal access if you want to discover more profiles.'); await refresh(); }));
$('export').addEventListener('click', () => attempt(() => {
  const blob=new Blob([exportJSON(state.config)],{type:'application/json'}), url=URL.createObjectURL(blob), link=element('a'); link.href=url; link.download='aws-sso-profiles.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}));
api.subscribe(() => attempt(refresh));
window.addEventListener('focus', () => { if (state) attempt(refresh); });
const monitor = monitorMultiSession(api, (mode,sessions) => {
  if (state && (JSON.stringify(mode) !== JSON.stringify(state.multiSession) || sessions && JSON.stringify(sessions)!==JSON.stringify(state.sessions))) { state.multiSession = mode; if(sessions) state.sessions=sessions; render(); }
});
window.addEventListener('pagehide', () => monitor.stop(), {once:true});
attempt(async () => {
  state = await api.send('UI_OPENED'); render();
  if (state.setupRequired) {
    $('portal-url').focus();
    status('Add your AWS access portal to get started.');
  }
});
