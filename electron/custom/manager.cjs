const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_TEXT = 10 * 1024 * 1024;
function classInSource(code) {
  if(typeof code!=='string')return undefined;
  const stripped=code.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,' ');
  return stripped.match(/\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*class\s+([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1];
}
function validate(record) {
  if (!record || typeof record !== 'object') throw new Error('配置记录必须是对象');
  record = {...record, methodName: record.methodName || record.method || 'process', className: record.className || classInSource(record.code) || 'CustomProcessor'};
  for (const key of ['name','className','methodName','code']) if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`缺少有效字段：${key}`);
  if (!IDENTIFIER.test(record.className) || !IDENTIFIER.test(record.methodName) || record.className.startsWith('FormatFlowRunner')) throw new Error('类名和方法名必须是简单 Java 标识符，不支持 package 声明');
  if (record.name.length > 100 || (record.description || '').length > 1000 || record.code.length > 100000) throw new Error('名称、描述或代码过长（代码上限 100 KB）');
  if (record.id !== undefined && (typeof record.id !== 'string' || !ID.test(record.id))) throw new Error('配置 ID 无效');
  if (record.description !== undefined && typeof record.description !== 'string') throw new Error('描述必须是文本');
  return {id:record.id?.toLowerCase() || crypto.randomUUID(),name:record.name.trim(),description:record.description || '',className:record.className,methodName:record.methodName,code:record.code,createTime:typeof record.createTime === 'string' ? record.createTime : new Date().toISOString(),updateTime:new Date().toISOString()};
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file,'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`配置文件无法读取，请修复或从 .bak 恢复，原文件已保留：${file}`); }
}
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp,JSON.stringify(value,null,2),'utf8');
    try { await fs.copyFile(file,file + '.bak'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
    await fs.rename(temp,file);
  } finally { await fs.rm(temp,{force:true}).catch(()=>{}); }
}
class CustomManager {
  constructor(root, cacheRoot, source = path.join(__dirname,'FormatFlowRunner.java')) {
    this.root=root; this.cacheRoot=cacheRoot; this.source=source;
    this.config=path.join(root,'config','custom-processors.json');
    this.settingsFile=path.join(root,'config','settings.json');
    this.children=new Set(); this.busy=false; this.cancelled=false; this.jdk=null;
  }
  async init() {
    await fs.mkdir(path.dirname(this.config),{recursive:true}); await fs.mkdir(this.cacheRoot,{recursive:true});
    try { await fs.writeFile(this.config,'[]\n',{flag:'wx'}); } catch(e) { if(e.code!=='EEXIST') throw e; }
    try { await fs.writeFile(this.settingsFile,'{"jsonIndent":2,"sqlIndent":2,"javaIndent":4}\n',{flag:'wx'}); } catch(e) { if(e.code!=='EEXIST') throw e; }
  }
  async removeCache(target) {
    const base=path.resolve(this.cacheRoot,'compiled'), resolved=path.resolve(target);
    const relative=path.relative(base,resolved);
    if(!relative || relative.startsWith('..') || path.isAbsolute(relative))throw new Error('拒绝删除缓存目录以外的路径');
    await fs.rm(resolved,{recursive:true,force:true});
  }
  async list() {
    const data=await readJson(this.config,[]);
    if(!Array.isArray(data) || data.length>100) throw new Error('配置必须是数组，最多 100 个功能');
    const seen=new Set();
    return data.map(item=>{const result=validate({...item,id:item.id || crypto.createHash('sha256').update(item.name+'|'+item.className).digest('hex').slice(0,24)}); if(seen.has(result.id)) throw new Error('配置包含重复 ID'); seen.add(result.id); return {...result,updateTime:item.updateTime || result.updateTime};});
  }
  async settings(patch) {
    const settings=await readJson(this.settingsFile,{jsonIndent:2,sqlIndent:2,javaIndent:4});
    if(patch) {
      if(typeof patch!=='object') throw new Error('设置格式无效');
      for(const [key,value] of Object.entries(patch)) { if(!['jsonIndent','sqlIndent','javaIndent'].includes(key) || ![2,4].includes(value)) throw new Error('缩进只支持 2 或 4 个空格'); settings[key]=value; }
      await atomicJson(this.settingsFile,settings);
    }
    return {jsonIndent:settings.jsonIndent===4?4:2,sqlIndent:settings.sqlIndent===4?4:2,javaIndent:settings.javaIndent===2?2:4};
  }
  cancel() { this.cancelled=true; for(const child of this.children) child.kill(); }
  async job(fn) {
    if(this.busy) throw new Error('已有自定义任务在运行，请等待或取消');
    this.busy=true; this.cancelled=false;
    try { return await fn(); } finally { this.busy=false; }
  }
  async process(executable,args,input='',timeout=20000) {
    if(this.cancelled) throw new Error('已取消处理');
    return new Promise((resolve,reject)=>{
      const env={};
      for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','TEMP','TMP','USERPROFILE','HOME']) if(process.env[key]) env[key]=process.env[key];
      const child=spawn(executable,args,{windowsHide:true,shell:false,env,stdio:['pipe','pipe','pipe']}); this.children.add(child);
      let output=[],errors=[],size=0,problem='';
      const timer=setTimeout(()=>{problem=`超过 ${timeout/1000} 秒，已终止 Java 进程`;child.kill();},timeout);
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>20*1024*1024){problem='输出过大，已终止 Java 进程';child.kill();}else output.push(chunk);});
      child.stderr.on('data',chunk=>{if(Buffer.concat(errors).length<64000)errors.push(chunk);});
      child.once('error',error=>{clearTimeout(timer);this.children.delete(child);reject(new Error(`无法启动 JDK：${error.message}`));});
      child.once('close',code=>{clearTimeout(timer);this.children.delete(child);if(this.cancelled)reject(new Error('已取消处理'));else if(problem)reject(new Error(problem));else if(code!==0)reject(new Error(`Java 进程失败（${code}）：${Buffer.concat(errors).toString('utf8').slice(0,3000)}`));else resolve({stdout:Buffer.concat(output).toString('utf8'),stderr:Buffer.concat(errors).toString('utf8')});});
      child.stdin.on('error',()=>{});child.stdin.end(input);
    });
  }
  async environment() {
    const suffix=process.platform==='win32'?'.exe':'';
    const candidates=[];
    if(process.env.JAVA_HOME)candidates.push(path.join(process.env.JAVA_HOME,'bin'));
    for(const folder of (process.env.PATH||process.env.Path||'').split(path.delimiter)) if(folder)candidates.push(folder.replace(/^"|"$/g,''));
    const failures=[];
    for(const bin of [...new Set(candidates)]) {
      const java=path.join(bin,'java'+suffix),javac=path.join(bin,'javac'+suffix);
      try {await fs.access(java);await fs.access(javac);}catch{continue;}
      try {
        const [runtime,compiler]=[await this.process(java,['-version'],'',5000),await this.process(javac,['-version'],'',5000)];
        const raw=runtime.stderr+runtime.stdout; const version=raw.match(/version\s+"(?:1\.)?(\d+)/)?.[1];
        const major=Number(version), compilerMajor=Number((compiler.stderr+compiler.stdout).match(/javac\s+(?:1\.)?(\d+)/)?.[1]);
        if(!major || major!==compilerMajor || major<8 || major>=24){failures.push(`发现 JDK ${major || '?'}，当前安全执行支持 JDK 8–23，推荐 JDK 21。`);continue;}
        const stat=await fs.stat(java);
        this.jdk={available:true,java,javac,major,version:raw.split(/\r?\n/)[0],home:path.dirname(bin),key:java+'|'+raw+'|'+stat.mtimeMs};
        return {...this.jdk,message:`JDK ${major} 已就绪`,configPath:this.config};
      }catch(e){failures.push(e.message);}
    }
    this.jdk=null;return {available:false,message:failures[0] || '未找到完整 JDK。请安装 JDK 21，并配置 JAVA_HOME 与 PATH 后重新检测。',configPath:this.config};
  }
  async ensureJdk() { if(!this.jdk){const result=await this.environment();if(!result.available)throw new Error(result.message);}return this.jdk; }
  async runner() {
    const jdk=await this.ensureJdk(); const source=await fs.readFile(this.source,'utf8');
    const hash=crypto.createHash('sha256').update(source+jdk.key).digest('hex');
    const dir=path.join(this.cacheRoot,'runner',hash);
    try{await fs.access(path.join(dir,'FormatFlowRunner.class'));}catch{
      await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'FormatFlowRunner.java'),source.replace(/^\uFEFF/,''));
      await this.process(jdk.javac,['-encoding','UTF-8','-d',dir,path.join(dir,'FormatFlowRunner.java')]);
    }
    return {jdk,dir,hash};
  }
  async invoke(mode,processor,dir,runner,input='') {
    const options=['-Xmx192m','-Xss512k','-XX:MaxMetaspaceSize=96m','-Dfile.encoding=UTF-8'];
    if(runner.jdk.major>=18)options.push('-Djava.security.manager=allow');
    const raw=await this.process(runner.jdk.java,[...options,'-cp',runner.dir,'FormatFlowRunner',mode,dir,processor.className,processor.methodName],mode==='run'?Buffer.from(input,'utf8').toString('base64')+'\n':'',mode==='run'?5000:20000);
    let data;try{data=JSON.parse(raw.stdout);}catch{throw new Error('Java 未返回有效结果（可能内存不足或输出超限）');}
    if(!data.ok){const error=new Error(data.message);error.line=data.line>0?data.line:undefined;error.column=data.column>0?data.column:undefined;throw error;}return data;
  }
  async compile(record) {
    const processor=validate(record), runner=await this.runner();
    const hash=crypto.createHash('sha256').update(processor.code+processor.className+processor.methodName+runner.hash).digest('hex');
    const dir=path.join(this.cacheRoot,'compiled',processor.id,hash);
    const marker=path.join(dir,'ready.json');
    try{await fs.access(marker);await fs.access(path.join(dir,processor.className+'.class'));return {processor,runner,dir,cached:true};}catch{}
    await fs.mkdir(dir,{recursive:true});
    const code=classInSource(processor.code)?processor.code:`public class ${processor.className} {\n${processor.code}\n}`;
    await fs.writeFile(path.join(dir,processor.className+'.java'),code,'utf8');
    try{await this.invoke('compile',processor,dir,runner);await fs.writeFile(marker,JSON.stringify({hash}));}
    catch(error){if(code!==processor.code && error.line)error.line=Math.max(1,error.line-1);await this.removeCache(dir);throw error;}
    return {processor,runner,dir,cached:false};
  }
  async execute(record,input) {
    if(typeof input!=='string' || Buffer.byteLength(input,'utf8')>MAX_TEXT)throw new Error('输入必须是文本，且不超过 10 MB');
    const result=await this.compile(record);const start=Date.now();
    const value=await this.invoke('run',result.processor,result.dir,result.runner,input);
    return {text:value.text,cached:result.cached,durationMs:Date.now()-start};
  }
  async save(record) {
    const list=await this.list(), processor=validate(record);const old=list.find(item=>item.id===processor.id);
    const compiled=await this.compile(processor); if(this.cancelled)throw new Error('已取消保存');
    processor.createTime=old?.createTime || processor.createTime;
    const next=list.filter(item=>item.id!==processor.id);if(next.length>=100)throw new Error('最多保存 100 个功能');next.push(processor);
    await atomicJson(this.config,next);
    const root=path.dirname(compiled.dir);
    for(const child of await fs.readdir(root)) if(child!==path.basename(compiled.dir)) await this.removeCache(path.join(root,child));
    return processor;
  }
  async remove(id) {
    if(typeof id!=='string'||!ID.test(id))throw new Error('配置 ID 无效');
    id=id.toLowerCase();
    const list=await this.list();await atomicJson(this.config,list.filter(item=>item.id!==id));
    await this.removeCache(path.join(this.cacheRoot,'compiled',id));return true;
  }
  async importFile(file) {
    const stat=await fs.stat(file);if(stat.size>5*1024*1024)throw new Error('导入文件不能超过 5 MB');
    const data=await readJson(file,[]);if(!Array.isArray(data)||!data.length||data.length>100)throw new Error('导入内容必须是非空数组，最多 100 个功能');
    const original=await this.list();if(original.length+data.length>100)throw new Error('导入后超过 100 个功能');
    const imported=data.map(item=>validate({...item,id:crypto.randomUUID()}));
    try {for(const processor of imported){try{await this.compile(processor);}catch(error){error.message=`导入「${processor.name}」失败${error.line?`（第 ${error.line} 行）`:''}：${error.message}`;throw error;}}if(this.cancelled)throw new Error('已取消导入');await atomicJson(this.config,[...original,...imported]);}
    catch(error){for(const item of imported)await this.removeCache(path.join(this.cacheRoot,'compiled',item.id));throw error;}
    return imported.length;
  }
}
module.exports={CustomManager,validate,atomicJson};
