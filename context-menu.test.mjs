// Run: node --test context-menu.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load as an ES module even when the enclosing application has no package.json.
const source = await readFile(new URL('./context-menu.js', import.meta.url), 'utf8');
const { createContextMenu } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

class FakeEvent {
  constructor(type, options = {}) {
    Object.assign(this, { type, bubbles: true, cancelable: true, clientX: 0, clientY: 0, detail: 1 }, options);
    this.defaultPrevented = false;
    this.stopped = false;
    this.immediate = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.immediate = true; this.stopped = true; }
  composedPath() { return this.path || []; }
}

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, capture = false) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ fn, capture: capture === true || !!capture?.capture });
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, fn, capture = false) {
    const flag = capture === true || !!capture?.capture;
    this.listeners.set(type, (this.listeners.get(type) || []).filter(l => l.fn !== fn || l.capture !== flag));
  }
  dispatchEvent(event) {
    event.target = this;
    const path = [];
    for (let node = this; node; node = node.parentNode) path.push(node);
    event.path = path;
    const shadow = path.findIndex(node => node.nodeType === 11);
    const invoke = (node, capture) => {
      event.target = shadow >= 0 && path.indexOf(node) > shadow ? path[shadow + 1] : this;
      for (const l of [...(node.listeners.get(event.type) || [])]) {
        if (l.capture !== capture) continue;
        l.fn(event);
        if (event.immediate) break;
      }
    };
    try {
      for (const node of [...path].reverse()) { invoke(node, true); if (event.stopped) return !event.defaultPrevented; }
      for (const node of path) {
        invoke(node, false);
        if (event.stopped || !event.bubbles) break;
      }
      return !event.defaultPrevented;
    } finally {
      event.path = [];
    }
  }
}

class Element extends EventTarget {
  constructor(doc, tag) {
    super();
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.offsetWidth = 120;
    this.offsetHeight = 80;
    this.textContent = '';
  }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  matches(selector) {
    if (selector === '[role="menu"]') return this.getAttribute('role') === 'menu';
    if (selector === '[role="menuitem"]') return this.getAttribute('role') === 'menuitem';
    if (selector === '[role="alert"]') return this.getAttribute('role') === 'alert';
    if (selector === 'textarea, input') return ['TEXTAREA', 'INPUT'].includes(this.tagName);
    if (selector === '[contenteditable]:not([contenteditable="false"])') return this.attributes.has('contenteditable') && this.getAttribute('contenteditable') !== 'false';
    if (selector === 'a[href]') return this.tagName === 'A' && this.attributes.has('href');
    if (selector === 'dialog[open]') return this.tagName === 'DIALOG' && this.attributes.has('open');
    throw new Error(`Unsupported selector: ${selector}`);
  }
  closest(selector) { for (let node = this; node instanceof Element; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return this.rect || { left: 10, top: 20, width: 100, height: 40 }; }
}

function page(fallback) {
  const doc = new EventTarget();
  const timers = new Map();
  let nextTimer = 0;
  const win = new EventTarget();
  Object.assign(win, {
    innerWidth: 800, innerHeight: 600,
    navigator: { clipboard: { writeText: async value => { win.copied = value; } } },
    location: { href: 'https://example.test/page', reload() {} },
    getSelection: () => ({ toString: () => '', rangeCount: 0 }),
    Event: FakeEvent, PointerEvent: FakeEvent, CustomEvent: FakeEvent,
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
  });
  doc.defaultView = win;
  doc.createElement = tag => new Element(doc, tag);
  doc.documentElement = doc.createElement('html');
  doc.documentElement.parentNode = doc;
  doc.body = doc.createElement('body');
  doc.documentElement.append(doc.body);
  doc.activeElement = doc.body;
  const controller = createContextMenu({ document: doc, fallback });
  return {
    doc, win, controller,
    el(tag, parent = doc.body) { const node = doc.createElement(tag); parent.append(node); return node; },
    menu: () => doc.body.querySelector('[role="menu"]'),
    fire(target, type, options = {}) { const event = new FakeEvent(type, options); target.dispatchEvent(event); return event; },
    advanceTimers() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); },
  };
}
const action = (id, label, run = () => {}) => ({ id, label, run });
const items = menu => menu.querySelectorAll('[role="menuitem"]');

test('closest provider wins, declines fall through, and opening does not run actions', () => {
  let runs = 0;
  const p = page(() => ({ label: 'Fallback', items: [action('fallback', 'Fallback', () => runs++)] }));
  const outer = p.el('div');
  const inner = p.el('div', outer);
  const target = p.el('span', inner);
  let seen;
  p.controller.register(outer, () => ({ label: 'Outer', items: [action('outer', 'Outer', () => runs++)] }));
  const unregister = p.controller.register(inner, context => { seen = context; return { label: 'Inner', items: [action('inner', 'Inner', () => runs++)] }; });
  const event = p.fire(target, 'contextmenu', { clientX: 55, clientY: 75 });
  assert.equal(event.defaultPrevented, true);
  assert.equal(seen.target, target);
  assert.equal(seen.keyboard, false);
  assert.deepEqual([seen.x, seen.y], [55, 75]);
  assert.equal(p.menu().getAttribute('aria-label'), 'Inner');
  assert.deepEqual(items(p.menu()).map(el => el.textContent), ['Inner', 'Fallback', 'Copy page link', 'Reload page']);
  assert.equal(runs, 0);
  unregister();
  p.controller.register(inner, () => null);
  p.fire(target, 'contextmenu', { clientX: 55, clientY: 75 });
  assert.equal(p.menu().getAttribute('aria-label'), 'Outer');
  assert.equal(runs, 0);
  p.controller.destroy();
});

test('copy acts on the text selected when the menu opened', async () => {
  const p = page();
  const input = p.el('input');
  input.type = 'text';
  input.value = 'alpha beta';
  input.selectionStart = 6;
  input.selectionEnd = 10;
  p.fire(input, 'contextmenu', { clientX: 12, clientY: 14 });
  const copy = items(p.menu()).find(button => button.textContent === 'Copy');
  assert.ok(copy);
  assert.equal(p.win.copied, undefined);
  input.selectionStart = 0;
  input.selectionEnd = 5;
  p.fire(copy, 'click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.win.copied, 'beta');
  assert.equal(p.menu(), null);
  p.controller.destroy();
});

test('right click suppresses native and later contextmenu handlers', () => {
  const p = page();
  const target = p.el('button');
  let reached = 0;
  p.doc.addEventListener('contextmenu', () => reached++, true);
  const event = p.fire(target, 'contextmenu', { clientX: 40, clientY: 30, button: 2 });
  assert.equal(event.defaultPrevented, true);
  assert.equal(reached, 0);
  assert.ok(p.menu());
  p.controller.destroy();
});

test('keyboard opening, navigation, Escape and focus restoration', () => {
  const p = page();
  const target = p.el('button');
  target.focus();
  let seen;
  p.controller.register(target, context => { seen = context; return { label: 'Actions', items: [action('one', 'One'), action('two', 'Two')] }; });
  const event = p.fire(target, 'keydown', { key: 'F10', shiftKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.equal(seen.keyboard, true);
  assert.deepEqual([seen.x, seen.y], [34, 40]);
  const buttons = items(p.menu());
  assert.equal(p.doc.activeElement, buttons[0]);
  p.fire(buttons[0], 'keydown', { key: 'ArrowDown' });
  assert.equal(p.doc.activeElement, buttons[1]);
  p.fire(buttons[1], 'keydown', { key: 'End' });
  assert.equal(p.doc.activeElement, buttons.at(-1));
  p.fire(buttons.at(-1), 'keydown', { key: 'Home' });
  assert.equal(p.doc.activeElement, buttons[0]);
  p.fire(buttons[0], 'keydown', { key: 'Escape' });
  assert.equal(p.menu(), null);
  assert.equal(p.doc.activeElement, target);
  p.fire(target, 'keydown', { key: 'ContextMenu' });
  assert.ok(p.menu());
  p.controller.destroy();
});

test('selecting an enabled action runs once and closes; disabled actions do neither', async () => {
  const p = page();
  const target = p.el('button');
  let runs = 0;
  p.controller.register(target, () => ({ label: 'Actions', items: [
    { ...action('disabled', 'Unavailable', () => runs++), disabled: true, reason: 'Not now' },
    action('go', 'Go', () => runs++),
  ] }));
  target.focus();
  p.fire(target, 'contextmenu', { clientX: 4, clientY: 5 });
  const [disabled, enabled] = items(p.menu());
  assert.equal(disabled.getAttribute('aria-disabled'), 'true');
  p.fire(disabled, 'click');
  await Promise.resolve();
  assert.equal(runs, 0);
  assert.ok(p.menu());
  enabled.focus();
  p.fire(enabled, 'click');
  await Promise.resolve();
  assert.equal(runs, 1);
  assert.equal(p.menu(), null);
  assert.equal(p.doc.activeElement, target);
  p.controller.destroy();
});

test('long press opens once, cancels the gesture, and suppresses the following native events', () => {
  const p = page();
  const target = p.el('button');
  let opened = 0, cancelled = 0, clicks = 0;
  p.controller.register(target, () => { opened++; return { label: 'Touch', items: [action('a', 'Action')] }; });
  target.addEventListener('pointercancel', () => cancelled++);
  target.addEventListener('click', () => clicks++);
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 25, clientY: 30 });
  p.advanceTimers();
  assert.ok(p.menu());
  assert.equal(opened, 1);
  assert.equal(cancelled, 1);
  assert.equal(p.fire(target, 'pointerup', { pointerId: 7 }).defaultPrevented, true);
  assert.equal(p.fire(target, 'click').defaultPrevented, true);
  assert.equal(p.fire(target, 'contextmenu', { clientX: 25, clientY: 30 }).defaultPrevented, true);
  assert.equal(clicks, 0);
  assert.equal(opened, 1);
  p.controller.destroy();
});
test('marked touch leaves native selection and contextmenu events untouched before and after pointerup', () => {
  for (const timing of ['before', 'after', 'cancel']) {
    const p = page();
    const region = p.el('div');
    region.setAttribute('data-native-touch-selection', '');
    const target = p.el('span', region);
    let reached = 0, cancelled = 0;
    p.doc.addEventListener('contextmenu', () => reached++, true);
    target.addEventListener('pointercancel', () => cancelled++);
    const down = p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 25, clientY: 30 });
    p.advanceTimers();
    assert.equal(down.defaultPrevented, false);
    assert.equal(p.menu(), null);
    assert.equal(cancelled, 0);
    if (timing !== 'before') p.fire(target, timing === 'cancel' ? 'pointercancel' : 'pointerup', { pointerType: 'touch', pointerId: 7 });
    const event = p.fire(target, 'contextmenu', { clientX: 25, clientY: 30 });
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
    assert.equal(reached, 1);
    assert.equal(p.menu(), null);
    if (timing === 'before') assert.equal(p.fire(target, 'pointerup', { pointerType: 'touch', pointerId: 7 }).defaultPrevented, false);
    p.controller.destroy();
  }
});

test('marked content in a shadow tree is native for touch but custom for mouse and keyboard', () => {
  const p = page();
  const host = p.el('div');
  const shadow = p.doc.createElement('shadow-root');
  shadow.nodeType = 11;
  shadow.parentNode = host;
  const region = p.el('div', shadow);
  region.setAttribute('data-native-touch-selection', '');
  const target = p.el('span', region);
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7 });
  p.fire(target, 'pointerup', { pointerType: 'touch', pointerId: 7 });
  assert.equal(p.fire(target, 'contextmenu', { pointerType: 'touch', clientX: 25, clientY: 30 }).defaultPrevented, false);
  p.fire(target, 'pointerdown', { pointerType: 'mouse', isPrimary: true, pointerId: 8, button: 2 });
  const rightClick = p.fire(target, 'contextmenu', { pointerType: 'mouse', button: 2, clientX: 25, clientY: 30 });
  assert.equal(rightClick.defaultPrevented, true);
  assert.ok(p.menu());
  p.fire(items(p.menu())[0], 'keydown', { key: 'Escape' });
  const keyboard = p.fire(target, 'keydown', { key: 'ContextMenu' });
  assert.equal(keyboard.defaultPrevented, true);
  assert.ok(p.menu());
  p.controller.destroy();
});

test('touch in editable controls and contenteditable descendants remains native', () => {
  for (const kind of ['input', 'textarea', 'contenteditable']) {
    const p = page();
    const editor = p.el(kind === 'contenteditable' ? 'div' : kind);
    if (kind === 'input') editor.type = 'text';
    if (kind === 'contenteditable') editor.setAttribute('contenteditable', 'true');
    const target = kind === 'contenteditable' ? p.el('span', editor) : editor;
    p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 3 });
    p.advanceTimers();
    assert.equal(p.menu(), null);
    p.fire(target, 'pointerup', { pointerType: 'touch', pointerId: 3 });
    assert.equal(p.fire(target, 'contextmenu', { pointerType: 'touch' }).defaultPrevented, false);
    p.controller.destroy();
  }
});

test('mobile context menus in the prompt keep focus and selection without a preceding pointer event', () => {
  for (const options of [
    { pointerType: 'touch' },
    { sourceCapabilities: { firesTouchEvents: true } },
  ]) {
    const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
    const input = p.el('textarea');
    input.value = 'Edit this prompt';
    input.selectionStart = 5;
    input.selectionEnd = 9;
    input.focus();
    const event = p.fire(input, 'contextmenu', options);
    assert.equal(event.defaultPrevented, false);
    assert.equal(p.menu(), null);
    assert.equal(p.doc.activeElement, input);
    assert.deepEqual([input.selectionStart, input.selectionEnd], [5, 9]);
    p.controller.destroy();
  }
});

test('a touch-oriented browser can open its native prompt menu without pointer metadata', () => {
  const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
  p.win.matchMedia = query => ({ matches: query === '(pointer: coarse)' });
  const input = p.el('textarea');
  input.focus();
  const event = p.fire(input, 'contextmenu');
  assert.equal(event.defaultPrevented, false);
  assert.equal(p.doc.activeElement, input);
  assert.equal(p.menu(), null);
  p.controller.destroy();
});

test('native ownership lasts until the next pointer rather than a fixed timeout', () => {
  const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
  const input = p.el('textarea');
  input.focus();
  const now = Date.now;
  try {
    let time = now();
    Date.now = () => time;
    p.fire(input, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1 });
    p.fire(input, 'pointerup', { pointerType: 'touch', pointerId: 1 });
    time += 5000;
    const event = p.fire(input, 'contextmenu');
    assert.equal(event.defaultPrevented, false);
    assert.equal(p.doc.activeElement, input);
    assert.equal(p.menu(), null);
  } finally {
    Date.now = now;
    p.controller.destroy();
  }
});

test('touch-generated mouse contextmenu on an editor stays native, but a mouse right click is custom', () => {
  const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
  const input = p.el('textarea');
  input.focus();
  p.fire(input, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1 });
  p.fire(input, 'pointerup', { pointerType: 'touch', pointerId: 1 });
  const mobile = p.fire(input, 'contextmenu', {
    pointerType: 'mouse', sourceCapabilities: { firesTouchEvents: true },
  });
  assert.equal(mobile.defaultPrevented, false);
  assert.equal(p.doc.activeElement, input);
  assert.equal(p.menu(), null);
  p.fire(input, 'pointerdown', { pointerType: 'mouse', isPrimary: true, pointerId: 2 });
  const desktop = p.fire(input, 'contextmenu', {
    pointerType: 'mouse', sourceCapabilities: { firesTouchEvents: false },
  });
  assert.equal(desktop.defaultPrevented, true);
  assert.ok(p.menu());
  p.controller.destroy();
});

test('selection handles leave touch native without disabling menus elsewhere', () => {
  const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
  const target = p.el('div');
  const range = {
    cloneRange: () => ({
      collapse(start) { this.start = start; },
      getBoundingClientRect() {
        const x = this.start ? 100 : 200;
        return { left: x, right: x, top: 100, bottom: 120 };
      },
    }),
  };
  p.win.getSelection = () => ({ isCollapsed: false, rangeCount: 1, getRangeAt: () => range });
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 205, clientY: 130 });
  p.advanceTimers();
  assert.equal(p.menu(), null);
  p.fire(target, 'pointerup', { pointerType: 'touch', pointerId: 1 });
  assert.equal(p.fire(target, 'contextmenu', { pointerType: 'touch', clientX: 205, clientY: 130 }).defaultPrevented, false);
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 2, clientX: 500, clientY: 500 });
  p.advanceTimers();
  assert.ok(p.menu());
  p.controller.destroy();
});

test('text selection beginning during a touch cancels the app menu', () => {
  const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
  const target = p.el('div');
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  p.win.getSelection = () => ({
    isCollapsed: false, rangeCount: 1,
    getRangeAt: () => ({ cloneRange: () => ({
      collapse() {}, getBoundingClientRect: () => ({ left: 100, right: 100, top: 100, bottom: 120 }),
    }) }),
  });
  p.advanceTimers();
  assert.equal(p.menu(), null);
  assert.equal(p.fire(target, 'contextmenu', { pointerType: 'touch' }).defaultPrevented, false);
  p.controller.destroy();
});

test('a selection handle next to a focused text control leaves touch native', () => {
  const p = page(() => ({ label: 'Page', items: [action('page', 'Page')] }));
  const editor = p.el('textarea');
  editor.rect = { left: 50, right: 200, top: 50, bottom: 120 };
  editor.selectionStart = 2;
  editor.selectionEnd = 8;
  editor.focus();
  p.fire(p.doc.body, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 210, clientY: 125 });
  p.advanceTimers();
  assert.equal(p.menu(), null);
  assert.equal(p.fire(p.doc.body, 'contextmenu', { pointerType: 'touch' }).defaultPrevented, false);
  p.controller.destroy();
});

test('unmarked siblings still use the custom menu and mouse clears stale touch suppression', () => {
  const p = page();
  const container = p.el('div');
  const text = p.el('span', container);
  text.setAttribute('data-native-touch-selection', '');
  const blank = p.el('div', container);
  p.fire(text, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1 });
  p.fire(text, 'pointerup', { pointerType: 'touch', pointerId: 1 });
  p.fire(text, 'pointerdown', { pointerType: 'mouse', button: 2 });
  assert.equal(p.fire(text, 'contextmenu', { button: 2, clientX: 10, clientY: 10 }).defaultPrevented, true);
  assert.ok(p.menu());
  p.fire(items(p.menu())[0], 'keydown', { key: 'Escape' });
  p.fire(blank, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 2 });
  p.advanceTimers();
  assert.ok(p.menu());
  assert.equal(p.fire(blank, 'contextmenu', { pointerType: 'mouse', button: 2, clientX: 10, clientY: 10 }).defaultPrevented, true);
  p.controller.destroy();
});

test('selection movement and a second touch remain native on text', () => {
  const p = page();
  const target = p.el('span');
  target.setAttribute('data-native-touch-selection', '');
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 });
  p.fire(target, 'pointermove', { pointerType: 'touch', pointerId: 1, clientX: 30, clientY: 10 });
  assert.equal(p.fire(target, 'contextmenu', { pointerType: 'touch', clientX: 30, clientY: 10 }).defaultPrevented, false);
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: false, pointerId: 2 });
  p.fire(target, 'pointerup', { pointerType: 'touch', pointerId: 1 });
  assert.equal(p.fire(target, 'contextmenu', { pointerType: 'touch', clientX: 10, clientY: 10 }).defaultPrevented, false);
  assert.equal(p.menu(), null);
  p.controller.destroy();
});

test('moving a touch beyond the threshold cancels the pending long press', () => {
  const p = page();
  const target = p.el('div');
  let opened = 0;
  p.controller.register(target, () => { opened++; return { label: 'Touch', items: [action('a', 'Action')] }; });
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 4, clientX: 10, clientY: 10 });
  p.fire(target, 'pointermove', { pointerId: 4, clientX: 21, clientY: 10 });
  p.advanceTimers();
  assert.equal(p.menu(), null);
  assert.equal(opened, 0);
  assert.equal(p.fire(target, 'click').defaultPrevented, false);
  p.controller.destroy();
});

test('destroy closes the menu, cancels pending touch, and removes listeners', () => {
  const p = page();
  const target = p.el('div');
  let opened = 0;
  p.controller.register(target, () => { opened++; return { label: 'Test', items: [action('a', 'Action')] }; });
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  assert.ok(p.menu());
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1 });
  p.controller.destroy();
  p.advanceTimers();
  assert.equal(p.menu(), null);
  assert.equal(opened, 1);
  assert.equal(p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 }).defaultPrevented, false);
  assert.equal(p.menu(), null);
});

test('menu keys do not reach sheet shortcuts and activation keys reach the button', () => {
  const p = page();
  const target = p.el('button');
  target.focus();
  p.controller.register(target, () => ({ items: [action('a', 'Action')] }));
  let shortcuts = 0, activationKeys = 0;
  p.doc.addEventListener('keydown', () => shortcuts++);
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  const button = items(p.menu())[0];
  button.addEventListener('keydown', () => activationKeys++);
  const shortcut = p.fire(button, 'keydown', { key: 'Delete' });
  assert.equal(shortcuts, 0);
  assert.equal(shortcut.defaultPrevented, false);
  for (const key of ['Enter', ' ']) {
    const event = p.fire(button, 'keydown', { key });
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(activationKeys, 2);
  assert.equal(shortcuts, 0);
  p.controller.destroy();
});

test('Tab closes the menu, restores focus and leaves navigation to the browser', () => {
  const p = page();
  const target = p.el('button');
  target.focus();
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  const event = p.fire(items(p.menu())[0], 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(event.defaultPrevented, false);
  assert.equal(p.menu(), null);
  assert.equal(p.doc.activeElement, target);
  p.controller.destroy();
});

test('a second touch cancels a pending long press', () => {
  const p = page();
  const target = p.el('div');
  let opened = 0;
  p.controller.register(target, () => { opened++; return { items: [action('a', 'Action')] }; });
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 1 });
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: false, pointerId: 2 });
  p.advanceTimers();
  assert.equal(opened, 0);
  assert.equal(p.menu(), null);
  p.controller.destroy();
});

test('programmatic chat scrolling keeps actions usable; user scroll dismisses only affected menus', async () => {
  const p = page();
  const chat = p.el('div');
  const target = p.el('button', chat);
  const other = p.el('div');
  let runs = 0;
  p.controller.register(target, () => ({ items: [action('reply', 'Reply', () => runs++)] }));
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  const menu = p.menu();
  target.rect = { left: 10, top: -80, width: 100, height: 40 };
  p.fire(chat, 'scroll');
  assert.equal(p.menu(), menu);
  p.fire(other, 'wheel');
  p.fire(other, 'scroll');
  assert.equal(p.menu(), menu);
  p.fire(items(menu)[0], 'click');
  await Promise.resolve();
  assert.equal(runs, 1);
  assert.equal(p.menu(), null);
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  p.fire(target, 'wheel');
  p.fire(chat, 'scroll');
  assert.equal(p.menu(), null);
  p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 2 });
  p.fire(chat, 'scroll');
  p.advanceTimers();
  assert.equal(p.menu(), null);
  p.controller.destroy();
});

test('long press retains the original shadow target and provider path after dispatch', () => {
  const p = page();
  const host = p.el('div');
  const shadow = p.doc.createElement('shadow-root');
  shadow.nodeType = 11;
  shadow.parentNode = host;
  const target = p.el('button', shadow);
  let seen;
  p.controller.register(shadow, context => { seen = context; return { items: [action('shadow', 'Shadow action')] }; });
  const event = p.fire(target, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 25, clientY: 30 });
  assert.deepEqual(event.composedPath(), []);
  p.advanceTimers();
  assert.equal(seen.target, target);
  assert.ok(seen.path.includes(shadow));
  assert.equal(items(p.menu())[0].textContent, 'Shadow action');
  p.controller.destroy();
});

test('closing notifies the original target after focus restoration or external dismissal', () => {
  const p = page();
  const target = p.el('input');
  const notices = [];
  target.addEventListener('context-menu-close', event => notices.push({ restored: event.detail.restoredFocus, active: p.doc.activeElement }));
  target.focus();
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  p.fire(items(p.menu())[0], 'keydown', { key: 'Escape' });
  assert.deepEqual(notices[0], { restored: true, active: target });
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  p.fire(p.win, 'blur');
  assert.equal(notices[1].restored, false);
  p.controller.destroy();
});

test('pointer dismissal restores the original field before notifying, but not on an outside click', () => {
  const p = page();
  const target = p.el('input');
  const outside = p.el('button');
  const notices = [];
  target.addEventListener('context-menu-close', event => notices.push({ restored: event.detail.restoredFocus, active: p.doc.activeElement }));
  target.focus();
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  p.fire(target, 'pointerdown', { pointerType: 'mouse' });
  assert.equal(p.menu(), null);
  assert.deepEqual(notices[0], { restored: true, active: target });
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  p.fire(outside, 'pointerdown', { pointerType: 'mouse' });
  assert.equal(p.menu(), null);
  assert.equal(notices[1].restored, false);
  p.controller.destroy();
});

test('dismissal reports focus returned by an action and notifies a detached target', async () => {
  const p = page();
  const target = p.el('input');
  const notices = [];
  target.addEventListener('context-menu-close', event => notices.push(event.detail.restoredFocus));
  p.controller.register(target, () => ({ items: [action('edit', 'Edit', () => target.focus())] }));
  target.focus();
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  p.fire(items(p.menu())[0], 'click');
  await Promise.resolve();
  assert.deepEqual(notices, [true]);
  p.fire(target, 'contextmenu', { clientX: 10, clientY: 10 });
  target.remove();
  p.fire(p.win, 'blur');
  assert.deepEqual(notices, [true, false]);
  p.controller.destroy();
});

test('context menu events inside an open menu do not replace it', () => {
  const p = page();
  const target = p.el('button');
  target.focus();
  let opened = 0;
  p.controller.register(target, () => { opened++; return { items: [action('a', 'Action')] }; });
  p.fire(target, 'keydown', { key: 'ContextMenu' });
  const menu = p.menu();
  const button = items(menu)[0];
  p.fire(target, 'contextmenu', { detail: 0, clientX: 0, clientY: 0 });
  assert.equal(p.menu(), menu);
  assert.equal(p.fire(button, 'contextmenu', { clientX: 30, clientY: 40, button: 2 }).defaultPrevented, true);
  p.fire(button, 'keydown', { key: 'ContextMenu' });
  p.fire(button, 'contextmenu', { detail: 0, clientX: 0, clientY: 0 });
  assert.equal(p.menu(), menu);
  assert.equal(p.doc.activeElement, button);
  assert.equal(opened, 1);
  p.controller.destroy();
});

test('long pressing a menu item leaves the menu and its action intact', async () => {
  const p = page();
  const target = p.el('button');
  let opened = 0, cancelled = 0, actions = 0;
  p.controller.register(p.doc.body, () => {
    opened++;
    return { items: [action('a', 'Action', () => actions++)] };
  });
  p.fire(target, 'contextmenu', { clientX: 20, clientY: 30 });
  const menu = p.menu();
  const button = items(menu)[0];
  const child = p.el('span', button);
  child.addEventListener('pointercancel', () => cancelled++);
  p.fire(child, 'pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 25, clientY: 35 });
  p.advanceTimers();
  assert.equal(p.menu(), menu);
  assert.equal(opened, 1);
  assert.equal(cancelled, 0);
  assert.equal(p.fire(child, 'pointerup', { pointerId: 7 }).defaultPrevented, false);
  assert.equal(p.fire(child, 'click').defaultPrevented, false);
  await Promise.resolve();
  assert.equal(actions, 1);
  assert.equal(p.menu(), null);
  p.controller.destroy();
});
