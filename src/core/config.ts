import { parseDocument, stringify } from 'yaml';

function decode(text: string) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\' || i + 1 === text.length) { result += text[i]; continue; }
    const value = text[++i];
    if (value === 'u') {
      const digits = text.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(digits)) throw new Error('Properties 包含不完整的 Unicode 转义');
      result += String.fromCharCode(parseInt(digits, 16)); i += 4;
    } else result += ({n: '\n', r: '\r', t: '\t', f: '\f'} as Record<string, string>)[value] ?? value;
  }
  return result;
}
function keyPath(raw: string): (string | number)[] {
  const tokens: (string | number)[] = []; let part = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '\\' && i + 1 < raw.length) { part += char + raw[++i]; continue; }
    if (char === '.') { if (part) { tokens.push(decode(part)); part = ''; } else if (raw[i - 1] !== ']') throw new Error('属性路径含空层级'); continue; }
    if (char === '[') {
      if (part) { tokens.push(decode(part)); part = ''; }
      const match = raw.slice(i).match(/^\[(0|[1-9]\d*)\]/);
      if (!match || Number(match[1]) > 100000) throw new Error('数组下标无效（支持 0～100000），字面方括号请用反斜杠转义');
      tokens.push(Number(match[1])); i += match[0].length - 1;
      if (i + 1 < raw.length && raw[i + 1] !== '.' && raw[i + 1] !== '[') throw new Error('数组下标后缺少层级分隔符');
      continue;
    }
    part += char;
  }
  if (part) tokens.push(decode(part));
  if (!tokens.length || raw.endsWith('.') || tokens.length > 128) throw new Error('属性路径为空、结尾无效或层级超过 128');
  return tokens;
}
function scalar(value: string, infer: boolean): unknown {
  if (!infer) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number))) return number;
  }
  return value;
}
export function propertiesToYaml(text: string, infer = true): string {
  const physical = text.replace(/\r\n?/g, '\n').split('\n');
  const entries: {path: (string | number)[]; value: unknown}[] = [];
  for (let line = 0; line < physical.length; line++) {
    let content = physical[line].trimStart();
    if (!content || /^[#!]/.test(content)) continue;
    while ((content.match(/\\+$/)?.[0].length ?? 0) % 2 === 1) {
      if (line + 1 >= physical.length) throw new Error('文件末尾存在未完成的续行');
      content = content.slice(0, -1) + physical[++line].trimStart();
    }
    let split = content.length;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\\') { i++; continue; }
      if (/[\s=:]/.test(content[i])) { split = i; break; }
    }
    const rawKey = content.slice(0, split);
    let valueStart = split;
    while (/\s/.test(content[valueStart] ?? '') && valueStart < content.length) valueStart++;
    if (content[valueStart] === '=' || content[valueStart] === ':') valueStart++;
    while (/\s/.test(content[valueStart] ?? '') && valueStart < content.length) valueStart++;
    entries.push({path: keyPath(rawKey), value: scalar(decode(content.slice(valueStart)), infer)});
  }
  if (!entries.length) throw new Error('没有可转换的 Properties 属性');
  const root: any = typeof entries[0].path[0] === 'number' ? [] : Object.create(null);
  for (const {path, value} of entries) {
    let node = root;
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (Array.isArray(node) !== (typeof key === 'number')) throw new Error('同一路径混用了对象和数组');
      const exists = Object.hasOwn(node, key);
      if (i === path.length - 1) {
        if (exists) throw new Error(`属性重复或层级冲突：${path.join('.')}`);
        node[key] = value;
      } else {
        if (!exists) node[key] = typeof path[i + 1] === 'number' ? [] : Object.create(null);
        else if (node[key] === null || typeof node[key] !== 'object') throw new Error(`属性层级冲突：${path.join('.')}`);
        node = node[key];
      }
    }
  }
  const check = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node) && Object.keys(node).length !== node.length) throw new Error('数组下标必须从 0 开始连续，不能跳过元素');
    Object.values(node).forEach(check);
  };
  check(root);
  return stringify(root, {indent: 2, lineWidth: 0});
}
function escapeKey(key: string) { return key.replace(/\\/g, '\\\\').replace(/[.\[\]=:#!\s]/g, (c) => ({'\n': '\\n', '\r': '\\r', '\t': '\\t'} as Record<string,string>)[c] ?? '\\' + c); }
function escapeValue(value: unknown) { return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/\f/g, '\\f').replace(/^ +/, (spaces) => spaces.replace(/ /g, '\\ ')); }
export function yamlToProperties(text: string): string {
  const doc = parseDocument(text, {uniqueKeys: true, intAsBigInt: true});
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  if (doc.warnings.length) throw new Error(doc.warnings[0].message);
  const data: unknown = doc.toJS({mapAsMap: true, maxAliasCount: 100});
  const lines: string[] = [];
  const ancestors = new Set<unknown>();
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 128) throw new Error('配置嵌套层级不能超过 128');
    if (value instanceof Map || Array.isArray(value)) {
      if (ancestors.has(value)) throw new Error('不支持包含循环引用的 YAML');
      if ((value instanceof Map ? value.size : value.length) === 0) throw new Error(`Properties 无法无损表示空对象或空数组：${path || '根节点'}`);
      ancestors.add(value);
      if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${path}[${i}]`, depth + 1));
      else for (const [key, item] of value) {
        if (typeof key !== 'string' || !key) throw new Error('YAML 属性名必须是非空字符串');
        visit(item, path ? `${path}.${escapeKey(key)}` : escapeKey(key), depth + 1);
      }
      ancestors.delete(value);
    } else {
      if (!path) throw new Error('YAML 根节点必须是对象或数组');
      if (value !== null && !['string', 'number', 'bigint', 'boolean'].includes(typeof value)) throw new Error(`Properties 不支持此 YAML 特殊类型：${path}`);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Properties 不支持无穷大或 NaN');
      lines.push(`${path}=${escapeValue(value)}`);
    }
  };
  visit(data, '', 0);
  return lines.join('\n') + '\n';
}
