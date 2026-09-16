import { useEffect, useRef, useState } from 'react';
import { Code2, Download, FolderOpen, Play, Plus, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import Editor, { type EditorHandle } from '../components/Editor';
import { CopyButton, ErrorBanner, PageHeading, Panel, SharedActions, SplitPane, type Notify } from '../components/common';
import type { CustomEnvironment, CustomProcessor, CustomResult } from '../lib/customTypes';
import type { ToolError } from '../lib/worker';
import { useIndent } from '../lib/settings';
const template = 'public class CustomProcessor {\n\n    public static String process(String input) {\n        return input;\n    }\n\n}';
const createProcessor = (): CustomProcessor => ({id:crypto.randomUUID(),name:'',description:'',className:'CustomProcessor',methodName:'process',code:template});
export default function CustomPage({notify}: {notify: Notify}) {
  const api = window.desktop?.custom;
  const [items,setItems]=useState<CustomProcessor[]>([]);
  const [draft,setDraft]=useState<CustomProcessor>(createProcessor);
  const [selected,setSelected]=useState('');
  const [dirty,setDirty]=useState(false);
  const [mode,setMode]=useState<'process'|'edit'>('process');
  const [input,setInput]=useState('hello world');
  const [result,setResult]=useState<CustomResult|null>(null);
  const [environment,setEnvironment]=useState<CustomEnvironment|null>(null);
  const [error,setError]=useState<ToolError|null>(null);
  const [codeError,setCodeError]=useState<ToolError|null>(null);
  const [busy,setBusy]=useState('');
  const [guide,setGuide]=useState(false);
  const [pending,setPending]=useState<null|{kind:'delete'}|{kind:'switch';id:string}>(null);
  const [testVisible,setTestVisible]=useState(false);
  const editor=useRef<EditorHandle>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const {indent,setIndent,settingsError}=useIndent('javaIndent',4);
  const mounted=useRef(true);
  const initialized=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(pending)dialog.current?.showModal();},[pending]);
  async function load(keep=true) {
    if(!api)return;
    const list=await api.list();setItems(list);
    if(!keep && list.length){setDraft(list[0]);setSelected(list[0].id);setDirty(false);}
    if(keep && !dirty && selected){const next=list.find(item=>item.id===selected);setDraft(next || createProcessor());setSelected(next?.id || '');setResult(null);}
  }
  async function detect() {
    if(!api)return;
    setBusy('检测 JDK');setError(null);
    try{setEnvironment(await api.environment());}catch(e){setError({message:(e as Error).message});}finally{if(mounted.current)setBusy('');}
  }
  useEffect(()=>{if(!api||initialized.current)return;initialized.current=true;load(false).catch(e=>setError({message:e.message}));void detect();},[]);
  function choose(id:string) {
    const item=items.find(item=>item.id===id);
    setDraft(item || createProcessor());setSelected(item?.id || '');setDirty(!item);setCodeError(null);setError(null);setResult(null);
    if(!item)setMode('edit');
  }
  function switchItem(id:string){if(busy)return;if(dirty)setPending({kind:'switch',id});else choose(id);}
  function edit(patch:Partial<CustomProcessor>){setDraft(current=>({...current,...patch}));setDirty(true);setCodeError(null);setError(null);setResult(null);}
  function mappedError(value:ToolError){
    const lines=draft.code.split('\n');const line=value.line;
    return {...value,offset:line ? lines.slice(0,line-1).reduce((sum,text)=>sum+text.length+1,0)+Math.max(0,(value.column||1)-1) : undefined};
  }
  async function save(){
    if(!api)return;
    setBusy('编译并保存');setError(null);setCodeError(null);
    try{
      const response=await api.save(draft);
      if(!response.ok){const next=mappedError(response.error);setCodeError(next);setError(next);return;}
      setDraft(response.value);setSelected(response.value.id);setDirty(false);await load();notify('功能已保存，编译缓存已就绪');
    }catch(e){setError({message:(e as Error).message});}finally{setBusy('');}
  }
  async function execute(test=false){
    if(!api)return;
    setBusy(test?'测试代码':'执行处理');setResult(null);setError(null);setCodeError(null);
    if(test)setTestVisible(true);
    try{
      const response=await api.run(draft,input);
      if(!response.ok){const next=mappedError(response.error);setError(next);if(next.line){setCodeError(next);setMode('edit');}return;}
      setResult(response.value);notify(test?'测试完成':'处理完成');
    }catch(e){setError({message:(e as Error).message});}finally{setBusy('');}
  }
  async function remove(){
    if(!api)return;setPending(null);setBusy('删除功能');
    try{await api.remove(selected);setItems(items.filter(item=>item.id!==selected));setSelected('');setDraft(createProcessor());setDirty(false);setResult(null);notify('已删除功能和编译缓存');}catch(e){setError({message:(e as Error).message});}finally{setBusy('');}
  }
  async function transfer(action:'import'|'export'){
    if(!api)return;setBusy(action==='import'?'校验并导入':'导出配置');setError(null);
    try{const count=await api[action]();if(count!==null&&count!==false){if(action==='import'){await load();notify(`已导入 ${count} 个功能`);}else notify('配置已导出');}}catch(e){setError({message:(e as Error).message});}finally{setBusy('');}
  }
  const canRun=!!api && !!environment?.available && !busy;
  const hasRecord=!!selected || dirty;
  return <div className="tool-page custom-page">
    <PageHeading title="自定义文本处理" description="用一个 Java 静态方法，创建自己的文本工具。"><button className="button" onClick={()=>setGuide(value=>!value)}>JDK 配置教程</button></PageHeading>
    <div className={`custom-environment ${environment?.available?'ready':''}`} role="status"><span>{!api?'此功能需要在桌面应用中使用':environment?.message || '正在检查本机 JDK…'}</span><button className="text-button" disabled={!api||!!busy} onClick={detect}><RefreshCw size={13}/>重新检测</button></div>
    {guide && <section className="jdk-guide"><div><strong>安装与配置 JDK</strong><button className="icon-button" aria-label="关闭 JDK 教程" onClick={()=>setGuide(false)}><X size={15}/></button></div><ol><li>从 Eclipse Adoptium 官方网站 <strong>adoptium.net</strong> 下载 Temurin 21，选择 Windows x64、JDK、MSI，按向导安装。</li><li>在 Windows「编辑系统环境变量 → 环境变量」中，将 <code>JAVA_HOME</code> 设置为 JDK 安装目录（不要带 bin），在 <code>Path</code> 中添加 <code>%JAVA_HOME%\bin</code>。</li><li>打开新的终端，执行 <code>java -version</code> 和 <code>javac -version</code>，确认均为同一版本，然后重新启动 FormatFlow。</li></ol><p>支持完整 JDK 8–23，推荐仍获更新的 JDK 21。JDK 24 起移除了本执行引擎需要的 Security Manager，当前不会在这些版本上无限制执行代码。未配置 JDK 不影响其他工具。</p><p>方法：<code>public static String process(String input)</code>。可填写完整 public 类，或仅填写方法。正则表达式使用 <code>java.util.regex</code>；只允许 JDK 标准库，文件、网络、外部程序及危险反射受限。</p><p className="config-path">配置位置：{environment?.configPath || '%APPDATA%\FormatFlow\config\custom-processors.json'}</p></section>}
    <div className="toolbar custom-toolbar"><div className="toolbar-group"><button className="button" disabled={!api||!!busy} onClick={()=>switchItem('')}><Plus size={14}/>新增功能</button><button className="button" disabled={!canRun} onClick={()=>transfer('import')}><Upload size={14}/>导入</button><button className="button" disabled={!api||!!busy||!items.length} onClick={()=>transfer('export')}><Download size={14}/>导出</button><button className="button subtle" disabled={!api||!!busy} onClick={()=>api?.openFolder().catch(e=>setError({message:e.message}))}><FolderOpen size={14}/>配置目录</button><button className="button subtle" disabled={!api||!!busy||dirty} onClick={()=>load(true).then(()=>notify('列表已重新加载')).catch(e=>setError({message:e.message}))}>重新加载</button></div>{busy && <span className="custom-progress">{busy}… <button className="text-button" onClick={()=>api?.cancel()}>取消</button></span>}</div>
    <ErrorBanner error={error || (settingsError?{message:settingsError}:null)} onLocate={codeError?.offset!==undefined?()=>editor.current?.focusAt(codeError.offset!):undefined}/>
    <div className="custom-workspace">
      <aside className="processor-list" aria-label="我的文本处理"><div className="processor-list-heading">我的文本处理 <span>{items.length}</span></div>{items.length ? items.map(item=><button key={item.id} className={`processor-item ${selected===item.id?'selected':''}`} aria-pressed={selected===item.id} disabled={!!busy} onClick={()=>switchItem(item.id)}><Code2 size={15}/><span><strong>{item.name}</strong><small>{item.description || `${item.className}.${item.methodName}`}</small></span></button>):<p className="processor-empty">还没有自定义功能。<br/>点击「新增功能」开始。</p>}</aside>
      <section className="custom-content">
        <div className="custom-content-heading"><div className="segmented" role="group" aria-label="自定义处理视图"><button className={mode==='process'?'active':''} aria-pressed={mode==='process'} onClick={()=>setMode('process')}>处理文本</button><button className={mode==='edit'?'active':''} aria-pressed={mode==='edit'} onClick={()=>setMode('edit')}>编辑功能{dirty?' · 未保存':''}</button></div><span className="custom-selection-name">{draft.name || '新功能'}</span></div>
        {mode==='edit' ? <>
          <fieldset className="processor-fields" disabled={!!busy}><label>功能名称<input aria-label="功能名称" maxLength={100} placeholder="例如：全部转大写" value={draft.name} onChange={e=>edit({name:e.target.value})}/></label><label>功能描述<input aria-label="功能描述" maxLength={1000} placeholder="这个功能的用途" value={draft.description} onChange={e=>edit({description:e.target.value})}/></label><label>Java 类名<input aria-label="Java 类名" value={draft.className} onChange={e=>edit({className:e.target.value})}/></label><label>静态方法名<input aria-label="静态方法名" value={draft.methodName} onChange={e=>edit({methodName:e.target.value})}/></label></fieldset>
          <Panel title="Java 代码" meta="JAVA" className="fill-panel custom-code" actions={<label className="select-label">缩进<select aria-label="Java 缩进" value={indent} onChange={e=>setIndent(Number(e.target.value))}><option value={2}>2 Spaces</option><option value={4}>4 Spaces</option></select></label>}><Editor ref={editor} label="Java 代码编辑器" readOnly={!!busy} value={draft.code} onChange={value=>{if(!busy)edit({code:value});}} language="java" indent={indent} error={codeError} onPrimary={()=>{if(canRun)void execute(true);}}/></Panel>
          <div className="custom-edit-actions"><button className="button primary" disabled={!canRun||!draft.name.trim()} onClick={save}><Save size={14}/>保存</button><button className="button" disabled={!canRun||!draft.name.trim()} onClick={()=>execute(true)}><Play size={14}/>测试</button><button className="button subtle" disabled={!selected||!!busy} onClick={()=>setPending({kind:'delete'})}><Trash2 size={14}/>删除</button><label className="checkbox-label"><input type="checkbox" checked={testVisible} onChange={e=>setTestVisible(e.target.checked)}/>测试输入与结果</label></div>
          {testVisible && <div className="custom-test-area"><label>测试输入<textarea aria-label="Java 测试输入" value={input} disabled={!!busy} onChange={e=>{setInput(e.target.value);setResult(null);}}/></label><label>测试结果<textarea aria-label="Java 测试结果" readOnly value={result?.text ?? ''}/></label></div>}
        </> : <>
          <div className="custom-run-actions"><button className="button primary" disabled={!canRun||!hasRecord||!draft.name.trim()} onClick={()=>execute()}><Play size={14}/>执行处理</button><SharedActions text={input} onClear={()=>{if(!busy){setInput('');setResult(null);}}} onPaste={value=>{if(!busy){setInput(value);setResult(null);}}} notify={notify}/></div>
          {dirty && <p className="custom-draft-note">当前执行的是未保存的草稿，保存后可在下次启动继续使用。</p>}
          <SplitPane left={<Panel title="输入文本" meta="TEXT"><Editor label="自定义输入编辑器" readOnly={!!busy} value={input} onChange={value=>{if(!busy){setInput(value);setResult(null);}}} language="text" onPrimary={()=>{if(canRun&&hasRecord)void execute();}}/></Panel>} right={<Panel title="处理结果" meta="TEXT" actions={<CopyButton value={result?.text ?? ''} notify={notify} label="复制自定义处理结果"/>}><Editor label="自定义结果编辑器" value={result?.text ?? ''} language="text" readOnly/></Panel>}/>
          <div className="custom-result-status">{result?`处理完成 · ${result.cached?'使用编译缓存':'首次编译'} · ${result.durationMs} ms${result.text===''?' · 结果为空':''}`:'执行时限 5 秒 · 输入与输出仅在内存中传递'}</div>
        </>}
      </section>
    </div>
    {pending && <dialog ref={dialog} className="help-modal" aria-labelledby="custom-confirm-title" onCancel={()=>setPending(null)}><h2 id="custom-confirm-title">{pending.kind==='delete'?'删除此功能？':'放弃未保存的修改？'}</h2><p>{pending.kind==='delete'?'将删除配置记录和该功能的编译缓存，其他功能不受影响。':'切换后，当前草稿修改将丢失。'}</p><div className="toolbar-group"><button className="button" autoFocus onClick={()=>setPending(null)}>取消</button><button className="button primary" onClick={()=>{if(pending.kind==='delete')void remove();else {choose(pending.id);setPending(null);}}}>{pending.kind==='delete'?'确认删除':'放弃修改'}</button></div></dialog>}
  </div>;
}
