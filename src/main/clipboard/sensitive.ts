import { createHash } from 'node:crypto';
import type { ClipboardContentType } from './types.ts';

// Conservative sensitive patterns: API keys, tokens, credentials, private keys
const SENSITIVE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // Private keys
  { name: 'Private Key Header', regex: /-----BEGIN\s+([A-Z\s]+)?PRIVATE\s+KEY-----/i },
  { name: 'OpenSSH Private Key', regex: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/i },
  { name: 'RSA Private Key', regex: /-----BEGIN\s+RSA\s+PRIVATE\s+KEY-----/i },
  
  // Specific known API keys & Tokens
  { name: 'OpenAI API Key', regex: /\bsk-[a-zA-Z0-9_-]{20,}\b/ },
  { name: 'GitHub Classic Token', regex: /\bghp_[a-zA-Z0-9]{36}\b/ },
  { name: 'GitHub Fine-Grained Token', regex: /\bgithub_pat_[a-zA-Z0-9_]{50,}\b/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Stripe Secret Key', regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/ },
  { name: 'Slack Bot Token', regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/ },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  
  // High-entropy bearer tokens & JWTs
  { name: 'JSON Web Token (JWT)', regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/ },
  { name: 'Authorization Bearer Header', regex: /\bBearer\s+[a-zA-Z0-9\-._~+/]{25,}=*\b/i },
  
  // Database connection strings containing user:password@host
  { name: 'Database Connection URI with Password', regex: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s]+:[^@\s]+@[^\s/]+/i },
  
  // Common password or secret assignments in config/env
  { name: 'Password assignment', regex: /(?:^|[\r\n;&|])\s*(?:[a-zA-Z0-9_]*(?:password|passwd|secret|api_key|access_token))\s*[:=]\s*["']?[^\s"']{8,}["']?/i }
];

export function isSensitiveText(text: string): { isSensitive: boolean; reason?: string } {
  if (!text || text.trim().length === 0) {
    return { isSensitive: false };
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.regex.test(text)) {
      return {
        isSensitive: true,
        reason: `Matches sensitive pattern: ${pattern.name}`
      };
    }
  }

  return { isSensitive: false };
}

export function detectContentType(text: string): ClipboardContentType {
  const trimmed = text.trim();

  // 1. URL check
  if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed) && !trimmed.includes('\n')) {
    return 'url';
  }

  // 2. JSON check
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // not valid JSON, continue checking
    }
  }

  // 3. Command check (single or multi-line shell command)
  const commandPrefixes = [
    '$ ', 'sudo ', 'npm ', 'pnpm ', 'yarn ', 'git ', 'docker ', 'kubectl ',
    'curl ', 'wget ', 'brew ', 'cargo ', 'ssh ', 'npx ', 'pip ', 'make ',
    'python ', 'node ', 'cat ', 'grep ', 'systemctl '
  ];
  const firstLine = trimmed.split('\n')[0].trim();
  if (commandPrefixes.some(prefix => firstLine.startsWith(prefix))) {
    return 'command';
  }

  // 4. Code check
  const codeIndicators = [
    /\b(function|const|let|var|class|interface|type|import|export|return)\b/,
    /\b(def|elif|lambda|import\s+\w+|from\s+\w+\s+import)\b/,
    /\b(public|private|protected|void|static)\b/,
    /\b(SELECT\s+.*\s+FROM|INSERT\s+INTO|UPDATE\s+.*\s+SET|DELETE\s+FROM)\b/i,
    /=>|\{|\};|<!--|<\/?[\w\d]+>/
  ];
  if (codeIndicators.some(pattern => pattern.test(trimmed))) {
    return 'code';
  }

  return 'text';
}

export function createClipboardHash(text: string): string {
  // Normalize whitespace to prevent trivial duplicates (e.g. trailing newlines)
  const normalized = text.trim().replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
