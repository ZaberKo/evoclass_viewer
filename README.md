# EvoClass Viewer

A portable course library and HTML slide reader built with pnpm, Vite, TypeScript, and CSS. Course files are selected and read entirely in the browser. No local backend, upload service, database, or installed runtime is needed to use the built viewer.

## Hosted viewer

The viewer is published on GitHub Pages:

**https://zaberko.github.io/evoclass_viewer/**

Pushes to `main` run `.github/workflows/pages.yml`, which tests the project, builds `dist/`, and deploys that folder. Open the URL, then click **Open course folder** and choose a local course directory containing `course.json`. Course files stay in the browser and are not uploaded to the site.

## Build and open

For development and building, use Node.js 22.18+ or 24 and pnpm.

```sh
pnpm install
pnpm build
```

The build produces **`dist/index.html`** and an **`assets/`** directory containing JavaScript and CSS. Copy the entire `dist` folder anywhere, keep its internal structure intact, and double-click `index.html` to open it in a modern desktop browser. A web server is not required. Copying only the HTML file is not sufficient.

The production build uses relative asset paths and a classic JavaScript bundle so it works under `file://` without module-loading restrictions. Development still uses Vite's normal module and hot-reload workflow.

Click **Open course folder** and choose the complete course directory containing `course.json`. The browser's folder selection dialog may call the operation an upload; the viewer reads those files locally and sends none of them to a server. Course material remains separate from the viewer HTML and is not included in the build.

After refreshing or reopening the page, select the course folder again. The browser does not automatically restore file access. **Continue learning** resumes the last saved session and page after selection, when this browser's local storage is available. File-URL storage behavior can vary by browser or when moving the viewer to another location.

## Refresh course files

The **Refresh course** button in the top toolbar reloads course metadata, rescans Lessons and Labs, and clears local resource caches. Use it after editing slides or images, adding a session folder, or deleting files. Course edits do not require rebuilding the viewer.

When supported, **Open course folder** requests a read-only directory handle through `showDirectoryPicker()`. While the viewer stays open, refresh scans that same directory without selecting it again. This depends on the browser and its policy for the current URL, including `file://`.

If directory handles are unavailable, the viewer uses the standard folder input. In that mode, **Refresh course** asks you to select the same folder again. If access is revoked, the next refresh can also use folder selection. Cancelling selection or encountering an invalid course leaves the currently loaded course available.

Refresh preserves the current slide by its relative file path, even if new slides are inserted before it. If that slide is deleted, the reader opens the first remaining slide of the session; if the session disappears or is empty, it returns to the course overview. Selecting a different course through the refresh picker is rejected; use **Open course folder** to switch courses.

Directory handles last for the current page session only. Browser reload is different from **Refresh course** and requires selecting the folder again.

## Course structure

```text
My Course/
  course.json
  README.md
  Lesson 1/
    00_Lesson 1  Introduction.html
    01_First Topic.html
    imgs/
      example.png
  Lesson 2/
    00_Lesson 2  Next Topic.html
  Lab 1/
    00_Lab 1  Getting Started.html
```

- `course.json` supplies `title`, `desc`, `hours`, `icon`, `stage`, `categories`, `rating`, and `students`. Only `title` is required for display; source language must be English when specified.
- Top-level folders matching `Lesson 1`, `Lesson1`, `Lab 1`, or `Lab1` are sessions. Folder names determine grouping, even when slide titles contain inconsistent labels.
- Sessions and their HTML pages are sorted numerically, so page 2 appears before page 10. Relative images, stylesheets, and scripts retain their original paths.
- Choose a working folder already checked out on `main`, or an English export of that branch. The portable browser app reads selected files and does not run Git or switch branches. Hidden files and translation subdirectories are ignored.

## Reading

Use the single course sidebar to switch between Lessons and Labs. Its top-left toggle collapses or expands it; on narrow screens it opens as a drawer.

Below the slide, a compact, centered navigation rail contains previous/next buttons, one clickable marker per page, the current page count, and a fullscreen button. Hover a marker to see its page title. Long page lists scroll horizontally on narrow screens.

**Left Arrow / Right Arrow** navigate both in the outer viewer and while the slide iframe has focus, including fullscreen. Text fields, editable areas, and code editors keep their normal keyboard controls. Modified shortcuts and held-key repeats do not trigger page changes.

The viewer adjusts to the browser window size, and the iframe fills the remaining reading area. Course HTML and its responsive styles remain unchanged. The fullscreen control expands the slide area together with its page controls; Escape exits fullscreen.

When turning pages, the current slide stays visible while the next iframe prepares at the same size. The viewer waits for its initial fonts and images, with a bounded resource wait, before switching frames. Rapid navigation cancels obsolete preparations, and keyboard focus follows the displayed slide.

## Local resources and offline use

The reader creates an in-memory copy of the selected slide, resolves its local resource references to embedded data URLs, and adds a keyboard message bridge. The source files on disk are never changed. The iframe stays sandboxed and cannot access the viewer document.

The loader supports the supplied HTML course structure, including local images, linked stylesheets, CSS resource URLs and imports, fonts, scripts, static gallery paths, and media resources. Missing local assets produce an error identifying the missing file. Arbitrary applications that construct resource paths at runtime, use dynamic `fetch()`, or depend on an ES module graph require additional packaging and are outside this course-format loader.

The viewer itself can open offline. Existing course links to external fonts, icons, MathJax, or other CDN resources are preserved and still require internet access; those external dependencies are not automatically downloaded or bundled.

## Validate and preview

```sh
pnpm dev
pnpm test
pnpm build
pnpm preview
```

The optional development server runs at **http://127.0.0.1:5173**. The build preview runs at **http://127.0.0.1:4173**. Both use the same browser folder picker as the standalone file.

Tests cover course validation, numeric ordering, stable identity, resource boundaries, keyboard event forwarding, resource readiness, cancellation of obsolete frames, fresh directory scans, and reading-position restoration. Browser verification covers direct `file://` opening after copying the build folder, local folder selection, image decoding, marker navigation, focused-iframe keyboard controls, fullscreen, and responsive sizing. Refresh checks include edited HTML and images, inserted slides, added and deleted sessions, invalid metadata, and selecting the wrong folder.

## Project layout

- `src/main.ts`: course library, native directory picker, sidebar, and slide reader.
- `src/local-course.ts`: browser file indexing and in-memory resource resolution.
- `src/course-directory.ts`: fresh directory scans and reading-position restoration.
- `src/slide-navigation.ts`: keyboard behavior and the iframe message bridge.
- `src/slide-frame.ts`: slide preparation and readiness messages for smooth page changes.
- `src/style.css`, `src/navigation.css`, `src/reader.css`: viewer layout and navigation styling.
- `vite.config.mjs`: portable folder build with relative assets and a classic script entry.
- `tests/`: loader and keyboard tests with a small example course.

Browser folder selection uses [`webkitdirectory` and `webkitRelativePath`](https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath). The reader uses [sandboxed iframe `srcdoc` content](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).
