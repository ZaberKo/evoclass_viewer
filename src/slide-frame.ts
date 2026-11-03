export function readinessBridge(token: string): string {
  return `(() => {
    document.addEventListener('DOMContentLoaded', async () => {
      let timeout;
      const resources = Promise.allSettled([
        document.fonts.ready,
        ...Array.from(document.images, image => image.decode().catch(() => {}))
      ]);
      await Promise.race([resources, new Promise(resolve => { timeout = setTimeout(resolve, 1800); })]);
      clearTimeout(timeout);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        parent.postMessage({ type: 'evoclass:ready', token: ${JSON.stringify(token)} }, '*');
      }));
    }, { once: true });
  })();`
}

export function prepareFrame(host: HTMLElement, html: string, token: string, signal: AbortSignal): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.className = 'pending-slide-frame'
    frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-downloads')
    frame.referrerPolicy = 'no-referrer'
    frame.setAttribute('aria-hidden', 'true')
    frame.inert = true
    const cleanup = () => {
      window.removeEventListener('message', ready)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      frame.remove()
      reject(new DOMException('Slide preparation cancelled.', 'AbortError'))
    }
    const ready = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'evoclass:ready' || event.data?.token !== token) return
      cleanup()
      resolve(frame)
    }
    if (signal.aborted) { abort(); return }
    window.addEventListener('message', ready)
    signal.addEventListener('abort', abort, { once: true })
    frame.srcdoc = html
    host.append(frame)
  })
}
