/** Split large scripts only at complete, top-level statements. Source text is
 * never rewritten here: quoted semicolons, comments and procedural blocks stay
 * intact. Small scripts use the formatter's original whole-script path. */
export function sqlBatches(text: string, targetSize = 48 * 1024): string[] {
  if (text.length <= targetSize) return [text];
  const batches: string[] = [];
  let start = 0, parentheses = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '-' && next === '-' || char === '#') {
      const end = text.indexOf('\n', i); if (end < 0) break; i = end; continue;
    }
    if (char === '/' && next === '*') {
      const begin = i; let depth = 1; i += 2;
      for (; i < text.length && depth; i++) {
        if (text[i] === '/' && text[i + 1] === '*') { depth++; i++; }
        else if (text[i] === '*' && text[i + 1] === '/') { depth--; i++; }
      }
      if (depth) return [text];
      if (/sql-formatter-disable/.test(text.slice(begin, i))) {
        const enable = /\/\*\s*sql-formatter-enable\s*\*\//g;
        enable.lastIndex = i;
        const match = enable.exec(text);
        if (!match) return [text];
        i = match.index + match[0].length;
      }
      i--; continue;
    }
    if ((char === 'n' || char === 'N') && (next === 'q' || next === 'Q') && text[i + 2] === "'") i++;
    if ((text[i] === 'q' || text[i] === 'Q') && text[i + 1] === "'") {
      const opening = text[i + 2];
      const closing = ({'[': ']', '{': '}', '(': ')', '<': '>'} as Record<string,string>)[opening] ?? opening;
      const end = text.indexOf(closing + "'", i + 3);
      if (end < 0) return [text];
      i = end + 1; continue;
    }
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      const closing = char === '[' ? ']' : char; let closed = false;
      for (i++; i < text.length; i++) {
        if (text[i] === '\\' && char !== '[') { i++; continue; }
        if (text[i] === closing) { if (text[i + 1] === closing) { i++; continue; } closed = true; break; }
      }
      if (!closed) return [text];
      continue;
    }
    if (char === '$') {
      const tag = text.slice(i, i + 130).match(/^\$(?:[a-zA-Z_][\w]*\$|\$)/)?.[0];
      if (tag) { const end = text.indexOf(tag, i + tag.length); if (end < 0) return [text]; i = end + tag.length - 1; continue; }
    }
    if (/[a-zA-Z_]/.test(char)) {
      const begin = i;
      while (i + 1 < text.length && /[a-zA-Z0-9_$]/.test(text[i + 1])) i++;
      // Procedural syntax and client delimiters are delegated as one unit.
      if (/^(BEGIN|DECLARE|PROCEDURE|FUNCTION|TRIGGER|DELIMITER)$/i.test(text.slice(begin, i + 1))) return [text];
      continue;
    }
    if (char === '(') parentheses++;
    if (char === ')') parentheses--;
    if (char === ';' && parentheses === 0 && i - start >= targetSize) { batches.push(text.slice(start, i + 1)); start = i + 1; }
  }
  if (start < text.length && text.slice(start).trim()) batches.push(text.slice(start));
  return batches.length ? batches : [text];
}
