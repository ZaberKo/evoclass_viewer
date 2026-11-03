import test from 'node:test';
import assert from 'node:assert/strict';
import { readCourseDirectory, refreshedPosition } from '../src/course-directory.ts';
import { openLocalCourse } from '../src/local-course.ts';

function directory(name, entries) {
  return { kind: 'directory', name, async *values() { yield* entries; } };
}

function file(name, content) {
  return { kind: 'file', name, getFile: async () => new File([content()], name) };
}

test('each directory scan sees new sessions, file edits, and deletions', async () => {
  let html = '<p>Original</p>';
  let title = 'Original title';
  const lessonEntries = [file('00_Introduction.html', () => html)];
  const entries = [
    file('course.json', () => JSON.stringify({ title })),
    directory('Lesson 1', lessonEntries),
    directory('.git', [file('secret', () => { throw new Error('Hidden directories must not be read.'); })]),
    directory('node_modules', [file('ignored', () => { throw new Error('Dependencies must not be read.'); })]),
  ];
  const root = directory('Example', entries);
  const first = await readCourseDirectory(root);
  assert.deepEqual(first.map(item => item.webkitRelativePath), ['Example/course.json', 'Example/Lesson 1/00_Introduction.html']);
  assert.equal(await first[1].text(), '<p>Original</p>');

  html = '<p>Edited</p>';
  title = 'Updated title';
  entries.push(directory('Lab 2', [file('00_New lab.html', () => '<p>New lab</p>')]));
  const second = await readCourseDirectory(root);
  assert.equal(await second[1].text(), '<p>Edited</p>');
  assert.equal(await first[1].text(), '<p>Original</p>');
  const { course } = await openLocalCourse(second);
  assert.equal(course.metadata.title, 'Updated title');
  assert.deepEqual(course.sections.map(section => section.id), ['Lesson 1', 'Lab 2']);
  lessonEntries.splice(0, 1);
  const third = await openLocalCourse(await readCourseDirectory(root));
  assert.deepEqual(third.course.sections.map(section => section.id), ['Lab 2']);
});

test('refresh restores the same file after insertion and handles removed slides or sessions', () => {
  const original = { id: 'Lesson 1', slides: [{ file: 'Lesson 1/02_Current.html' }] };
  const updated = { id: 'Lesson 1', slides: [{ file: 'Lesson 1/01_New.html' }, ...original.slides] };
  const course = { sections: [updated] };
  assert.deepEqual(refreshedPosition(course, original, 0), { section: updated, page: 1 });
  updated.slides.pop();
  assert.deepEqual(refreshedPosition(course, original, 0), { section: updated, page: 0 });
  updated.slides.length = 0;
  assert.deepEqual(refreshedPosition(course, original, 0), { section: null, page: 0 });
  course.sections.length = 0;
  assert.deepEqual(refreshedPosition(course, original, 0), { section: null, page: 0 });
  assert.deepEqual(refreshedPosition(course, null, 0), { section: null, page: 0 });
});

test('directory read failures propagate instead of producing a partial course', async () => {
  const root = directory('Example', [{ kind: 'file', name: 'course.json', getFile() { throw new DOMException('Access revoked.', 'NotAllowedError'); } }]);
  await assert.rejects(readCourseDirectory(root), { name: 'NotAllowedError' });
});
