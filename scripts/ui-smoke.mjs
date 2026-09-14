import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({...(process.env.FORMATFLOW_TEST_EXE ? {executablePath:process.env.FORMATFLOW_TEST_EXE, args:[]} : {args:[process.cwd()]}), env, timeout:30000});
const page = await app.firstWindow();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const checks = [];
const active = () => page.locator('.page-slot:not([hidden])');
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
async function appearance(label, resolved) {
  await page.getByRole('button', {name:label + '外观', exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', resolved);
}
async function navigate(key) { await page.keyboard.press(`Control+${key}`); }
async function assertLayout() {
  const overflow = await active().evaluate(root => {
    const frame = root.getBoundingClientRect();
    return [...root.querySelectorAll('button,select,input,.panel,.text-action-panel')]
      .filter(el => el.getClientRects().length && !el.closest('.cm-editor') && !el.closest('.tree-scroll'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.right > frame.right + 1 || r.left < frame.left - 1 || (!el.closest('.timestamp-scroll') && r.bottom > frame.bottom + 1); })
      .map(el => el.getAttribute('aria-label') || el.textContent);
  });
  expect(overflow).toEqual([]);
  const heights = await active().locator('.editor-host').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().height));
  heights.forEach(height => expect(height).toBeGreaterThan(70));
  const emptyOverflow = await active().locator('.output-placeholder').evaluateAll(nodes => nodes.flatMap(node => {
    const frame = node.getBoundingClientRect();
    return [...node.children].filter(el => el.getClientRects().length).filter(el => {
      const r = el.getBoundingClientRect(); return r.top < frame.top - 1 || r.bottom > frame.bottom + 1;
    }).map(el => el.textContent || el.tagName);
  }));
  expect(emptyOverflow).toEqual([]);
}
await mkdir('test-results', {recursive:true});
try {
  await page.getByRole('heading', {name:'JSON 工作台'}).waitFor();
  await check('Five tools render in light and dark appearance', async () => {
    for (const [label, theme] of [['浅色','light'],['深色','dark']]) {
      await appearance(label, theme);
      for (const [key, name] of [['1','json'],['2','sql'],['3','timestamp'],['4','config'],['5','text']]) {
        await navigate(key);
        if (key === '4') await page.getByRole('button',{name:'转换',exact:true}).click();
        if (key === '5') await page.getByRole('button',{name:'JSON 压缩',exact:true}).click();
        await assertLayout();
        const dismiss = page.getByRole('button',{name:'关闭提示',exact:true});
        if (await dismiss.count()) await dismiss.click();
        await page.screenshot({path:`test-results/ui-${name}-${theme}.png`, animations:'disabled'});
      }
    }
  });
  await check('Theme changes preserve text, undo history and result', async () => {
    const input = page.getByRole('textbox',{name:'文本输入编辑器',exact:true});
    await input.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('{"retain":true}');
    await page.getByRole('button',{name:'JSON 压缩',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'文本结果编辑器',exact:true})).toHaveText('{"retain":true}');
    await appearance('浅色','light'); await appearance('深色','dark');
    await expect(input).toHaveText('{"retain":true}');
    await expect(page.getByRole('textbox',{name:'文本结果编辑器',exact:true})).toHaveText('{"retain":true}');
    await input.click(); await page.keyboard.press('Control+z');
    await expect(input).toContainText('application');
  });
  await check('Dark editor search and folded code use the current appearance', async () => {
    await navigate('1');
    const input = page.getByRole('textbox',{name:'JSON 编辑器',exact:true});
    await input.click(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+f');
    const search = active().locator('.cm-search input').first();
    await expect(search).toBeVisible(); await search.pressSequentially('FormatFlow');
    await expect(active().locator('.cm-searchMatch').first()).toBeVisible();
    expect(await search.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(36, 36, 38)');
    await page.screenshot({path:'test-results/ui-search-dark.png',animations:'disabled'});
    await page.keyboard.press('Escape');
    await active().locator('.cm-foldGutter .cm-gutterElement').filter({hasText:'⌄'}).first().click();
    const folded = active().locator('.cm-foldPlaceholder').first();
    await expect(folded).toBeVisible();
    expect(await folded.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(41, 41, 44)');
    await folded.click();
    await expect(input).toContainText('FormatFlow');
  });
  await check('Dark selection covers last row and survives loss of focus', async () => {
    await navigate('1');
    const input = page.getByRole('textbox',{name:'JSON 编辑器',exact:true});
    await input.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('{\n  "last": true\n}');
    await page.keyboard.press('Control+a');
    const cm = input.locator('..').locator('..');
    const inspect = () => cm.evaluate(root => {
      const line = root.querySelector('.cm-line:last-child');
      const range = document.createRange(); range.selectNodeContents(line);
      const textRect = range.getBoundingClientRect();
      const selection = [...root.querySelectorAll('.cm-selectionBackground')].filter(el => {
        const r = el.getBoundingClientRect(); return r.left <= textRect.left + 1 && r.right >= textRect.right - 1 && r.top <= textRect.top + 1 && r.bottom >= textRect.bottom - 1;
      });
      return {background:getComputedStyle(line).backgroundColor, colors:selection.map(el => getComputedStyle(el).backgroundColor)};
    });
    await expect.poll(async () => (await inspect()).colors).toContain('rgb(54, 92, 137)');
    expect((await inspect()).background).toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({path:'test-results/ui-selection-dark.png'});
    await active().getByRole('button',{name:'复制',exact:true}).focus();
    await expect.poll(async () => (await inspect()).colors).toContain('rgb(64, 75, 92)');
    expect((await inspect()).background).toBe('rgba(0, 0, 0, 0)');
  });
  await check('Appearance preference persists and system changes are live', async () => {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(page.getByRole('button',{name:'深色外观',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.emulateMedia({colorScheme:'light'});
    await appearance('系统','light');
    await page.emulateMedia({colorScheme:'dark'});
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await appearance('浅色','light');
    await page.emulateMedia({colorScheme:'light'}); await page.emulateMedia({colorScheme:'dark'});
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  });
  await check('Keyboard dialog traps focus, blocks background and restores focus', async () => {
    const trigger = page.getByRole('button',{name:/^快捷键指南/});
    await trigger.click();
    const dialog = page.getByRole('dialog',{name:'快捷键指南'});
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Control+5');
    await expect(page.getByRole('navigation').getByRole('button').first()).toHaveAttribute('aria-current','page');
    await page.screenshot({path:'test-results/ui-shortcuts.png'});
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  });
  await check('Text category tabs support arrows, Home and End', async () => {
    await navigate('5');
    await page.getByRole('tab',{name:'压缩与清理',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab',{name:'命名与大小写',exact:true})).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName('命名与大小写');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab',{name:'编码与解码',exact:true})).toHaveAttribute('aria-selected','true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab',{name:'压缩与清理',exact:true})).toHaveAttribute('aria-selected','true');
  });
  await check('Minimum window fits every tool, category and split extreme', async () => {
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(940,640));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(940);
    for (const key of ['1','2','3','4','5']) { await navigate(key); await assertLayout(); }
    for (const name of ['压缩与清理','命名与大小写','按行整理','编码与解码']) {
      await page.getByRole('tab',{name,exact:true}).click(); await assertLayout();
    }
    for (const key of ['1','4','5']) {
      await navigate(key);
      const handle = active().getByRole('separator');
      await handle.focus();
      for (let i = 0; i < 23; i++) await page.keyboard.press('ArrowLeft');
      await assertLayout();
      for (let i = 0; i < 23; i++) await page.keyboard.press('ArrowRight');
      await assertLayout();
    }
    await page.screenshot({path:'test-results/ui-minimum.png'});
  });
  await check('UI text contrast and reduced motion preferences', async () => {
    for (const [label, theme] of [['浅色','light'],['深色','dark']]) {
      await appearance(label,theme);
      const contrasts = await page.evaluate(() => {
        const tokens = getComputedStyle(document.documentElement);
        const luminance = name => {
          const hex = tokens.getPropertyValue(name).trim().replace('#','');
          const rgb = [0,2,4].map(i => parseInt(hex.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
          return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
        };
        const pairs = [['--text','--surface'],['--secondary','--background'],['--tertiary','--background'],['--secondary','--sidebar'],['--accent','--surface'],['--on-accent','--accent']];
        for (const token of ['key','string','number','keyword','comment','punctuation','function']) pairs.push([`--syntax-${token}`,'--surface']);
        return pairs.map(([fg,bg]) => {
          const a=luminance(fg), b=luminance(bg); return {fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        });
      });
      for (const pair of contrasts) expect(pair.ratio,`${theme}: ${pair.fg}/${pair.bg}`).toBeGreaterThanOrEqual(4.5);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    expect(await page.getByRole('button',{name:'浅色外观',exact:true}).evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
    await appearance('浅色','light');
  });
  expect(errors).toEqual([]);
  await writeFile('test-results/ui-smoke-report.json',JSON.stringify({passed:checks.length,checks,errors},null,2));
} finally { await app.close(); }
