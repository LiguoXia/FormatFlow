import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({...(process.env.FORMATFLOW_TEST_EXE ? {executablePath:process.env.FORMATFLOW_TEST_EXE, args:[]} : {args:[process.cwd()]}), env, timeout:30000});
const page = await app.firstWindow();
const clipboardBefore = await app.evaluate(({clipboard}) => clipboard.readText());
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
const active = () => page.locator('.page-slot:not([hidden])');
const input = (name) => page.getByRole('textbox', {name, exact:true});
async function setText(name, text) { await input(name).click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(text); }
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
await mkdir('test-results', {recursive:true});
try {
  await page.getByRole('heading', {name:'JSON 工作台'}).waitFor();
  await page.getByRole('button', {name:'浅色外观',exact:true}).click();
  await check('Ctrl+A highlights final text row, including unfocused selection', async () => {
    await setText('JSON 编辑器', '{\n  "hello": "world"\n}');
    await page.keyboard.press('Control+a');
    const field = input('JSON 编辑器');
    const cm = field.locator('..').locator('..');
    await expect(cm).toHaveAttribute('data-has-selection', 'true');
    await expect(active().locator('.selection-count')).toContainText('已选 22 字符');
    const inspect = () => cm.evaluate((root) => {
      const last = root.querySelector('.cm-line:last-child');
      const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
      let node, finalNode; while ((node = walker.nextNode())) {if (node.textContent.length) finalNode = node;}
      const range = document.createRange(); range.setStart(finalNode, finalNode.length - 1); range.setEnd(finalNode, finalNode.length);
      const rect = range.getBoundingClientRect();
      const covering = [...root.querySelectorAll('.cm-selectionBackground')].filter((el) => {const r=el.getBoundingClientRect(); return r.left <= rect.left + 2 && r.right >= rect.right - 2 && r.top <= rect.top + 3 && r.bottom >= rect.bottom - 3;});
      return {activeBackground:getComputedStyle(last).backgroundColor, covering:covering.length, colors:covering.map((el)=>getComputedStyle(el).backgroundColor)};
    });
    await expect.poll(async () => (await inspect()).covering).toBeGreaterThan(0);
    expect((await inspect()).activeBackground).toBe('rgba(0, 0, 0, 0)');
    expect((await inspect()).colors).toContain('rgb(197, 218, 247)');
    await page.keyboard.press('Control+c');
    await expect.poll(() => app.evaluate(({clipboard}) => clipboard.readText())).toBe('{\n  "hello": "world"\n}');
    await page.screenshot({path:'test-results/selection-focused.png'});
    await active().getByRole('button', {name:'复制',exact:true}).focus();
    expect((await inspect()).activeBackground).toBe('rgba(0, 0, 0, 0)');
    await expect.poll(async () => (await inspect()).covering).toBeGreaterThan(0);
    await page.screenshot({path:'test-results/selection-unfocused.png'});
  });
  await check('Text navigation and lossless JSON minification', async () => {
    await page.keyboard.press('Control+5');
    await expect(page.getByRole('heading', {name:'文本处理',exact:true})).toBeVisible();
    await setText('文本输入编辑器', '{\n "id": 900719925474099312345,\n "message": "hello  world"\n}');
    await page.getByRole('button',{name:'JSON 压缩',exact:true}).click();
    await expect(input('文本结果编辑器')).toHaveText('{"id":900719925474099312345,"message":"hello  world"}');
    await page.getByRole('button',{name:'复制结果',exact:true}).click();
    await expect.poll(() => app.evaluate(({clipboard})=>clipboard.readText())).toBe('{"id":900719925474099312345,"message":"hello  world"}');
    await setText('文本输入编辑器', '{"bad":}');
    await page.getByRole('button',{name:'JSON 压缩',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Line 1');
    await expect(input('文本输入编辑器')).toHaveText('{"bad":}');
  });
  await check('Case conversions, chained operations and undo', async () => {
    await page.getByRole('tab',{name:'命名与大小写'}).click();
    await setText('文本输入编辑器','user_name\nHTTP_server');
    await page.getByRole('button',{name:'小驼峰 camelCase',exact:true}).click();
    await expect(input('文本结果编辑器')).toContainText('userName');
    await expect(input('文本结果编辑器')).toContainText('httpServer');
    await page.getByRole('button',{name:'用结果继续处理',exact:true}).click();
    await expect(input('文本输入编辑器')).toContainText('userName');
    await page.getByRole('button',{name:'下划线 snake_case',exact:true}).click();
    await expect(input('文本结果编辑器')).toContainText('http_server');
    await input('文本输入编辑器').click(); await page.keyboard.press('Control+z');
    await expect(input('文本输入编辑器')).toContainText('HTTP_server');
    await page.getByRole('button',{name:'全部大写',exact:true}).click();
    await expect(input('文本结果编辑器')).toContainText('USER_NAME');
    await page.getByRole('button',{name:'全部小写',exact:true}).click();
    await expect(input('文本结果编辑器')).toContainText('http_server');
    await page.screenshot({path:'test-results/text-tools.png'});
  });
  await check('Mouse selection, final row and read-only output copying', async () => {
    await setText('文本输入编辑器','FIRST\nFINAL');
    await page.getByRole('button',{name:'全部小写',exact:true}).click();
    await expect(input('文本结果编辑器')).toContainText('final');
    const field=input('文本结果编辑器');
    const first=await field.locator('.cm-line').first().boundingBox();
    const last=await field.locator('.cm-line').last().boundingBox();
    await page.mouse.move(first.x + 12, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + 90, last.y + last.height / 2,{steps:12});
    await page.mouse.up();
    await expect(field.locator('..').locator('..')).toHaveAttribute('data-has-selection','true');
    await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
    await expect.poll(() => app.evaluate(({clipboard})=>clipboard.readText())).toBe('first\nfinal');
    await page.keyboard.insertText('must not modify');
    await expect(field).toHaveText('firstfinal');
  });
  await check('Line cleanup, valid empty result and Unicode Base64', async () => {
    await page.getByRole('tab',{name:'按行整理'}).click();
    await setText('文本输入编辑器','item10\nitem2\nitem10');
    await page.getByRole('button',{name:'去重行',exact:true}).click();
    await expect(input('文本结果编辑器')).toHaveText('item10item2');
    await page.getByRole('button',{name:'用结果继续处理',exact:true}).click();
    await page.getByRole('button',{name:'按行升序',exact:true}).click();
    await expect(input('文本结果编辑器')).toHaveText('item2item10');
    await page.getByRole('tab',{name:'压缩与清理'}).click();
    await setText('文本输入编辑器',' \n\t ');
    await page.getByRole('button',{name:'删除空行',exact:true}).click();
    await expect(page.getByRole('heading',{name:'处理完成，结果为空'})).toBeVisible();
    await page.getByRole('tab',{name:'编码与解码'}).click();
    await setText('文本输入编辑器','你好 👋');
    await page.getByRole('button',{name:'Base64 编码',exact:true}).click();
    await expect(input('文本结果编辑器')).toHaveText('5L2g5aW9IPCfkYs=');
    await page.getByRole('button',{name:'用结果继续处理',exact:true}).click();
    await page.getByRole('button',{name:'Base64 解码',exact:true}).click();
    await expect(input('文本结果编辑器')).toHaveText('你好 👋');
  });
  await check('All five navigation items and new panels fit minimum window', async () => {
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(940,640));
    await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(940);
    for(const name of ['压缩与清理','命名与大小写','按行整理','编码与解码']) {
      await page.getByRole('tab',{name,exact:true}).click();
      const overflowing=await active().evaluate((root)=>{
        const frame=root.getBoundingClientRect();
        return [...root.querySelectorAll('button,.panel')].filter(el=>el.getClientRects().length&&!el.closest('.cm-editor')).filter(el=>{const r=el.getBoundingClientRect(); return r.left < frame.left-1 || r.right>frame.right+1 || r.bottom>frame.bottom+1;}).map(el=>el.textContent);
      });
      expect(overflowing).toEqual([]);
    }
    await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
    const nav=await page.getByRole('navigation').boundingBox();
    const sidebar=await page.locator('.sidebar').boundingBox();
    expect(nav.y+nav.height).toBeLessThan(sidebar.y+sidebar.height);
    await page.screenshot({path:'test-results/text-minimum.png'});
    expect(errors).toEqual([]);
  });
  await writeFile('test-results/text-smoke-report.json',JSON.stringify({passed:checks.length,checks,errors},null,2));
} finally { await app.evaluate(({clipboard}, text)=>clipboard.writeText(text),clipboardBefore); await app.close(); }
