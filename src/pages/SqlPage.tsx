import { useState } from 'react';
import { Check, Database, ShieldCheck, WandSparkles } from 'lucide-react';
import Editor, { type EditorLanguage } from '../components/Editor';
import { ActionButton, ErrorBanner, PageHeading, Panel, SharedActions, useProcessor, type Notify } from '../components/common';
import { sqlSample } from '../lib/samples';
export default function SqlPage({notify}: {notify: Notify}) {
  const [text, setText] = useState(sqlSample);
  const [language, setLanguage] = useState<EditorLanguage>('mysql');
  const [indent, setIndent] = useState(2);
  const [formatted, setFormatted] = useState(false);
  const processor = useProcessor();
  function edit(value: string) { processor.cancel(); setText(value); setFormatted(false); }
  function format() { processor.run<string>('sql', {text, language, indent}, (result) => { setText(result); setFormatted(true); notify('SQL 已格式化'); }); }
  return <div className="tool-page"><PageHeading title="SQL 格式化" description="理顺每一次查询，专注业务逻辑。"><SharedActions text={text} onPaste={edit} onClear={() => edit('')} notify={notify} /></PageHeading>
    <div className="toolbar"><div className="toolbar-group"><ActionButton busy={processor.busy} disabled={!text.trim()} onClick={format}><WandSparkles size={15} />格式化 SQL<kbd>Ctrl ↵</kbd></ActionButton><span className="toolbar-divider" /><label className="select-label"><Database size={14} />数据库<select aria-label="SQL 方言" value={language} onChange={(event) => { processor.cancel(); setLanguage(event.target.value as EditorLanguage); setFormatted(false); }}><option value="mysql">MySQL</option><option value="postgresql">PostgreSQL</option><option value="plsql">Oracle / PL/SQL</option><option value="transactsql">SQL Server</option></select></label>{processor.busy && <button className="button subtle" onClick={processor.cancel}>取消</button>}</div><label className="select-label">缩进<select aria-label="SQL 缩进" value={indent} onChange={(e) => setIndent(Number(e.target.value))}><option value={2}>2 Spaces</option><option value={4}>4 Spaces</option></select></label></div>
    <ErrorBanner error={processor.error} />
    <Panel title="查询编辑器" meta="SQL" className="fill-panel" actions={<><button className="text-button" onClick={() => edit(sqlSample)}>载入示例</button>{formatted && <span className="valid-badge"><Check size={12} />已格式化</span>}</>}><Editor label="SQL 编辑器" value={text} onChange={edit} language={language} indent={indent} error={processor.error} onPrimary={format} /></Panel>
    <div className="page-note"><span><ShieldCheck size={13} />仅整理缩进、换行与关键字大小写，SQL 始终在本地处理</span><span>Ctrl + F 查找</span></div>
  </div>;
}
