import { useState } from 'react';
import { ArrowLeftRight, ArrowRight, Check, Info } from 'lucide-react';
import Editor from '../components/Editor';
import { ActionButton, CopyButton, ErrorBanner, PageHeading, Panel, SharedActions, SplitPane, useProcessor, type Notify } from '../components/common';
import { propertiesSample, yamlSample } from '../lib/samples';
export default function ConfigPage({notify}: {notify: Notify}) {
  const [direction, setDirection] = useState<'toYaml' | 'toProperties'>('toYaml');
  const [text, setText] = useState(propertiesSample);
  const [output, setOutput] = useState('');
  const [infer, setInfer] = useState(true);
  const processor = useProcessor();
  const toYaml = direction === 'toYaml';
  function edit(value: string) { processor.cancel(); setText(value); setOutput(''); }
  function switchDirection(next: typeof direction) {
    if (next === direction) return;
    processor.cancel();
    setText(output || (text === propertiesSample || text === yamlSample ? next === 'toYaml' ? propertiesSample : yamlSample : text));
    setOutput(''); setDirection(next);
  }
  function convert() { processor.run<string>('config', {text, direction, infer}, (result) => { setOutput(result); notify('转换完成'); }); }
  return <div className="tool-page"><PageHeading title="配置格式转换" description="在 Properties 与 YAML 之间，轻松切换。"><SharedActions text={output || text} onPaste={edit} onClear={() => edit('')} notify={notify} /></PageHeading>
    <div className="toolbar"><div className="toolbar-group"><div className="segmented" role="group" aria-label="转换方向"><button aria-pressed={toYaml} className={toYaml ? 'active' : ''} onClick={() => switchDirection('toYaml')}>Properties <ArrowRight size={12} /> YAML</button><button aria-pressed={!toYaml} className={!toYaml ? 'active' : ''} onClick={() => switchDirection('toProperties')}>YAML <ArrowRight size={12} /> Properties</button></div><ActionButton busy={processor.busy} disabled={!text.trim()} onClick={convert}><ArrowLeftRight size={14} />转换</ActionButton>{processor.busy && <button className="button subtle" onClick={processor.cancel}>取消</button>}</div>{toYaml && <label className="checkbox-label" title="关闭后，所有 Properties 值都保留为字符串"><input type="checkbox" checked={infer} onChange={(e) => { processor.cancel(); setInfer(e.target.checked); setOutput(''); }} />识别数字与布尔值</label>}</div>
    <ErrorBanner error={processor.error} />
    <SplitPane left={<Panel title="输入内容" meta={toYaml ? 'PROPERTIES' : 'YAML'} actions={<button className="text-button" onClick={() => edit(toYaml ? propertiesSample : yamlSample)}>载入示例</button>}><Editor label="配置输入编辑器" value={text} onChange={edit} language={toYaml ? 'properties' : 'yaml'} onPrimary={convert} /></Panel>} right={<Panel title="转换结果" meta={toYaml ? 'YAML' : 'PROPERTIES'} actions={<>{output && <span className="valid-badge"><Check size={12} />已转换</span>}<CopyButton value={output} notify={notify} label="复制转换结果" /></>}><div className="output-container"><Editor label="配置输出编辑器" value={output} language={toYaml ? 'yaml' : 'properties'} readOnly />{!output && <div className="output-placeholder"><ArrowLeftRight size={28} strokeWidth={1.3} /><h3>另一种格式，同样清晰</h3><p>转换后的内容会显示在这里</p></div>}</div></Panel>} />
    <div className="page-note"><span><Info size={13} />支持层级与数组；注释不保留。Properties 本身不包含类型信息</span><span>Ctrl + Enter 转换</span></div>
  </div>;
}
