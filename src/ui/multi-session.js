import {element, button, attempt} from './common.js';

export function renderMultiSession(node, mode, api, recheck, compact = false) {
  const enabled = mode?.status === 'enabled';
  node.hidden = mode?.status !== 'disabled';
  if (node.hidden) { node.replaceChildren(); return; }
  node.className = `multi-session ${enabled ? 'is-ready' : 'needs-setup'}${compact ? ' compact' : ''}`;
  const copy = element('div', null, 'multi-session-copy');
  copy.append(element(compact ? 'strong' : 'h2', enabled ? 'Multi-session detected' : 'Set up AWS multi-session'));
  copy.append(element('p', enabled
    ? 'Ready to open separate profiles · up to 5 active identities.'
    : mode?.status === 'disabled'
      ? 'AWS multi-session is off. Turn it on to keep profiles open together.'
      : 'Enable multi-session in an AWS console before opening profiles.'));
  if (!enabled && !compact) {
    copy.append(element('p', 'Open an AWS console → account menu → Turn on multi-session, then return here and Recheck. If AWS asks you to sign in, open one permission set from your access portal first.'));
    copy.append(element('small', 'An AWS console control reports multi-session is off. Enable it, then Recheck. Inconclusive checks do not lock profiles.'));
  }
  const actions = element('div', null, 'multi-session-actions');
  if (!enabled) actions.append(button('Open AWS console', () => attempt(() => api.send('OPEN_MULTI_SESSION_SETUP')), 'button primary'));
  actions.append(button('Recheck', () => attempt(recheck), 'button secondary'));
  node.replaceChildren(copy, actions);
}
