import { StreamLanguage, syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export const propertiesLanguage = StreamLanguage.define({
  name: 'properties',
  startState: () => ({value: false, continued: false}),
  token(stream, state) {
    if (stream.sol()) {
      state.value = state.continued; state.continued = false;
      stream.eatSpace();
      if (stream.eol()) return null;
      if (!state.value && /^[#!]/.test(stream.peek() ?? '')) { stream.skipToEnd(); return 'comment'; }
    }
    if (state.value) {
      stream.skipToEnd();
      state.continued = (stream.current().match(/\\+$/)?.[0].length ?? 0) % 2 === 1;
      return 'value';
    }
    if (stream.eatSpace()) { stream.eat(/[=:]/); stream.eatSpace(); state.value = true; return 'separator'; }
    if (stream.eat(/[=:]/)) { stream.eatSpace(); state.value = true; return 'separator'; }
    while (!stream.eol()) {
      const next = stream.peek();
      if (next && /[\s=:]/.test(next)) break;
      if (stream.next() === '\\') stream.next();
    }
    return 'key';
  },
  tokenTable: {key: tags.propertyName, value: tags.string, separator: tags.separator}
});

// YAML's grammar calls all unquoted scalars "Literal". Classify visible values
// without parsing the document again or treating quoted numbers as numbers.
function scalarDecorations(view: EditorView): DecorationSet {
  const ranges: ReturnType<ReturnType<typeof Decoration.mark>['range']>[] = [];
  for (const {from, to} of view.visibleRanges) syntaxTree(view.state).iterate({from, to, enter(node) {
    if (node.name !== 'Literal' || node.node.parent?.name === 'Key') return;
    const value = view.state.sliceDoc(node.from, node.to);
    const kind = /^(true|false)$/i.test(value) ? 'boolean' : /^(null|~)$/i.test(value) ? 'null' : /^[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:e[-+]?\d+)?$|^[-+]?0[xo][\da-f_]+$|^[-+]?\.(?:inf|nan)$/i.test(value) ? 'number' : null;
    if (kind) ranges.push(Decoration.mark({class: `yaml-${kind}`}).range(node.from, node.to));
  }});
  return Decoration.set(ranges, true);
}
export const yamlScalars = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = scalarDecorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = scalarDecorations(update.view);
  }
}, {decorations: (instance) => instance.decorations});
