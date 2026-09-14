import { parseTree, printParseErrorCode, format, type Node, type ParseError } from 'jsonc-parser';

export class TextError extends Error {
  constructor(message: string, public offset = 0, public line = 1, public column = 1) { super(message); }
}
export function parseJson(text: string): Node {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true, allowEmptyContent: false });
  if (errors.length || !root) {
    const error = errors[0];
    const offset = Math.min(error?.offset ?? 0, text.length);
    const before = text.slice(0, offset).split('\n');
    const names: Record<string, string> = {
      InvalidSymbol: '存在非法字符', InvalidNumberFormat: '数字格式不正确', PropertyNameExpected: '需要双引号包围的属性名',
      ValueExpected: '缺少有效的值', ColonExpected: '缺少冒号 :', CommaExpected: '缺少逗号 ,', CloseBraceExpected: '缺少右花括号 }',
      CloseBracketExpected: '缺少右方括号 ]', EndOfFileExpected: 'JSON 结束后存在多余内容', InvalidCommentToken: '标准 JSON 不支持注释',
      UnexpectedEndOfString: '字符串未闭合', InvalidEscapeCharacter: '无效的转义字符', InvalidUnicode: '无效的 Unicode 转义',
      InvalidCharacter: '字符串中存在未转义的控制字符'
    };
    const code = error ? printParseErrorCode(error.error) : 'ValueExpected';
    throw new TextError(names[code] ?? code, offset, before.length, before.at(-1)!.length + 1);
  }
  return root;
}
export function formatJson(text: string, indent: number): string {
  parseJson(text);
  // Token-based formatting preserves large integers, duplicate keys and numeric spelling.
  // Apply edits in one pass. Repeated whole-string replacement is quadratic on large JSON.
  const edits = format(text, undefined, { tabSize: indent, insertSpaces: true, eol: '\n' });
  const parts: string[] = []; let offset = 0;
  for (const edit of edits) { parts.push(text.slice(offset, edit.offset), edit.content); offset = edit.offset + edit.length; }
  parts.push(text.slice(offset));
  return parts.join('');
}
export function unescapeText(text: string): string {
  if (!text.trim()) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
  } catch { /* Also accepts escaped fragments without outer quotes. */ }
  return text.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (match) => JSON.parse('"' + match + '"'));
}

export interface TreeRow {
  id: number; depth: number; name: string; kind: string; value: string;
  count: number; container: boolean; expanded: boolean;
}
export class JsonTree {
  private root: Node;
  private nodes = new Map<number, Node>();
  private open = new Set<number>();
  private all = false;
  private closed = new Set<number>();
  private visible: { node: Node; name: string; depth: number }[] = [];
  constructor(private text: string) { this.root = parseJson(text); this.open.add(this.root.offset); this.rebuild(); }
  private isOpen(node: Node) { return this.all ? !this.closed.has(node.offset) : this.open.has(node.offset); }
  private rebuild() {
    this.visible = [];
    this.nodes.clear();
    const stack = [{node: this.root, name: '', depth: 0}];
    while (stack.length) {
      const item = stack.pop()!;
      this.visible.push(item);
      this.nodes.set(item.node.offset, item.node);
      if (!this.isOpen(item.node)) continue;
      const children = item.node.children ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (item.node.type === 'object') stack.push({node: child.children![1], name: String(child.children![0].value), depth: item.depth + 1});
        else if (item.node.type === 'array') stack.push({node: child, name: String(i), depth: item.depth + 1});
      }
    }
  }
  toggle(id: number) {
    if (this.all) this.closed.has(id) ? this.closed.delete(id) : this.closed.add(id);
    else this.open.has(id) ? this.open.delete(id) : this.open.add(id);
    this.rebuild(); return this.slice(0, 100);
  }
  expand(all: boolean) { this.all = all; this.open.clear(); this.closed.clear(); this.rebuild(); return this.slice(0, 100); }
  slice(start: number, limit: number) {
    const rows: TreeRow[] = this.visible.slice(start, start + limit).map(({node, name, depth}) => {
      const container = node.type === 'object' || node.type === 'array';
      const raw = this.text.slice(node.offset, node.offset + Math.min(node.length, 200));
      return { id: node.offset, depth, name, kind: node.type, value: container ? '' : raw + (node.length > 200 ? '…' : ''), count: node.children?.length ?? 0, container, expanded: this.isOpen(node) };
    });
    return { rows, total: this.visible.length, start };
  }
  copy(id: number) {
    const node = this.nodes.get(id);
    if (!node) throw new Error('节点已失效，请重新解析');
    return node.type === 'string' ? String(node.value) : this.text.slice(node.offset, node.offset + node.length);
  }
}
