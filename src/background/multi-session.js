import {isConsoleUrl, isMultiSessionUrl} from '../core/urls.js';
import {readMultiSession} from '../core/multi-session.js';

const consolePatterns = ['https://*.console.aws.amazon.com/*', 'https://console.aws.amazon.com/*'];
export async function checkMultiSession() {
  const tabs = await chrome.tabs.query({url: consolePatterns});
  const results = await Promise.allSettled(tabs.filter(tab => isConsoleUrl(tab.url)).map(async tab => {
    let result;
    try { result = (await chrome.scripting.executeScript({target: {tabId: tab.id}, func: readMultiSession}))[0]?.result; } catch { /* A pre-existing tab may not permit injection yet. Its URL is still evidence. */ }
    if (result?.status === 'enabled' || result?.status === 'disabled') return result;
    return isMultiSessionUrl(tab.url) ? {status:'enabled',source:'session-url'} : {status:'unknown'};
  }));
  const evidence = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const enabled = evidence.find(r => r?.status === 'enabled');
  // An old landing page can retain an Enable control after another tab has
  // already entered a native session. Positive session evidence wins across tabs.
  if (enabled) return {status: 'enabled', source: enabled.source};
  const disabled = evidence.find(r => r?.status === 'disabled');
  return disabled ? {status:'disabled',source:disabled.source} : {status:'unknown'};
}

export async function openMultiSessionSetup() {
  const tabs = await chrome.tabs.query({url: consolePatterns});
  const existing = tabs.find(tab => isConsoleUrl(tab.url));
  if (existing) {
    await chrome.tabs.update(existing.id, {active: true});
    await chrome.windows.update(existing.windowId, {focused: true});
  } else await chrome.tabs.create({url: 'https://console.aws.amazon.com/'});
}
