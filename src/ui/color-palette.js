import {button,element} from './common.js';
import {PRESET_COLORS,CUSTOM_COLOR_COUNT} from '../core/colors.js';
import {accentForeground} from '../core/appearance.js';
export function createColorButton(label,value,open) {
  const control=button('',open,'palette-trigger');
  const swatch=element('span',null,'palette-trigger-swatch'); swatch.style.backgroundColor=value;
  swatch.setAttribute('aria-hidden','true');control.append(swatch);
  control.setAttribute('aria-label',label);control.setAttribute('aria-haspopup','dialog');control.title=`${label} · ${value}`;
  return control;
}
export function createColorPalette({getCustomColors,saveCustomColor}) {
  const dialog=element('dialog',null,'color-palette-dialog'); dialog.setAttribute('aria-labelledby','color-palette-title');
  const header=element('div',null,'section-header'),title=element('h2','Profile color');title.id='color-palette-title';
  header.append(title,button('×',()=>dialog.close(),'text-button'));
  header.lastChild.setAttribute('aria-label','Close color palette');
  const context=element('p',null,'muted'),current=element('p',null,'palette-current');
  const presetHeading=element('h3','Preset colors'),presets=element('div',null,'color-palette-grid');presets.setAttribute('role','group');presets.setAttribute('aria-label','Preset colors');
  const customHeading=element('h3','Custom colors'),customs=element('div',null,'color-palette-grid');customs.setAttribute('role','group');customs.setAttribute('aria-label','Custom colors');
  const hint=element('p','Click + to add a color. Use the pencil to edit a saved color.','palette-hint');
  const error=element('p',null,'notice error');error.hidden=true;error.setAttribute('role','alert');
  dialog.append(header,context,current,presetHeading,presets,customHeading,customs,hint,error);document.body.append(dialog);
  let selection,busy=false;
  const choices=[];
  function paint() {
    current.textContent=`Current: ${selection.value}`;
    for(const {control,color} of choices) {
      const chosen=color()?.toLowerCase()===selection.value.toLowerCase();
      control.setAttribute('aria-pressed',String(chosen));
      control.querySelector('.palette-check').hidden=!chosen;
    }
  }
  async function choose(color) {
    if(busy) return; busy=true;error.hidden=true;
    try { await selection.onSelect(color); selection.value=color;paint();dialog.close(); }
    catch(e) { error.textContent=e.message;error.hidden=false; }
    finally { busy=false; }
  }
  function tile(label,color,action) {
    const control=button('',action,'palette-choice');
    const face=element('span',null,'palette-face');const check=element('span','✓','palette-check');check.setAttribute('aria-hidden','true');face.append(check);
    if(color) {face.style.backgroundColor=color;face.style.color=accentForeground(color);}
    control.append(face,element('span',label,'palette-name'));return control;
  }
  return {open({value,label,onSelect}) {
    selection={value,label,onSelect};busy=false;error.hidden=true;context.textContent=label;
    choices.length=0;presets.replaceChildren();customs.replaceChildren();
    for(const preset of PRESET_COLORS) {
      const control=tile(preset.name,preset.value,()=>choose(preset.value));
      control.title=`${preset.name} · ${preset.value}`;control.setAttribute('aria-label',`Use ${preset.name} ${preset.value}`);
      presets.append(control);choices.push({control,color:()=>preset.value});
    }
    const saved=getCustomColors();
    for(let index=0;index<CUSTOM_COLOR_COUNT;index++) {
      let color=saved[index];const label=`Custom ${index+1}`,wrap=element('div',null,'palette-custom');
      const picker=document.createElement('input');picker.type='color';picker.value=color||value;
      picker.setAttribute('aria-label',`Edit custom color ${index+1}`);picker.title=`Edit ${label.toLowerCase()}`;
      const control=tile(label,color,()=>{
        if(color) choose(color);
        else { try { if(picker.showPicker)picker.showPicker();else picker.click(); } catch { picker.click(); } }
      });
      const plus=element('span','+','palette-plus');plus.setAttribute('aria-hidden','true');plus.hidden=!!color;control.querySelector('.palette-face').append(plus);
      control.setAttribute('aria-label',color?`Use ${label.toLowerCase()} ${color}`:`Set ${label.toLowerCase()}`);control.title=color?`${label} · ${color}`:`Set ${label.toLowerCase()} with the color picker`;
      const edit=element('label',null,'palette-custom-edit');const pencil=element('span','✎');pencil.setAttribute('aria-hidden','true');edit.append(pencil,picker);
      picker.addEventListener('change',async()=>{
        if(busy)return;busy=true;error.hidden=true;
        try {
          const next=picker.value.toLowerCase();await saveCustomColor(index,next);color=next;
          const face=control.querySelector('.palette-face');face.style.backgroundColor=color;face.style.color=accentForeground(color);plus.hidden=true;
          control.setAttribute('aria-label',`Use ${label.toLowerCase()} ${color}`);control.title=`${label} · ${color}`;
          await selection.onSelect(color);selection.value=color;paint();dialog.close();
        } catch(e) {error.textContent=e.message;error.hidden=false;} finally{busy=false;}
      });
      wrap.append(control,edit);customs.append(wrap);choices.push({control,color:()=>color});
    }
    paint();dialog.showModal();
  }};
}
