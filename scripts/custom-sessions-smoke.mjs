import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('test-results',{recursive:true});
const data=await mkdtemp(path.resolve('test-results/custom-sessions-'));
const env={...process.env,FORMATFLOW_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[process.cwd(),`--user-data-dir=${path.join(data,'browser')}`],env,timeout:30000});
const page=await app.firstWindow();
const checks=[];
const input=()=>page.getByRole('textbox',{name:'自定义输入编辑器',exact:true});
const output=()=>page.getByRole('textbox',{name:'自定义结果编辑器',exact:true});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function select(name){await page.locator('.processor-item').filter({hasText:name}).click();}
async function type(value){await input().click();await page.keyboard.press('Control+a');if(value)await page.keyboard.insertText(value);else await page.keyboard.press('Backspace');}
async function run(expected){await page.getByRole('button',{name:'执行处理',exact:true}).click();await expect(output()).toHaveText(expected,{timeout:20000});}
try{
  await page.getByRole('heading',{name:'JSON 工作台'}).waitFor();
  await page.evaluate(async()=>{
    for(const [id,name,expression] of [['session-a','功能 A','input.toUpperCase(java.util.Locale.ROOT)'],['session-b','功能 B','"B:" + input']]){
      const response=await window.desktop.custom.save({id,name,description:'',className:'CustomProcessor',methodName:'process',code:`public static String process(String input) { return ${expression}; }`});
      if(!response.ok)throw new Error(response.error.message);
    }
  });
  await page.getByRole('navigation').getByRole('button',{name:'自定义处理',exact:true}).click();
  await expect(page.locator('.custom-environment')).toContainText('已就绪',{timeout:20000});
  await check('Different processors restore independent input, output and timing',async()=>{
    await select('功能 A');await type('alpha 中文\nlast line');await run('ALPHA 中文LAST LINE');
    await select('功能 B');await expect(input()).toHaveText('hello world');await expect(output()).toHaveText('');
    await type('beta');await run('B:beta');await select('功能 A');
    await expect(input()).toHaveText('alpha 中文last line');await expect(output()).toHaveText('ALPHA 中文LAST LINE');
    await expect(page.locator('.custom-result-status')).toContainText('处理完成');
    await select('功能 B');await expect(input()).toHaveText('beta');await expect(output()).toHaveText('B:beta');
  });
  await check('Reloading processor list and visiting another tool preserve sessions',async()=>{
    await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(output()).toHaveText('B:beta');
    await page.keyboard.press('Control+1');await page.keyboard.press('Control+6');await expect(input()).toHaveText('beta');await expect(output()).toHaveText('B:beta');
  });
  await check('Editing and clearing one input do not affect other processors',async()=>{
    await type('unsent');await expect(output()).toHaveText('');await select('功能 A');await expect(output()).toHaveText('ALPHA 中文LAST LINE');
    await select('功能 B');await expect(input()).toHaveText('unsent');await type('');await select('功能 A');await select('功能 B');await expect(input()).toHaveText('');await expect(output()).toHaveText('');
  });
  await check('New draft test survives save without inheriting another session',async()=>{
    await page.getByRole('button',{name:'新增功能',exact:true}).click();await page.getByRole('textbox',{name:'功能名称',exact:true}).fill('功能 C');
    await page.getByRole('checkbox',{name:'测试输入与结果'}).check();await expect(page.getByRole('textbox',{name:'Java 测试输入',exact:true})).toHaveValue('hello world');
    await page.getByRole('textbox',{name:'Java 测试输入',exact:true}).fill('draft C');await page.getByRole('button',{name:'测试',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Java 测试结果',exact:true})).toHaveValue('draft C',{timeout:20000});
    await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.processor-item')).toHaveCount(3,{timeout:20000});
    await page.getByRole('button',{name:'处理文本',exact:true}).click();await expect(output()).toHaveText('draft C');
    await select('功能 A');await expect(output()).toHaveText('ALPHA 中文LAST LINE');await select('功能 C');await expect(input()).toHaveText('draft C');await expect(output()).toHaveText('draft C');
  });
  await check('Deleting a processor preserves other sessions',async()=>{
    await page.getByRole('button',{name:'编辑功能',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();
    await expect(page.locator('.processor-item')).toHaveCount(2);await select('功能 A');await page.getByRole('button',{name:'处理文本',exact:true}).click();await expect(output()).toHaveText('ALPHA 中文LAST LINE');
  });
  await check('Restarting renderer clears transient text while retaining configurations',async()=>{
    await page.reload();await page.getByRole('heading',{name:'JSON 工作台'}).waitFor();await page.getByRole('navigation').getByRole('button',{name:'自定义处理',exact:true}).click();
    await expect(page.locator('.processor-item')).toHaveCount(2);await select('功能 A');await expect(input()).toHaveText('hello world');await expect(output()).toHaveText('');
  });
  await writeFile('test-results/custom-sessions-report.json',JSON.stringify({passed:checks.length,checks},null,2));
}finally{await app.close();}
