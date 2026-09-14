import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Compartment, Annotation, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, keymap, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, isolateHistory } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting, indentUnit } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { setDiagnostics } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { sql, MySQL, PostgreSQL, PLSQL, MSSQL } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { propertiesLanguage, yamlScalars } from './editorLanguages';
import type { ToolError } from '../lib/worker';

const external = Annotation.define<boolean>();
const palette = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName], color: 'var(--syntax-key)' },
  { tag: [tags.string, tags.attributeValue, tags.content], color: 'var(--syntax-string)' },
  { tag: [tags.number], color: 'var(--syntax-number)' },
  { tag: [tags.bool, tags.null, tags.keyword], color: 'var(--syntax-keyword)' },
  { tag: [tags.comment], color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.bracket, tags.operator], color: 'var(--syntax-punctuation)' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: 'var(--syntax-function)' },
]);
const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px', color: 'var(--text)', background: 'var(--surface)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-code)', lineHeight: '1.85' },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 22px 0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--tertiary)', border: 'none', padding: '0 7px 0 12px', minWidth: '45px' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)', color: 'var(--accent)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '&[data-has-selection="true"] .cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground': { backgroundColor: 'var(--selection-inactive)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-foldGutter': { width: '13px', color: 'var(--tertiary)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-secondary)', color: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '4px' },
  '.cm-tooltip': { border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow-floating)' },
  '.cm-panels': { background: 'var(--surface-secondary)', color: 'var(--text)', border: 'none' },
  '.cm-search': { padding: '8px' },
  '.cm-search input': { border: '1px solid var(--border)', borderRadius: '5px', background: 'var(--surface)', color: 'var(--text)' },
  '.cm-search .cm-button': { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '5px' },
  '.cm-selectionMatch': { background: 'var(--accent-soft)', outline: '1px solid var(--accent)' },
  '.cm-searchMatch': { background: 'var(--accent-soft)', outline: '1px solid var(--accent)' },
  '.cm-searchMatch-selected': { background: 'var(--selection)' },
  '&.cm-focused .cm-matchingBracket': { background: 'var(--accent-soft)', outline: '1px solid var(--accent)' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--danger)' },
});
export type EditorLanguage = 'text' | 'json' | 'mysql' | 'postgresql' | 'plsql' | 'transactsql' | 'properties' | 'yaml';
function languageSupport(language: EditorLanguage) {
  if (language === 'text') return [];
  if (language === 'json') return json();
  if (language === 'yaml') return [yaml(), yamlScalars];
  if (language === 'properties') return propertiesLanguage;
  return sql({dialect: {mysql: MySQL, postgresql: PostgreSQL, plsql: PLSQL, transactsql: MSSQL}[language]});
}
export interface EditorHandle { focusAt(offset: number): void; }
interface Props {
  value: string; onChange?(text: string): void; language: EditorLanguage; label: string;
  readOnly?: boolean; indent?: number; error?: ToolError | null; onPrimary?(): void;
}
const Editor = forwardRef<EditorHandle, Props>(function Editor({value, onChange, language, label, readOnly = false, indent = 2, error, onPrimary}, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const options = useRef({onChange, onPrimary}); options.current = {onChange, onPrimary};
  const compartments = useRef({language: new Compartment(), indent: new Compartment()});
  const [stats, setStats] = useState(() => ({lines: value.split('\n').length, length: value.length, line: 1, column: 1, selected: 0}));
  useImperativeHandle(ref, () => ({focusAt(offset) {
    const editor = view.current; if (!editor) return;
    const pos = Math.min(offset, editor.state.doc.length);
    editor.dispatch({selection: {anchor: pos}, effects: EditorView.scrollIntoView(pos, {y: 'center'})}); editor.focus();
  }}), []);
  useEffect(() => {
    const instance = new EditorView({parent: host.current!, state: EditorState.create({doc: value, extensions: [
      lineNumbers(), history(), drawSelection(), rectangularSelection(), crosshairCursor(),
      highlightActiveLine(), highlightActiveLineGutter(), bracketMatching(), foldGutter(), highlightSelectionMatches(),
      compartments.current.language.of(languageSupport(language)), compartments.current.indent.of(indentUnit.of(' '.repeat(indent))),
      syntaxHighlighting(palette), editorTheme, EditorState.readOnly.of(readOnly),
      EditorView.contentAttributes.of({'aria-label': label, spellcheck: 'false'}),
      EditorView.editorAttributes.of((view) => ({'data-has-selection': String(view.state.selection.ranges.some((range) => !range.empty))})),
      keymap.of([{key: 'Mod-Enter', run: () => { options.current.onPrimary?.(); return true; }}, {key: 'Mod-y', run: redo}, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          setStats({lines: update.state.doc.lines, length: update.state.doc.length, line: line.number, column: pos - line.from + 1, selected: update.state.selection.ranges.reduce((total, range) => total + range.to - range.from, 0)});
        }
        if (update.docChanged && !update.transactions.some((t) => t.annotation(external))) options.current.onChange?.(update.state.doc.toString());
      })
    ]})});
    view.current = instance;
    return () => { instance.destroy(); view.current = null; };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: value}, annotations: [external.of(true), isolateHistory.of('full')]});
  }, [value]);
  useEffect(() => { view.current?.dispatch({effects: compartments.current.language.reconfigure(languageSupport(language))}); }, [language]);
  useEffect(() => { view.current?.dispatch({effects: compartments.current.indent.reconfigure(indentUnit.of(' '.repeat(indent)))}); }, [indent]);
  useEffect(() => {
    const editor = view.current; if (!editor) return;
    const offset = Math.min(error?.offset ?? 0, editor.state.doc.length);
    editor.dispatch(setDiagnostics(editor.state, error && error.offset !== undefined ? [{from: offset, to: Math.min(offset + 1, editor.state.doc.length), severity: 'error', message: error.message}] : []));
  }, [error]);
  return <div className="editor-shell"><div className="editor-host" ref={host} /><div className="editor-status"><span>{stats.lines.toLocaleString()} 行<span className="dot-divider">·</span>{stats.length.toLocaleString()} 字符</span><span className={stats.selected ? 'selection-count' : ''}>{stats.selected ? `已选 ${stats.selected.toLocaleString()} 字符` : readOnly ? '只读' : `行 ${stats.line}，列 ${stats.column}`}<span className="dot-divider">·</span>UTF-8</span></div></div>;
});
export default Editor;
