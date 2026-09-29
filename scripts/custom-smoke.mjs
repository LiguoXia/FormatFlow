import { _electron as electron, expect } from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
await mkdir('test-results',{recursive:true});
const data=await mkdtemp(path.resolve('test-results/custom-desktop-'));
const env={...process.env,FORMATFLOW_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[process.cwd(),`--user-data-dir=${path.join(data,'browser')}`],env,timeout:30000});
const page=await app.firstWindow();
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const active=()=>page.locator('.page-slot:not([hidden])');
async function code(value){const field=page.getByRole('textbox',{name:'Java 代码编辑器',exact:true});await field.click();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(value);}
try {
 await page.getByRole('heading',{name:'JSON 工作台'}).waitFor();
 await check('Persistent JSON/SQL indentation across reload',async()=>{
   await page.getByRole('combobox',{name:'JSON 缩进'}).selectOption('4');await page.keyboard.press('ControlOrMeta+2');await page.getByRole('combobox',{name:'SQL 缩进'}).selectOption('4');
   await expect.poll(async()=>JSON.parse(await readFile(path.join(data,'config/settings.json'),'utf8')).sqlIndent).toBe(4);
   await page.reload();await expect(page.getByRole('combobox',{name:'JSON 缩进'})).toHaveValue('4');await page.keyboard.press('ControlOrMeta+2');await expect(page.getByRole('combobox',{name:'SQL 缩进'})).toHaveValue('4');
 });
 await page.keyboard.press('ControlOrMeta+6');
 await check('New Java processor, editor syntax, test and save',async()=>{
   await expect(page.locator('.custom-environment')).toContainText('已就绪',{timeout:15000});
   await page.getByRole('button',{name:'新增功能',exact:true}).click();await page.getByRole('textbox',{name:'功能名称',exact:true}).fill('自定义大写');
   await code('public static String process(String input) {\n    return input.toUpperCase(java.util.Locale.ROOT);\n}');
   await expect(page.getByRole('textbox',{name:'Java 代码编辑器'}).locator('span').first()).toBeVisible();
   await page.getByRole('button',{name:'测试',exact:true}).click();await expect(page.getByRole('textbox',{name:'Java 测试结果',exact:true})).toHaveValue('HELLO WORLD',{timeout:30000});
   await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.processor-item')).toContainText('自定义大写',{timeout:30000});
   await page.screenshot({path:'test-results/custom-editor.png'});
 });
 await check('Execute persisted processor, editable input and copyable result',async()=>{
   await page.getByRole('button',{name:'处理文本',exact:true}).click();await page.getByRole('button',{name:'执行处理',exact:true}).click();
   await expect(page.getByRole('textbox',{name:'自定义结果编辑器',exact:true})).toHaveText('HELLO WORLD',{timeout:10000});await expect(page.locator('.custom-result-status')).toContainText('使用编译缓存');
   await page.screenshot({path:'test-results/custom-process.png'});
   await page.reload();await page.getByRole('heading',{name:'JSON 工作台'}).waitFor();await page.getByRole('navigation').getByRole('button',{name:'自定义处理',exact:true}).click();await expect(page.locator('.processor-item')).toContainText('自定义大写');await expect(page.locator('.custom-environment')).toContainText('已就绪');
 });
 await check('Compilation error location and draft discard confirmation',async()=>{
   await page.getByRole('button',{name:'编辑功能',exact:true}).click();await code('public static String process(String input) {\n    return missing;\n}');await page.getByRole('button',{name:'保存',exact:true}).click();
   await expect(page.getByRole('alert')).toContainText('编译失败',{timeout:15000});await expect(page.getByRole('alert')).toContainText('Line 2');await page.getByRole('button',{name:'定位错误',exact:true}).click();
   await expect(active().locator('.cm-lintRange-error')).toHaveCount(1);
   await page.getByRole('button',{name:'新增功能',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();
 });
 await check('Cancellation and timeout leave the desktop responsive',async()=>{
   await code('public static String process(String input) { while(true) {} }');await page.getByRole('button',{name:'测试',exact:true}).click();
   await expect(page.getByRole('alert')).toContainText('超过 5 秒',{timeout:20000});
   await page.getByRole('button',{name:'测试',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('alert')).toContainText('取消',{timeout:10000});
 });
 await check('Export/import uses native dialogs and compiles imported code',async()=>{
   const backup=path.join(data,'FormatFlowProcessorBackup.json');
   await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},backup);
   await page.getByRole('button',{name:'导出',exact:true}).click();await expect.poll(async()=>{try{return JSON.parse(await readFile(backup,'utf8')).length;}catch{return 0;}}).toBe(1);
   await page.getByRole('button',{name:'导入',exact:true}).click();await expect(page.locator('.processor-item')).toHaveCount(2,{timeout:20000});
 });
 await check('Minimum window, dark appearance and JDK tutorial are usable',async()=>{
   await page.getByRole('button',{name:'深色外观',exact:true}).click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(940,640));
   await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(940);
   await page.getByRole('button',{name:'JDK 配置教程',exact:true}).click();await expect(page.locator('.jdk-guide')).toContainText('JAVA_HOME');await page.getByRole('button',{name:'关闭 JDK 教程',exact:true}).click();
   await page.screenshot({path:'test-results/custom-minimum-dark.png'});
   const horizontal=await active().evaluate(root=>root.scrollWidth>root.clientWidth+1);expect(horizontal).toBe(false);
 });
 await check('Delete one processor and preserve another',async()=>{
   await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('.processor-item')).toHaveCount(1);
 });
 await check('Fullscreen arrows point outward on entry and inward on exit',async()=>{
   const button=page.getByRole('button',{name:'切换全屏',exact:true});await expect(button.locator('svg')).toHaveAttribute('data-direction','outward');await button.click();await expect(button.locator('svg')).toHaveAttribute('data-direction','inward');await expect(button).toHaveAttribute('title','退出全屏 · Esc / F11');await page.keyboard.press('Escape');await expect(button.locator('svg')).toHaveAttribute('data-direction','outward');
 });
 expect(errors).toEqual([]);await writeFile('test-results/custom-smoke-report.json',JSON.stringify({passed:checks.length,checks,errors,data},null,2));
}finally{await app.close();}
