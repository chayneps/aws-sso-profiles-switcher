import {createFavicon} from './favicon.js';
const MODE_CLASSES = ['awsui-dark-mode', 'awsui-polaris-dark-mode'];
const ACCOUNT_SELECTOR = '#nav-usernameMenu, [data-testid$="awsc-nav-account-menu-button"]';
const ACCENT_CSS = `
[data-aws-sso-header-accent] { box-shadow: inset 0 -3px 0 var(--aws-sso-profile-accent) !important; }
[data-aws-sso-top-accent] { background-color: var(--aws-sso-profile-accent) !important; background-image: none !important; }
[data-aws-sso-account-accent] {
  background-color: var(--aws-sso-profile-accent) !important;
  background-image: none !important;
  color: var(--aws-sso-profile-foreground) !important;
  border-radius: 0 0 4px 4px !important;
}
[data-aws-sso-account-accent] * {
  background-color: transparent !important;
  background-image: none !important;
  color: var(--aws-sso-profile-foreground) !important;
}
[data-aws-sso-account-accent] svg path:not([fill="none"]) { fill: currentColor !important; }
/* AWS's native account-color corners cast gray wing-shaped shadows. The
   full button now carries the accent, so those inner shadows are redundant. */
[data-aws-sso-account-accent] *::before,
[data-aws-sso-account-accent] *::after { box-shadow: none !important; }
`;
export function accentForeground(color) {
  const rgb = color.slice(1).match(/../g).map(value => {
    const channel = parseInt(value,16)/255;
    return channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;
  });
  const luminance = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return (luminance+.05)/.05 >= 1.05/(luminance+.05) ? '#000000' : '#ffffff';
}
export function createAppearance(doc, media = {matches: false}) {
  const favicon=createFavicon(doc);
  let touched = [], accentNodes = [], roots = [], accentStyle, accountNode, headerNode, stripNode, accentColor;
  function currentNodes() {
    const menu = doc.querySelector(ACCOUNT_SELECTOR);
    const header=doc.querySelector('#awsc-nav-header') || menu?.closest('header, [role="banner"]');
    return {account:menu?.closest('button, a, [role="button"]') || menu,header,strip:header?.querySelector(':scope > [role="img"][aria-label^="Account color:"]') || null};
  }
  function markAccent(node, attribute, color, foreground) {
    if (!node) return;
    const properties = ['--aws-sso-profile-accent','--aws-sso-profile-foreground'].map(name => [name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]);
    accentNodes.push({node,attribute,value:node.getAttribute(attribute),properties});
    node.setAttribute(attribute,'');
    node.style.setProperty('--aws-sso-profile-accent',color);
    node.style.setProperty('--aws-sso-profile-foreground',foreground);
  }
  function clear({keepFavicon=false}={}) {
    if(!keepFavicon)favicon.clear();
    for (const {node, classes, attrs} of touched) {
      for (const [name, present] of classes) node.classList.toggle(name, present);
      for (const [name, value] of attrs) { if (value == null) node.removeAttribute(name); else node.setAttribute(name, value); }
    }
    for (const {node,attribute,value,properties} of accentNodes) {
      if (value == null) node.removeAttribute(attribute); else node.setAttribute(attribute,value);
      for (const [name,original,priority] of properties) {
        if (original) node.style.setProperty(name,original,priority); else node.style.removeProperty(name);
      }
    }
    touched = []; accentNodes = []; roots = [];
    doc.getElementById('aws-sso-profile-badge')?.remove();
    accentStyle?.remove(); accentStyle = null;
    accountNode = null; headerNode = null; stripNode = null; accentColor = null;
  }
  function isCurrent() {
    if (roots[0] !== doc.documentElement || roots[1] !== doc.body || !favicon.isCurrent()) return false;
    const nodes = currentNodes();
    if (nodes.account !== accountNode || nodes.header !== headerNode || nodes.strip !== stripNode) return false;
    if (accentNodes.length && !accentStyle?.isConnected) return false;
    return accentNodes.every(({node,attribute}) => node.isConnected && node.hasAttribute(attribute) && node.style.getPropertyValue('--aws-sso-profile-accent') === accentColor);
  }
  function apply(profile) {
    clear({keepFavicon:true});
    if (!profile) { favicon.clear(); return {matched: false, supported: false}; }
    const dark = profile.theme === 'dark' || (profile.theme === 'system' && media.matches);
    roots = [doc.documentElement, doc.body];
    const supportedRoots = roots.filter(node => node && (MODE_CLASSES.some(c => node.classList.contains(c)) || node.classList.contains('awsui-visual-refresh') || ['data-awsui-color-mode', 'data-color-mode'].some(a => /^(dark|light)$/.test(node.getAttribute(a) || ''))));
    for (const node of supportedRoots) {
      const attrs = ['data-awsui-color-mode', 'data-color-mode'].filter(a => node.hasAttribute(a)).map(a => [a, node.getAttribute(a)]);
      touched.push({node, classes: MODE_CLASSES.map(c => [c, node.classList.contains(c)]), attrs});
      // AWS uses both names across legacy Polaris and current Cloudscape roots.
      for (const c of MODE_CLASSES) node.classList.toggle(c, dark);
      for (const [a] of attrs) node.setAttribute(a, dark ? 'dark' : 'light');
    }
    accentColor = /^#[0-9a-f]{6}$/i.test(profile.color || '') ? profile.color : '#ff9900';
    const faviconSupported=favicon.apply(accentColor);
    const foreground = accentForeground(accentColor), nodes = currentNodes();
    accountNode = nodes.account; headerNode = nodes.header; stripNode = nodes.strip;
    markAccent(headerNode,'data-aws-sso-header-accent',accentColor,foreground);
    markAccent(accountNode,'data-aws-sso-account-accent',accentColor,foreground);
    markAccent(stripNode,'data-aws-sso-top-accent',accentColor,foreground);
    if (accentNodes.length) {
      accentStyle = doc.createElement('style'); accentStyle.id = 'aws-sso-console-accent';
      accentStyle.textContent = ACCENT_CSS; (doc.head || doc.documentElement).append(accentStyle);
    }
    return {matched: true, supported: supportedRoots.length > 0, accentSupported: accentNodes.length > 0, faviconSupported};
  }
  return {apply, clear, isCurrent};
}
