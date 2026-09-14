import { useRef, useState } from 'react';
import { ArrowDownToLine, Check, Copy, FileText, Info, Play, RotateCcw } from 'lucide-react';
import Editor, { type EditorHandle } from '../components/Editor';
import { CopyButton, ErrorBanner, PageHeading, Panel, SharedActions, SplitPane, useProcessor, type Notify } from '../components/common';
import { copyText } from '../lib/clipboard';
import { textActionGroups, textActions } from '../lib/textActions';
import type { TextAction } from '../core/text';

const sample = `{
  "application": "FormatFlow",
  "user_name": "Tom",
  "message": "Hello, world!",
  "local_first": true,
  "tools": ["JSON", "SQL", "Text"]
}`;
export default function TextPage({notify}: {notify: Notify}) {
  const [text, setText] = useState(sample);
  const [result, setResult] = useState<{text: string; action: TextAction} | null>(null);
  const [groupId, setGroupId] = useState<string>('compact');
  const [operation, setOperation] = useState<TextAction>('json-minify');
  const editor = useRef<EditorHandle>(null);
  const processor = useProcessor();
  const group = textActionGroups.find((group) => group.id === groupId)!;
  const current = textActions.find((action) => action.id === operation)!;
  const completed = result ? textActions.find((action) => action.id === result.action) : null;

  function edit(value: string) { processor.cancel(); setText(value); setResult(null); }
  function process(action: TextAction = operation) {
    setOperation(action);
    if (!text) { notify('请先输入需要处理的文本'); return; }
    processor.cancel(); setResult(null);
    processor.run<string>('text', {text, operation: action}, (value) => {
      setResult({text: value, action});
      notify(`${textActions.find((item) => item.id === action)!.label}完成`);
    });
  }
  return <div className="tool-page text-page">
    <PageHeading title="文本处理" description="从命名转换到文本整理，常用操作一步到位。"><SharedActions text={text} onClear={() => edit('')} onPaste={edit} notify={notify} /></PageHeading>
    <div className="toolbar text-toolbar"><div className="segmented text-categories" role="tablist" aria-label="文本处理分类">{textActionGroups.map((item, index) => <button key={item.id} id={`text-tab-${item.id}`} role="tab" aria-controls="text-action-panel" aria-selected={item.id === groupId} tabIndex={item.id === groupId ? 0 : -1} className={item.id === groupId ? 'active' : ''} onKeyDown={(event) => {
      const next = event.key === 'ArrowRight' ? (index + 1) % textActionGroups.length : event.key === 'ArrowLeft' ? (index + textActionGroups.length - 1) % textActionGroups.length : event.key === 'Home' ? 0 : event.key === 'End' ? textActionGroups.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      const target = textActionGroups[next]; setGroupId(target.id); setOperation(target.actions[0].id);
      document.getElementById(`text-tab-${target.id}`)?.focus();
    }} onClick={() => { setGroupId(item.id); setOperation(item.actions[0].id); }}>{item.label}</button>)}</div><span className="tool-count">{textActions.length} 个常用操作</span></div>
    <div id="text-action-panel" className="text-action-panel" role="tabpanel" aria-labelledby={`text-tab-${group.id}`}>
      <div className="text-action-list">{group.actions.map((action) => <button key={action.id} className={`text-action ${operation === action.id ? 'selected' : ''}`} aria-pressed={operation === action.id} title={action.description} disabled={processor.busy} onClick={() => process(action.id)}>{action.label}</button>)}</div>
      <div className="text-action-description"><span><Info size={13} />{current.description}</span>{processor.busy ? <button className="button subtle" onClick={processor.cancel}>取消</button> : <button className="text-button" onClick={() => process()} disabled={!text}><Play size={11} />再次处理 <kbd>Ctrl ↵</kbd></button>}</div>
    </div>
    <ErrorBanner error={processor.error} onLocate={() => editor.current?.focusAt(processor.error?.offset ?? 0)} />
    <SplitPane left={<Panel title="输入内容" meta="TEXT" actions={<button className="text-button" onClick={() => edit(sample)}>载入示例</button>}><Editor ref={editor} label="文本输入编辑器" value={text} onChange={edit} language="text" error={processor.error} onPrimary={() => process()} /></Panel>} right={<Panel title="处理结果" meta={result?.action === 'json-minify' ? 'JSON' : 'TEXT'} actions={<>{result && <span className="valid-badge"><Check size={12} />{completed?.label}</span>}<CopyButton value={result?.text ?? ''} label="复制处理结果" notify={notify} /></>}><div className="output-container"><Editor label="文本结果编辑器" value={result?.text ?? ''} language={result?.action === 'json-minify' ? 'json' : 'text'} readOnly />{result === null && <div className="output-placeholder"><FileText size={28} strokeWidth={1.3} /><h3>{processor.busy ? '正在处理文本…' : '整理文本，从这里开始'}</h3><p>{processor.busy ? '可随时取消，原文保留在左侧' : '点击上方操作，结果会显示在这里'}</p></div>}{result?.text === '' && <div className="output-placeholder"><Check size={28} strokeWidth={1.3} /><h3>处理完成，结果为空</h3><p>当前操作已移除输入中的全部内容</p></div>}</div><div className="text-result-actions"><button className="button" disabled={!result} title="用本次结果替换输入，可在输入编辑器按 Ctrl + Z 撤销" onClick={() => { if (result) { edit(result.text); notify('结果已用作输入，可继续处理'); } }}><ArrowDownToLine size={13} />用结果继续处理</button><button className="button" disabled={!result?.text} onClick={async () => { try { await copyText(result!.text); notify('已复制处理结果'); } catch { notify('复制失败，请选择结果后按 Ctrl + C'); } }}><Copy size={13} />复制结果</button></div></Panel>} />
    <div className="page-note"><span><RotateCcw size={13} />保留原文，可组合多步处理；Ctrl + Z 撤销输入修改</span><span>Ctrl + 5 文本处理</span></div>
  </div>;
}
