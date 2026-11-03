import test from 'node:test';
import assert from 'node:assert/strict';
import { openLocalCourse, resolveCoursePath } from '../src/local-course.ts';

function selectedFile(path, content = '') {
  const file = new File([content], path.split('/').at(-1));
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

function courseFiles(metadata = { title: 'Example course', source_language: 'en', repo_guid: 'stable-id' }) {
  return [
    selectedFile('Example/course.json', JSON.stringify(metadata)),
    selectedFile('Example/Lab 2/10_Practice.html'),
    selectedFile('Example/Lesson 10/01_Tenth lesson.html'),
    selectedFile('Example/Lesson 2/10_Last slide.html'),
    selectedFile('Example/Lesson 2/2_Second slide.htm'),
    selectedFile('Example/Lesson 2/00_Lesson 2 - Introduction.html'),
    selectedFile('Example/.git/Lesson 1/00_Hidden.html'),
    selectedFile('Example/translated/Lesson 1/00_Translation.html'),
  ];
}

test('local folders group root sessions and sort slides numerically', async () => {
  const { course } = await openLocalCourse(courseFiles());
  assert.deepEqual(course.sections.map(section => section.id), ['Lesson 2', 'Lesson 10', 'Lab 2']);
  assert.deepEqual(course.sections[0].slides.map(slide => slide.title), ['Lesson 2 - Introduction', 'Second slide', 'Last slide']);
  assert.equal(course.sections[0].title, 'Introduction');
  assert.equal(course.id, 'stable-id');
  assert.equal(course.path, 'Example');
});

test('metadata is validated and identity survives reopening', async () => {
  const metadata = { title: 'Example course', hours: 70, categories: ['Databases', 42] };
  const first = await openLocalCourse(courseFiles(metadata));
  const second = await openLocalCourse(courseFiles(metadata));
  assert.equal(first.course.id, second.course.id);
  assert.equal(first.course.metadata.hours, 70);
  assert.deepEqual(first.course.metadata.categories, ['Databases']);
  await assert.rejects(openLocalCourse(courseFiles({ title: 'Example', source_language: 'zh_CN' })), /English main/);
  await assert.rejects(openLocalCourse(courseFiles({ title: '' })), /course title/);
  await assert.rejects(openLocalCourse([selectedFile('Example/course.json', '{')]), /valid JSON/);
  await assert.rejects(openLocalCourse([selectedFile('Example/Lab 1/slide.html')]), /contains course.json/);
});

test('resource paths allow shared assets inside the course and reject escapes', () => {
  assert.equal(resolveCoursePath('imgs/one%20two.png?version=1#icon', 'Lab 1/slide.html'), 'Lab 1/imgs/one two.png');
  assert.equal(resolveCoursePath('../assets/image.png', 'Lab 1/slide.html'), 'assets/image.png');
  for (const path of ['../../secret.txt', '%2e%2e/%2e%2e/secret.txt', '/etc/passwd', '../.git/config', 'imgs\\image.png']) {
    assert.throws(() => resolveCoursePath(path, 'Lab 1/slide.html'));
  }
});

test('folder selection rejects unrelated roots and invalid paths', async () => {
  await assert.rejects(openLocalCourse([...courseFiles(), selectedFile('Other/slide.html')]), /one course folder/);
  await assert.rejects(openLocalCourse([...courseFiles(), selectedFile('Example/../slide.html')]), /complete course folder/);
  await assert.rejects(openLocalCourse([selectedFile('Example/course.json', '{"title":"Empty"}')]), /No slides found/);
});

test('disposed local courses cannot read slides', async () => {
  const localCourse = await openLocalCourse(courseFiles());
  localCourse.dispose();
  await assert.rejects(localCourse.renderSlide('outside.html', ''), /not part/);
  await assert.rejects(localCourse.renderSlide('Lab 2/10_Practice.html', ''), /Reopen the course/);
});
