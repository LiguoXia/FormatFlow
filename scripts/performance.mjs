import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({args: [process.cwd()], env});
const page = await app.firstWindow();
const originalClipboard = await app.evaluate(({clipboard}) => clipboard.readText());
const results = [];
await mkdir('test-results', {recursive: true});
await page.getByRole('heading', {name: 'JSON 工作台'}).waitFor();
const active = () => page.locator('.page-slot:not([hidden])');
try {
  for (const tool of ['json', 'sql']) for (const mb of [1, 10]) {
    if (tool === 'sql') await page.getByRole('button', {name: /^SQL 查询/}).click();
    else await page.getByRole('button', {name: /^JSON 格式化/}).click();
    const length = await app.evaluate(({clipboard}, {tool, mb}) => {
      const unit = tool === 'json' ? '{"id":12345,"name":"FormatFlow","enabled":true,"tags":["local","fast"]}' : "select u.id, u.name from users u left join orders o on u.id = o.user_id where u.status = 'active' and o.total > 100 order by u.id;\n";
      const count = Math.ceil(mb * 1024 * 1024 / (unit.length + (tool === 'json' ? 1 : 0)));
      const text = tool === 'json' ? '[' + Array(count).fill(unit).join(',') + ']' : unit.repeat(count);
      clipboard.writeText(text); return text.length;
    }, {tool, mb});
    const beforePaste = Date.now();
    await active().getByRole('button', {name: '粘贴', exact: true}).click();
    await expect(active().locator('.editor-status').first()).toContainText(length.toLocaleString(), {timeout:30000});
    const pasteMs = Date.now() - beforePaste;
    console.log(`Pasted ${tool} ${mb} MB in ${pasteMs} ms`);
    await page.evaluate(() => {
      globalThis.perfSamples = []; globalThis.perfPrevious = performance.now();
      globalThis.perfTimer = setInterval(() => { const now = performance.now(); globalThis.perfSamples.push(now - globalThis.perfPrevious); globalThis.perfPrevious = now; }, 50);
    });
    const start = Date.now();
    await active().getByRole('button', {name: tool === 'json' ? /^格式化 Ctrl/ : /^格式化 SQL/}).click();
    await expect(active().locator('.valid-badge')).toContainText(tool === 'json' ? '有效 JSON' : '已格式化', {timeout: 90000});
    const elapsed = Date.now() - start;
    const metrics = await page.evaluate(() => { clearInterval(globalThis.perfTimer); return {ticks: globalThis.perfSamples.length, maxGapMs: Math.round(Math.max(0, ...globalThis.perfSamples)), over200ms: globalThis.perfSamples.filter((v) => v > 200).length}; });
    const rows = tool === 'json' ? await page.getByRole('treeitem').count() : 0;
    if (tool === 'json') expect(rows).toBeLessThanOrEqual(100);
    const result = {tool, mb, chars:length, pasteMs, formatMs:elapsed, renderedTreeRows:rows, ...metrics};
    results.push(result); console.log(JSON.stringify(result));
    await active().getByRole('button', {name:'清空', exact:true}).click();
  }
  await writeFile('test-results/performance.json', JSON.stringify(results, null, 2));
} finally { await app.evaluate(({clipboard}, text) => clipboard.writeText(text), originalClipboard); await app.close(); }
