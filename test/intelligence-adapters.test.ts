import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  detectSourceType,
  formatBytes,
  inspectSourceItem,
  ingestFileSource,
  ingestFolderSource
} from '../src/main/intelligence/adapters.ts';

test('detectSourceType: accurately categorizes supported and unsupported file formats', () => {
  // Markdown
  const md = detectSourceType('README.md');
  assert.strictEqual(md.type, 'markdown');
  assert.strictEqual(md.isSupported, true);

  // Plain Text
  const txt = detectSourceType('notes.txt');
  assert.strictEqual(txt.type, 'text');
  assert.strictEqual(txt.isSupported, true);

  // Code
  const ts = detectSourceType('App.tsx');
  assert.strictEqual(ts.type, 'code');
  assert.strictEqual(ts.isSupported, true);

  const py = detectSourceType('main.py');
  assert.strictEqual(py.type, 'code');
  assert.strictEqual(py.isSupported, true);

  // PDF
  const pdf = detectSourceType('spec.pdf');
  assert.strictEqual(pdf.type, 'pdf');
  assert.strictEqual(pdf.isSupported, true);

  // Image / Screenshot
  const png = detectSourceType('screenshot.png');
  assert.strictEqual(png.type, 'image');
  assert.strictEqual(png.isSupported, true);

  const jpg = detectSourceType('diagram.jpg');
  assert.strictEqual(jpg.type, 'image');
  assert.strictEqual(jpg.isSupported, true);

  // Unsupported Archives
  const zip = detectSourceType('archive.zip');
  assert.strictEqual(zip.type, 'unsupported');
  assert.strictEqual(zip.isSupported, false);
  assert.match(zip.reason || '', /archive/i);

  // Unsupported Executables
  const exe = detectSourceType('installer.exe');
  assert.strictEqual(exe.type, 'unsupported');
  assert.strictEqual(exe.isSupported, false);
  assert.match(exe.reason || '', /binary/i);

  // Unsupported Office format
  const docx = detectSourceType('document.docx');
  assert.strictEqual(docx.type, 'unsupported');
  assert.strictEqual(docx.isSupported, false);
  assert.match(docx.reason || '', /office/i);

  // Unknown extension
  const xyz = detectSourceType('unknown.xyz123');
  assert.strictEqual(xyz.type, 'unsupported');
  assert.strictEqual(xyz.isSupported, false);
});

test('formatBytes: formats file sizes readably', () => {
  assert.strictEqual(formatBytes(0), '0 B');
  assert.strictEqual(formatBytes(512), '512 B');
  assert.strictEqual(formatBytes(2048), '2 KB');
  assert.strictEqual(formatBytes(1048576), '1 MB');
});

test('inspectSourceItem and ingestFileSource: parses text and markdown files', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-adapter-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const mdPath = join(testDir, 'roadmap.md');
  const mdContent = '# Project Roadmap\n- [ ] Release v1.0\nTODO: Fix UI glitch before release';
  await fs.writeFile(mdPath, mdContent, 'utf-8');

  // Inspect source item
  const inspected = await inspectSourceItem(mdPath);
  assert.strictEqual(inspected.status, 'ready');
  assert.strictEqual(inspected.type, 'markdown');
  assert.strictEqual(inspected.name, 'roadmap.md');
  assert.strictEqual(inspected.sizeBytes, Buffer.byteLength(mdContent));

  // Ingest source item
  const ingested = await ingestFileSource(mdPath);
  assert.strictEqual(ingested.status, 'ready');
  assert.strictEqual(ingested.sourceType, 'markdown');
  assert.strictEqual(ingested.extractedText, mdContent);
  assert.strictEqual(ingested.metadata.lineCount, 3);
  assert.strictEqual(ingested.evidenceLocations.length, 1);
  assert.strictEqual(ingested.evidenceLocations[0].lineStart, 1);
  assert.strictEqual(ingested.evidenceLocations[0].lineEnd, 3);

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ingestFileSource: safely handles unsupported and non-existent files', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-unsupported-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  // Unsupported zip file
  const zipPath = join(testDir, 'backup.zip');
  await fs.writeFile(zipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // zip header

  const inspectedZip = await inspectSourceItem(zipPath);
  assert.strictEqual(inspectedZip.status, 'unsupported');
  assert.ok(inspectedZip.warning?.includes('Archive'));

  const ingestedZip = await ingestFileSource(zipPath);
  assert.strictEqual(ingestedZip.status, 'unsupported');
  assert.ok(ingestedZip.unsupportedReason?.includes('Archive'));
  assert.strictEqual(ingestedZip.extractedText, '');

  // Non-existent file
  const missingPath = join(testDir, 'does-not-exist.txt');
  const inspectedMissing = await inspectSourceItem(missingPath);
  assert.strictEqual(inspectedMissing.status, 'error');
  assert.ok(inspectedMissing.warning?.includes('does not exist'));

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ingestFileSource: reads image metadata and base64 without attempting text parsing', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-image-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const imgPath = join(testDir, 'screenshot.png');
  const fakePngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
  await fs.writeFile(imgPath, fakePngBytes);

  const ingested = await ingestFileSource(imgPath);
  assert.strictEqual(ingested.status, 'ready');
  assert.strictEqual(ingested.sourceType, 'image');
  assert.strictEqual(ingested.mimeType, 'image/png');
  assert.strictEqual(ingested.metadata.isVisual, true);
  assert.ok(ingested.imageDataBase64);
  assert.strictEqual(ingested.imageDataBase64, fakePngBytes.toString('base64'));

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ingestFolderSource: recursively walks directory while skipping excluded dirs', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-folder-${randomUUID()}`);
  await fs.mkdir(join(testDir, 'src'), { recursive: true });
  await fs.mkdir(join(testDir, 'node_modules', 'foo'), { recursive: true });
  await fs.mkdir(join(testDir, '.git'), { recursive: true });

  await fs.writeFile(join(testDir, 'src', 'index.ts'), 'export const a = 1;', 'utf-8');
  await fs.writeFile(join(testDir, 'README.md'), '# Title\nDocumentation', 'utf-8');
  await fs.writeFile(join(testDir, 'node_modules', 'foo', 'package.json'), '{}', 'utf-8');
  await fs.writeFile(join(testDir, '.git', 'config'), 'repo config', 'utf-8');

  const sources = await ingestFolderSource(testDir);

  // Must include src/index.ts and README.md, but NOT node_modules or .git
  const paths = sources.map(s => s.relativePath);
  assert.ok(paths.some(p => p.includes('index.ts')));
  assert.ok(paths.some(p => p.includes('README.md')));
  assert.ok(!paths.some(p => p.includes('node_modules')));
  assert.ok(!paths.some(p => p.includes('.git')));

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});
