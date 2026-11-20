/* Shared context menus. Providers are consulted from the target outwards; the
   first one that returns a menu wins. Generic actions follow app actions. */
export function createContextMenu({ document: doc, fallback } = {}) {
  if (!doc) throw new TypeError('createContextMenu requires a document');
  const win = doc.defaultView;
  const providers = new Map();
  const listeners = [];
  let menu = null;
  let returnFocus = null;
  let anchor = null;
  let touch = null;
  let nativeTouch = null;
  let suppress = null;
  let scrollIntent = null;
  let keyboardAt = 0;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function close(restore = false, focusLost = false) {
    if (!menu) return;
    const target = anchor.target;
    menu.remove();
    menu = null;
    anchor = null;
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    const restoredFocus = !!(!focusLost && returnFocus?.isConnected && doc.activeElement === returnFocus);
    returnFocus = null;
    target.dispatchEvent(new win.CustomEvent('context-menu-close', {
      bubbles: true, composed: true, detail: { restoredFocus },
    }));
  }
  function cancelTouch() {
    if (touch) win.clearTimeout(touch.timer);
    touch = null;
  }
  function textControl(target) {
    const el = target.closest?.('textarea, input');
    if (!el || el.disabled) return null;
    if (el.tagName === 'INPUT' && !['text', 'search', 'url', 'tel', 'email', 'password'].includes(el.type)) return null;
    return el;
  }
  // Mark only text regions, not their surrounding controls or empty space.
  // Inspect the composed path so markers and editors inside shadow roots work.
  function nativeTouchTarget(path) {
    let editable;
    for (const node of path) {
      if (node.nodeType !== 1) continue;
      if (node.hasAttribute('data-native-touch-selection')) return true;
      if (textControl(node) === node) return true;
      if (editable === undefined && node.hasAttribute('contenteditable')) {
        editable = node.getAttribute('contenteditable') !== 'false';
      }
    }
    return editable === true;
  }
  function nearSelection(x, y) {
    const near = rect => rect && x >= rect.left - 32 && x <= rect.right + 32 &&
      y >= rect.top - 32 && y <= rect.bottom + 32;
    const input = textControl(doc.activeElement);
    if (input && input.selectionStart != null && input.selectionEnd > input.selectionStart &&
        near(input.getBoundingClientRect())) return true;
    const selection = win.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    for (const start of [true, false]) {
      const endpoint = range.cloneRange();
      endpoint.collapse(start);
      if (near(endpoint.getBoundingClientRect())) return true;
    }
    return false;
  }
  function generic(context) {
    const { target } = context;
    const input = textControl(target);
    const editable = input || target.closest?.('[contenteditable]:not([contenteditable="false"])');
    const selection = win.getSelection();
    const inputStart = input?.selectionStart;
    const inputEnd = input?.selectionEnd;
    const selected = input
      ? (inputStart != null && inputEnd != null ? input.value.slice(inputStart, inputEnd) : '')
      : selection?.toString() || '';
    const selectedRange = !input && selection?.rangeCount ? selection.getRangeAt(0) : null;
    const range = selectedRange && editable?.contains(selectedRange.commonAncestorContainer) ? selectedRange.cloneRange() : null;
    const writable = editable && !input?.readOnly;
    const secret = input?.type === 'password';
    const items = [];
    const add = (id, label, run, disabled = false, reason = '') => items.push({ id, label, run, disabled, reason });
    const clipboard = win.navigator.clipboard;
    const copy = async value => {
      if (!clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser or context.');
      await clipboard.writeText(value);
    };
    function restoreSelection() {
      editable?.focus({ preventScroll: true });
      if (input && inputStart != null && inputEnd != null) input.setSelectionRange(inputStart, inputEnd);
      else if (range) { selection.removeAllRanges(); selection.addRange(range); }
    }
    function insert(value) {
      restoreSelection();
      if (input && inputStart != null && inputEnd != null) {
        input.setRangeText(value, inputStart, inputEnd, 'end');
        input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
      } else if (!doc.execCommand('insertText', false, value)) {
        throw new Error('Unable to edit this field.');
      }
    }
    if (selected && !secret) add('copy-selection', 'Copy', () => copy(selected));
    if (writable && selected && !secret) add('cut-selection', 'Cut', async () => { await copy(selected); insert(''); });
    if (writable) add('paste', 'Paste', async () => {
      if (!clipboard?.readText) throw new Error('Clipboard access is unavailable in this browser or context.');
      insert(await clipboard.readText());
    });
    if (editable) add('select-all', 'Select all', () => {
      editable.focus({ preventScroll: true });
      if (input) input.select();
      else { const all = doc.createRange(); all.selectNodeContents(editable); selection.removeAllRanges(); selection.addRange(all); }
    });
    const link = target.closest?.('a[href]');
    if (link) {
      const href = link.href;
      if (link.protocol === 'http:' || link.protocol === 'https:') add('open-link', 'Open link in new tab', () => win.open(href, '_blank', 'noopener,noreferrer'));
      add('copy-link', 'Copy link address', () => copy(href));
    }
    add('copy-page-link', 'Copy page link', () => copy(win.location.href));
    add('reload-page', 'Reload page', () => win.location.reload());
    return { label: 'Page', items };
  }
  function open(context) {
    close();
    scrollIntent = null;
    const path = context.path;
    const roots = [...providers.keys()].filter(root => path.includes(root) || root === context.target || root.contains?.(context.target));
    roots.sort((a, b) => a === b ? 0 : a.contains?.(b) ? 1 : b.contains?.(a) ? -1 : path.indexOf(a) - path.indexOf(b));
    let primary = null;
    for (const root of roots) {
      for (const provider of providers.get(root)) {
        primary = provider(context);
        if (primary) break;
      }
      if (primary) break;
    }
    const extra = fallback?.(context);
    const builtIn = generic(context);
    const groups = [primary, extra, builtIn].filter(Boolean);
    const seen = new Set();
    const sections = groups.map(group => (group.items || []).filter(item => {
      if (!item || !item.label || typeof item.run !== 'function' || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })).filter(items => items.length);
    if (!sections.length) return;
    anchor = context;
    returnFocus = doc.activeElement;
    menu = doc.createElement('div');
    menu.className = 'menu at context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', primary?.label || extra?.label || builtIn.label);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
    const currentMenu = menu;
    sections.forEach((items, index) => {
      if (index) menu.append(doc.createElement('hr'));
      for (const item of items) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.textContent = item.label;
        if (item.id) button.dataset.action = item.id;
        if (item.disabled) button.setAttribute('aria-disabled', 'true');
        if (item.reason) button.title = item.reason;
        button.addEventListener('click', async () => {
          if (item.disabled) return;
          try {
            await item.run();
            if (menu === currentMenu) close(currentMenu.contains(doc.activeElement));
          } catch (error) {
            if (menu !== currentMenu) return;
            let notice = menu.querySelector('[role="alert"]');
            if (!notice) { notice = doc.createElement('span'); notice.className = 'menu-note'; notice.setAttribute('role', 'alert'); menu.append(notice); }
            notice.textContent = error?.message || 'Unable to complete this action.';
            position(context.x, context.y);
          }
        });
        menu.append(button);
      }
    });
    const host = context.target.closest?.('dialog[open]') || doc.fullscreenElement || doc.body;
    host.append(menu);
    position(context.x, context.y);
    menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }
  function position(x, y) {
    if (!menu) return;
    const margin = 4;
    menu.style.left = `${Math.max(margin, Math.min(x, win.innerWidth - menu.offsetWidth - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, win.innerHeight - menu.offsetHeight - margin))}px`;
  }
  function targetOf(event) {
    const node = event.composedPath?.()[0] || event.target;
    return node?.nodeType === 1 ? node : node?.parentElement || doc.documentElement;
  }
  function openEvent(event, keyboard = false, x = event.clientX, y = event.clientY, target = targetOf(event), path = event.composedPath?.() || []) {
    if (keyboard) {
      const rect = target.getBoundingClientRect();
      x = rect.left + Math.min(24, rect.width / 2);
      y = rect.top + Math.min(24, rect.height / 2);
    }
    open({ event, target, path, x, y, keyboard });
  }
  function isSuppressed(event) {
    return suppress && Date.now() < suppress.until && (event.composedPath?.().includes(suppress.target) || event.target === suppress.target || suppress.target.contains?.(event.target) || event.target?.contains?.(suppress.target));
  }
  function matchesGesture(event, state) {
    return state && (event.composedPath?.().includes(state.target) || event.target === state.target ||
      state.target.contains?.(event.target) || event.target?.contains?.(state.target));
  }
  function cancelGesture(state) {
    state.target.dispatchEvent(new win.PointerEvent('pointercancel', {
      bubbles: true, composed: true, pointerId: state.id, pointerType: 'touch',
      isPrimary: true, clientX: state.x, clientY: state.y,
    }));
  }
  listen(doc, 'contextmenu', event => {
    const isMouse = event.pointerType === 'mouse' || event.sourceCapabilities?.firesTouchEvents === false;
    const isKeyboard = Date.now() - keyboardAt < 500 && event.clientX === 0 && event.clientY === 0;
    if (!isMouse && !isKeyboard) {
      const state = touch?.native ? touch : nativeTouch;
      if (state && (!state.until || Date.now() < state.until) && matchesGesture(event, state)) return;
    }
    if (isMouse) suppress = null;
    event.preventDefault(); event.stopImmediatePropagation();
    if (menu?.contains(event.target)) return;
    if (isSuppressed(event) || isKeyboard) return;
    if (touch) {
      const state = touch;
      suppress = { target: state.target, pointerId: state.id, until: Date.now() + 1200 };
      cancelTouch();
      cancelGesture(state);
    }
    openEvent(event, event.detail === 0 && event.clientX === 0 && event.clientY === 0);
  }, true);
  listen(doc, 'keydown', event => {
    if (menu?.contains(event.target)) {
      if (event.key === 'Enter' || event.key === ' ') return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const buttons = [...menu.querySelectorAll('[role="menuitem"]')];
        const current = buttons.indexOf(doc.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
        return;
      }
      if (event.key === 'Tab') { event.stopPropagation(); close(true); return; }
      event.stopPropagation();
      return;
    }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault(); event.stopPropagation(); keyboardAt = Date.now(); openEvent(event, true);
    }
  }, true);
  listen(doc, 'pointerdown', event => {
    nativeTouch = null;
    suppress = null;
    if (menu && !menu.contains(event.target)) {
      const path = event.composedPath?.() || [];
      close(!!returnFocus && (path.includes(returnFocus) || returnFocus.contains?.(event.target)));
    }
    if (event.pointerType === 'touch' && touch && event.pointerId !== touch.id) {
      cancelTouch();
      return;
    }
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    cancelTouch();
    if (menu?.contains(event.target)) return;
    const target = targetOf(event);
    const path = event.composedPath?.() || [];
    const state = { target, path, id: event.pointerId, x: event.clientX, y: event.clientY, timer: null, native: nativeTouchTarget(path) || nearSelection(event.clientX, event.clientY) };
    if (state.native) { touch = state; return; }
    state.timer = win.setTimeout(() => {
      if (touch !== state) return;
      if (nearSelection(state.x, state.y)) { state.native = true; state.timer = null; return; }
      touch = null;
      suppress = { target, pointerId: state.id, until: Date.now() + 1200 };
      cancelGesture(state);
      openEvent(event, false, state.x, state.y, state.target, state.path);
    }, 550);
    touch = state;
  }, true);
  listen(doc, 'pointermove', event => {
    if (event.pointerType === 'touch') scrollIntent = { path: event.composedPath?.() || [], until: Date.now() + 1000 };
    if (touch && !touch.native && event.pointerId === touch.id && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 10) cancelTouch();
  }, true);
  listen(doc, 'pointerup', event => {
    if (touch && event.pointerId === touch.id) {
      if (touch.native) nativeTouch = { ...touch, until: Date.now() + 1200 };
      cancelTouch();
    }
    if (suppress && Date.now() < suppress.until && event.pointerId === suppress.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  listen(doc, 'pointercancel', event => {
    if (touch?.native && event.pointerId === touch.id) nativeTouch = { ...touch, until: Date.now() + 1200 };
    cancelTouch();
  }, true);
  listen(doc, 'click', event => {
    if (!isSuppressed(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  listen(doc, 'wheel', event => {
    scrollIntent = { path: event.composedPath?.() || [], until: Date.now() + 1000 };
  }, true);
  listen(doc, 'keydown', event => {
    if (!menu?.contains(event.target) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      scrollIntent = { path: event.composedPath?.() || [], until: Date.now() + 1000 };
    }
  }, true);
  listen(win, 'blur', () => { cancelTouch(); close(false, true); });
  listen(win, 'resize', () => close());
  listen(doc, 'scroll', event => {
    const affects = context => context && (event.target === doc || event.target === win || context.path.includes(event.target) || event.target?.contains?.(context.target));
    if (affects(touch)) cancelTouch();
    if (affects(anchor) && scrollIntent && Date.now() < scrollIntent.until &&
        (event.target === doc || event.target === win || scrollIntent.path.includes(event.target))) close();
  }, true);
  return {
    register(root, provider) {
      if (!root || typeof provider !== 'function') throw new TypeError('register requires a root and provider');
      if (!providers.has(root)) providers.set(root, new Set());
      const set = providers.get(root);
      set.add(provider);
      return () => { set.delete(provider); if (!set.size) providers.delete(root); };
    },
    destroy() { cancelTouch(); close(); listeners.forEach(remove => remove()); providers.clear(); },
  };
}
