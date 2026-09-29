import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

if (process.platform !== 'darwin') throw new Error('Run this check on macOS.');
const arch = process.env.FORMATFLOW_EXPECT_ARCH || process.arch;
expect(process.arch).toBe(arch);
const bundle = path.resolve(`release/${arch === 'arm64' ? 'mac-arm64' : 'mac'}/FormatFlow.app`);
const executablePath = path.join(bundle, 'Contents/MacOS/FormatFlow');
const binary = execFileSync('file', [executablePath], {encoding: 'utf8'});
expect(binary).toContain(arch === 'arm64' ? 'arm64' : 'x86_64');
execFileSync('codesign', ['--verify', '--deep', '--strict', bundle]);
await mkdir('test-results', {recursive: true});
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
// Simulate Finder: no shell JAVA_HOME and only the system PATH.
delete env.JAVA_HOME;
env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const app = await electron.launch({executablePath, args: [], env, timeout: 60000});
const page = await app.firstWindow();
const clipboard = await app.evaluate(({clipboard}) => clipboard.readText());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log(`PASS ${name}`); };
const field = name => page.getByRole('textbox', {name, exact: true});
async function input(name, value) {
  await field(name).click(); await page.keyboard.press('Meta+a'); await page.keyboard.insertText(value);
}
try {
  await page.getByRole('heading', {name: 'JSON 工作台'}).waitFor();
  await check('Native architecture, menu and macOS chrome', async () => {
    expect(await app.evaluate(() => process.arch)).toBe(arch);
    expect(await page.evaluate(() => window.desktop.platform)).toBe('darwin');
    expect(await app.evaluate(({Menu}) => Menu.getApplicationMenu().items.map(item => item.role))).toContain('appmenu');
    await expect(page.locator('.app')).toHaveClass(/is-mac/);
    await expect(page.getByRole('button', {name: '关闭窗口', exact: true})).toHaveCount(0);
  });
  await check('Command formatting, undo, clipboard and search', async () => {
    await input('JSON 编辑器', '{"id":900719925474099312345,"text":"你好"}');
    await page.keyboard.press('Meta+Enter');
    await expect(page.locator('.valid-badge')).toContainText('有效 JSON');
    await expect(field('JSON 编辑器')).toContainText('900719925474099312345');
    await field('JSON 编辑器').click(); await page.keyboard.press('Meta+a'); await page.keyboard.press('Meta+c');
    await expect.poll(() => app.evaluate(({clipboard}) => clipboard.readText())).toContain('你好');
    await page.keyboard.press('Meta+f'); await expect(page.locator('.cm-search')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: '清空', exact: true}).click();
    await field('JSON 编辑器').click(); await page.keyboard.press('Meta+z');
    await expect(field('JSON 编辑器')).toContainText('你好');
  });
  await check('Command navigation and built-in tools', async () => {
    await page.keyboard.press('Meta+2');
    await page.getByRole('button', {name: /^格式化 SQL/}).click();
    await expect(field('SQL 编辑器')).toContainText('SELECT');
    await page.keyboard.press('Meta+3');
    await page.getByRole('combobox', {name: '时区', exact: true}).selectOption('UTC');
    await field('输入时间戳').fill('0');
    await page.getByRole('button', {name: '转换为日期时间', exact: true}).click();
    await expect(page.locator('.result-main').first()).toContainText('1970-01-01');
    await page.keyboard.press('Meta+4');
    await page.getByRole('button', {name: '转换', exact: true}).click();
    await expect(field('配置输出编辑器')).toContainText('port: 8080');
    await page.keyboard.press('Meta+5');
    await expect(field('文本输入编辑器')).toBeVisible();
    await page.keyboard.press('Meta+/');
    await expect(page.getByRole('dialog')).toContainText('⌘');
    await page.keyboard.press('Escape');
  });
  await check('Finder JDK discovery and packaged Java execution', async () => {
    await page.keyboard.press('Meta+6');
    await expect(page.locator('.custom-environment')).toContainText('已就绪', {timeout: 30000});
    const environment = await page.evaluate(() => window.desktop.custom.environment());
    expect(environment.available, environment.message).toBe(true);
    expect(environment.configPath).toContain('Library/Application Support/FormatFlow/config');
    const result = await page.evaluate(() => window.desktop.custom.run({id:'mac-smoke',name:'Mac smoke',className:'CustomProcessor',methodName:'process',code:'public static String process(String input) { return input.toUpperCase(java.util.Locale.ROOT); }'}, 'hello 你好 👋'));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.value.text).toBe('HELLO 你好 👋');
  });
  await check('Native fullscreen enter and exit', async () => {
    await page.getByRole('button', {name: '切换全屏', exact: true}).click();
    await expect(page.locator('.app')).toHaveClass(/is-fullscreen/, {timeout: 15000});
    await page.keyboard.press('Escape');
    await expect(page.locator('.app')).not.toHaveClass(/is-fullscreen/, {timeout: 15000});
  });
  await check('Sandbox and offline processing', async () => {
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    expect(await page.evaluate(async () => {try {await fetch('https://example.com'); return true;} catch {return false;}})).toBe(false);
    expect(errors).toEqual([]);
  });
  await page.keyboard.press('Meta+1');
  await page.screenshot({path:`test-results/mac-${arch}.png`});
  await writeFile(`test-results/mac-${arch}.json`, JSON.stringify({arch, binary, checks, errors}, null, 2));
} finally {
  await app.evaluate(({clipboard}, text) => clipboard.writeText(text), clipboard);
  await app.close();
}
