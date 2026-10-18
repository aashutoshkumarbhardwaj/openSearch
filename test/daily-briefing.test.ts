import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { MemoryStore } from '../src/main/memory/store.ts';
import { ActivityTracker } from '../src/main/briefing/activity.ts';
import { BriefingStore } from '../src/main/briefing/store.ts';
import { BriefingGenerator } from '../src/main/briefing/generator.ts';
import { BriefingNotifier } from '../src/main/briefing/notifier.ts';
import { BriefingController } from '../src/main/briefing/index.ts';

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `recalldesk-test-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

test('Daily Briefing: ActivityTracker records verified events without confidential contents', async () => {
  const dir = await makeTempDir();
  const tracker = new ActivityTracker(dir);
  await tracker.load();

  // Log verified indexing and task activities
  await tracker.logActivity('indexing', 'Indexed 45 file(s) across 2 folder(s) (3 added, 1 changed, 0 removed)', {
    files: 45,
    root: '/Users/test/project-a',
    added: 3,
    changed: 1,
    removed: 0
  });

  await tracker.logActivity('task', 'Completed task: "Implement token bucket rate limiter"', {
    id: 'task-123',
    path: '/Users/test/project-a/src/rate-limiter.ts'
  });

  // Verify recent activities
  const recent = tracker.getRecentActivities(10);
  assert.equal(recent.length, 2);
  assert.match(recent[0].description, /Completed task/);
  assert.match(recent[1].description, /Indexed 45 file\(s\)/);

  // Verify persistence across reload
  const tracker2 = new ActivityTracker(dir);
  await tracker2.load();
  const recentReloaded = tracker2.getRecentActivities(10);
  assert.equal(recentReloaded.length, 2);
  assert.equal(recentReloaded[0].description, recent[0].description);

  // Scope filtering
  const scopedProjA = tracker2.getRecentActivities(10, undefined, '/Users/test/project-a');
  assert.equal(scopedProjA.length, 2);

  const scopedProjB = tracker2.getRecentActivities(10, undefined, '/Users/test/other-project');
  assert.equal(scopedProjB.length, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('Daily Briefing: deterministic briefing ranks explicit deadlines first and preserves citations', async () => {
  const dir = await makeTempDir();
  const memoryStore = new MemoryStore(dir);
  await memoryStore.load();

  const tracker = new ActivityTracker(dir);
  await tracker.load();

  // Create tasks with and without explicit deadlines
  await memoryStore.createManualItem({
    type: 'task',
    title: 'Routine refactoring of utilities',
    details: 'Cleanup unused helpers',
    sourcePath: '/workspace/project/src/utils.ts',
    relativePath: 'src/utils.ts',
    status: 'open'
  });

  await memoryStore.createManualItem({
    type: 'task',
    title: 'Deliver quarterly compliance audit report',
    details: 'Submit signed audit to regulator',
    sourcePath: '/workspace/project/docs/audit.md',
    relativePath: 'docs/audit.md',
    dueDate: '2026-10-25',
    status: 'open'
  });

  await memoryStore.createManualItem({
    type: 'decision',
    title: 'Adopt SQLite local file storage with atomic temp-file replacement',
    details: 'Ensures zero cloud leakage and resilient crash-recovery',
    sourcePath: '/workspace/project/docs/architecture.md',
    relativePath: 'docs/architecture.md',
    status: 'open'
  });

  await tracker.logActivity('indexing', 'Indexed 12 file(s) across 1 folder(s) (1 changed)', {
    files: 12,
    root: '/workspace/project'
  });

  const generator = new BriefingGenerator({
    memoryStore,
    activityTracker: tracker
  });

  const briefing = await generator.generate({ scope: 'all' });

  assert.equal(briefing.insufficientData, false);
  assert.equal(briefing.generationType, 'deterministic');
  assert.equal(briefing.openTasks.length, 2);

  // The task with the explicit deadline must be prioritized at index 0!
  assert.equal(briefing.openTasks[0].title, 'Deliver quarterly compliance audit report');
  assert.equal(briefing.openTasks[0].dueDate, '2026-10-25');
  assert.equal(briefing.openTasks[0].relativePath, 'docs/audit.md');

  // Focus items must be present and citation preserved
  assert.ok(briefing.focusItems.length >= 1 && briefing.focusItems.length <= 3);
  const primaryFocus = briefing.focusItems[0];
  assert.match(primaryFocus.title, /Deliver quarterly compliance audit report/);
  assert.equal(primaryFocus.priority, 'high');
  assert.match(primaryFocus.rationale, /2026-10-25/);
  assert.equal(primaryFocus.relatedSource, '/workspace/project/docs/audit.md');

  // Key decisions preserved
  assert.equal(briefing.keyDecisions.length, 1);
  assert.equal(briefing.keyDecisions[0].title, 'Adopt SQLite local file storage with atomic temp-file replacement');
  assert.equal(briefing.keyDecisions[0].relativePath, 'docs/architecture.md');

  // Summary mentions counts
  assert.match(briefing.summary, /2 open tasks/);
  assert.match(briefing.summary, /1 with scheduled deadline/);

  await fs.rm(dir, { recursive: true, force: true });
});

test('Daily Briefing: handles empty or incomplete data gracefully without inventing facts', async () => {
  const dir = await makeTempDir();
  const memoryStore = new MemoryStore(dir);
  await memoryStore.load();

  const tracker = new ActivityTracker(dir);
  await tracker.load();

  const generator = new BriefingGenerator({
    memoryStore,
    activityTracker: tracker
  });

  const briefing = await generator.generate({ scope: 'all' });

  assert.equal(briefing.insufficientData, true);
  assert.equal(briefing.openTasks.length, 0);
  assert.equal(briefing.keyDecisions.length, 0);
  assert.equal(briefing.recentActivity.length, 0);
  assert.match(briefing.summary, /Limited project data available/);
  assert.ok(briefing.focusItems.length > 0);
  assert.match(briefing.focusItems[0].title, /Index project directory/);

  await fs.rm(dir, { recursive: true, force: true });
});

test('Daily Briefing: clipboard items included only when explicitly enabled', async () => {
  const dir = await makeTempDir();
  const memoryStore = new MemoryStore(dir);
  await memoryStore.load();
  const tracker = new ActivityTracker(dir);
  await tracker.load();

  let clipboardQueried = false;
  const mockGetClipboard = async () => {
    clipboardQueried = true;
    return [
      { text: 'docker compose up -d', contentType: 'command', capturedAt: Date.now() }
    ];
  };

  const generator = new BriefingGenerator({
    memoryStore,
    activityTracker: tracker,
    getRecentClipboard: mockGetClipboard
  });

  // When includeClipboard is false, clipboard is NOT queried
  await generator.generate({ includeClipboard: false });
  assert.equal(clipboardQueried, false);

  // When includeClipboard is true, clipboard is queried
  await generator.generate({ includeClipboard: true });
  assert.equal(clipboardQueried, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('Daily Briefing: BriefingStore persists briefings, settings, and prevents duplicate days unless regenerated', async () => {
  const dir = await makeTempDir();
  const store = new BriefingStore(dir);
  await store.load();

  // Test settings
  const settings = await store.getSettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.notificationsEnabled, false);
  assert.equal(settings.preferredTime, '09:00');

  await store.updateSettings({
    notificationsEnabled: true,
    preferredTime: '10:30',
    includeClipboard: true
  });

  // Verify settings persisted across reload
  const store2 = new BriefingStore(dir);
  await store2.load();
  const settings2 = await store2.getSettings();
  assert.equal(settings2.notificationsEnabled, true);
  assert.equal(settings2.preferredTime, '10:30');
  assert.equal(settings2.includeClipboard, true);

  // Save briefing
  const sampleBriefing = {
    id: 'briefing-1',
    date: '2026-10-18',
    createdAt: Date.now(),
    scope: 'all',
    scopeName: 'All Projects',
    summary: 'Executive project overview for today.',
    focusItems: [],
    openTasks: [],
    completedRecently: [],
    keyDecisions: [],
    recentActivity: [],
    insufficientData: false,
    generationType: 'deterministic' as const
  };

  await store2.saveBriefing(sampleBriefing);

  const foundToday = await store2.getTodayBriefing('2026-10-18', 'all');
  assert.ok(foundToday);
  assert.equal(foundToday?.summary, 'Executive project overview for today.');

  // Regeneration replaces existing briefing for the same date/scope instead of creating duplicate
  const updatedBriefing = {
    ...sampleBriefing,
    summary: 'Regenerated summary with newly confirmed tasks.'
  };
  await store2.saveBriefing(updatedBriefing);

  const list = await store2.listBriefings();
  assert.equal(list.length, 1);
  assert.equal(list[0].summary, 'Regenerated summary with newly confirmed tasks.');

  // Delete briefing
  const deleted = await store2.deleteBriefing('briefing-1');
  assert.equal(deleted, true);
  const listAfterDelete = await store2.listBriefings();
  assert.equal(listAfterDelete.length, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('Daily Briefing: BriefingNotifier checks time and prevents duplicate notifications per day', async () => {
  const dir = await makeTempDir();
  const store = new BriefingStore(dir);
  await store.load();

  let sentNotification: { title: string; body: string } | null = null;
  const notifier = new BriefingNotifier(store, (title, body) => {
    sentNotification = { title, body };
  });

  // When disabled, no notification sent
  let didNotify = await notifier.checkAndNotify();
  assert.equal(didNotify, false);
  assert.equal(sentNotification, null);

  // Enable notifications with preferred time set to past time today (e.g. 00:01)
  await store.updateSettings({
    notificationsEnabled: true,
    preferredTime: '00:01'
  });

  didNotify = await notifier.checkAndNotify();
  assert.equal(didNotify, true);
  assert.ok(sentNotification);
  const notif = sentNotification as { title: string; body: string };
  // Verify privacy masking: title and body do not expose file or task bodies
  assert.match(notif.title, /RecallDesk Daily Memory Briefing/);
  assert.match(notif.body, /Your daily project briefing is ready/);

  // Second check on the same day must NOT send duplicate notification!
  sentNotification = null;
  didNotify = await notifier.checkAndNotify();
  assert.equal(didNotify, false);
  assert.equal(sentNotification, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('Daily Briefing: BriefingController coordinates generation, activity logging, and project scoping', async () => {
  const dir = await makeTempDir();
  const memoryStore = new MemoryStore(dir);
  await memoryStore.load();

  // Create project A task and project B task
  await memoryStore.createManualItem({
    type: 'task',
    title: 'Project A: Setup CI/CD pipeline',
    sourcePath: '/workspace/project-a/ci.yml',
    relativePath: 'ci.yml',
    status: 'open'
  });

  await memoryStore.createManualItem({
    type: 'task',
    title: 'Project B: Configure database replica',
    sourcePath: '/workspace/project-b/db.ts',
    relativePath: 'db.ts',
    status: 'open'
  });

  const controller = new BriefingController({
    storageDir: dir,
    memoryStore
  });
  await controller.initialize();

  // Global briefing collects both tasks
  const globalBriefing = await controller.generateBriefing({ scope: 'all' });
  assert.equal(globalBriefing.openTasks.length, 2);

  // Project A briefing filters strictly to Project A
  const projABriefing = await controller.generateBriefing({ scope: '/workspace/project-a', forceRegenerate: true });
  assert.equal(projABriefing.openTasks.length, 1);
  assert.equal(projABriefing.openTasks[0].title, 'Project A: Setup CI/CD pipeline');

  // Verify generation was logged as an activity
  const activities = await controller.getActivityLog();
  assert.ok(activities.length >= 2);
  assert.match(activities[0].description, /Generated daily memory briefing/);

  controller.shutdown();
  await fs.rm(dir, { recursive: true, force: true });
});
