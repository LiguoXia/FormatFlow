import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
await mkdir('test-results',{recursive:true});const root=await mkdtemp(path.resolve('test-results/no-jdk-'));
const env={...process.env,FORMATFLOW_TEST_DATA:root,JAVA_HOME:path.join(root,'missing'),PATH:'',Path:''};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[process.cwd()],env});const page=await app.firstWindow();
try {
 await page.getByRole('heading',{name:'JSON 工作台'}).waitFor();await page.getByRole('button',{name:/^格式化 Ctrl/}).click();await expect(page.locator('.valid-badge')).toContainText('有效 JSON');
 await page.getByRole('navigation').getByRole('button',{name:'自定义处理',exact:true}).click();await expect(page.locator('.custom-environment')).toContainText('未找到完整 JDK');
 await page.getByRole('button',{name:'新增功能',exact:true}).click();await page.getByRole('textbox',{name:'功能名称',exact:true}).fill('无 JDK 测试');await expect(page.getByRole('button',{name:'保存',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'测试',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'JDK 配置教程',exact:true}).click();await expect(page.locator('.jdk-guide')).toContainText('javac -version');await page.screenshot({path:'test-results/custom-no-jdk.png'});
 await writeFile('test-results/no-jdk-report.json',JSON.stringify({passed:true,checks:['Built-in JSON works without JDK','Missing JDK message','Execution/save disabled','Installation tutorial available']},null,2));console.log('PASS no-JDK desktop experience and existing tools');
} finally {await app.close();}
