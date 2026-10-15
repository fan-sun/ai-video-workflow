import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCourseVideoPlan } from '../../build/common/course_video.mjs';
import { injectCourseChapterProgressHtml } from '../../build/teaching/course_chapter_progress.mjs';

test('六幕教程可单独构建第一幕与第六幕，并保留六章全片进度', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'course-six-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const acts = Array.from({ length: 6 }, (_, i) => {
    const act = i + 1;
    fs.writeFileSync(path.join(root, `act${act}.json`), JSON.stringify({ total: 10 }), { encoding: 'utf8' });
    fs.writeFileSync(path.join(root, `act${act}.html`), '<div id="opening" data-duration="2"></div>', { encoding: 'utf8' });
    return { act, audio: `act${act}.wav`, timings: `act${act}.json`, visual_source: `act${act}.html`, subtitle_highlights: [], allowed_warnings: {} };
  });
  const timeline = { total_s: 60, acts: acts.map(({ act }) => ({ act, start_s: (act - 1) * 10, end_s: act * 10 })) };
  fs.writeFileSync(path.join(root, 'timeline.json'), JSON.stringify(timeline), { encoding: 'utf8' });
  const index = { episode: 'ep01', slug: 'tutorial', current_version: 'v1', production_contract: 'current', chapter_titles: ['评论', '选题', '写稿', '声音', '画面', '交付'], timeline_summary: 'timeline.json', acts };
  for (const number of [1, 6]) {
    const plan = createCourseVideoPlan(index, 'review', { rootDir: root, act: number });
    assert.equal(plan.acts.length, 1);
    assert.equal(plan.acts[0].act, number);
    assert.equal(plan.acts[0].prepare.chapter.titles.length, 6);
    assert.equal(plan.acts[0].prepare.chapter.startS, (number - 1) * 10);
  }
});

test('六格章节栏与精确时长比例一致，重复注入不重复生成', () => {
  const source = '<html><head></head><body><div id="root" data-composition-id="main"></div></body></html>';
  const chapter = { titles: ['评论', '选题', '写稿', '声音', '画面', '交付'], acts: Array.from({ length: 6 }, (_, i) => ({ startS: i * 10, endS: (i + 1) * 10 })), totalS: 60, startS: 0, endS: 10, introEndS: 2 };
  const html = injectCourseChapterProgressHtml(source, chapter);
  assert.equal((html.match(/class="course-chapter-cell"/g) || []).length, 6);
  assert.equal(injectCourseChapterProgressHtml(html, chapter), html);
});
