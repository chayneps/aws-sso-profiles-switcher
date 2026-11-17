import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readMultiSession} from '../src/core/multi-session.js';

const sessionURL = 'https://111122223333-abcdefgh.us-east-1.console.aws.amazon.com/console/home';
function read(html, href = 'https://console.aws.amazon.com/') {
  const dom = new JSDOM(html);
  // jsdom has no layout; give rendered controls a rectangle.
  for (const node of dom.window.document.querySelectorAll('button, a')) node.getClientRects = () => {
    for (let parent = node; parent; parent = parent.parentElement) if (dom.window.getComputedStyle(parent).display === 'none') return [];
    return [{width: 100, height: 30}];
  };
  const result = readMultiSession(dom.window.document, href);
  dom.window.close(); return result;
}
test('detects AWS session-specific hosts without assuming ordinary consoles are enabled', () => {
  assert.deepEqual(read('', sessionURL), {status: 'enabled', source: 'session-url'});
  for (const href of ['https://console.aws.amazon.com/', 'https://us-east-1.console.aws.amazon.com/', 'https://111122223333.console.aws.amazon.com/']) assert.equal(read('', href).status, 'unknown');
});
test('visible opt-in and opt-out controls provide explicit evidence, with opt-in taking precedence', () => {
  assert.deepEqual(read('<button>Enable multi-session</button>'), {status: 'disabled', source: 'console-control'});
  assert.equal(read('<a>Turn on multi-session</a>', sessionURL).status, 'disabled');
  assert.deepEqual(read('<button>Disable multi-session</button>'), {status: 'enabled', source: 'console-control'});
  assert.equal(read('<button aria-label="Disable multi-session"> ⚙ </button>').status, 'enabled');
  assert.equal(read('<button>Disable multi-session</button><button>Enable multi-session</button>').status, 'disabled');
});
test('ignores help text, hidden controls, generic session actions, and lookalike origins', () => {
  assert.equal(read('<p>Disable multi-session</p><button>Add session</button>').status, 'unknown');
  for (const attr of ['hidden', 'inert', 'aria-hidden="true"', 'style="visibility:hidden"', 'style="display:none"']) assert.equal(read(`<div ${attr}><button>Disable multi-session</button></div>`).status, 'unknown');
  for (const href of ['https://111122223333-abcdefgh.console.aws.amazon.com.attacker.test/', 'http://111122223333-abcdefgh.console.aws.amazon.com/', 'https://111122223333-abcdefgh.console.aws.amazon.com:444/']) assert.equal(read('<button>Disable multi-session</button>', href).status, 'unknown');
});
