import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { formatJson, JsonTree, parseJson, TextError, unescapeText } from '../src/core/json';
import { formatSql } from '../src/core/sql';
import { sqlBatches } from '../src/core/sqlBatches';
import { propertiesToYaml, yamlToProperties } from '../src/core/config';
import { dateToTimestamp, timestampToDate } from '../src/core/timestamp';

describe('JSON', () => {
  it('formats without losing integers, duplicate keys or exponent notation', () => {
    const source = '{"id":900719925474099312345,"n":1e+04,"n":-0}';
    const result = formatJson(source, 4);
    expect(result).toContain('    "id": 900719925474099312345');
    expect(result).toContain('"n": 1e+04');
    expect(result).toContain('"n": -0');
  });
  it.each(['{"x":}', '{"a":1,}', '{"a":1}// comment', '{"a":1}null', '{"x":"line\nbreak"}', '', '[1,]'])('rejects invalid standard JSON: %s', (text) => expect(() => parseJson(text)).toThrow(TextError));
  it('reports error coordinates', () => { try { parseJson('{\n  "a": }'); } catch (err) { expect(err).toMatchObject({line: 2, column: 8}); } });
  it('decodes exactly one layer of escapes and leaves unknown escapes alone', () => {
    expect(unescapeText('\\u4F60\\u597D\\n\\t\\r\\"\\\\')).toBe('你好\n\t\r"\\');
    expect(unescapeText(JSON.stringify('{"a":1}'))).toBe('{"a":1}');
    expect(unescapeText('\\\\n')).toBe('\\n');
    expect(unescapeText('path\\x')).toBe('path\\x');
  });
  it('shows first-level properties, lazily expands nested nodes and copies exact values', () => {
    const tree = new JsonTree('{"list":[1,{"a":true}],"big":900719925474099312345,"s":"hello\\nworld"}');
    const first = tree.slice(0, 100);
    expect(first.rows.map((r) => r.name)).toEqual(['', 'list', 'big', 's']);
    expect(first.rows[1].expanded).toBe(false);
    expect(tree.toggle(first.rows[1].id).total).toBe(6);
    expect(tree.copy(first.rows[2].id)).toBe('900719925474099312345');
    expect(tree.copy(first.rows[3].id)).toBe('hello\nworld');
    expect(tree.expand(true).total).toBe(7);
    expect(tree.expand(false).total).toBe(1);
  });
  it('virtualizes large trees to bounded slices', () => {
    const tree = new JsonTree(JSON.stringify(Array.from({length: 30000}, (_, i) => ({id: i}))));
    expect(tree.slice(0, 100).rows).toHaveLength(100);
    expect(tree.slice(20000, 100).rows[0].name).toBe('19999');
    expect(tree.expand(true).total).toBe(60001);
  });
  it('formats dense input with many whitespace edits in bounded time', () => {
    const data = Array.from({length: 15000}, (_, i) => ({id: i, name: 'FormatFlow', tags: ['local', 'fast']}));
    const started = performance.now();
    const result = formatJson(JSON.stringify(data), 2);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(JSON.parse(result)).toEqual(data);
  });
});
describe('SQL', () => {
  it('preserves literals, identifiers, conditions and joins', () => {
    const text = "select u.id, 'select FROM' as label, case when u.a > 1 then 'yes' else 'no' end as result from users u left join orders o on (u.id = o.user_id) where u.name = 'Tom' and o.amount >= 10 group by u.id, u.a order by u.id;";
    const result = formatSql(text);
    for (const value of ["'select FROM'", "'Tom'", 'u.id = o.user_id', 'o.amount >= 10', 'LEFT JOIN', 'GROUP BY', 'ORDER BY', 'CASE']) expect(result).toContain(value);
    expect(result.split('\n').length).toBeGreaterThan(10);
    expect(formatSql(result)).toBe(result);
  });
  it.each([['postgresql', "select id::text, now() from users where id = $1;"], ['plsql', 'select nvl(name, \'unknown\') from users where rownum <= 10;'], ['transactsql', 'select top 10 [name] from [users] where id = @id;']] as const)('formats %s', (dialect, source) => expect(formatSql(source, dialect)).toMatch(/SELECT/));
  it('rejects unterminated strings', () => expect(() => formatSql("select 'oops")).toThrow());
  it('batches statements without splitting quoted text, comments or procedural blocks', () => {
    const units = ["select ';', 'it''s;ok';", 'select $$a;b$$;', 'select $tag$a;b$tag$;', 'select [a;]]b] from t;', "select q'[a';b]' from dual;", "select nq'[a';b]' from dual;", 'select 1 /* outer /* ; */ ; */;', '-- ;\nselect 1;'];
    for (const unit of units) {
      const text = unit + unit;
      expect(sqlBatches(text, 1)).toEqual([unit, unit]);
    }
    const body = 'BEGIN select 1; select 2; END;';
    expect(sqlBatches(body, 1)).toEqual([body]);
    const disabled = '/* sql-formatter-disable */ invalid ; stuff ; /* sql-formatter-enable */ select 1;';
    expect(sqlBatches(disabled, 1)).toEqual([disabled]);
  });
  it('formats a batched script identically to separate statements', () => {
    const query = "select id, 'a;b' as s from users where name = 'Tom';";
    const many = query.repeat(1200);
    expect(formatSql(many)).toBe(Array(1200).fill(formatSql(query)).join('\n\n\n'));
  });
});
describe('Timestamp', () => {
  it('handles seconds, milliseconds and epoch across zones', () => {
    expect(timestampToDate('0', 'UTC').date).toBe('1970-01-01 00:00:00');
    expect(timestampToDate('1694419200000', 'Asia/Shanghai').date).toBe(timestampToDate('1694419200', 'Asia/Shanghai').date);
    expect(timestampToDate('0', 'Asia/Tokyo').date).toBe('1970-01-01 09:00:00');
    expect(timestampToDate('-1', 'UTC').date).toBe('1969-12-31 23:59:59');
  });
  it('roundtrips a time in Shanghai', () => { const result = dateToTimestamp('2026-09-11 10:30:00', 'Asia/Shanghai'); expect(timestampToDate(String(result.seconds), 'Asia/Shanghai').date).toBe('2026-09-11 10:30:00'); });
  it.each(['2026-02-29 00:00:00', '2026-13-01 00:00:00', '2026-01-01 25:00:00', 'bad', '2026-01-01'])('rejects invalid date %s', (text) => expect(() => dateToTimestamp(text, 'UTC')).toThrow());
  it('rejects nonexistent or ambiguous DST wall-clock times', () => {
    expect(() => dateToTimestamp('2026-03-08 02:30:00', 'America/New_York')).toThrow();
    expect(() => dateToTimestamp('2026-11-01 01:30:00', 'America/New_York')).toThrow();
  });
  it.each(['1.1', 'nan', '12345678901', '12345678901234'])('rejects invalid timestamp %s', (value) => expect(() => timestampToDate(value, 'UTC')).toThrow());
});
describe('Properties / YAML', () => {
  it('converts nested keys, typed scalars and Java escapes', () => {
    const result = parseYaml(propertiesToYaml('# comment\nserver.port=8080\napp.enabled=true\napp.name=\\u4F60\\u597D\napp.lines=hello\\nworld\napp.path=C:\\\\temp'));
    expect(result).toEqual({server: {port: 8080}, app: {enabled: true, name: '你好', lines: 'hello\nworld', path: 'C:\\temp'}});
  });
  it('supports separators, spaces, escaped keys and continuation', () => {
    expect(parseYaml(propertiesToYaml('a : 1\nb 2\nc=hello\\\n  world\na\\.b=v\\=x'))).toEqual({a: 1, b: 2, c: 'helloworld', 'a.b': 'v=x'});
  });
  it('keeps significant strings and large integer text', () => {
    expect(parseYaml(propertiesToYaml('pin=0012\nid=9007199254740993'))).toEqual({pin: '0012', id: '9007199254740993'});
    expect(parseYaml(propertiesToYaml('port=8080\non=true', false))).toEqual({port: '8080', on: 'true'});
  });
  it('roundtrips arrays, dotted keys and special values', () => {
    const yaml = 'users:\n  - name: Tom\n    active: true\n  - name: Amy\n    active: false\n"a.b": "line\\nnext"\n"a[0]": " leading "\n';
    expect(parseYaml(propertiesToYaml(yamlToProperties(yaml)))).toEqual(parseYaml(yaml));
  });
  it.each(['a=1\na.b=2', 'a.b=1\na=2', 'a=1\na=2', 'a[1]=x', 'a.x=1\na[0]=2', 'a=\\u12'])('rejects lossy or malformed properties %s', (text) => expect(() => propertiesToYaml(text)).toThrow());
  it.each(['x: []', 'x: {}', 'x: 1\nx: 2', 'x: &x [*x]', '- [unclosed', '123: value'])('rejects unsupported YAML %s', (text) => expect(() => yamlToProperties(text)).toThrow());
  it('prevents prototype pollution while handling literal properties', () => {
    const yaml = propertiesToYaml('__proto__.polluted=yes\nconstructor.name=test');
    expect(yaml).toContain('__proto__');
    expect(({} as any).polluted).toBeUndefined();
  });
  it('preserves large YAML integer digits in properties', () => expect(yamlToProperties('id: 900719925474099312345')).toBe('id=900719925474099312345\n'));
  it('handles literal backslash followed by u', () => expect(parseYaml(propertiesToYaml('path=C:\\\\users'))).toEqual({path: 'C:\\users'}));
  it.each(['x: !!binary SGVsbG8=', 'x: !!timestamp 2020-01-01', 'x: !custom abc'])('rejects YAML tags that properties cannot preserve: %s', (text) => expect(() => yamlToProperties(text)).toThrow());
});
