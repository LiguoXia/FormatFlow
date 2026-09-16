import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {CustomManager}=require('../electron/custom/manager.cjs');
await mkdir('test-results',{recursive:true});
const root=await mkdtemp(path.resolve('test-results/custom-integration-'));
const manager=new CustomManager(root,path.join(root,'cache'));
const checks=[];
async function check(name, fn){await fn();checks.push(name);console.log('PASS '+name);}
let sequence=0;
const record=(body,extra={})=>({id:'processor-'+(++sequence),name:'测试功能',description:'',className:'CustomProcessor',methodName:'process',code:`public class CustomProcessor { public static String process(String input) throws Exception { ${body} } }`,...extra});
const execute=p=>manager.job(()=>manager.execute(p,'hello 你好 👋'));
const blocked=async p=>assert.rejects(()=>execute(p),/安全限制|ClassNotFound|NoClassDefFound|SecurityException|access denied/);
await manager.init();
try {
  const env=await manager.job(()=>manager.environment());assert.equal(env.available,true,env.message);
  await check('JDK compiler detection and UTF-8 cached execution',async()=>{
    const p=record('return input.toUpperCase(java.util.Locale.ROOT);');
    const first=await execute(p),second=await execute(p);assert.equal(first.text,'HELLO 你好 👋');assert.equal(first.cached,false);assert.equal(second.cached,true);
  });
  await check('Method-only source, rename and cache invalidation',async()=>{
    const p=record('',{code:'public static String execute(String input) { return input.trim(); }',methodName:'execute'});
    assert.equal((await execute(p)).text,'hello 你好 👋');p.code=p.code.replace('input.trim()','"changed"');assert.equal((await execute(p)).text,'changed');
  });
  await check('Simplified config aliases and class text inside a method literal',async()=>{
    const p=record('',{className:undefined,methodName:undefined,method:'execute',code:'public static String execute(String input) { return "public class Decoy"; }'});
    assert.equal((await execute(p)).text,'public class Decoy');
    await assert.rejects(()=>manager.removeCache(root),/缓存目录以外/);
  });
  await check('Compiler errors include line/column and do not replace saved config',async()=>{
    const p=record('return input;');await manager.job(()=>manager.save(p));
    await assert.rejects(()=>manager.job(()=>manager.save({...p,code:'public static String process(String input) {\n return missing;\n}'})),e=>!!e.line&&e.message.includes('编译失败'));
    assert.equal((await manager.list()).find(i=>i.id===p.id).code,p.code);
  });
  await check('Public static String signature validation',async()=>{
    for(const code of ['public String process(String input) {return input;}','public static int process(String input) {return 1;}','public static String other(String input) {return input;}','public static String process(int input) {return "x";}'])await assert.rejects(()=>execute(record('',{code})),/方法/);
  });
  await check('Runtime exceptions and null/empty results',async()=>{
    await assert.rejects(()=>execute(record('int zero=0;return ""+(1/zero);')),/ArithmeticException/);
    await assert.rejects(()=>execute(record('return null;')),/null/);
    assert.equal((await execute(record('return "";'))).text,'');
  });
  await check('Pure standard libraries: regex, dates, streams and in-memory IO',async()=>{
    const p=record('java.io.StringWriter out = new java.io.StringWriter(); out.write(java.time.LocalDate.of(2026,9,16).toString()); return out.toString()+java.util.Arrays.stream(input.split(" ")).distinct().collect(java.util.stream.Collectors.joining("-"));');
    assert.equal((await execute(p)).text,'2026-09-16hello-你好-👋');
  });
  await check('Filesystem writes are denied and no file is created',async()=>{
    const file=path.join(root,'forbidden.txt');await blocked(record(`new java.io.FileOutputStream(${JSON.stringify(file)}).write(1);return input;`));await assert.rejects(()=>access(file));
  });
  await check('Filesystem reads and NIO access are denied',async()=>{
    await blocked(record(`new java.io.FileInputStream(${JSON.stringify(manager.config)}).read();return input;`));
    await blocked(record('return java.nio.file.Files.readAllLines(java.nio.file.Paths.get("anything")).toString();'));
  });
  await check('Network and external programs are denied',async()=>{
    await blocked(record('new java.net.Socket("127.0.0.1",9);return input;'));
    await blocked(record('new ProcessBuilder("cmd", "/c", "echo forbidden").start();return input;'));
    await blocked(record('Runtime.getRuntime().exec("whoami");return input;'));
  });
  await check('Dangerous reflection and environment changes are denied',async()=>{
    await blocked(record('String.class.getDeclaredField("value").setAccessible(true);return input;'));
    await blocked(record('System.setProperty("formatflow.test", "modified");return input;'));
    await blocked(record('return System.getenv().toString();'));
  });
  await check('Exit, thread spawning and disabling security are denied',async()=>{
    await blocked(record('System.exit(0);return input;'));
    await blocked(record('new Thread(() -> {}).start();return input;'));
    await blocked(record('System.setSecurityManager(null);return input;'));
  });
  await check('Static initializer is restricted before invocation',async()=>{
    await blocked(record('',{code:'public class CustomProcessor { static {System.setProperty("test","bad");} public static String process(String input) {return input;} }'}));
  });
  await check('Infinite loop is killed after five seconds; next job works',async()=>{
    const start=Date.now();await assert.rejects(()=>execute(record('while(true) {}')),/超过 5 秒/);assert.ok(Date.now()-start<12000);assert.equal((await execute(record('return "ok";'))).text,'ok');
  });
  await check('Explicit cancellation terminates in-flight process',async()=>{
    const p=record('while(true) {}');await manager.job(()=>manager.compile(p));
    const promise=execute(p);setTimeout(()=>manager.cancel(),300);await assert.rejects(()=>promise,/已取消/);assert.equal(manager.children.size,0);
  });
  await check('Memory exhaustion is contained in the Java process',async()=>{
    await assert.rejects(()=>execute(record('byte[] data=new byte[300*1024*1024];return ""+data.length;')),/OutOfMemory|内存|Java 进程失败/);
    assert.equal((await execute(record('return "alive";'))).text,'alive');
  });
  await check('Persistent settings, backups and deletion scope',async()=>{
    await manager.settings({jsonIndent:4,sqlIndent:4});const fresh=new CustomManager(root,manager.cacheRoot);await fresh.init();assert.equal((await fresh.settings()).jsonIndent,4);
    const a=await manager.job(()=>manager.save(record('return "a";'))),b=await manager.job(()=>manager.save(record('return "b";')));
    await access(manager.config+'.bak');await manager.job(()=>manager.remove(a.id));await assert.rejects(()=>access(path.join(manager.cacheRoot,'compiled',a.id)));assert.ok((await manager.list()).some(p=>p.id===b.id));
    await assert.rejects(()=>manager.remove('../escape'),/ID/);
  });
  await check('Import validates and compiles transactionally; IDs never overwrite',async()=>{
    const file=path.join(root,'backup.json');const before=await manager.list();
    await writeFile(file,JSON.stringify([record('return "import";'),record('return missing;')]));await assert.rejects(()=>manager.job(()=>manager.importFile(file)),/编译/);assert.equal((await manager.list()).length,before.length);
    await writeFile(file,JSON.stringify([before[0]]));assert.equal(await manager.job(()=>manager.importFile(file)),1);assert.equal((await manager.list()).length,before.length+1);
  });
  await check('Corrupt config is preserved and existing built-in settings work',async()=>{
    const original=await readFile(manager.config,'utf8');await writeFile(manager.config,'{broken');await assert.rejects(()=>manager.list(),/原文件已保留/);assert.equal(await readFile(manager.config,'utf8'),'{broken');assert.equal((await manager.settings()).jsonIndent,4);await writeFile(manager.config,original);
  });
  await writeFile('test-results/custom-integration-report.json',JSON.stringify({passed:checks.length,jdk:env.version,checks,root},null,2));
}finally{manager.cancel();}
