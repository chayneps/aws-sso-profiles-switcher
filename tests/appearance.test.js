import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readConsoleIdentity} from '../src/core/identity.js';
import {createAppearance, accentForeground} from '../src/core/appearance.js';
const profile={accountId:'111122223333',accountName:'Development',permissionSet:'Dev_Lower',theme:'dark',color:'#123456'};
test('session hostname can supply account ID only alongside the complete role identity',()=>{
  const dom=new JSDOM('<button id="nav-usernameMenu" title="AWSReservedSSO_Dev_Lower_0123456789abcdef/user">Development</button>');
  const href='https://111122223333-abc.us-east-1.console.aws.amazon.com/console/home';
  assert.equal(readConsoleIdentity(dom.window.document,href).accountId,'111122223333');
  dom.window.document.querySelector('button').textContent='444455556666';assert.equal(readConsoleIdentity(dom.window.document,href),null);
  dom.window.document.querySelector('button').textContent='Development';
  dom.window.document.querySelector('button').removeAttribute('title');assert.equal(readConsoleIdentity(dom.window.document,href),null);dom.window.close();
});
test('reads only account and complete permission-set identity from console header',()=>{
  const dom=new JSDOM('<button id="nav-usernameMenu" title="AWSReservedSSO_Dev_Lower_0123456789abcdef/user@example.test @ alias">Development (111122223333) Dev_Lower/user@example.test</button>');
  assert.deepEqual(readConsoleIdentity(dom.window.document,'https://us-east-1.console.aws.amazon.com/console/home'),{accountId:'111122223333',permissionSet:'Dev_Lower',sessionHost:'us-east-1.console.aws.amazon.com'});
  assert.equal(readConsoleIdentity(dom.window.document,'https://attacker.test/'),null);dom.window.document.querySelector('button').removeAttribute('title');assert.equal(readConsoleIdentity(dom.window.document,'https://console.aws.amazon.com/'),null);dom.window.close();
});
test('native theme uses both mode classes, changes profile, and restores original classes',()=>{
  const dom=new JSDOM('<body class="awsui-visual-refresh"><main>Content</main></body>'),doc=dom.window.document,adapter=createAppearance(doc);
  assert.equal(adapter.apply(profile).supported,true);assert.ok(doc.body.classList.contains('awsui-dark-mode'));assert.ok(doc.body.classList.contains('awsui-polaris-dark-mode'));
  adapter.apply({...profile,theme:'light',color:'#a855f7'});assert.equal(doc.body.classList.contains('awsui-dark-mode'),false);assert.equal(doc.querySelectorAll('#aws-sso-profile-badge').length,0);
  assert.ok(doc.querySelector('#aws-sso-profile-favicon').href.includes('%23a855f7'));
  adapter.clear();assert.equal(doc.body.className,'awsui-visual-refresh');assert.equal(doc.querySelector('#aws-sso-profile-badge'),null);dom.window.close();
});
test('unsupported pages report support without a floating overlay or forced native classes',()=>{
  const dom=new JSDOM('<body><main>Legacy page</main></body>'),adapter=createAppearance(dom.window.document);assert.equal(adapter.apply(profile).supported,false);assert.equal(dom.window.document.body.className,'');assert.equal(dom.window.document.querySelector('#aws-sso-profile-badge'),null);adapter.clear();dom.window.close();
});
test('system mode follows the supplied media state and unmatching clears appearance',()=>{
  const dom=new JSDOM('<body class="awsui-visual-refresh awsui-polaris-dark-mode"></body>'),media={matches:false},adapter=createAppearance(dom.window.document,media);adapter.apply({...profile,theme:'system'});assert.equal(dom.window.document.body.classList.contains('awsui-polaris-dark-mode'),false);media.matches=true;adapter.apply({...profile,theme:'system'});assert.equal(dom.window.document.body.classList.contains('awsui-polaris-dark-mode'),true);adapter.apply(null);assert.equal(dom.window.document.querySelector('#aws-sso-profile-badge'),null);assert.equal(dom.window.document.body.className,'awsui-visual-refresh awsui-polaris-dark-mode');dom.window.close();
});
test('profile labels never create floating content or executable markup',()=>{
  const dom=new JSDOM('<body class="awsui-visual-refresh"><div id="aws-sso-profile-badge">Old overlay</div></body>'),adapter=createAppearance(dom.window.document);
  adapter.apply({...profile,label:'<img src=x onerror=alert(1)>'});assert.equal(dom.window.document.querySelector('#aws-sso-profile-badge'),null);assert.equal(dom.window.document.querySelector('img'),null);adapter.clear();dom.window.close();
});
test('console header and nested account strip use the profile accent and contrasting text, then restore native state',()=>{
  const dom=new JSDOM('<body class="awsui-visual-refresh"><header id="awsc-nav-header" style="box-shadow:0 1px 2px gray"><button id="nav-usernameMenu" style="background:blue;color:red;--aws-sso-profile-accent:purple !important"><span style="background:#7d8998">Development</span></button></header></body>');
  const doc=dom.window.document,menu=doc.querySelector('button'),header=doc.querySelector('header'),adapter=createAppearance(doc),originalPriority=menu.style.getPropertyPriority('--aws-sso-profile-accent');
  assert.equal(adapter.apply({...profile,color:'#ff9900'}).accentSupported,true);assert.equal(adapter.isCurrent(),true);
  assert.equal(menu.style.getPropertyValue('--aws-sso-profile-accent'),'#ff9900');assert.equal(menu.style.getPropertyValue('--aws-sso-profile-foreground'),'#000000');assert.equal(header.hasAttribute('data-aws-sso-header-accent'),true);
  assert.match(doc.querySelector('#aws-sso-console-accent').textContent,/background-color: transparent !important/);
  adapter.apply({...profile,color:'#123456'});assert.equal(menu.style.getPropertyValue('--aws-sso-profile-foreground'),'#ffffff');assert.equal(doc.querySelectorAll('#aws-sso-console-accent').length,1);
  adapter.apply(null);assert.equal(menu.hasAttribute('data-aws-sso-account-accent'),false);assert.equal(header.hasAttribute('data-aws-sso-header-accent'),false);assert.equal(doc.querySelector('#aws-sso-console-accent'),null);
  assert.equal(menu.style.background,'blue');assert.equal(menu.style.color,'red');assert.equal(menu.style.getPropertyValue('--aws-sso-profile-accent'),'purple');assert.equal(menu.style.getPropertyPriority('--aws-sso-profile-accent'),originalPriority);assert.equal(menu.style.getPropertyValue('--aws-sso-profile-foreground'),'');dom.window.close();
});
test('header replacement and native style resets invalidate the applied appearance even when identity text is unchanged',()=>{
  const dom=new JSDOM('<body><header id="awsc-nav-header"><button id="nav-usernameMenu">Development</button></header></body>'),doc=dom.window.document,adapter=createAppearance(doc);
  adapter.apply(profile);const old=doc.querySelector('button');const replacement=doc.createElement('button');replacement.id='nav-usernameMenu';replacement.textContent='Development';old.replaceWith(replacement);
  assert.equal(adapter.isCurrent(),false);adapter.apply(profile);assert.equal(adapter.isCurrent(),true);assert.equal(old.hasAttribute('data-aws-sso-account-accent'),false);assert.equal(replacement.style.getPropertyValue('--aws-sso-profile-accent'),profile.color);
  replacement.removeAttribute('style');assert.equal(adapter.isCurrent(),false);adapter.apply(profile);assert.equal(adapter.isCurrent(),true);adapter.clear();dom.window.close();
});
test('known account-menu test IDs work without an ID and unsafe color text cannot enter page CSS',()=>{
  const dom=new JSDOM('<body><header role="banner"><button data-testid="more-menu__awsc-nav-account-menu-button">Development</button></header></body>'),doc=dom.window.document,adapter=createAppearance(doc);
  assert.equal(adapter.apply({...profile,color:'red; background:url(https://attacker.test)'}).accentSupported,true);assert.equal(doc.querySelector('button').style.getPropertyValue('--aws-sso-profile-accent'),'#ff9900');assert.doesNotMatch(doc.querySelector('#aws-sso-console-accent').textContent,/attacker/);
  adapter.clear();assert.equal(doc.querySelector('button').style.getPropertyValue('--aws-sso-profile-accent'),'');dom.window.close();
});
test('profile accent foreground uses black for bright colors and white for dark colors',()=>{
  for(const color of ['#ffffff','#ff9900','#ffff00','#00ff00'])assert.equal(accentForeground(color),'#000000');
  for(const color of ['#000000','#123456','#0000ff'])assert.equal(accentForeground(color),'#ffffff');
});
test('native top strip matches the account accent, removes inner corner shadows, and restores native styles',()=>{
  const dom=new JSDOM('<body><header id="awsc-nav-header"><div role="img" aria-label="Account color: Unset" style="height:4px;background:#7d8998"></div><button id="nav-usernameMenu"><span class="native-corners">Account</span></button></header><div id="aws-sso-profile-badge">Legacy badge</div></body>');
  const doc=dom.window.document,strip=doc.querySelector('[role=img]'),before=strip.getAttribute('style'),adapter=createAppearance(doc);
  adapter.apply({...profile,color:'#24a148'});assert.equal(strip.hasAttribute('data-aws-sso-top-accent'),true);assert.equal(strip.style.getPropertyValue('--aws-sso-profile-accent'),'#24a148');assert.equal(adapter.isCurrent(),true);
  const css=doc.querySelector('#aws-sso-console-accent').textContent;
  assert.match(css,/\[data-aws-sso-top-accent\].*background-color: var\(--aws-sso-profile-accent\)/);assert.match(css,/\*::before,[\s\S]*\*::after \{ box-shadow: none !important/);assert.match(css,/border-radius: 0 0 4px 4px/);
  assert.equal(doc.querySelector('#aws-sso-profile-badge'),null);adapter.apply(null);assert.equal(strip.hasAttribute('data-aws-sso-top-accent'),false);assert.equal(strip.style.getPropertyValue('--aws-sso-profile-accent'),'');assert.equal(strip.style.background,'rgb(125, 137, 152)');
  assert.equal(strip.style.height,'4px');assert.ok(before.includes('#7d8998'));dom.window.close();
});
test('top strip replacement and style resets reapply without requiring a floating badge',()=>{
  const dom=new JSDOM('<body><header id="awsc-nav-header"><div role="img" aria-label="Account color: Unset"></div><button id="nav-usernameMenu">Account</button></header></body>'),doc=dom.window.document,adapter=createAppearance(doc);
  adapter.apply(profile);const old=doc.querySelector('[role=img]');old.removeAttribute('style');assert.equal(adapter.isCurrent(),false);adapter.apply(profile);assert.equal(adapter.isCurrent(),true);
  const replacement=old.cloneNode(false);replacement.removeAttribute('data-aws-sso-top-accent');replacement.removeAttribute('style');old.replaceWith(replacement);
  assert.equal(adapter.isCurrent(),false);adapter.apply(profile);assert.equal(replacement.style.getPropertyValue('--aws-sso-profile-accent'),profile.color);assert.equal(old.hasAttribute('data-aws-sso-top-accent'),false);assert.equal(doc.querySelector('#aws-sso-profile-badge'),null);
  adapter.clear();dom.window.close();
});
