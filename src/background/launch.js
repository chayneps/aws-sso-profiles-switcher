import {buildShortcut, isConsoleUrl, parseRoleLink} from '../core/urls.js';
import {readConsoleIdentity, resolveIdentity} from '../core/identity.js';
import {checkMultiSession} from './multi-session.js';
import {getSessions} from './sessions.js';
import {readConsoleSessions} from '../core/console-sessions.js';
import {groupAwsTab} from './tab-group.js';

export function createLauncher({session}) {
  async function organize(tab, config, options) {
    try { await groupAwsTab(tab, config.ui.tabGroupName, options); return {}; }
    catch { return {warning:'Profile opened, but Chrome could not place it in the tab group. Reload the extension and allow tab-group access.'}; }
  }
  async function focus(tab, config) {
    const result = await organize(tab,config,{preserveExisting:true});
    await chrome.tabs.update(tab.id,{active:true});
    await chrome.windows.update(tab.windowId,{focused:true});
    return {focused:true,...result};
  }
  async function launch(profile, config) {
    const state = await session();
    // Repeated clicks during federation focus the exact same requested shortcut,
    // without treating that pending request as a verified console identity.
    for (const [id, pending] of Object.entries(state.launches || {})) {
      if (pending.profileId !== profile.id || Date.now()-pending.startedAt > 600000) continue;
      const tab = await chrome.tabs.get(Number(id)).catch(()=>null);
      const role = tab && parseRoleLink(tab.pendingUrl || tab.url,profile.portalId);
      if (role?.accountId === profile.accountId && role.permissionSet === profile.permissionSet) return focus(tab,config);
      // The owned tab may be on an identity-provider page whose URL Chrome does
      // not expose to us. Reuse that pending sign-in without claiming an identity.
      if (tab && !tab.url && !tab.pendingUrl) return {...await focus(tab,config),pending:true};
    }
    // Search live console tabs too: observation caches disappear on reload and
    // content scripts can miss a pre-existing tab until the page is refreshed.
    const tabs = await chrome.tabs.query({url:['https://*.console.aws.amazon.com/*','https://console.aws.amazon.com/*']});
    for (const tab of tabs.filter(tab=>isConsoleUrl(tab.url))) {
      try {
        const closedAt=state.closedSessions?.[new URL(tab.url).hostname.split('.')[0]];
        if(closedAt) {
          const snapshot=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:readConsoleSessions}))[0]?.result;
          if(!snapshot || (snapshot.loadedAt || 0)<=closedAt)continue;
        }
        const result = (await chrome.scripting.executeScript({target:{tabId:tab.id},func:readConsoleIdentity}))[0]?.result;
        const known = state.launches?.[tab.id]?.profileId === profile.id;
        const identity = known && result ? {...result,portalId:profile.portalId} : result;
        if (resolveIdentity(identity,config.profiles)?.id === profile.id) return focus(tab,config);
      } catch { /* An unreadable tab is not confidently matched to this role. */ }
    }
    const sessions = await getSessions(config,state);
    const existingSession = sessions.items.find(item=>item.profileId===profile.id);
    if(existingSession) {
      const tab=await chrome.tabs.create({url:existingSession.url});
      return {focused:false,reusedSession:true,...await organize(tab,config)};
    }
    if(sessions.items.length + sessions.pendingProfileIds.length >= sessions.limit) return {sessionFull:true,sessions};
    const multiSession = await checkMultiSession();
    // No console to inspect is unknown, not disabled. Allow the first launch to
    // establish session evidence; block only an explicit disabled indication.
    if (multiSession.status === 'disabled') return {launchBlocked:true,multiSession};
    const tab = await chrome.tabs.create({url:buildShortcut(profile)});
    const {launches={}} = await session();
    for (const [id, old] of Object.entries(launches)) if (Date.now()-old.startedAt > 600000) delete launches[id];
    launches[tab.id] = {profileId:profile.id,startedAt:Date.now()};
    await chrome.storage.session.set({launches});
    return {focused:false,...await organize(tab,config)};
  }
  return {launch};
}
