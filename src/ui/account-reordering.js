// Only headers initiate an internal drag. Never trust external dataTransfer keys.
export function createAccountReordering({getGroups,move,onEnd=()=>{}}) {
  let dragged=null,busy=false;
  const attached=new Map();
  const clean=()=>{for(const {group} of attached.values())group.classList.remove('account-dragging','drop-before','drop-after');};
  const finish=()=>{const cancelled=dragged!==null;dragged=null;clean();if(cancelled&&!busy)onEnd();};
  async function commit(sourceKey,targetKey,position) {
    if(busy||sourceKey===targetKey)return;
    busy=true;dragged=null;clean();
    try{await move({sourceKey,targetKey,position});}
    finally{busy=false;}
  }
  function position(event,group){const r=group.getBoundingClientRect();return event.clientY<r.top+r.height/2?'before':'after';}
  return {
    get dragging(){return dragged!==null;},
    beginRender(){clean();attached.clear();},
    attach(group,legend,account) {
      attached.set(account.key,{group,legend});group.dataset.accountKey=account.key;
      legend.draggable=true;legend.tabIndex=0;
      legend.title='Drag to reorder accounts. Alt+↑ or Alt+↓ moves this account.';
      legend.setAttribute('aria-label',legend.textContent.trim());
      legend.setAttribute('aria-description','Drag to reorder; Alt+Up or Alt+Down also moves this account.');
      legend.addEventListener('dragstart',event=>{
        if(busy){event.preventDefault();return;}
        dragged=account.key;clean();group.classList.add('account-dragging');
        event.dataTransfer?.setData('text/plain',account.key);
        if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setDragImage?.(group,12,12);}
      });
      legend.addEventListener('dragend',finish);
      group.addEventListener('dragover',event=>{
        if(!dragged||dragged===account.key||busy)return;
        event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';
        clean();attached.get(dragged)?.group.classList.add('account-dragging');
        group.classList.add(`drop-${position(event,group)}`);
        // Keep every destination reachable in the popup's scrolling list.
        const scroll=group.closest('.popup-main');
        if(scroll){const r=scroll.getBoundingClientRect();if(event.clientY>r.bottom-35)scroll.scrollTop+=18;else if(event.clientY<r.top+35)scroll.scrollTop-=18;}
      });
      group.addEventListener('dragleave',event=>{if(!group.contains(event.relatedTarget))group.classList.remove('drop-before','drop-after');});
      group.addEventListener('drop',event=>{
        if(!dragged||busy)return;event.preventDefault();event.stopPropagation();
        void commit(dragged,account.key,position(event,group)).catch(()=>{});
      });
      legend.addEventListener('keydown',event=>{
        if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||busy)return;
        event.preventDefault();event.stopPropagation();
        const groups=getGroups(),index=groups.findIndex(g=>g.key===account.key),target=groups[index+(event.key==='ArrowUp'?-1:1)];
        if(target)void commit(account.key,target.key,event.key==='ArrowUp'?'before':'after').catch(()=>{});
      });
    }
  };
}
