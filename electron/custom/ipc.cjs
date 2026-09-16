const {dialog, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {CustomManager} = require('./manager.cjs');
function installCustom({app, ipcMain, validSender, getWindow}) {
  const testRoot = !app.isPackaged && process.env.FORMATFLOW_TEST_DATA;
  const root = testRoot || path.join(app.getPath('appData'),'FormatFlow');
  const cache = testRoot ? path.join(testRoot,'processors') : path.join(process.env.LOCALAPPDATA || app.getPath('userData'),'FormatFlow','processors');
  const manager = new CustomManager(root,cache);
  const ready = manager.init();
  ready.then(() => manager.list()).catch(() => {});
  // Register immediately; every request waits for directory initialization.
  let settingsQueue = Promise.resolve();
  const handle = (name, fn) => ipcMain.handle(name,async(event,...args)=>{
    if(!validSender(event))return {ok:false,error:{message:'请求来源无效'}};
    try{await ready;return {ok:true,value:await fn(...args)};}
    catch(error){return {ok:false,error:{message:error.message || '操作失败',line:error.line,column:error.column}};}
  });
  handle('custom:list',()=>manager.list());
  handle('custom:environment',()=>manager.job(()=>manager.environment()));
  handle('custom:save',record=>manager.job(()=>manager.save(record)));
  handle('custom:run',(record,input)=>manager.job(()=>manager.execute(record,input)));
  handle('custom:remove',id=>manager.job(()=>manager.remove(id)));
  handle('custom:cancel',()=>{manager.cancel();return true;});
  handle('custom:folder',async()=>{await shell.openPath(path.dirname(manager.config));return true;});
  handle('custom:export',async()=>{
    const items=await manager.list();
    const result=await dialog.showSaveDialog(getWindow(),{title:'导出自定义处理配置',defaultPath:'FormatFlowProcessorBackup.json',filters:[{name:'JSON 配置',extensions:['json']}]});
    if(result.canceled||!result.filePath)return false;
    await fs.writeFile(result.filePath,JSON.stringify(items,null,2),'utf8');return true;
  });
  handle('custom:import',()=>manager.job(async()=>{
    const result=await dialog.showOpenDialog(getWindow(),{title:'导入自定义处理配置',properties:['openFile'],filters:[{name:'JSON 配置',extensions:['json']}]});
    if(result.canceled)return null;return manager.importFile(result.filePaths[0]);
  }));
  handle('settings:read',()=>manager.settings());
  handle('settings:write',patch=>{const next=settingsQueue.then(()=>manager.settings(patch));settingsQueue=next.catch(()=>{});return next;});
  app.on('before-quit',()=>manager.cancel());
  ready.catch(()=>{});
  return manager;
}
module.exports={installCustom};
