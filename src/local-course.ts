export type Slide = { file: string; title: string };
export type Section = { id: string; kind: 'Lesson' | 'Lab'; number: number; title: string; slides: Slide[] };
export type Course = {
  id: string;
  path: string;
  folder: string;
  mode: string;
  metadata: {
    title: string;
    desc?: string;
    hours?: number;
    icon?: string;
    stage?: string;
    categories?: string[];
    rating?: number;
    students?: number;
  };
  sections: Section[];
};
export type LocalCourse = {
  course: Course;
  renderSlide(file: string, bridgeScript: string): Promise<string>;
  dispose(): void;
};

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const remoteReference = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;
const resourceExtension = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|m?js|woff2?|ttf|otf|mp[34]|webm|ogg|wav|pdf|sql|csv|txt|json)(?:[?#].*)?$/i;
const mimeTypes: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg',
  ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf', json: 'application/json',
  sql: 'text/plain', txt: 'text/plain', csv: 'text/csv',
};

/** Resolve a resource relative to a course file, rejecting paths outside the selected folder. */
export function resolveCoursePath(reference: string, containingFile: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(reference.split(/[?#]/, 1)[0]); }
  catch { throw new Error(`Invalid resource path: ${reference}`); }
  if (!decoded || decoded.includes('\\') || decoded.includes('\0') || decoded.startsWith('/')) {
    throw new Error(`Resource path must stay inside the selected course: ${reference}`);
  }
  const parts = containingFile.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '.' || !part) continue;
    if (part === '..') {
      if (!parts.length) throw new Error(`Resource is outside the selected course: ${reference}`);
      parts.pop();
    } else {
      if (part.startsWith('.')) throw new Error(`Hidden course resources are not supported: ${reference}`);
      parts.push(part);
    }
  }
  return parts.join('/');
}

async function replaceMatches(value: string, pattern: RegExp, replacement: (match: RegExpMatchArray) => Promise<string>) {
  const matches = [...value.matchAll(pattern)];
  const replacements = await Promise.all(matches.map(replacement));
  let result = '';
  let cursor = 0;
  matches.forEach((match, index) => {
    result += value.slice(cursor, match.index) + replacements[index];
    cursor = match.index! + match[0].length;
  });
  return result + value.slice(cursor);
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function openLocalCourse(selectedFiles: File[]): Promise<LocalCourse> {
  const files = new Map<string, File>();
  let folder = '';
  for (const file of selectedFiles) {
    const relative = file.webkitRelativePath;
    const segments = relative.split('/');
    if (segments.length < 2 || segments.some(part => !part || part === '..' || part.includes('\\'))) {
      throw new Error('Choose a complete course folder using Open course folder.');
    }
    if (segments.some(part => part.startsWith('.') || part === 'node_modules')) continue;
    if (!folder) folder = segments[0];
    if (folder !== segments[0]) throw new Error('Choose one course folder at a time.');
    const path = segments.slice(1).join('/');
    if (files.has(path)) throw new Error(`The selected folder contains duplicate files: ${path}`);
    files.set(path, file);
  }
  const metadataFile = files.get('course.json');
  if (!metadataFile) throw new Error('Choose the course folder that contains course.json directly.');
  let metadata: Record<string, unknown>;
  try { metadata = JSON.parse(await metadataFile.text()); }
  catch { throw new Error('course.json is not valid JSON.'); }
  if (!metadata || typeof metadata !== 'object' || typeof metadata.title !== 'string' || !metadata.title.trim()) {
    throw new Error('course.json must contain a course title.');
  }
  if (metadata.source_language && metadata.source_language !== 'en') {
    throw new Error('Choose the English main working folder or an English course export.');
  }
  const sectionNames = new Set([...files.keys()].map(path => path.split('/')[0]));
  const sections: Section[] = [...sectionNames].filter(name => /^(Lesson|Lab)\s*\d+$/i.test(name)).map(id => {
    const kind = /^lesson/i.test(id) ? 'Lesson' as const : 'Lab' as const;
    const slides = [...files.keys()].filter(path => path.startsWith(`${id}/`) && path.split('/').length === 2 && /\.html?$/i.test(path))
      .sort(collator.compare).map(file => ({
        file,
        title: file.split('/').at(-1)!.replace(/^\d+[\s_.-]*/, '').replace(/\.html?$/i, '').trim(),
      }));
    const title = slides[0]?.title.replace(/^(Lesson|Lab)\s*\d+\s*[:–—-]?\s*/i, '').trim() || id;
    return { id, kind, number: Number(id.match(/\d+$/)![0]), title, slides };
  }).sort((a, b) => a.kind === b.kind ? a.number - b.number || collator.compare(a.id, b.id) : a.kind === 'Lesson' ? -1 : 1);
  if (!sections.some(section => section.slides.length)) {
    throw new Error('No slides found. The course needs Lesson 1 or Lab 1 folders containing HTML files.');
  }
  const course: Course = {
    id: typeof metadata.repo_guid === 'string' && metadata.repo_guid ? metadata.repo_guid : `${folder}:${metadata.title}`,
    path: folder,
    folder,
    mode: 'local folder',
    metadata: {
      title: metadata.title,
      desc: typeof metadata.desc === 'string' ? metadata.desc : undefined,
      hours: typeof metadata.hours === 'number' ? metadata.hours : undefined,
      icon: typeof metadata.icon === 'string' ? metadata.icon : undefined,
      stage: typeof metadata.stage === 'string' ? metadata.stage : undefined,
      categories: Array.isArray(metadata.categories) ? metadata.categories.filter((value): value is string => typeof value === 'string') : undefined,
      rating: typeof metadata.rating === 'number' ? metadata.rating : undefined,
      students: typeof metadata.students === 'number' ? metadata.students : undefined,
    },
    sections,
  };
  const assetCache = new Map<string, Promise<string>>();
  let disposed = false;
  const requireFile = (path: string) => {
    if (disposed) throw new Error('Reopen the course folder to read its slides.');
    const file = files.get(path);
    if (!file) throw new Error(`Missing course resource: ${path}. Select the complete course folder with all its assets.`);
    return file;
  };
  async function resource(reference: string, containingFile: string, ancestors: string[] = []): Promise<string> {
    if (!reference.trim() || remoteReference.test(reference.trim())) return reference;
    const path = resolveCoursePath(reference.trim(), containingFile);
    if (ancestors.includes(path)) throw new Error(`Circular local resource dependency: ${path}`);
    const fragment = reference.includes('#') ? reference.slice(reference.indexOf('#')) : '';
    if (!assetCache.has(path)) {
      const promise = (async () => {
        const file = requireFile(path);
        const extension = path.split('.').at(-1)!.toLowerCase();
        const mime = mimeTypes[extension] || file.type || 'application/octet-stream';
        if (extension === 'css') {
          const css = await rewriteCss(await file.text(), path, [...ancestors, path]);
          return dataUrl(new TextEncoder().encode(css), mime);
        }
        if (extension === 'js' || extension === 'mjs') {
          const script = await rewriteScript(await file.text(), path, [...ancestors, path]);
          return dataUrl(new TextEncoder().encode(script), mime);
        }
        return dataUrl(new Uint8Array(await file.arrayBuffer()), mime);
      })();
      assetCache.set(path, promise);
      promise.catch(() => assetCache.delete(path));
    }
    return await assetCache.get(path)! + fragment;
  }
  async function rewriteCss(css: string, containingFile: string, ancestors: string[] = []): Promise<string> {
    const withImports = await replaceMatches(css, /@import\s+(["'])([^"']+)\1/g, async match =>
      `@import "${await resource(match[2], containingFile, ancestors)}"`);
    return replaceMatches(withImports, /url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi, async match =>
      `url("${await resource(match[2] ?? match[3], containingFile, ancestors)}")`);
  }
  async function rewriteScript(script: string, containingFile: string, ancestors: string[] = []): Promise<string> {
    // Course galleries assign static image paths from JavaScript after the page loads.
    return replaceMatches(script, /(["'`])((?:\.{1,2}\/)?(?:imgs|images|assets|media|fonts)\/[^"'`\n]+)\1/g, async match => {
      if (match[2].includes('${') || !resourceExtension.test(match[2])) return match[0];
      return `${match[1]}${await resource(match[2], containingFile, ancestors)}${match[1]}`;
    });
  }
  async function rewriteSourceSet(sourceSet: string, containingFile: string): Promise<string> {
    const candidates: string[] = [];
    let cursor = 0;
    while (cursor < sourceSet.length) {
      while (/[\s,]/.test(sourceSet[cursor] || '') && cursor < sourceSet.length) cursor++;
      const start = cursor;
      while (cursor < sourceSet.length && !/\s/.test(sourceSet[cursor])) cursor++;
      let reference = sourceSet.slice(start, cursor);
      if (!reference) break;
      let descriptor = '';
      if (reference.endsWith(',')) {
        reference = reference.replace(/,+$/, '');
      } else {
        const descriptorStart = cursor;
        while (cursor < sourceSet.length && sourceSet[cursor] !== ',') cursor++;
        descriptor = sourceSet.slice(descriptorStart, cursor).trim();
      }
      candidates.push(`${await resource(reference, containingFile)}${descriptor ? ` ${descriptor}` : ''}`);
    }
    return candidates.join(', ');
  }
  return {
    course,
    async renderSlide(file, bridgeScript) {
      if (!sections.some(section => section.slides.some(slide => slide.file === file))) {
        throw new Error(`Slide is not part of the selected course: ${file}`);
      }
      const html = await requireFile(file).text();
      const document = new DOMParser().parseFromString(html, 'text/html');
      // The source folder is the resource root; browser file URLs cannot serve these selected files.
      document.querySelectorAll('base').forEach(element => element.remove());
      const attributes = ['src', 'poster', 'data'];
      await Promise.all([...document.querySelectorAll('*')].map(async element => {
        for (const attribute of attributes) {
          const value = element.getAttribute(attribute);
          if (value && (attribute !== 'data' || element.tagName === 'OBJECT')) {
            element.setAttribute(attribute, await resource(value, file));
          }
        }
        const href = element.getAttribute('href');
        if (href && (element.tagName === 'LINK' || resourceExtension.test(href))) {
          element.setAttribute('href', await resource(href, file));
        }
        const sourceSet = element.getAttribute('srcset');
        if (sourceSet) {
          element.setAttribute('srcset', await rewriteSourceSet(sourceSet, file));
        }
        const style = element.getAttribute('style');
        if (style) element.setAttribute('style', await rewriteCss(style, file));
        if (element.tagName === 'STYLE') element.textContent = await rewriteCss(element.textContent || '', file);
        if (element.tagName === 'SCRIPT' && !element.hasAttribute('src')) {
          element.textContent = await rewriteScript(element.textContent || '', file);
        }
      }));
      const bridge = document.createElement('script');
      bridge.textContent = bridgeScript;
      document.head.prepend(bridge);
      return `<!doctype html>\n${document.documentElement.outerHTML}`;
    },
    dispose() {
      disposed = true;
      assetCache.clear();
      files.clear();
    },
  };
}
