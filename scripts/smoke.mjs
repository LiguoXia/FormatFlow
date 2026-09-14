import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
await mkdir('test-results', {recursive: true});
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(process.env.FORMATFLOW_TEST_EXE ? {executablePath: process.env.FORMATFLOW_TEST_EXE, args: []} : {args: [root]}),
  env, timeout: 30000
});
const page = await app.firstWindow();
const originalClipboard = await app.evaluate(({clipboard}) => clipboard.readText());
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const report = [];
const start = Date.now();
async function check(name, fn) { const before = Date.now(); await fn(); report.push({name, ms: Date.now() - before}); console.log(`PASS ${name}`); }
const active = () => page.locator('.page-slot:not([hidden])');
const editor = (label) => page.getByRole('textbox', {name: label});
async function setEditor(label, text) { const field = editor(label); await field.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(text); }
try {
  await page.getByRole('heading', {name: 'JSON 工作台'}).waitFor();
  await page.getByRole('button', {name: '浅色外观', exact: true}).click();
  await check('Initial JSON parsed and first-level tree visible', async () => {
    await expect(page.getByRole('treeitem')).toHaveCount(8);
    await expect(page.getByRole('button', {name: '展开 workspace', exact: true})).toBeVisible();
    await page.screenshot({path: 'test-results/json.png'});
  });
  await check('Tree expand, locate and exact node clipboard', async () => {
    await page.getByRole('button', {name: '展开 workspace', exact: true}).click();
    await expect(page.getByRole('treeitem')).toHaveCount(11);
    await page.getByRole('button', {name: '复制节点 name', exact: true}).click();
    await expect.poll(() => app.evaluate(({clipboard}) => clipboard.readText())).toBe('FormatFlow');
    await page.getByRole('button', {name: '全部展开', exact: true}).click();
    await expect(page.getByRole('treeitem')).toHaveCount(27);
    await page.getByRole('button', {name: '全部折叠', exact: true}).click();
    await expect(page.getByRole('treeitem')).toHaveCount(1);
  });
  await check('Invalid JSON reports coordinates and recovers', async () => {
    await setEditor('JSON 编辑器', '{\n "bad": }');
    await page.getByRole('button', {name: /^格式化 Ctrl/}).click();
    await expect(page.getByRole('alert')).toContainText('Line 2');
    await page.getByRole('button', {name: '定位错误'}).click();
    await setEditor('JSON 编辑器', '{"id":900719925474099312345,"enabled":true}');
    await page.keyboard.press('Control+Enter');
    await expect(active().locator('.valid-badge')).toContainText('有效 JSON');
    await expect(editor('JSON 编辑器')).toContainText('900719925474099312345');
    await page.getByRole('combobox', {name: 'JSON 缩进'}).selectOption('4');
    await page.getByRole('button', {name: /^格式化/}).click();
    await expect(editor('JSON 编辑器')).toContainText('    "id"');
  });
  await check('Unescape, paste, clear and undo', async () => {
    await setEditor('JSON 编辑器', '\\u4F60\\u597D\\nworld');
    await page.getByRole('button', {name: '去转义', exact: true}).click();
    await expect(editor('JSON 编辑器')).toContainText('你好');
    await app.evaluate(({clipboard}) => clipboard.writeText('{"pasted":true}'));
    await active().getByRole('button', {name: '粘贴', exact: true}).click();
    await expect(editor('JSON 编辑器')).toContainText('pasted');
    await active().getByRole('button', {name: '清空', exact: true}).click();
    await expect(editor('JSON 编辑器')).toHaveText('');
    await editor('JSON 编辑器').click(); await page.keyboard.press('Control+z');
    await expect(editor('JSON 编辑器')).toContainText('pasted');
  });
  await check('SQL formatting and language switch', async () => {
    await page.keyboard.press('Control+2');
    await page.getByRole('button', {name: /^格式化 SQL/}).click();
    await expect(editor('SQL 编辑器')).toContainText('SELECT');
    await expect(editor('SQL 编辑器')).toContainText('LEFT JOIN');
    await page.getByRole('combobox', {name: 'SQL 方言'}).selectOption('postgresql');
    await setEditor('SQL 编辑器', 'select id::text from users where id = $1;');
    await page.keyboard.press('Control+Enter');
    await expect(active().locator('.valid-badge')).toContainText('已格式化');
    await page.screenshot({path: 'test-results/sql.png'});
  });
  await check('Timestamp conversions and timezone updates', async () => {
    await page.keyboard.press('Control+3');
    await page.getByRole('combobox', {name: '时区', exact: true}).selectOption('UTC');
    await page.getByRole('textbox', {name: '输入时间戳', exact: true}).fill('0');
    await page.getByRole('button', {name: '转换为日期时间', exact: true}).click();
    await expect(active().locator('.result-main')).toContainText('1970-01-01 00:00:00');
    await page.getByRole('combobox', {name: '时区', exact: true}).selectOption('Asia/Tokyo');
    await expect(active().locator('.result-main')).toContainText('1970-01-01 09:00:00');
    await page.getByRole('textbox', {name: '输入日期时间', exact: true}).fill('2026-02-30 12:00:00');
    await page.getByRole('button', {name: '转换为时间戳', exact: true}).click();
    await expect(page.getByRole('alert')).toContainText('日期时间无效');
    await page.getByRole('textbox', {name: '输入日期时间', exact: true}).fill('2026-09-11 10:30:00');
    await page.getByRole('button', {name: '转换为时间戳', exact: true}).click();
    await page.screenshot({path: 'test-results/timestamp.png'});
  });
  await check('Configuration bidirectional conversion', async () => {
    await page.keyboard.press('Control+4');
    await page.getByRole('button', {name: '转换', exact: true}).click();
    await expect(editor('配置输出编辑器')).toContainText('port: 8080');
    await expect(editor('配置输出编辑器').locator('.yaml-number').first()).toBeVisible();
    await expect(editor('配置输出编辑器').locator('.yaml-boolean').first()).toBeVisible();
    expect(await editor('配置输出编辑器').locator('.yaml-number').first().evaluate((node) => getComputedStyle(node.querySelector('span') ?? node).color)).toBe('rgb(152, 99, 35)');
    expect(await editor('配置输出编辑器').locator('.yaml-boolean').first().evaluate((node) => getComputedStyle(node.querySelector('span') ?? node).color)).toBe('rgb(128, 97, 166)');
    await page.getByRole('button', {name: 'YAML Properties', exact: true}).click();
    await page.getByRole('button', {name: '转换', exact: true}).click();
    await expect(editor('配置输出编辑器')).toContainText('server.port=8080');
    const tokenColors = await editor('配置输出编辑器').locator('.cm-line').first().locator('span').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
    expect(tokenColors).toContain('rgb(62, 123, 85)');
    expect(tokenColors).toContain('rgb(65, 107, 155)');
    await page.screenshot({path: 'test-results/config.png'});
  });
  await check('Cancel keeps input, and clearing invalidates in-flight output', async () => {
    await page.keyboard.press('Control+2');
    await app.evaluate(({clipboard}) => clipboard.writeText("select id, name from users where id > 1;\n".repeat(15000)));
    await active().getByRole('button', {name: '粘贴', exact: true}).click();
    await expect(active().locator('.editor-status').first()).toContainText('615,000');
    await page.getByRole('button', {name: /^格式化 SQL/}).click();
    await page.getByRole('button', {name: '取消', exact: true}).click();
    await expect(page.getByRole('button', {name: /^格式化 SQL/})).toBeEnabled();
    await expect(active().locator('.editor-status').first()).toContainText('615,000');
    await page.getByRole('button', {name: /^格式化 SQL/}).click();
    await active().getByRole('button', {name: '清空', exact: true}).click();
    await expect(editor('SQL 编辑器')).toHaveText('');
    await page.waitForTimeout(1000);
    await expect(editor('SQL 编辑器')).toHaveText('');
    await expect(active().locator('.valid-badge')).toHaveCount(0);
  });
  await check('Minimum window size and splitter layout', async () => {
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(940, 640));
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(940);
    for (const key of ['1', '2', '3', '4']) {
      await page.keyboard.press(`Control+${key}`);
      const layout = await active().evaluate((el) => {
        const root = el.getBoundingClientRect();
        return [...el.querySelectorAll('button,select,input,.panel')].filter((n) => n.getClientRects().length && !n.closest('.cm-editor') && !n.closest('.tree-scroll') && !n.closest('.timestamp-scroll')).map((n) => ({name: n.textContent, rect: n.getBoundingClientRect()})).filter(({rect}) => rect.right > root.right + 1 || rect.left < root.left - 1);
      });
      expect(layout).toEqual([]);
    }
    await page.keyboard.press('Control+1');
    await page.getByRole('button', {name: '载入示例', exact: true}).first().click();
    await page.getByRole('button', {name: /^格式化 Ctrl/}).click();
    await expect(active().locator('.valid-badge')).toContainText('有效 JSON');
    const separator = active().getByRole('separator');
    await separator.focus(); await page.keyboard.press('ArrowLeft');
    await expect(separator).toHaveAttribute('aria-valuenow', '54');
    await page.screenshot({path: 'test-results/minimum-window.png'});
  });
  await check('Native maximize, minimize, true fullscreen and restore', async () => {
    await page.getByRole('button', {name: '最大化或还原'}).click();
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await page.getByRole('button', {name: '最大化或还原'}).click();
    await page.getByRole('button', {name: '最小化', exact: true}).click();
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].restore());
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
    await page.getByRole('heading', {name: 'JSON 工作台'}).click();
    await page.keyboard.press('F11');
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
  });
  await check('Offline processing and isolated renderer', async () => {
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    const external = await page.evaluate(async () => { try { await fetch('https://example.com'); return true; } catch { return false; } });
    expect(external).toBe(false);
    expect(errors).toEqual([]);
  });
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1320, 860));
  await page.screenshot({path: 'test-results/final-desktop.png'});
  await writeFile('test-results/smoke-report.json', JSON.stringify({passed: report.length, durationMs: Date.now() - start, checks: report, errors}, null, 2));
  console.log(`All ${report.length} desktop checks passed.`);
} finally { await app.evaluate(({clipboard}, value) => clipboard.writeText(value), originalClipboard); await app.close(); }
