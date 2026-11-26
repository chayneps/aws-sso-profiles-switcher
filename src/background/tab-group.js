export async function groupAwsTab(tab, name, {preserveExisting = false} = {}) {
  if (preserveExisting && Number.isInteger(tab.groupId) && tab.groupId >= 0) {
    await chrome.tabGroups.update(tab.groupId, {collapsed: false});
    return;
  }

  // Query by window, then compare literally: Chrome's title query is a pattern.
  const groups = await chrome.tabGroups.query({windowId: tab.windowId});
  const existing = groups.find(group => group.title === name);
  if (existing) {
    if (tab.groupId !== existing.id) await chrome.tabs.group({tabIds: [tab.id], groupId: existing.id});
    await chrome.tabGroups.update(existing.id, {collapsed: false});
  } else {
    const id = await chrome.tabs.group({tabIds: [tab.id], createProperties: {windowId: tab.windowId}});
    await chrome.tabGroups.update(id, {title: name, color: 'orange', collapsed: false});
  }
}
