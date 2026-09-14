import { createScanner } from 'jsonc-parser';
import { parseJson } from './json';

export type TextAction = 'json-minify' | 'one-line' | 'remove-whitespace' | 'collapse-spaces' |
  'camel' | 'pascal' | 'snake' | 'kebab' | 'upper' | 'lower' | 'title' | 'invert-case' |
  'trim-lines' | 'remove-empty-lines' | 'dedupe-lines' | 'sort-asc' | 'sort-desc' |
  'reverse-lines' | 'number-lines' | 'remove-line-numbers' |
  'url-encode' | 'url-decode' | 'base64-encode' | 'base64-decode' |
  'unicode-escape' | 'unicode-unescape';

export function minifyJson(text: string): string {
  parseJson(text);
  const scanner = createScanner(text, true);
  const parts: string[] = [];
  for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan()) parts.push(text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength()));
  return parts.join('');
}

function naming(text: string, style: 'camel' | 'pascal' | 'snake' | 'kebab') {
  return text.replace(/[\p{L}\p{M}\p{N}_-]+(?:[ \t]+[\p{L}\p{M}\p{N}_-]+)*/gu, (name) => {
    const prefix = name.match(/^[_-]+/)?.[0] ?? '';
    const suffix = name.match(/[_-]+$/)?.[0] ?? '';
    const middle = name.slice(prefix.length, suffix ? -suffix.length : undefined);
    const words = middle.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2').replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').split(/[_\-\s]+/u).filter(Boolean).map((word) => word.toLowerCase());
    if (!words.length) return name;
    const capitalize = (word: string) => { const [first, ...rest] = [...word]; return first.toUpperCase() + rest.join(''); };
    return prefix + (style === 'snake' || style === 'kebab' ? words.join(style === 'snake' ? '_' : '-') : words.map((word, i) => style === 'camel' && i === 0 ? word : capitalize(word)).join('')) + suffix;
  });
}

function mapLines(text: string, action: (lines: string[]) => string[]): string {
  const eol = text.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  const finalBreak = /(?:\r\n|\r|\n)$/.test(text);
  const lines = text.split(/\r\n|\r|\n/);
  if (finalBreak) lines.pop();
  const result = action(lines);
  return result.length ? result.join(eol) + (finalBreak ? eol : '') : '';
}
function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(''));
}
function decodeBase64(text: string) {
  let binary: string;
  try { binary = atob(text.replace(/[\t\n\f\r ]/g, '')); }
  catch { throw new Error('不是有效的 Base64 文本，请检查字符和末尾填充'); }
  try { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
  catch { throw new Error('Base64 内容不是有效的 UTF-8 文本'); }
}

export function processText(text: string, action: TextAction): string {
  if (text === '') return '';
  switch (action) {
    case 'json-minify': return minifyJson(text);
    case 'one-line': return text.replace(/\s+/gu, ' ').trim();
    case 'remove-whitespace': return text.replace(/\s+/gu, '');
    case 'collapse-spaces': return mapLines(text, (lines) => lines.map((line) => line.replace(/[^\S\r\n]+/gu, ' ')));
    case 'camel': case 'pascal': case 'snake': case 'kebab': return naming(text, action);
    case 'upper': return text.toUpperCase();
    case 'lower': return text.toLowerCase();
    case 'title': return text.toLowerCase().replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => { const [first, ...rest] = [...word]; return first.toUpperCase() + rest.join(''); });
    case 'invert-case': return [...text].map((char) => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()).join('');
    case 'trim-lines': return mapLines(text, (lines) => lines.map((line) => line.trim()));
    case 'remove-empty-lines': return mapLines(text, (lines) => lines.filter((line) => line.trim() !== ''));
    case 'dedupe-lines': return mapLines(text, (lines) => [...new Set(lines)]);
    case 'sort-asc': case 'sort-desc': {
      const collator = new Intl.Collator('zh-Hans-CN', {numeric: true, sensitivity: 'variant'});
      return mapLines(text, (lines) => lines.sort((a, b) => (action === 'sort-asc' ? 1 : -1) * collator.compare(a, b)));
    }
    case 'reverse-lines': return mapLines(text, (lines) => lines.reverse());
    case 'number-lines': return mapLines(text, (lines) => lines.map((line, i) => `${i + 1}. ${line}`));
    case 'remove-line-numbers': return mapLines(text, (lines) => lines.map((line) => line.replace(/^[ \t]*\d+[.)、][ \t]*/u, '')));
    case 'url-encode': return encodeURIComponent(text);
    case 'url-decode': try { return decodeURIComponent(text); } catch { throw new Error('URL 编码无效：请检查 % 后的十六进制字符或 UTF-8 字节'); }
    case 'base64-encode': return encodeBase64(text);
    case 'base64-decode': return decodeBase64(text);
    case 'unicode-escape': return text.replace(/[^\x20-\x7e]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
    case 'unicode-unescape': return text.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})/g, (_all, point: string | undefined, unit: string | undefined) => {
      const code = parseInt(point ?? unit!, 16);
      if (code > 0x10ffff) throw new Error('Unicode 码点超出有效范围');
      return point ? String.fromCodePoint(code) : String.fromCharCode(code);
    });
    default: throw new Error('不支持的文本处理操作');
  }
}
