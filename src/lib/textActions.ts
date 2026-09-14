import type { TextAction } from '../core/text';
export const textActionGroups = [
  {id: 'compact', label: '压缩与清理', actions: [
    {id: 'json-minify', label: 'JSON 压缩', description: '移除 JSON 结构空白，保留字符串内容、大整数与键顺序。'},
    {id: 'one-line', label: '文本压成一行', description: '将换行、制表符和连续空白合并为一个空格。'},
    {id: 'remove-whitespace', label: '去除全部空白', description: '删除所有空白字符，包括单词间空格与换行。'},
    {id: 'collapse-spaces', label: '合并多余空格', description: '连续空格或制表符合并为一个空格，保留换行。'},
    {id: 'trim-lines', label: '去除行首尾空白', description: '逐行清理首尾空白，保留行内内容。'},
    {id: 'remove-empty-lines', label: '删除空行', description: '删除空白行，也删除仅包含空格或制表符的行。'}
  ]},
  {id: 'case', label: '命名与大小写', actions: [
    {id: 'camel', label: '小驼峰 camelCase', description: 'user_name → userName；支持空格和短横线分词，保留标点与换行。'},
    {id: 'pascal', label: '大驼峰 PascalCase', description: 'user_name → UserName；缩写词会规范化，保留标点与换行。'},
    {id: 'snake', label: '下划线 snake_case', description: 'userName → user_name；支持 HTTPServer 等缩写词边界。'},
    {id: 'kebab', label: '短横线 kebab-case', description: 'userName → user-name；适合文件名和样式命名。'},
    {id: 'upper', label: '全部大写', description: '将所有字母转为大写，保留数字、标点和换行。'},
    {id: 'lower', label: '全部小写', description: '将所有字母转为小写，保留数字、标点和换行。'},
    {id: 'title', label: '单词首字母大写', description: '英文单词首字母大写，其余字母转为小写。'},
    {id: 'invert-case', label: '大小写反转', description: '大写变小写，小写变大写。'}
  ]},
  {id: 'lines', label: '按行整理', actions: [
    {id: 'dedupe-lines', label: '去重行', description: '按原文精确去重，保留第一次出现的行及原顺序。'},
    {id: 'sort-asc', label: '按行升序', description: '按自然顺序排序：item2 排在 item10 前面，支持中文。'},
    {id: 'sort-desc', label: '按行降序', description: '按自然顺序倒序排列，支持数字和中文。'},
    {id: 'reverse-lines', label: '倒置行顺序', description: '最后一行移到最前，逐行内容保持不变。'},
    {id: 'number-lines', label: '添加行号', description: '在每行前添加 1.、2. 等连续编号。'},
    {id: 'remove-line-numbers', label: '移除行号', description: '移除行首的数字编号，支持 1.、1)、1、格式。'}
  ]},
  {id: 'encoding', label: '编码与解码', actions: [
    {id: 'url-encode', label: 'URL 编码', description: '按 UTF-8 编码 URL 参数值；不要用于编码整个网址。'},
    {id: 'url-decode', label: 'URL 解码', description: '还原百分号编码；加号保留为加号。'},
    {id: 'base64-encode', label: 'Base64 编码', description: '以 UTF-8 编码文本，支持中文和 Emoji。'},
    {id: 'base64-decode', label: 'Base64 解码', description: '将 Base64 还原为 UTF-8 文本，格式错误会给出提示。'},
    {id: 'unicode-escape', label: 'Unicode 转义', description: '将中文、Emoji 与控制字符转为 Unicode 转义序列。'},
    {id: 'unicode-unescape', label: 'Unicode 还原', description: '支持 \\u4f60 与 \\u{1f600}，保留其他文本。'}
  ]}
] as const satisfies readonly {id: string; label: string; actions: readonly {id: TextAction; label: string; description: string}[]}[];
export const textActions = textActionGroups.flatMap((group) => [...group.actions]);
