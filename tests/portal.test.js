import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {scanPortal, preparePortalForSync} from '../src/core/portal-scan.js';
const portalId='https://example.awsapps.com/start/';
function fixture(pages,{delay=2,filter='',failAccounts=[],stagger=false}={}){
  const dom=new JSDOM('<input type="search" aria-label="Filter accounts"><table role="treegrid"><tbody></tbody></table><button aria-label="Previous page">Previous</button><button aria-label="Next page">Next</button>',{url:portalId});
  const doc=dom.window.document;doc.querySelector('input').value=filter;let page=0,accessClicks=0,launchClicks=0;
  function draw(){
    const tbody=doc.querySelector('tbody');tbody.replaceChildren();
    for(const account of pages[page]){
      const row=doc.createElement('tr');row.setAttribute('aria-level','1');row.innerHTML=`<td><button aria-expanded="false">Expand</button><div role="button" data-testid="account-list-cell"></div><a href="#/console?account_id=${account.id}&referrer=accessPortal">${account.id}</a></td>`;
      row.querySelector('[data-testid]').textContent=account.name;tbody.append(row);
      const button=row.querySelector('button');let timer;
      button.addEventListener('click',()=>{
        if(button.getAttribute('aria-expanded')==='true'){
          button.setAttribute('aria-expanded','false');clearTimeout(timer);let next=row.nextElementSibling;while(next?.getAttribute('aria-level')==='2'){const after=next.nextElementSibling;next.remove();next=after;}return;
        }
        button.setAttribute('aria-expanded','true');const placeholder=doc.createElement('tr');placeholder.setAttribute('aria-level','2');placeholder.innerHTML='<td>Loading…</td>';row.after(placeholder);
        timer=setTimeout(()=>{
          if(!row.isConnected)return;placeholder.remove();
          if(failAccounts.includes(account.id)){const error=doc.createElement('tr');error.setAttribute('aria-level','2');error.innerHTML='<td>Error loading roles</td>';row.after(error);return;}
          if(!account.roles.length){const empty=doc.createElement('tr');empty.setAttribute('aria-level','2');empty.innerHTML='<td>No permission sets</td>';row.after(empty);return;}
          let anchor=row;
          account.roles.forEach((role,index)=>{
            const add=()=>{if(!row.isConnected||button.getAttribute('aria-expanded')!=='true')return;const child=doc.createElement('tr');child.setAttribute('aria-level','2');child.setAttribute('aria-setsize',String(account.roles.length));child.innerHTML=`<td><a data-testid="federation-link" href="#/console?account_id=${account.id}&role_name=${encodeURIComponent(role)}"></a></td><td><button>Access keys</button></td>`;child.querySelector('a').textContent=role;child.querySelector('a').addEventListener('click',()=>launchClicks++);child.querySelector('button').addEventListener('click',()=>accessClicks++);anchor.after(child);anchor=child;};
            if(stagger&&index>0)setTimeout(add,20*index);else add();
          });
        },delay);
      });
    }
    doc.querySelector('[aria-label="Previous page"]').disabled=page===0;doc.querySelector('[aria-label="Next page"]').disabled=page===pages.length-1;
  }
  doc.querySelector('[aria-label="Next page"]').onclick=()=>{page++;draw();};doc.querySelector('[aria-label="Previous page"]').onclick=()=>{page--;draw();};draw();
  return {dom,doc,page:()=>page,clicks:()=>({accessClicks,launchClicks})};
}
const account=(id='111122223333',roles=['Developer'])=>({id,name:`Account ${id}`,roles});
const scan=f=>scanPortal({document:f.doc,portalId,interval:2,timeout:150});
test('discovers delayed multiple roles in treegrid and restores expansion without launching',async()=>{
  const f=fixture([[account('111122223333',['Developer','ReadOnly'])]],{stagger:true});const result=await scan(f);
  assert.equal(result.complete,true);assert.equal(result.candidates.length,2);assert.equal(f.doc.querySelector('[aria-expanded]').getAttribute('aria-expanded'),'false');assert.deepEqual(f.clicks(),{accessClicks:0,launchClicks:0});f.dom.window.close();
});
test('follows pagination and restores initial page',async()=>{
  const f=fixture([[account()],[account('444455556666',['Audit'])]]);const result=await scan(f);assert.equal(result.complete,true);assert.equal(result.progress.pages,2);assert.equal(result.progress.accounts,2);assert.equal(result.candidates.length,2);assert.equal(f.page(),0);f.dom.window.close();
});
test('active filter produces a partial scan and retains user filter',async()=>{
  const f=fixture([[account()]],{filter:'Development'});const result=await scan(f);assert.equal(result.complete,false);assert.match(result.warnings[0],/filter/);assert.equal(f.doc.querySelector('input').value,'Development');f.dom.window.close();
});
test('one failed account does not discard successful candidates or claim completeness',async()=>{
  const f=fixture([[account(),account('444455556666')]],{failAccounts:['444455556666']});const result=await scan(f);assert.equal(result.complete,false);assert.equal(result.candidates.length,1);assert.match(result.warnings.join(' '),/could not be loaded/);f.dom.window.close();
});
test('a stalled loading row times out as partial rather than an empty role list',async()=>{
  const f=fixture([[account()]],{delay:200});const result=await scanPortal({document:f.doc,portalId,interval:2,timeout:15});assert.equal(result.complete,false);assert.equal(result.candidates.length,0);assert.match(result.warnings[0],/Timed out/);f.dom.window.close();
});
test('explicit empty assignment is resolved without inventing a role',async()=>{
  const f=fixture([[account('111122223333',[])]]);const result=await scan(f);assert.equal(result.complete,true);assert.equal(result.candidates.length,0);f.dom.window.close();
});
test('cancellation preserves collected candidates and restores disclosure state',async()=>{
  const f=fixture([[account(),account('444455556666')]]);let cancelled=false;const result=await scanPortal({document:f.doc,portalId,interval:2,timeout:100,cancelled:()=>cancelled,onProgress:()=>{cancelled=true;}});assert.equal(result.cancelled,true);assert.equal(result.complete,false);assert.equal(result.candidates.length,1);assert.equal(f.doc.querySelector('[aria-expanded]').getAttribute('aria-expanded'),'false');f.dom.window.close();
});
test('signed-out portal reports unavailable access rather than a complete empty catalog',async()=>{
  const dom=new JSDOM('<main><h1>Sign in to your access portal</h1><button>Sign in</button></main>',{url:portalId});
  const result=await scanPortal({document:dom.window.document,portalId,timeout:10,interval:2});
  assert.equal(result.complete,false);assert.equal(result.accessUnavailable,true);assert.equal(result.candidates.length,0);dom.window.close();
});
test('an explicit empty accounts table is a complete empty catalog',async()=>{
  const dom=new JSDOM('<table role="treegrid"><tbody><tr><td>No AWS accounts</td></tr></tbody></table>',{url:portalId});
  const result=await scanPortal({document:dom.window.document,portalId,timeout:10,interval:2});
  assert.equal(result.complete,true);assert.equal(result.candidates.length,0);assert.notEqual(result.accessUnavailable,true);dom.window.close();
});
test('owned sync tab clears filters and returns to the first page before loading all profiles',async()=>{
  const f=fixture([[account()],[account('444455556666')]],{filter:'Development'});
  f.doc.querySelector('[aria-label="Next page"]').click();assert.equal(f.page(),1);
  await preparePortalForSync({document:f.doc,portalId,timeout:50,interval:2});
  assert.equal(f.doc.querySelector('input').value,'');assert.equal(f.page(),0);
  const result=await scan(f);assert.equal(result.complete,true);assert.equal(result.candidates.length,2);f.dom.window.close();
});
