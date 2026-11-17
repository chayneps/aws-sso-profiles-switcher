import {button,element} from './common.js';
export function createSessionButton(item,label,close) {
  const control=button('',()=>close(item),'session-button');
  control.title=`In session · Close session for ${label}`;
  control.setAttribute('aria-label',`Close session for ${label}`);
  const dot=element('span',null,'session-dot'); dot.setAttribute('aria-hidden','true');
  const x=element('span','×','session-close'); x.setAttribute('aria-hidden','true');
  control.append(dot,x); return control;
}
