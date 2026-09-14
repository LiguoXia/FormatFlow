import { formatJson, unescapeText, JsonTree, TextError } from '../core/json';
import { formatSql } from '../core/sql';
import { propertiesToYaml, yamlToProperties } from '../core/config';
import { processText } from '../core/text';
let tree: JsonTree | undefined;
self.onmessage = (event) => {
  const { id, action, payload = {} } = event.data;
  try {
    let result: unknown;
    if (action === 'json') {
      const text = payload.format ? formatJson(payload.text, payload.indent) : payload.text;
      tree = new JsonTree(text);
      result = {text, tree: tree.slice(0, 100)};
    } else if (action === 'unescape') result = unescapeText(payload.text);
    else if (action === 'sql') result = formatSql(payload.text, payload.language, payload.indent);
    else if (action === 'config') result = payload.direction === 'toYaml' ? propertiesToYaml(payload.text, payload.infer) : yamlToProperties(payload.text);
    else if (action === 'text') result = processText(payload.text, payload.operation);
    else if (!tree) throw new Error('请先解析 JSON');
    else if (action === 'tree:toggle') result = tree.toggle(payload.id);
    else if (action === 'tree:expand') result = tree.expand(payload.all);
    else if (action === 'tree:slice') result = tree.slice(payload.start, payload.limit);
    else if (action === 'tree:copy') result = tree.copy(payload.id);
    else throw new Error('未知操作');
    self.postMessage({id, result});
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    self.postMessage({id, error: {message: err.message, ...(err instanceof TextError ? {offset: err.offset, line: err.line, column: err.column} : {})}});
  }
};
