import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { prepareFrame, readinessBridge } from '../src/slide-frame.ts';

test('readiness waits for initial image and font decoding', async () => {
  let releaseFont;
  let releaseImage;
  let onReady;
  const messages = [];
  vm.runInNewContext(readinessBridge('ready-token'), {
    document: {
      addEventListener: (_name, callback) => { onReady = callback; },
      fonts: { ready: new Promise(resolve => { releaseFont = resolve; }) },
      images: [{ decode: () => new Promise(resolve => { releaseImage = resolve; }) }],
    },
    requestAnimationFrame: callback => callback(),
    setTimeout, clearTimeout,
    parent: { postMessage: message => messages.push(message) },
  });
  const ready = onReady();
  releaseFont();
  await Promise.resolve();
  assert.equal(messages.length, 0);
  releaseImage();
  await ready;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'evoclass:ready');
  assert.equal(messages[0].token, 'ready-token');
});

test('frame preparation authenticates readiness and removes cancelled frames', async t => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  });
  const frames = [];
  globalThis.window = new EventTarget();
  globalThis.document = { createElement: () => ({
    contentWindow: {},
    setAttribute() {},
    remove() {
      const index = frames.indexOf(this);
      if (index >= 0) frames.splice(index, 1);
    },
  }) };
  const host = { append: frame => frames.push(frame) };
  const sendReady = (source, token) => window.dispatchEvent(Object.assign(new Event('message'), {
    source, data: { type: 'evoclass:ready', token },
  }));
  const controller = new AbortController();
  let resolved = false;
  const pending = prepareFrame(host, '<p>Next slide</p>', 'frame-token', controller.signal);
  pending.then(() => { resolved = true; });
  const frame = frames[0];
  sendReady({}, 'frame-token');
  sendReady(frame.contentWindow, 'wrong-token');
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(frame.className, 'pending-slide-frame');
  assert.equal(frame.inert, true);
  sendReady(frame.contentWindow, 'frame-token');
  assert.equal(await pending, frame);

  const cancelled = new AbortController();
  const obsolete = prepareFrame(host, '<p>Obsolete slide</p>', 'obsolete-token', cancelled.signal);
  assert.equal(frames.length, 2);
  cancelled.abort();
  await assert.rejects(obsolete, { name: 'AbortError' });
  assert.deepEqual(frames, [frame]);
  const alreadyAborted = prepareFrame(host, '', 'unused', cancelled.signal);
  await assert.rejects(alreadyAborted, { name: 'AbortError' });
  assert.deepEqual(frames, [frame]);
});
