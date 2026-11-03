type NavigationKey = {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  repeat?: boolean
}

export function pageDelta(event: NavigationKey): number {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.repeat) return 0
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
}

export function navigationBridge(token: string): string {
  return `(() => {
    const token = ${JSON.stringify(token)};
    window.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.repeat) return;
      const target = event.composedPath()[0];
      if (target instanceof Element && (target.closest('input, textarea, select, [role="textbox"], [role="slider"], [role="spinbutton"], .monaco-editor, .CodeMirror, .cm-editor, .ace_editor') || target.isContentEditable)) return;
      const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (!delta) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      parent.postMessage({ type: 'evoclass:navigate', token, delta }, '*');
    }, true);
  })();`
}
