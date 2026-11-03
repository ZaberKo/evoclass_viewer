import type { Course, Section } from './local-course'

export type CourseFileHandle = {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}

export type CourseDirectoryHandle = {
  kind: 'directory'
  name: string
  values(): AsyncIterable<CourseDirectoryHandle | CourseFileHandle>
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>
}

export type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { id: string; mode: 'read' }) => Promise<CourseDirectoryHandle>
}

export async function readCourseDirectory(root: CourseDirectoryHandle): Promise<File[]> {
  const files: File[] = []
  async function walk(directory: CourseDirectoryHandle, path: string) {
    for await (const entry of directory.values()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const relativePath = `${path}/${entry.name}`
      if (entry.kind === 'directory') await walk(entry, relativePath)
      else {
        const file = await entry.getFile()
        Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true })
        files.push(file)
      }
    }
  }
  await walk(root, root.name)
  return files
}

export function refreshedPosition(course: Course, section: Section | null, page: number): { section: Section | null; page: number } {
  const nextSection = section && course.sections.find(item => item.id === section.id && item.slides.length)
  if (!nextSection) return { section: null, page: 0 }
  const file = section.slides[page]?.file
  const nextPage = nextSection.slides.findIndex(slide => slide.file === file)
  return { section: nextSection, page: Math.max(0, nextPage) }
}
