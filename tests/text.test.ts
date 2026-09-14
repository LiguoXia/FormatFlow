import { describe, expect, it } from 'vitest';
import { minifyJson, processText, type TextAction } from '../src/core/text';
import { textActions } from '../src/lib/textActions';

describe('JSON minification', () => {
  it('preserves string spaces and escapes, large numbers, exponent spelling and duplicate keys', () => {
    const input = '{\n  "id": 900719925474099312345, "a": "hello  world", "a": "x\\n y\\t\\\\end", "n": 1e+09\n}';
    expect(minifyJson(input)).toBe('{"id":900719925474099312345,"a":"hello  world","a":"x\\n y\\t\\\\end","n":1e+09}');
  });
  it.each(['[1, ]', '{"a":}', '// comment\n{}', '{x:1}'])('rejects invalid JSON instead of removing arbitrary whitespace: %s', (source) => expect(() => minifyJson(source)).toThrow());
  it.each([' null ', '  true\n', ' -0\t', ' " spaced  text " ', ' [ 1, {} , [] ] '])('supports every JSON root type: %s', (source) => expect(JSON.parse(minifyJson(source))).toEqual(JSON.parse(source)));
  it('handles a dense 10 MB document without quadratic concatenation', () => {
    const source = '[\n' + '  { "name": "FormatFlow", "ok": true },\n'.repeat(280000) + 'null]';
    const start = performance.now();
    const compact = minifyJson(source);
    expect(compact.startsWith('[{"name":"FormatFlow","ok":true},')).toBe(true);
    expect(compact.endsWith(',null]')).toBe(true);
    expect(compact.length).toBeLessThan(source.length);
    expect(performance.now() - start).toBeLessThan(10000);
  });
});

describe('Text naming and case', () => {
  it.each([
    ['camel', 'user_name\nHTTP_SERVER\nhello world', 'userName\nhttpServer\nhelloWorld'],
    ['pascal', 'user_name\nhttpServer\nhello-world', 'UserName\nHttpServer\nHelloWorld'],
    ['snake', 'userName\nHTTPServer\nXMLHttpRequest\nversion2Value', 'user_name\nhttp_server\nxml_http_request\nversion2_value'],
    ['kebab', 'userName\nHTTPServer', 'user-name\nhttp-server'],
    ['camel', '__user_name__ = first_value;\n你好_世界', '__userName__ = firstValue;\n你好世界'],
    ['snake', '\t  someField, anotherField\r\n__privateField__', '\t  some_field, another_field\r\n__private_field__'],
    ['upper', 'Hello, 你好! é\n123', 'HELLO, 你好! É\n123'],
    ['lower', 'HELLO, 你好! É\n123', 'hello, 你好! é\n123'],
    ['title', 'hELLO wORLD! 你好', 'Hello World! 你好'],
    ['invert-case', 'Hello WoRLD 你好 123', 'hELLO wOrld 你好 123']
  ] as const)('%s', (action, source, expected) => expect(processText(source, action)).toBe(expected));
});

describe('Text cleanup and lines', () => {
  it.each([
    ['one-line', '  hello  world\r\n\t你好  ', 'hello world 你好'],
    ['remove-whitespace', ' a b\t\r\n c\u3000', 'abc'],
    ['collapse-spaces', 'a  b\r\n  c\t d\r\n', 'a b\r\n c d\r\n'],
    ['trim-lines', ' a \r\n b\t\r\n', 'a\r\nb\r\n'],
    ['remove-empty-lines', 'a\n \n\tb\n\n', 'a\n\tb\n'],
    ['remove-empty-lines', '\n  \n\t', ''],
    ['dedupe-lines', 'b\na\nb\nA\na\n', 'b\na\nA\n'],
    ['sort-asc', 'item10\nitem2\nitem1', 'item1\nitem2\nitem10'],
    ['sort-desc', 'item1\nitem10\nitem2\n', 'item10\nitem2\nitem1\n'],
    ['reverse-lines', 'a\r\nb\r\nc\r\n', 'c\r\nb\r\na\r\n'],
    ['number-lines', 'a\nb\n', '1. a\n2. b\n'],
    ['remove-line-numbers', '1. a\n2) b\n3、c\n123value\n', 'a\nb\nc\n123value\n']
  ] as const)('%s', (action, source, expected) => expect(processText(source, action)).toBe(expected));
});

describe('Text encoding', () => {
  it('roundtrips UTF-8 Base64 and accepts wrapped input', () => {
    const source = '你好，FormatFlow 👋\nnext\tline';
    const encoded = processText(source, 'base64-encode');
    expect(processText(encoded.slice(0, 8) + '\r\n' + encoded.slice(8), 'base64-decode')).toBe(source);
  });
  it('does not spread a large byte array into one function call', () => {
    const source = '你好 👋'.repeat(40000);
    expect(processText(processText(source, 'base64-encode'), 'base64-decode')).toBe(source);
  });
  it.each(['@@@', 'a', 'a=b=', '/w=='])('reports malformed Base64 / non-UTF8 payloads: %s', (source) => expect(() => processText(source, 'base64-decode')).toThrow());
  it('roundtrips URL values without silently changing + to space', () => {
    const source = '你好 +/?&=👋';
    expect(processText(processText(source, 'url-encode'), 'url-decode')).toBe(source);
    expect(processText('a+b', 'url-decode')).toBe('a+b');
    expect(() => processText('%ZZ', 'url-decode')).toThrow();
    expect(() => processText('%FF', 'url-decode')).toThrow();
  });
  it('handles Unicode code points and surrogate pairs', () => {
    expect(processText('你好 👋\n', 'unicode-escape')).toBe('\\u4f60\\u597d \\ud83d\\udc4b\\u000a');
    expect(processText('\\u4f60\\u597d \\u{1f44b}\\n', 'unicode-unescape')).toBe('你好 👋\\n');
    expect(() => processText('\\u{110000}', 'unicode-unescape')).toThrow();
  });
  it.each(textActions.map(({id}) => id))('all registered actions handle empty input: %s', (action) => expect(processText('', action)).toBe(''));
  it('rejects unknown actions', () => expect(() => processText('hello', 'missing' as TextAction)).toThrow());
});
