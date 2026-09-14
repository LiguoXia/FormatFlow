import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Braces, Clock3, Code2, Database, Expand, Keyboard, LockKeyhole, Maximize2, Minus, PanelsTopLeft, Shrink, Square, TextCursorInput, X } from 'lucide-react';
import JsonPage from './pages/JsonPage';
import SqlPage from './pages/SqlPage';
import TimestampPage from './pages/TimestampPage';
import ConfigPage from './pages/ConfigPage';
import TextPage from './pages/TextPage';
import AppearanceControl from './components/AppearanceControl';
import { appVersion } from './lib/version';
import { Toast } from './components/common';

const navigation = [
  {id: 'json', label: 'JSON', sub: '格式化与解析', icon: Braces},
  {id: 'sql', label: 'SQL', sub: '查询格式化', icon: Database},
  {id: 'timestamp', label: '时间戳', sub: '日期与时间转换', icon: Clock3},
  {id: 'config', label: 'Properties / YAML', sub: '配置格式转换', icon: ArrowLeftRight},
  {id: 'text', label: '文本处理', sub: '压缩、转换与整理', icon: TextCursorInput}
] as const;
type Tool = typeof navigation[number]['id'];

function ShortcutGuide({onClose}: {onClose(): void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previousFocus.current?.focus(); };
  }, []);
  return <dialog ref={dialog} className="help-modal" aria-labelledby="help-heading" onCancel={onClose} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="help-title"><span className="card-icon"><Keyboard size={23} /></span><button className="icon-button" aria-label="关闭快捷键指南" autoFocus onClick={onClose}><X size={18} /></button></div>
    <h2 id="help-heading">快捷键指南</h2><p>让常用操作，更顺手。</p>
    {[
      ['格式化 / 转换', 'Ctrl + Enter'], ['切换工具', 'Ctrl + 1 / 2 / 3 / 4 / 5'],
      ['查找 / 替换', 'Ctrl + F / Ctrl + H'], ['撤销 / 重做', 'Ctrl + Z / Ctrl + Y'],
      ['全选 / 复制 / 粘贴 / 剪切', 'Ctrl + A / C / V / X'], ['全屏 / 退出全屏', 'F11 / Esc'], ['快捷键指南', 'Ctrl + /']
    ].map(([label, keys]) => <div className="shortcut-row" key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}
    <div className="help-tip"><Maximize2 size={14} />双击标题栏最大化，拖动面板间隔调整比例。</div>
  </dialog>;
}

export default function App() {
  const [active, setActive] = useState<Tool>('json');
  const [visited, setVisited] = useState<Set<Tool>>(new Set(['json']));
  const [toast, setToast] = useState({message: '', id: 0});
  const [help, setHelp] = useState(false);
  const [windowState, setWindowState] = useState({maximized: false, fullscreen: false});
  const notify = useCallback((message: string) => setToast((last) => ({message, id: last.id + 1})), []);
  const closeToast = useCallback(() => setToast((last) => ({...last, message: ''})), []);
  const changeTool = useCallback((tool: Tool) => { setActive(tool); setVisited((previous) => new Set(previous).add(tool)); }, []);
  const fullscreen = useCallback(async () => {
    if (window.desktop) await window.desktop.windowAction('fullscreen');
    else {
      if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
      setWindowState((value) => ({...value, fullscreen: !!document.fullscreenElement}));
    }
  }, []);
  useEffect(() => {
    window.desktop?.getWindowState().then(setWindowState);
    return window.desktop?.onWindowState(setWindowState);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (help) { setHelp(false); return; }
        if (window.desktop) void window.desktop.windowAction('exit-fullscreen');
        else if (document.fullscreenElement) { void document.exitFullscreen(); setWindowState((v) => ({...v, fullscreen: false})); }
      }
      if (event.ctrlKey && event.key === '/') { event.preventDefault(); setHelp((value) => !value); return; }
      if (help) return;
      if ((event.ctrlKey || event.metaKey) && /^[1-5]$/.test(event.key)) {
        event.preventDefault(); changeTool(navigation[Number(event.key) - 1].id);
      }
      if (event.key === 'F11' && !event.repeat) { event.preventDefault(); void fullscreen(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [changeTool, fullscreen, help]);
  const current = navigation.find((item) => item.id === active)!;
  const pages = {json: <JsonPage notify={notify} />, sql: <SqlPage notify={notify} />, timestamp: <TimestampPage notify={notify} />, config: <ConfigPage notify={notify} />, text: <TextPage notify={notify} />};

  return <div className={`app ${windowState.fullscreen ? 'is-fullscreen' : ''}`}>
    <div className="titlebar">
      <div className="titlebar-brand"><Code2 size={16} /><span>FormatFlow</span></div>
      <span className="titlebar-caption">{current.label}</span>
      <div className="window-controls">
        <button aria-label="切换全屏" title="全屏 F11 · Esc 退出" onClick={fullscreen}>{windowState.fullscreen ? <Shrink size={14} /> : <Expand size={14} />}</button>
        {window.desktop && <>
          <button aria-label="最小化" title="最小化" onClick={() => window.desktop!.windowAction('minimize')}><Minus size={15} /></button>
          <button aria-label="最大化或还原" title="最大化或还原" onClick={() => window.desktop!.windowAction('maximize')}>{windowState.maximized ? <PanelsTopLeft size={13} /> : <Square size={12} />}</button>
          <button className="window-close" aria-label="关闭窗口" title="关闭窗口" onClick={() => window.desktop!.windowAction('close')}><X size={16} /></button>
        </>}
      </div>
    </div>
    <div className="app-body">
      <aside className="sidebar">
        <div className="brand"><span className="brand-logo"><Braces size={24} strokeWidth={1.8} /></span><div><strong>FormatFlow</strong><span>文本工具箱</span></div></div>
        <div className="sidebar-label nav-heading">工具</div>
        <nav aria-label="工具导航">{navigation.map((item, index) => {
          const Icon = item.icon;
          return <button key={item.id} className={`nav-item ${active === item.id ? 'selected' : ''}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => changeTool(item.id)} title={`${item.sub} · Ctrl + ${index + 1}`}>
            <Icon className="nav-icon" size={18} strokeWidth={1.8} /><span className="nav-text">{item.label}</span><span className="nav-number" aria-hidden="true">{index + 1}</span>
          </button>;
        })}</nav>
        <div className="sidebar-bottom">
          <AppearanceControl />
          <button className="shortcut-button" onClick={() => setHelp(true)}><Keyboard size={17} /><span>快捷键指南</span><kbd>Ctrl /</kbd></button>
          <div className="privacy-note"><LockKeyhole size={13} /><span>仅在本地处理</span></div>
          <div className="sidebar-version">版本 {appVersion}</div>
        </div>
      </aside>
      <main aria-label={current.label}>{navigation.filter((item) => visited.has(item.id)).map((item) => <div key={item.id} className="page-slot" hidden={active !== item.id}>{pages[item.id]}</div>)}</main>
    </div>
    <footer className="app-footer"><span><span className="status-dot" />文本不上传、不自动保存</span><span>Ctrl + Enter 快速处理<span className="footer-dot">·</span>F11 全屏</span></footer>
    <Toast key={toast.id} message={toast.message} onClose={closeToast} />
    {help && <ShortcutGuide onClose={() => setHelp(false)} />}
  </div>;
}
