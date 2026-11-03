import './style.css'
import './navigation.css'
import './reader.css'
import { openLocalCourse, type Course, type Section, type LocalCourse } from './local-course'
import { navigationBridge, pageDelta } from './slide-navigation'
import { prepareFrame, readinessBridge } from './slide-frame'
import { readCourseDirectory, refreshedPosition, type CourseDirectoryHandle, type DirectoryPickerWindow } from './course-directory'

type Progress = { section: string; page: number }

const icons: Record<string, string> = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lab: '<path d="M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M8 15h8"/>',
  slides: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8M8 9h8m-8 4h4"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
}
const icon = (name: string, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
const readable = (value: unknown): string => Array.isArray(value) ? value.map(readable).filter(Boolean).join(' · ') : typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const app = document.querySelector<HTMLDivElement>('#app')!
let course: Course | null = null
let localCourse: LocalCourse | null = null
let directoryHandle: CourseDirectoryHandle | null = null
let directoryPickerUnavailable = false
let reselectForRefresh = false
let activeSection: Section | null = null
let activePage = 0
let filter = 'all'
let query = ''
let courseRequest = 0
let frameRequest = 0
let frameToken = ''
let framePreparation: AbortController | null = null
let sidebarCollapsed = readStorage('evoclass.sidebarCollapsed') === 'true'
let mobileSidebarOpen = false
const mobileLayout = window.matchMedia('(max-width: 620px)')
let loading = false
let notice = ''

function readStorage(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function saveStorage(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* Storage may be unavailable in private browsing. */ } }
function progress(): Progress | null {
  if (!course) return null
  try {
    const result = JSON.parse(readStorage(`evoclass.progress.${course.id}`) || 'null')
    return result && typeof result.section === 'string' && Number.isInteger(result.page) && result.page >= 0 ? result : null
  } catch { return null }
}
function title() { return course?.metadata.title || course?.folder || 'Your learning space' }
function totalSlides() { return course?.sections.reduce((sum, section) => sum + section.slides.length, 0) || 0 }
function sectionLabel(section: Section) { return `${section.kind} ${section.number}` }
function sectionName(section: Section) { return section.title || sectionLabel(section) }

function sidebar() {
  const sections = course?.sections || []
  return `<aside class="sidebar"><a class="brand" href="#" data-action="overview" aria-label="Evoclass home"><span class="brand-mark">${icon('book')}</span><span>evoclass<span class="brand-dot">.</span></span></a>
    <div class="workspace-label">YOUR WORKSPACE <span class="local-dot"></span></div>
    <button class="nav-button ${!activeSection ? 'selected' : ''}" data-action="overview">${icon('grid')}<span>Course overview</span></button>
    <div class="sidebar-course-label"><span>COURSE CONTENT</span><span>${sections.length.toString().padStart(2, '0')}</span></div>
    <nav class="course-navigation" aria-label="Course sessions">${course ? ['Lesson', 'Lab'].map(kind => {
      const items = sections.filter(section => section.kind === kind)
      return items.length ? `<div class="nav-group-label">${icon(kind === 'Lab' ? 'lab' : 'book')} ${kind === 'Lab' ? 'Labs' : 'Lessons'} <span>${items.length}</span></div>${items.map(section => `<button class="session-nav ${activeSection?.id === section.id ? 'active' : ''}" data-section="${escapeHtml(section.id)}" title="${escapeHtml(sectionName(section))}"><span class="session-number">${String(section.number).padStart(2, '0')}</span><span>${escapeHtml(sectionName(section))}</span>${activeSection?.id === section.id ? '<span class="active-indicator"></span>' : ''}</button>`).join('')}` : ''
    }).join('') : '<div class="sidebar-empty">Your lessons and labs will appear here when you open a course.</div>'}</nav>
    <div class="sidebar-bottom"><button class="open-folder-button" data-action="open-folder">${icon('folder')}<span>Open course folder</span>${icon('plus')}</button><div class="local-status"><span class="local-dot"></span> Local workspace <span class="version">v1.0</span></div></div></aside>`
}

function render() {
  frameRequest++
  framePreparation?.abort()
  frameToken = ''
  app.innerHTML = `<div class="app-shell ${activeSection ? 'reader-shell' : ''}">${sidebar()}<main class="main-content">${activeSection ? reader() : overview()}</main></div>`
  app.querySelectorAll('.language-badge').forEach(badge => { badge.textContent = 'EN' })
  const navigation = app.querySelector<HTMLElement>('.sidebar')!
  navigation.id = 'course-sidebar'
  navigation.insertAdjacentHTML('afterbegin', `<button class="icon-button sidebar-close" data-action="sidebar" aria-label="Close course sidebar">${icon('close')}</button>`)
  app.querySelector('.topbar')!.insertAdjacentHTML('afterbegin', `<button class="icon-button sidebar-toggle" data-action="sidebar" aria-controls="course-sidebar">${icon('list')}</button>`)
  if (course) app.querySelector('.topbar')!.lastElementChild!.insertAdjacentHTML('beforebegin', `<button class="icon-button course-refresh" data-action="refresh" aria-label="Refresh course" title="Refresh course">${icon('refresh')}</button>`)
  app.querySelector('.app-shell')!.insertAdjacentHTML('beforeend', '<button class="sidebar-backdrop" data-action="sidebar" aria-label="Close course sidebar" tabindex="-1" hidden></button>')
  syncSidebar()
  bindApp()
  syncCourseActions()
  if (activeSection) void updateFrame()
}

function syncSidebar() {
  const expanded = mobileLayout.matches ? mobileSidebarOpen : !sidebarCollapsed
  app.querySelector('.app-shell')?.classList.toggle('sidebar-collapsed', sidebarCollapsed)
  app.querySelector('.app-shell')?.classList.toggle('mobile-sidebar-open', mobileSidebarOpen && mobileLayout.matches)
  const navigation = app.querySelector<HTMLElement>('.sidebar')
  if (navigation) navigation.inert = !expanded
  const toggle = app.querySelector<HTMLButtonElement>('.sidebar-toggle')
  if (toggle) {
    const label = expanded ? 'Collapse course sidebar' : 'Expand course sidebar'
    toggle.setAttribute('aria-expanded', String(expanded))
    toggle.setAttribute('aria-label', label)
    toggle.title = label
  }
  const backdrop = app.querySelector<HTMLButtonElement>('.sidebar-backdrop')
  if (backdrop) backdrop.hidden = !(mobileLayout.matches && mobileSidebarOpen)
}

function toggleSidebar() {
  if (mobileLayout.matches) mobileSidebarOpen = !mobileSidebarOpen
  else {
    sidebarCollapsed = !sidebarCollapsed
    saveStorage('evoclass.sidebarCollapsed', String(sidebarCollapsed))
  }
  syncSidebar()
  if (mobileLayout.matches && mobileSidebarOpen) app.querySelector<HTMLButtonElement>('.sidebar-close')?.focus()
  else app.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus()
}

mobileLayout.addEventListener('change', () => {
  mobileSidebarOpen = false
  syncSidebar()
})

function overview() {
  if (!course) return `<header class="topbar"><span>Workspace <span class="breadcrumb-divider">/</span> <strong>Getting started</strong></span><span class="topbar-status">${icon('shield')} Runs on your computer</span></header>
    <div class="welcome-view"><div class="eyebrow"><span class="local-dot"></span> YOUR LOCAL LEARNING SPACE</div><h1>A little focus.<br>A world to learn.</h1><p class="welcome-description">Bring your course materials together in one calm space.<br>Open a course folder and pick up where curiosity takes you.</p><button class="primary-button welcome-action" data-action="open-folder" ${loading ? 'disabled' : ''}>${icon('folder')}${loading ? 'Opening course…' : 'Open course folder'}${icon('arrow')}</button><p class="welcome-hint">Lessons, labs, and every slide. Right where you left them.</p>
    ${notice ? `<div class="error-notice" role="alert">${escapeHtml(notice)}</div>` : ''}
    <div class="welcome-preview" aria-hidden="true"><div class="preview-rail"><div class="preview-brand">${icon('book')}</div><i></i><i></i><i></i><i></i></div><div class="preview-page"><div class="preview-pill">BUILT FOR YOUR NEXT CHAPTER</div><h2>Everything in its place.</h2><div class="preview-cards"><div>${icon('book')}<strong>Follow the lessons</strong><span>A clear path through your course</span></div><div>${icon('lab')}<strong>Put it into practice</strong><span>Your labs, ready when you are</span></div></div><div class="preview-line"></div><div class="preview-line short"></div></div><span class="preview-badge">${icon('check')} Local files. Familiar flow.</span></div>
    <p class="local-picker-hint">Choose an English course folder containing course.json. Files are read locally and are never uploaded. After reopening this viewer, select the folder again to resume.</p></div>`
  const saved = progress()
  const resume = saved && course.sections.find(section => section.id === saved.section && section.slides.length)
  const first = course.sections.find(section => section.slides.length)
  const next = resume || first
  const categories = readable(course.metadata.categories)
  return `<header class="topbar"><span>Workspace <span class="breadcrumb-divider">/</span> <strong>Course overview</strong></span><span class="topbar-status"><span class="local-dot"></span> Local course <span class="language-badge">EN · main</span></span></header>
    <div class="overview-content"><div class="course-heading-line"><div class="eyebrow">YOUR COURSE, AT A GLANCE</div><button class="text-button" data-action="open-folder">${icon('folder')} Change folder</button></div>
    <section class="course-hero"><div class="hero-copy"><div class="course-tags"><span class="course-tag">${escapeHtml(readable(course.metadata.stage) || 'COURSE COLLECTION')}</span>${categories ? `<span class="category-tag">${escapeHtml(categories)}</span>` : ''}</div><h1>${escapeHtml(title())}</h1><p>${escapeHtml(course.metadata.desc || 'A space to explore ideas, work through lessons, and turn knowledge into practice.')}</p><div class="hero-actions">${next ? `<button class="primary-button" data-resume="${escapeHtml(next.id)}">${icon(resume ? 'arrow' : 'book')}${resume ? 'Continue learning' : 'Start learning'}${icon('arrow')}</button>` : ''}<span class="hero-caption">${resume ? `Pick up at ${escapeHtml(sectionLabel(resume))}` : 'Your next chapter starts here'}</span></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-shadow"></div><div class="art-book back"></div><div class="art-book front"><div class="art-book-spine"></div>${icon('book')}<div class="art-book-line"></div><div class="art-book-line small"></div></div><div class="art-star star-one">✦</div><div class="art-star star-two">✦</div><span class="art-dot"></span></div></section>
    <div class="stats-row"><div class="stat">${icon('book')}<span><strong>${course.sections.filter(section => section.kind === 'Lesson').length}</strong> Lessons</span></div><div class="stat">${icon('lab')}<span><strong>${course.sections.filter(section => section.kind === 'Lab').length}</strong> Labs</span></div><div class="stat">${icon('slides')}<span><strong>${totalSlides()}</strong> Slides</span></div><div class="stat">${icon('clock')}<span>${course.metadata.hours ? `<strong>${escapeHtml(readable(course.metadata.hours))}</strong> Hours` : '<strong>Self-paced</strong> Learning'}</span></div></div>
    ${notice ? `<div class="error-notice" role="alert">${escapeHtml(notice)}</div>` : ''}
    <section class="curriculum"><div class="section-heading"><div><h2>Course content</h2><p>A clear path from first ideas to hands-on practice.</p></div><span class="session-count">${course.sections.length} sessions</span></div><div class="curriculum-toolbar"><div class="filter-tabs" role="group" aria-label="Filter sessions">${['all', 'Lesson', 'Lab'].map(value => `<button class="filter-tab ${filter === value ? 'active' : ''}" data-filter="${value}" aria-pressed="${filter === value}">${value === 'all' ? 'All sessions' : value === 'Lab' ? 'Labs' : 'Lessons'}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="session-search" type="search" placeholder="Find a session…" value="${escapeHtml(query)}" aria-label="Find a session"><kbd>/</kbd></label></div><div id="session-results">${sessionResults()}</div></section>
    <footer class="course-footer">${icon('folder')}<span title="${escapeHtml(course.path)}">${escapeHtml(course.folder)}</span><span class="footer-note">Made for focused learning</span></footer></div>`
}

function sessionResults() {
  const selected = course!.sections.filter(section => (filter === 'all' || section.kind === filter) && `${sectionLabel(section)} ${sectionName(section)}`.toLowerCase().includes(query.toLowerCase()))
  if (!selected.length) return `<div class="empty-results">${icon('search')}<h3>${query ? 'No matching sessions' : 'No sessions here yet'}</h3><p>${query ? 'Try another title or choose a different filter.' : 'This course has no readable sessions in the main branch.'}</p></div>`
  const saved = progress()
  return ['Lesson', 'Lab'].map(kind => {
    const items = selected.filter(section => section.kind === kind)
    return items.length ? `<div class="content-group"><div class="group-heading"><span class="group-icon ${kind === 'Lab' ? 'mint' : ''}">${icon(kind === 'Lab' ? 'lab' : 'book')}</span><h3>${kind === 'Lab' ? 'Hands-on labs' : 'Lessons'}</h3><span>${items.length} ${items.length === 1 ? 'session' : 'sessions'}</span></div><div class="session-grid">${items.map(section => `<button class="session-card ${kind === 'Lab' ? 'lab-card' : ''}" data-section="${escapeHtml(section.id)}" ${section.slides.length ? '' : 'disabled'}><div class="card-top"><span class="card-number">${escapeHtml(sectionLabel(section))}</span>${saved?.section === section.id ? '<span class="resume-badge">In progress</span>' : icon(kind === 'Lab' ? 'lab' : 'book')}</div><h4>${escapeHtml(sectionName(section))}</h4><div class="card-bottom"><span>${icon('slides')}${section.slides.length} ${section.slides.length === 1 ? 'slide' : 'slides'}</span><span class="card-arrow">${icon('arrow')}</span></div></button>`).join('')}</div></div>` : ''
  }).join('')
}

function reader() {
  const section = activeSection!
  return `<header class="topbar reader-topbar"><button class="text-button reader-overview" data-action="overview" aria-label="Course overview" title="Course overview"><span class="back-icon">${icon('arrow')}</span><span>Overview</span></button><div class="reader-session"><span class="reader-session-label">${escapeHtml(sectionLabel(section))}</span><h1 title="${escapeHtml(sectionName(section))}">${escapeHtml(sectionName(section))}</h1></div><span class="language-badge">EN</span></header>
    <section class="reader-content">
    <div class="reading-area"><div class="slide-stage" id="slide-stage">
      <div class="slide-frame-wrap"><iframe id="course-frame" title="Course slide" sandbox="allow-scripts allow-popups allow-downloads" referrerpolicy="no-referrer"></iframe><div id="frame-status" class="frame-status" role="status" hidden></div></div>
      <nav class="slide-controls" aria-label="Slide navigation">
        <button class="slide-step" data-action="previous" aria-label="Previous slide" title="Previous slide (Left arrow)"><span class="back-icon">${icon('chevron')}</span></button>
        <div class="slide-track"><div class="slide-markers">${section.slides.map((slide, index) => `<button class="slide-marker" data-page="${index}" aria-label="Slide ${index + 1}: ${escapeHtml(slide.title)}" title="${index + 1}. ${escapeHtml(slide.title)}"><span></span></button>`).join('')}</div><span class="slide-counter" id="slide-counter" aria-live="polite"></span></div>
        <button class="slide-step" data-action="next" aria-label="Next slide" title="Next slide (Right arrow)">${icon('chevron')}</button>
        <button class="slide-step fullscreen-control" data-action="fullscreen" aria-label="Fullscreen slide" title="Fullscreen slide">${icon('expand')}</button>
      </nav>
    </div></div></section>`
}

async function updateFrame() {
  if (!activeSection || !course || !localCourse) return
  const slide = activeSection.slides[activePage]
  if (!slide) return
  const currentRequest = ++frameRequest
  framePreparation?.abort()
  const preparation = new AbortController()
  framePreparation = preparation
  const nextToken = crypto.randomUUID()
  const frame = document.querySelector<HTMLIFrameElement>('#course-frame')!
  document.querySelector('#slide-counter')!.textContent = `${activePage + 1} / ${activeSection.slides.length}`
  document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button => {
    const current = Number(button.dataset.page) === activePage
    button.classList.toggle('current', current)
    if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current')
  })
  document.querySelector<HTMLButtonElement>('[data-action="previous"]')!.disabled = activePage === 0
  document.querySelector<HTMLButtonElement>('[data-action="next"]')!.disabled = activePage === activeSection.slides.length - 1
  document.querySelector<HTMLElement>('.slide-marker.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const status = document.querySelector<HTMLDivElement>('#frame-status')!
  status.hidden = Boolean(frameToken)
  status.setAttribute('role', 'status')
  status.textContent = 'Preparing slide…'
  try {
    const html = await localCourse.renderSlide(slide.file, navigationBridge(nextToken) + readinessBridge(nextToken))
    if (currentRequest !== frameRequest || !frame.isConnected) return
    const nextFrame = await prepareFrame(frame.parentElement!, html, nextToken, preparation.signal)
    if (currentRequest !== frameRequest || !frame.isConnected) { nextFrame.remove(); return }
    const restoreFocus = document.activeElement === frame
    nextFrame.title = `${sectionName(activeSection)} — ${slide.title || `Slide ${activePage + 1}`}`
    frame.remove()
    nextFrame.id = 'course-frame'
    nextFrame.classList.remove('pending-slide-frame')
    nextFrame.removeAttribute('aria-hidden')
    nextFrame.inert = false
    frameToken = nextToken
    status.hidden = true
    if (restoreFocus) nextFrame.focus()
    saveStorage(`evoclass.progress.${course.id}`, JSON.stringify({ section: activeSection.id, page: activePage }))
  } catch (error) {
    if (currentRequest !== frameRequest || !frame.isConnected) return
    status.hidden = false
    status.textContent = error instanceof Error ? error.message : 'Unable to display this slide.'
    status.setAttribute('role', 'alert')
  }
}
function openSection(id: string, resume = false) {
  const section = course?.sections.find(item => item.id === id)
  if (!section?.slides.length) return
  const saved = progress()
  activeSection = section
  mobileSidebarOpen = false
  activePage = resume && saved?.section === id ? Math.min(saved.page, section.slides.length - 1) : 0
  render()
}
function changePage(page: number) {
  if (!activeSection || page < 0 || page >= activeSection.slides.length || page === activePage) return
  activePage = page
  void updateFrame()
}
function bindApp() {
  app.querySelectorAll<HTMLElement>('[data-section]').forEach(button => button.addEventListener('click', () => openSection(button.dataset.section!)))
  app.querySelectorAll<HTMLElement>('[data-resume]').forEach(button => button.addEventListener('click', () => openSection(button.dataset.resume!, true)))
  app.querySelectorAll<HTMLElement>('[data-action]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault()
    switch (button.dataset.action) {
      case 'overview': activeSection = null; mobileSidebarOpen = false; render(); break
      case 'sidebar': toggleSidebar(); break
      case 'open-folder': void chooseCourseFolder(); break
      case 'refresh': void refreshCourse(); break
      case 'previous': changePage(activePage - 1); break
      case 'next': changePage(activePage + 1); break
      case 'fullscreen': void toggleFullscreen(); break
    }
  }))
  app.querySelectorAll<HTMLElement>('[data-page]').forEach(button => button.addEventListener('click', () => changePage(Number(button.dataset.page))))
  app.querySelectorAll<HTMLElement>('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter!
    app.querySelectorAll<HTMLElement>('[data-filter]').forEach(tab => { tab.classList.toggle('active', tab.dataset.filter === filter); tab.setAttribute('aria-pressed', String(tab.dataset.filter === filter)) })
    updateResults()
  }))
  app.querySelector<HTMLInputElement>('#session-search')?.addEventListener('input', event => { query = (event.target as HTMLInputElement).value; updateResults() })
}
function updateResults() {
  const results = document.querySelector('#session-results')!
  results.innerHTML = sessionResults()
  results.querySelectorAll<HTMLElement>('[data-section]').forEach(button => button.addEventListener('click', () => openSection(button.dataset.section!)))
}
async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('#slide-stage')?.requestFullscreen() }
  catch { showToast('Fullscreen is not available in this browser.') }
}
function showToast(message: string) {
  document.querySelector('.toast')?.remove()
  const toast = document.createElement('div')
  toast.className = 'toast'; toast.setAttribute('role', 'status'); toast.textContent = message
  document.body.append(toast); setTimeout(() => toast.remove(), 4500)
}
function syncCourseActions() {
  app.querySelectorAll<HTMLButtonElement>('[data-action="open-folder"], [data-action="refresh"]').forEach(button => {
    button.disabled = loading
    button.setAttribute('aria-busy', String(loading))
  })
  const refresh = app.querySelector<HTMLButtonElement>('[data-action="refresh"]')
  if (refresh) refresh.title = loading ? 'Refreshing course…' : directoryHandle ? 'Refresh course from disk' : 'Refresh course by selecting the same folder again'
}

async function loadCourseFiles(files: File[] | Promise<File[]>, refresh = false, handle: CourseDirectoryHandle | null = null) {
  const currentRequest = ++courseRequest
  loading = true; notice = ''
  syncCourseActions()
  try {
    const result = await openLocalCourse(await files)
    if (currentRequest !== courseRequest) { result.dispose(); return }
    const hasStableId = course && course.id !== `${course.folder}:${course.metadata.title}`
    if (refresh && course && (result.course.folder !== course.folder || (hasStableId && result.course.id !== course.id))) {
      result.dispose()
      throw new Error(`Select the same course folder (${course.folder}) to refresh. Use Open course folder to switch courses.`)
    }
    const position = refreshedPosition(result.course, refresh ? activeSection : null, activePage)
    localCourse?.dispose()
    localCourse = result
    directoryHandle = handle
    loading = false
    course = result.course; activeSection = position.section; activePage = position.page
    if (!refresh) { filter = 'all'; query = '' }
    mobileSidebarOpen = false
    render()
    if (refresh) showToast('Course refreshed. Latest files loaded.')
  } catch (error) {
    if (currentRequest !== courseRequest) return
    loading = false
    if (refresh && handle && error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)) directoryHandle = null
    const message = error instanceof Error ? error.message : 'Unable to open this course.'
    notice = message
    if (course) showToast(message); else render()
  } finally {
    if (currentRequest === courseRequest) { loading = false; syncCourseActions() }
  }
}

const directoryInput = document.createElement('input')
directoryInput.type = 'file'
directoryInput.id = 'course-directory'
directoryInput.setAttribute('webkitdirectory', '')
directoryInput.multiple = true
directoryInput.hidden = true
directoryInput.addEventListener('change', () => {
  const files = Array.from(directoryInput.files || [])
  const refresh = reselectForRefresh
  reselectForRefresh = false
  if (files.length) void loadCourseFiles(files, refresh)
  directoryInput.value = ''
})
directoryInput.addEventListener('cancel', () => { reselectForRefresh = false })
document.body.append(directoryInput)

function selectFolderFiles(refresh: boolean) {
  reselectForRefresh = refresh
  directoryInput.value = ''
  if (refresh) showToast(`Select ${course?.folder || 'the same course folder'} again to load its latest files.`)
  directoryInput.click()
}

async function chooseCourseFolder() {
  if (loading) return
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker || directoryPickerUnavailable) { selectFolderFiles(false); return }
  loading = true
  syncCourseActions()
  try {
    const handle = await picker.call(window, { id: 'evoclass-course', mode: 'read' })
    await loadCourseFiles(readCourseDirectory(handle), false, handle)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (error instanceof DOMException && ['SecurityError', 'NotAllowedError', 'NotSupportedError'].includes(error.name)) {
      directoryPickerUnavailable = true
      selectFolderFiles(false)
    } else showToast(error instanceof Error ? error.message : 'Unable to open the course folder.')
  } finally { loading = false; syncCourseActions() }
}

async function refreshCourse() {
  if (!course || loading) return
  if (!directoryHandle) { selectFolderFiles(true); return }
  loading = true
  syncCourseActions()
  const handle = directoryHandle
  try {
    let permission = await handle.queryPermission({ mode: 'read' })
    if (permission !== 'granted') permission = await handle.requestPermission({ mode: 'read' })
    if (permission !== 'granted') throw new DOMException('Folder access is no longer available.', 'NotAllowedError')
    await loadCourseFiles(readCourseDirectory(handle), true, handle)
  } catch (error) {
    directoryHandle = null
    showToast('Folder access is no longer available. Click Refresh course to select the same folder again.')
  } finally { loading = false; syncCourseActions() }
}

window.addEventListener('message', event => {
  const frame = document.querySelector<HTMLIFrameElement>('#course-frame')
  if (!frame || event.source !== frame.contentWindow || !activeSection || mobileSidebarOpen) return
  if (event.data?.type !== 'evoclass:navigate' || event.data.token !== frameToken) return
  if (event.data.delta === -1 || event.data.delta === 1) changePage(activePage + event.data.delta)
})

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileSidebarOpen) {
    mobileSidebarOpen = false
    syncSidebar()
    app.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus()
    return
  }
  if (mobileSidebarOpen || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return
  if (event.key === '/' && !activeSection) { event.preventDefault(); document.querySelector<HTMLInputElement>('#session-search')?.focus() }
  const delta = pageDelta(event)
  if (activeSection && delta) { event.preventDefault(); changePage(activePage + delta) }
})

render()
