import { useEffect, useRef, useState } from 'react';
import { Braces, ChevronDown, ChevronRight, Copy, ListTree } from 'lucide-react';
import type { TreeRow } from '../core/json';
import { ToolWorker } from '../lib/worker';
import { copyText } from '../lib/clipboard';
import type { Notify } from './common';
export interface TreeSlice {rows: TreeRow[]; total: number; start: number;}
export default function JsonTreeView({initial, worker, notify, onSelect, mode}: {initial: TreeSlice | null; worker: ToolWorker; notify: Notify; onSelect(id: number): void; mode: {all: boolean; revision: number}}) {
  const [data, setData] = useState(initial);
  const scroll = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const lastStart = useRef(0);
  useEffect(() => { request.current++; setData(initial); lastStart.current = 0; if (scroll.current) scroll.current.scrollTop = 0; }, [initial]);
  useEffect(() => {
    if (!mode.revision || !initial) return;
    refresh('tree:expand', {all: mode.all});
  }, [mode]);
  useEffect(() => () => { request.current++; }, []);
  async function refresh(action: string, payload: object) {
    const seq = ++request.current;
    try { const result = await worker.request<TreeSlice>(action, payload); if (seq === request.current) { setData(result); lastStart.current = result.start; if (scroll.current) scroll.current.scrollTop = 0; } }
    catch { /* The input may have changed while a tree request was in flight. */ }
  }
  if (!data) return <div className="tree-empty"><div className="empty-icon"><ListTree size={28} strokeWidth={1.4} /></div><h3>从文本，到结构</h3><p>点击「解析」或「格式化」<br />在这里探索 JSON 的每一层</p><span className="small-key">Ctrl + Enter</span></div>;
  return <><div className="tree-scroll" ref={scroll} role="tree" aria-label="JSON 结构树" onScroll={async (event) => {
    const start = Math.max(0, Math.floor(event.currentTarget.scrollTop / 34) - 12);
    if (Math.abs(start - lastStart.current) < 10) return;
    lastStart.current = start; const seq = ++request.current;
    try { const next = await worker.request<TreeSlice>('tree:slice', {start, limit: 100}); if (seq === request.current) setData(next); } catch { /* tree was invalidated */ }
  }}><div style={{height: data.total * 34, position: 'relative', minWidth: '100%'}}><div style={{position: 'absolute', top: data.start * 34, width: '100%'}}>{data.rows.map((row) => <div className="tree-row" key={row.id} role="treeitem" aria-level={row.depth + 1} aria-expanded={row.container ? row.expanded : undefined} style={{paddingLeft: 12 + Math.min(row.depth, 40) * 19}}>
    {row.container ? <button className="tree-chevron" aria-label={`${row.expanded ? '折叠' : '展开'} ${row.name || '根节点'}`} onClick={() => refresh('tree:toggle', {id: row.id})}>{row.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="tree-chevron"><span className="tree-leaf" /></span>}
    <button className="tree-value" onClick={() => onSelect(row.id)} title={row.container ? `${row.name}: ${row.kind}` : `${row.name}: ${row.value}`}>
      {row.depth === 0 && row.container ? <Braces size={14} className="tree-root-icon" /> : null}
      {row.name && <><span className="tree-key">{row.name}</span><span className="tree-colon">:</span></>}
      {row.container ? <><span className="tree-type">{row.kind === 'array' ? `Array[${row.count}]` : 'Object'}</span>{row.kind === 'object' && <span className="tree-count">{row.count} 个属性</span>}</> : <span className={`token-${row.kind}`}>{row.value}</span>}
    </button>
    <button className="tree-copy icon-button" aria-label={`复制节点 ${row.name || '根节点'}`} title="复制节点值" onClick={async () => { try { await copyText(await worker.request<string>('tree:copy', {id: row.id})); notify('已复制节点值'); } catch { notify('节点已更新，请重新解析'); } }}><Copy size={12} /></button>
  </div>)}</div></div></div><div className="tree-footer"><span className="status-dot" />已解析<span className="muted">{data.total.toLocaleString()} 个可见节点</span></div></>;
}
