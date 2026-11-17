import {element} from './common.js';

export function accountHasSession(account, sessions, profiles) {
  return (sessions?.items || []).some(item=>profiles.some(profile=>profile.id===item.profileId && profile.accountId===account.accountId && profile.portalId===account.portalId));
}
export function createAccountGroup(account, {list = false, portalLabel = '', active = false, reordering} = {}) {
  const group = element('fieldset', null, 'account-group');
  group.classList.toggle('has-session',active);
  const legend = element('legend', null, 'account-group-legend');
  if (account.accountName) legend.append(element('span', account.accountName, 'account-group-name'), document.createTextNode(' '));
  legend.append(element('code', account.accountId, 'account-group-id'));
  if (portalLabel) legend.append(document.createTextNode(' '), element('span', portalLabel, 'account-group-portal'));
  const body = element(list ? 'ul' : 'div', null, list ? 'profile-list' : 'profile-grid');
  group.append(legend, body);
  reordering?.attach(group,legend,account);
  return {group, body};
}
