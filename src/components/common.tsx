import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Clipboard, Copy, LoaderCircle, Trash2, X } from 'lucide-react';
import { ToolWorker, type ToolError } from '../lib/worker';
import { copyText, pasteText } from '../lib/clipboard';
export type Notify = (message: string) => void;
export function useProcessor() {
  const worker = useRef(new ToolWorker()).current;
  const sequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ToolError | null>(null);
  useEffect(() => () => { sequence.current++; worker.dispose(); }, [worker]);
  async function run<T>(action: string, payload: object, onSuccess: (result: T) => void) {
    const id = ++sequence.current; setBusy(true); setError(null);
    try { const result = await worker.request<T>(action, payload); if (sequence.current === id) onSuccess(result); }
    catch (error) { if (sequence.current === id) setError(error as ToolError); }
    finally { if (sequence.current === id) setBusy(false); }
  }
  function cancel() { sequence.current++; worker.dispose(); setBusy(false); setError(null); }
  return {worker, busy, error, setError, run, cancel};
}
export function ActionButton({children, busy, ...props}: React.ButtonHTMLAttributes<HTMLButtonElement> & {busy?: boolean}) {
  return <button {...props} className={`button primary ${props.className ?? ''}`} disabled={props.disabled || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : null}{children}</button>;
}
export function SharedActions({text, onClear, onPaste, notify}: {text: string; onClear(): void; onPaste?(text: string): void; notify: Notify}) {
  return <div className="shared-actions">{onPaste && <button className="button" onClick={async () => { try { onPaste(await pasteText()); } catch { notify('无法读取剪贴板，请使用 Ctrl + V'); } }}><Clipboard size={14} />粘贴</button>}<button className="button" onClick={onClear} disabled={!text}><Trash2 size={14} />清空</button><button className="button" onClick={async () => { try { await copyText(text); notify('已复制'); } catch { notify('复制失败，请选择文本后按 Ctrl + C'); } }} disabled={!text}><Copy size={14} />复制</button></div>;
}
export function CopyButton({value, notify, label = '复制'}: {value: string; notify: Notify; label?: string}) {
  return <button className="icon-button" aria-label={label} title={label} onClick={async () => { try { await copyText(value); notify('已复制'); } catch { notify('复制失败'); } }} disabled={!value}><Copy size={14} /></button>;
}
export function ErrorBanner({error, onLocate}: {error: ToolError | null; onLocate?(): void}) {
  if (!error) return null;
  return <div className="error-banner" role="alert"><AlertCircle size={17} /><div><strong>无法处理当前内容{error.line ? ` · Line ${error.line}, Column ${error.column}` : ''}</strong><p>{error.message}</p></div>{onLocate && error.offset !== undefined && <button className="button" onClick={onLocate}>定位错误</button>}</div>;
}
export function Panel({title, meta, actions, children, className = ''}: {title: string; meta?: string; actions?: ReactNode; children: ReactNode; className?: string}) {
  return <section className={`panel ${className}`}><div className="panel-header"><div className="panel-title">{title}{meta && <span className="file-tag">{meta}</span>}</div><div className="panel-actions">{actions}</div></div>{children}</section>;
}
export function SplitPane({left, right, label = '调整左右面板宽度'}: {left: ReactNode; right: ReactNode; label?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(56);
  return <div className="split-pane" ref={ref} style={{gridTemplateColumns: `minmax(0, ${ratio}fr) 12px minmax(0, ${100 - ratio}fr)`}}>{left}<div className="split-handle" role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={ratio} aria-valuemin={30} aria-valuemax={75} tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setRatio((r) => Math.max(30, Math.min(75, r + (event.key === 'ArrowLeft' ? -2 : 2)))); } }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = 'true'; }} onPointerMove={(event) => { if (event.currentTarget.dataset.dragging !== 'true') return; const rect = ref.current!.getBoundingClientRect(); setRatio(Math.max(30, Math.min(75, (event.clientX - rect.left) / rect.width * 100))); }} onPointerUp={(event) => { event.currentTarget.dataset.dragging = 'false'; event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={(event) => { event.currentTarget.dataset.dragging = 'false'; }}><span /></div>{right}</div>;
}
export function Toast({message, onClose}: {message: string; onClose(): void}) {
  useEffect(() => { if (message) { const timer = setTimeout(onClose, 1900); return () => clearTimeout(timer); } }, [message, onClose]);
  return message ? <div className="toast" role="status"><Check size={16} />{message}<button aria-label="关闭提示" onClick={onClose}><X size={13} /></button></div> : null;
}
export function PageHeading({title, description, children}: {title: string; description: string; children?: ReactNode}) {
  return <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}
