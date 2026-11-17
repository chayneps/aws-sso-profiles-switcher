const ICON_SELECTOR='link[rel~="icon" i]';
export const FAVICON_ID='aws-sso-profile-favicon';
// Main thought-cloud silhouette, simplified from our logo for 16–32 px tabs.
// No lettering or detached thought dots, so the profile fill remains clear.
const CLOUD_PATH='M8.5 9C9.4 4.3 12.4 2 16 2C19.8 2 22.9 4.2 24.1 7.6C27.5 7.2 30.2 10 30.2 13.4C30.2 14.8 29.8 16.1 29 17.2C30.4 18.4 31 20 31 21.6C31 25.1 28.2 27.9 24.7 27.9C23.6 27.9 22.5 27.6 21.6 27.1C20.2 29.3 18 30.4 15.6 30.4C12.6 30.4 10.3 28.9 8.9 26.7C6.4 27.9 3.2 26.8 1.9 24.4C.6 22.1 .9 19.8 2.3 18.2C1.5 17.1 1.1 15.9 1.3 14.5C1.6 11.1 4.5 8.8 8.5 9Z';
// A code-native icon: no image service, network requests, or profile identifiers.
export function profileFavicon(color) {
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Invalid favicon color.');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="${CLOUD_PATH}" fill="${color.toLowerCase()}" stroke="#767676" stroke-width="1" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export function createFavicon(doc) {
  let link,href,head,originals=[];
  function clear() {
    link?.remove();link=null;href=null;head=null;
    for(const {node,marker} of originals)if(marker.isConnected)marker.replaceWith(node);
    originals=[];
  }
  function apply(color) {
    const nextHref=profileFavicon(color);
    if(!doc.head)return false;
    // Discard records from a replaced head without restoring stale icons into it.
    originals=originals.filter(record=>record.marker.isConnected);
    for(const node of doc.querySelectorAll(ICON_SELECTOR)) {
      if(node===link)continue;
      const marker=doc.createComment('aws-sso-original-favicon');node.replaceWith(marker);originals.push({node,marker});
    }
    head=doc.head;href=nextHref;
    if(!link){link=doc.createElement('link');link.id=FAVICON_ID;}
    link.rel='icon';link.type='image/svg+xml';link.setAttribute('sizes','any');
    link.removeAttribute('media');
    if(link.getAttribute('href')!==href)link.setAttribute('href',href);
    if(link.parentNode!==head)head.append(link);
    return true;
  }
  function isCurrent() {
    return Boolean(head===doc.head && link?.isConnected && link.parentNode===head && link.rel==='icon' && link.type==='image/svg+xml' && !link.hasAttribute('media') && link.getAttribute('sizes')==='any' && link.getAttribute('href')===href && [...doc.querySelectorAll(ICON_SELECTOR)].every(node=>node===link));
  }
  return {apply,clear,isCurrent};
}
