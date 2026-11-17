import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readPortalAccess} from '../src/core/portal-access.js';
const account='<table role="treegrid"><tbody><tr aria-level="1"><td><a href="#/console?account_id=111122223333">111122223333</a></td></tr></tbody></table>';
function read(html){const dom=new JSDOM(html);for(const node of dom.window.document.querySelectorAll('*'))node.getClientRects=()=>node.closest('[hidden]')?[]:[{}];const result=readPortalAccess(dom.window.document);dom.window.close();return result.status;}
test('rendered Accounts rows and explicit empty inventory prove portal access',()=>{
  assert.equal(read(account),'ready');assert.equal(read('<table role="treegrid"><tbody><tr><td>No AWS accounts</td></tr></tbody></table>'),'ready');
});
test('explicit visible sign-in or expiry is required; loading, errors, and unrelated text are unknown',()=>{
  assert.equal(read('<h1>Sign in</h1>'),'sign-in-required');assert.equal(read('<div role="alert">Your session has expired.</div>'+account),'sign-in-required');
  for(const html of ['<p>Loading accounts…</p>','<div role="alert">Network error</div>','<p>Sign in</p>','<h1 hidden>Sign in</h1>'])assert.equal(read(html),'unknown');
  assert.equal(read('<h1 hidden>Sign in</h1>'+account),'ready');assert.equal(read('<div hidden>'+account+'</div>'),'unknown');
});
