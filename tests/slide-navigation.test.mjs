import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pageDelta, navigationBridge } from '../src/slide-navigation.ts';

test('arrow navigation preserves modified keys and suppresses repeat and composition', () => {
  assert.equal(pageDelta({ key: 'ArrowLeft' }), -1);
  assert.equal(pageDelta({ key: 'ArrowRight' }), 1);
  assert.equal(pageDelta({ key: 'ArrowUp' }), 0);
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'repeat']) {
    assert.equal(pageDelta({ key: 'ArrowRight', [modifier]: true }), 0);
  }
});

test('iframe bridge forwards arrows but leaves editors and text fields untouched', () => {
  let listener;
  const messages = [];
  class Element {
    constructor(editable = false) { this.editable = editable; }
    closest() { return this.editable; }
  }
  vm.runInNewContext(navigationBridge('test-token'), {
    window: { addEventListener(name, callback, capture) {
      assert.equal(name, 'keydown');
      assert.equal(capture, true);
      listener = callback;
    } },
    parent: { postMessage: value => messages.push(value) },
    Element,
  });
  let prevented = 0;
  const event = editable => ({
    key: 'ArrowRight', composedPath: () => [new Element(editable)],
    preventDefault: () => prevented++, stopImmediatePropagation() {},
  });
  listener(event(true));
  assert.equal(messages.length, 0);
  listener(event(false));
  assert.equal(prevented, 1);
  assert.equal(messages[0].delta, 1);
  assert.equal(messages[0].token, 'test-token');
});
