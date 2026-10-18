import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ClipboardStore } from '../src/main/clipboard/store.ts';
import { ClipboardService, type ClipboardAdapter } from '../src/main/clipboard/service.ts';
import { isSensitiveText, detectContentType, createClipboardHash } from '../src/main/clipboard/sensitive.ts';

class MockClipboardAdapter implements ClipboardAdapter {
  public content = '';
  public writes: string[] = [];

  readText(): string {
    return this.content;
  }

  writeText(text: string): void {
    this.content = text;
    this.writes.push(text);
  }
}

test('Clipboard Memory: disabled by default and loads clean settings', async () => {
  const testDir = join(tmpdir(), `recall-desk-clipboard-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const store = new ClipboardStore(testDir);
  await store.load();

  const settings = store.getSettings();
  assert.strictEqual(settings.enabled, false, 'Clipboard capture MUST be disabled by default');
  assert.strictEqual(settings.paused, false);
  assert.strictEqual(settings.filterSensitiveData, true);
  assert.strictEqual(settings.retentionLimit, 200);

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('Sensitive Data Detection: detects API keys, private keys, connection strings, and passwords', () => {
  // OpenAI API Key
  assert.strictEqual(isSensitiveText('sk-' + 'abcdef1234567890abcdef1234567890').isSensitive, true);

  // GitHub tokens
  assert.strictEqual(isSensitiveText('gh' + 'p_123456789012345678901234567890123456').isSensitive, true);
  assert.strictEqual(isSensitiveText('github_pat_' + '11AAAAAAA01234567890_abcdefghijklmnopqrstuvwxyz1234567890').isSensitive, true);

  // AWS Access Key ID
  assert.strictEqual(isSensitiveText(['AKIA', 'IOSFODNN7EXAMPLE'].join('')) .isSensitive, true);

  // Private key
  const privKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
  assert.strictEqual(isSensitiveText(privKey).isSensitive, true);

  // Database URI with credentials
  assert.strictEqual(isSensitiveText('postgres://postgres:SuperSecretPassword123@db.example.com:5432/mydb').isSensitive, true);
  assert.strictEqual(isSensitiveText('mongodb+srv://admin:MySecretPass99@cluster0.mongodb.net/test').isSensitive, true);

  // Config password assignment
  assert.strictEqual(isSensitiveText('DB_PASSWORD = "VerySecureSecretPassword99"').isSensitive, true);

  // Normal code snippet / command should NOT be sensitive
  assert.strictEqual(isSensitiveText('npm install lucide-react --save').isSensitive, false);
  assert.strictEqual(isSensitiveText('const PORT = 3000; console.log(`Listening on ${PORT}`);').isSensitive, false);
});

test('Content Type Detection: classifies code, command, url, json, and text', () => {
  // URLs
  assert.strictEqual(detectContentType('https://developer.mozilla.org/en-US/docs/Web/API'), 'url');

  // Commands
  assert.strictEqual(detectContentType('git commit -m "feat: add clipboard memory"'), 'command');
  assert.strictEqual(detectContentType('docker run -d -p 8080:80 nginx:alpine'), 'command');
  assert.strictEqual(detectContentType('$ kubectl get pods -n kube-system'), 'command');

  // JSON
  assert.strictEqual(detectContentType('{"name": "recall-desk", "version": "1.0.0"}'), 'json');

  // Code
  assert.strictEqual(detectContentType('function calculateSum(a: number, b: number): number {\n  return a + b;\n}'), 'code');
  assert.strictEqual(detectContentType('SELECT id, name, created_at FROM users WHERE status = "active";'), 'code');

  // Plain Text
  assert.strictEqual(detectContentType('Meeting notes: Remember to discuss architecture milestones tomorrow at 10 AM.'), 'text');
});

test('ClipboardStore: stores new text, updates duplicate timestamp, and respects retention limits', async () => {
  const testDir = join(tmpdir(), `recall-desk-clipboard-store-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const store = new ClipboardStore(testDir);
  await store.load();

  // 1. Add valid item
  const res1 = await store.addItem('git checkout -b feature/clipboard');
  assert.strictEqual(res1.status, 'added');
  assert.ok(res1.item);
  assert.strictEqual(res1.item.contentType, 'command');

  // 2. Add exact duplicate: should update timestamp and NOT create new entry
  const firstId = res1.item.id;
  const res2 = await store.addItem('git checkout -b feature/clipboard');
  assert.strictEqual(res2.status, 'duplicate_updated');
  assert.ok(res2.item);
  assert.strictEqual(res2.item.id, firstId);
  assert.strictEqual(store.listItems().length, 1);

  // 3. Sensitive text is filtered
  const resSensitive = await store.addItem('export STRIPE_SECRET_KEY=' + 'sk_' + 'live_' + '123456789012345678901234');
  assert.strictEqual(resSensitive.status, 'filtered');
  assert.strictEqual(resSensitive.item, null);
  assert.strictEqual(store.listItems().length, 1);

  // 4. Too short / too long text is filtered
  const resShort = await store.addItem('hi');
  assert.strictEqual(resShort.status, 'filtered');

  // 5. Test Retention Limits (set to 3 for testing)
  await store.updateSettings({ retentionLimit: 3 });
  await store.addItem('Item number two for retention testing');
  await store.addItem('Item number three for retention testing');
  await store.addItem('Item number four for retention testing');
  await store.addItem('Item number five for retention testing');

  // Should cap at 3 items
  const itemsAfterRetention = store.listItems();
  assert.strictEqual(itemsAfterRetention.length, 3);

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ClipboardStore: search, pin/unpin, labeling, and deleting items', async () => {
  const testDir = join(tmpdir(), `recall-desk-clipboard-ops-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const store = new ClipboardStore(testDir);
  await store.load();

  const add1 = await store.addItem('curl -X POST https://api.example.com/v1/auth -d "user=test"');
  const add2 = await store.addItem('docker-compose up -d postgres redis');
  const add3 = await store.addItem('npm install @huggingface/transformers');

  assert.ok(add1.item && add2.item && add3.item);

  // Search keyword
  const searchResults = store.search('docker-compose');
  assert.strictEqual(searchResults.length, 1);
  assert.strictEqual(searchResults[0].item.id, add2.item.id);

  // Search URL / domain
  const searchAuth = store.search('api.example.com');
  assert.strictEqual(searchAuth.length, 1);
  assert.strictEqual(searchAuth[0].item.id, add1.item.id);

  // Pin item
  const pinnedItem = await store.pinItem(add3.item.id, true);
  assert.strictEqual(pinnedItem?.isPinned, true);

  const pinnedList = store.listItems({ pinnedOnly: true });
  assert.strictEqual(pinnedList.length, 1);
  assert.strictEqual(pinnedList[0].id, add3.item.id);

  // Set Label
  const labeledItem = await store.setLabel(add3.item.id, 'HuggingFace Install Command');
  assert.strictEqual(labeledItem?.label, 'HuggingFace Install Command');

  // Search by label
  const searchByLabel = store.search('HuggingFace');
  assert.strictEqual(searchByLabel.length, 1);
  assert.strictEqual(searchByLabel[0].item.id, add3.item.id);

  // Delete item
  const deleteSuccess = await store.deleteItem(add1.item.id);
  assert.strictEqual(deleteSuccess, true);
  assert.strictEqual(store.getItem(add1.item.id), null);
  assert.strictEqual(store.listItems().length, 2);

  // Clear history while preserving pinned items
  const clearedCount = await store.clearHistory(true);
  assert.strictEqual(clearedCount, 1); // Only add2 was unpinned
  assert.strictEqual(store.listItems().length, 1);
  assert.strictEqual(store.listItems()[0].id, add3.item.id); // Pinned item preserved!

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});

test('ClipboardService: monitors via mock adapter without capturing when disabled', async () => {
  const testDir = join(tmpdir(), `recall-desk-clipboard-service-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  const store = new ClipboardStore(testDir);
  await store.load();

  const mockAdapter = new MockClipboardAdapter();
  mockAdapter.content = 'Initial pre-existing text before enabling';

  const capturedEvents: any[] = [];
  const service = new ClipboardService(store, (item, status) => {
    capturedEvents.push({ item, status });
  }, mockAdapter);

  // 1. Service shouldn't start polling when disabled
  service.start();
  assert.strictEqual(service.isRunning, false);

  // 2. Enable service
  await store.updateSettings({ enabled: true });
  service.start();
  assert.strictEqual(service.isRunning, true);

  // 3. User copies new command
  mockAdapter.content = 'npm run dev -- --host';
  const poll1 = await service.pollOnce();
  assert.strictEqual(poll1.status, 'added');
  assert.strictEqual(poll1.item?.text, 'npm run dev -- --host');
  assert.strictEqual(capturedEvents.length, 1);

  // 4. Repeated poll with unchanged content does nothing
  const poll2 = await service.pollOnce();
  assert.strictEqual(poll2.status, 'unchanged');
  assert.strictEqual(capturedEvents.length, 1);

  // 5. Copying from RecallDesk itself
  service.copyToClipboard('export const RECALL_DESK_VERSION = "0.1.0";');
  assert.strictEqual(mockAdapter.writes.length, 1);
  // Next poll shouldn't create redundant capture of internal copy
  const poll3 = await service.pollOnce();
  assert.strictEqual(poll3.status, 'unchanged');

  // 6. Stop service immediately when disabled
  service.stop();
  assert.strictEqual(service.isRunning, false);

  // Clean up
  await fs.rm(testDir, { recursive: true, force: true });
});
