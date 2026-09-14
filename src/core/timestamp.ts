import { DateTime } from 'luxon';
export const TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
export const zones = ['Local', 'UTC', 'Asia/Shanghai', 'Asia/Tokyo'] as const;
export function zoneId(zone: string) { return zone === 'Local' ? 'local' : zone; }
export function timestampToDate(text: string, zone: string) {
  const value = text.trim();
  if (!/^-?(?:\d{1,10}|\d{13})$/.test(value)) throw new Error('请输入秒级（最多 10 位）或 13 位毫秒级整数时间戳');
  const unit = value.replace('-', '').length === 13 ? '毫秒' : '秒';
  const ms = Number(value) * (unit === '秒' ? 1000 : 1);
  const date = DateTime.fromMillis(ms, {zone: zoneId(zone)});
  if (!date.isValid) throw new Error('时间戳超出了支持的日期范围');
  return { date: date.toFormat(TIME_FORMAT), iso: date.toISO()!, seconds: Math.floor(ms / 1000), milliseconds: ms, unit };
}
export function dateToTimestamp(text: string, zone: string) {
  const value = text.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error('请使用 YYYY-MM-DD HH:mm:ss 格式');
  const date = DateTime.fromFormat(value, TIME_FORMAT, {zone: zoneId(zone), locale: 'en'});
  if (!date.isValid || date.toFormat(TIME_FORMAT) !== value) throw new Error('日期时间无效，请检查月份、日期或夏令时');
  if (date.getPossibleOffsets().length > 1) throw new Error('此本地时间处于夏令时重复区间，请改用 UTC 转换');
  return { seconds: Math.floor(date.toMillis() / 1000), milliseconds: date.toMillis(), iso: date.toISO()! };
}
