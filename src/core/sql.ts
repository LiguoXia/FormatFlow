import { format, type SqlLanguage } from 'sql-formatter';
import { sqlBatches } from './sqlBatches';
export function formatSql(text: string, language: SqlLanguage = 'mysql', indent = 2): string {
  if (!text.trim()) throw new Error('请先输入 SQL');
  return sqlBatches(text).map((batch) => format(batch, { language, tabWidth: indent, keywordCase: 'upper', linesBetweenQueries: 2 })).join('\n\n\n');
}
