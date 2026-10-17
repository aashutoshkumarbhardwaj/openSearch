import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  isVisionCapable,
  ProjectIntelligenceAnalyzer
} from '../src/main/intelligence/analyzer.ts';
import type { SourceItem } from '../src/main/intelligence/types.ts';

test('isVisionCapable: correctly identifies vision-compatible models', () => {
  assert.strictEqual(isVisionCapable('llava:7b'), true);
  assert.strictEqual(isVisionCapable('llama3.2-vision:11b'), true);
  assert.strictEqual(isVisionCapable('minicpm-v'), true);
  assert.strictEqual(isVisionCapable('bakllava'), true);
  assert.strictEqual(isVisionCapable('moondream'), true);

  assert.strictEqual(isVisionCapable('smollm2:360m'), false);
  assert.strictEqual(isVisionCapable('llama3:latest'), false);
  assert.strictEqual(isVisionCapable('mistral:7b'), false);
  assert.strictEqual(isVisionCapable('qwen2.5-coder:7b'), false);
  assert.strictEqual(isVisionCapable(''), false);
});

test('ProjectIntelligenceAnalyzer: extracts evidence-backed findings using local engine', async () => {
  const testDir = join(tmpdir(), `recall-desk-analyzer-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const planPath = join(testDir, 'PROJECT_PLAN.md');
  const planContent = [
    '# Architecture & Implementation Plan',
    'Decision: Use Electron IPC and local JSON storage for user privacy',
    'TODO: Finish the universal source-selection modal before Friday',
    '- [ ] Implement unit tests for document extraction',
    'Potential question: should we add OCR for scanned PDFs?'
  ].join('\n');
  await fs.writeFile(planPath, planContent, 'utf-8');

  const sources: SourceItem[] = [
    {
      id: randomUUID(),
      path: planPath,
      name: 'PROJECT_PLAN.md',
      type: 'markdown',
      sizeBytes: Buffer.byteLength(planContent),
      sizeFormatted: '1 KB',
      status: 'ready'
    }
  ];

  const analyzer = new ProjectIntelligenceAnalyzer();
  const progressLogs: string[] = [];

  const result = await analyzer.runAnalysis(
    {
      sources,
      goal: 'tasks',
      customInstructions: 'Focus on urgent deadlines'
    },
    {
      activeModel: 'smollm2:360m',
      onProgress: (p) => {
        progressLogs.push(p.message);
      }
    }
  );

  // Result verification
  assert.ok(result.overview.length > 0);
  assert.ok(result.findings.length >= 2, `Expected at least 2 findings, got ${result.findings.length}`);

  // Finding verification
  const taskFinding = result.findings.find(f => f.title.toLowerCase().includes('universal source-selection') || f.title.toLowerCase().includes('modal'));
  assert.ok(taskFinding, 'Should have extracted task finding');
  assert.strictEqual(taskFinding.type, 'task');
  assert.strictEqual(taskFinding.dueDate, 'Friday');
  assert.strictEqual(taskFinding.evidenceClassification, 'explicitly_stated');
  assert.strictEqual(taskFinding.sourceName, 'PROJECT_PLAN.md');
  assert.ok(taskFinding.sourceExcerpt.includes('universal source-selection modal'));

  const decisionFinding = result.findings.find(f => f.title.toLowerCase().includes('electron ipc') || f.title.toLowerCase().includes('privacy'));
  assert.ok(decisionFinding, 'Should have extracted decision finding');
  assert.strictEqual(decisionFinding.type, 'decision');
  assert.strictEqual(decisionFinding.evidenceClassification, 'explicitly_stated');

  // Verify progress reporting occurred
  assert.ok(progressLogs.length > 0);

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ProjectIntelligenceAnalyzer: warns about text-only models when image is analyzed', async () => {
  const testDir = join(tmpdir(), `recall-desk-analyzer-image-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const imgPath = join(testDir, 'mockup.png');
  await fs.writeFile(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  const sources: SourceItem[] = [
    {
      id: randomUUID(),
      path: imgPath,
      name: 'mockup.png',
      type: 'image',
      sizeBytes: 8,
      sizeFormatted: '8 B',
      status: 'ready'
    }
  ];

  const analyzer = new ProjectIntelligenceAnalyzer();
  const result = await analyzer.runAnalysis(
    {
      sources,
      goal: 'images'
    },
    {
      activeModel: 'smollm2:360m' // Text-only model
    }
  );

  // Must warn user about text-only model instead of silently pretending visual parsing worked
  assert.ok(result.warnings.some(w => w.toLowerCase().includes('text-only') || w.toLowerCase().includes('vision model')));

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ProjectIntelligenceAnalyzer: aborts when cancelled', async () => {
  const testDir = join(tmpdir(), `recall-desk-analyzer-cancel-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const filePath = join(testDir, 'sample.txt');
  await fs.writeFile(filePath, 'TODO: Sample task for cancellation test', 'utf-8');

  const sources: SourceItem[] = [
    {
      id: randomUUID(),
      path: filePath,
      name: 'sample.txt',
      type: 'text',
      sizeBytes: 40,
      sizeFormatted: '40 B',
      status: 'ready'
    }
  ];

  const analyzer = new ProjectIntelligenceAnalyzer();

  // Cancel immediately after starting
  const promise = analyzer.runAnalysis(
    {
      sources,
      goal: 'next_actions'
    },
    {
      activeModel: 'smollm2:360m'
    }
  );

  analyzer.cancel();

  await assert.rejects(
    async () => {
      await promise;
    },
    (err: any) => {
      return err.message?.includes('cancelled') || err.name === 'AbortError';
    }
  );

  assert.strictEqual(analyzer.running, false);

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});
