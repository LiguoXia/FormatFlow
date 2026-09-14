import { useEffect, useRef, useState } from 'react';
import { Braces, Check, ChevronsDownUp, ChevronsUpDown, Code2, CornerDownLeft, Sparkles, WandSparkles } from 'lucide-react';
import Editor, { type EditorHandle } from '../components/Editor';
import JsonTreeView, { type TreeSlice } from '../components/JsonTreeView';
import { ActionButton, ErrorBanner, PageHeading, Panel, SharedActions, SplitPane, useProcessor, type Notify } from '../components/common';
import { jsonSample } from '../lib/samples';

export default function JsonPage({notify}: {notify: Notify}) {
  const [text, setText] = useState(jsonSample);
  const [tree, setTree] = useState<TreeSlice | null>(null);
  const [indent, setIndent] = useState(2);
  const [mode, setMode] = useState({all: false, revision: 0});
  const processor = useProcessor();
  const editor = useRef<EditorHandle>(null);
  function edit(value: string) { processor.cancel(); setText(value); setTree(null); }
  function process(format: boolean, quiet = false) {
    if (!text.trim()) { notify('请先输入 JSON'); return; }
    processor.run<{text: string; tree: TreeSlice}>('json', {text, format, indent}, (result) => { setText(result.text); setTree(result.tree); if (!quiet) notify(format ? 'JSON 已格式化' : 'JSON 解析成功'); });
  }
  useEffect(() => { process(false, true); }, []);
  return <div className="tool-page">
    <PageHeading title="JSON 工作台" description="让复杂数据，清晰可读。"><SharedActions text={text} onPaste={edit} onClear={() => edit('')} notify={notify} /></PageHeading>
    <div className="toolbar"><div className="toolbar-group"><ActionButton onClick={() => process(true)} busy={processor.busy} disabled={!text.trim()}><WandSparkles size={15} />格式化<kbd>Ctrl ↵</kbd></ActionButton><button className="button" onClick={() => process(false)} disabled={processor.busy || !text.trim()}><Braces size={15} />解析</button><span className="toolbar-divider" /><button className="button subtle" disabled={processor.busy || !text} onClick={() => processor.run<string>('unescape', {text}, (result) => { setText(result); setTree(null); notify('已解码一层转义，可继续解析 JSON'); })}><Code2 size={15} />去转义</button>{processor.busy && <button className="button subtle" onClick={() => { processor.cancel(); setTree(null); }}>取消</button>}</div><label className="select-label">缩进<select aria-label="JSON 缩进" value={indent} onChange={(e) => setIndent(Number(e.target.value))}><option value={2}>2 Spaces</option><option value={4}>4 Spaces</option></select></label></div>
    <ErrorBanner error={processor.error} onLocate={() => editor.current?.focusAt(processor.error?.offset ?? 0)} />
    <SplitPane left={<Panel title="输入内容" meta="JSON" actions={<><button className="text-button" onClick={() => edit(jsonSample)}>载入示例</button>{tree && <span className="valid-badge"><Check size={12} />有效 JSON</span>}</>}><Editor ref={editor} label="JSON 编辑器" value={text} onChange={edit} language="json" indent={indent} error={processor.error} onPrimary={() => process(true)} /></Panel>} right={<Panel title="结构视图" meta="TREE" actions={<><button className="icon-button" aria-label="全部展开" title="全部展开" disabled={!tree} onClick={() => setMode((m) => ({all: true, revision: m.revision + 1}))}><ChevronsUpDown size={15} /></button><button className="icon-button" aria-label="全部折叠" title="全部折叠" disabled={!tree} onClick={() => setMode((m) => ({all: false, revision: m.revision + 1}))}><ChevronsDownUp size={15} /></button></>}><JsonTreeView initial={tree} worker={processor.worker} notify={notify} mode={mode} onSelect={(id) => editor.current?.focusAt(id)} /></Panel>} />
    <div className="page-note"><span><Sparkles size={13} />点击树节点可定位原文，悬停可复制节点值</span><span><CornerDownLeft size={12} />Ctrl + Enter 格式化</span></div>
  </div>;
}
