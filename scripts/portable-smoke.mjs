import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
// The NSIS launcher does not forward the Node inspector's stdout. Attach to the
// extracted application's loopback CDP port instead of to the bootstrap process.
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const {version} = JSON.parse(await readFile('package.json', 'utf8'));
const started = Date.now();
const child = spawn(path.resolve(`release/FormatFlow-${version}-win-x64.exe`), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {env, windowsHide:true, stdio:'ignore'});
let browser;
try {
  let ready = false;
  while (Date.now() - started < 60000) {
    if (child.exitCode !== null) throw new Error(`Portable launcher exited: ${child.exitCode}`);
    try { const result = await fetch(`http://127.0.0.1:${port}/json/version`); if (result.ok) {ready = true; break;} } catch { /* unpacking */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Portable application did not expose its test port within 60 seconds');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0];
  await page.getByRole('heading', {name:'JSON 工作台'}).waitFor();
  const launchMs = Date.now() - started;
  await expect(page.getByRole('treeitem')).toHaveCount(8);
  await page.getByRole('button',{name:'深色外观',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.locator('.cm-editor').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(36, 36, 38)');
  await page.getByRole('button',{name:'浅色外观',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  const input = page.getByRole('textbox', {name:'JSON 编辑器'});
  await input.click(); await page.keyboard.press('Control+a');
  await page.keyboard.insertText('{"portable":true,"id":900719925474099312345}');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.valid-badge')).toContainText('有效 JSON');
  await expect(input).toContainText('900719925474099312345');
  await page.getByRole('button', {name:'切换全屏'}).click();
  await expect.poll(() => page.evaluate(async () => (await window.desktop.getWindowState()).fullscreen)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(async () => (await window.desktop.getWindowState()).fullscreen)).toBe(false);
  await page.getByRole('button', {name:'载入示例', exact:true}).click();
  await page.getByRole('button', {name:/^格式化 Ctrl/}).click();
  await expect(page.locator('.valid-badge')).toContainText('有效 JSON');
  await page.keyboard.press('Control+5');
  await expect(page.getByRole('heading', {name:'文本处理',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'JSON 压缩',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'文本结果编辑器'})).toContainText('"application":"FormatFlow"');
  const textInput=page.getByRole('textbox',{name:'文本输入编辑器'});
  await textInput.click(); await page.keyboard.press('Control+a');
  await expect(textInput.locator('..').locator('..')).toHaveAttribute('data-has-selection','true');
  await page.screenshot({path:'test-results/portable.png'});
  await writeFile('test-results/portable-smoke.json', JSON.stringify({passed:true, version, launchMs, checks:['Portable extraction and launch','Worker inside ASAR','JSON formatting preserves large integer','Native full screen and Escape','Text tools and JSON compression','Selection highlight state','Light and dark appearance inside portable app'], packagedFile:page.url()}, null, 2));
  console.log(`PASS portable EXE ${version} extraction, launch, JSON, text tools, selection and native fullscreen (${launchMs} ms to ready)`);
  await page.evaluate(() => window.desktop.windowAction('close')).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  // Only the process started by this test is eligible for cleanup.
  if (child.exitCode === null) child.kill();
}
