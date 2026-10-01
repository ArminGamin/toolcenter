const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root='D:/jaukumas',out='D:/toolsai/control-center/output',ts=require(root+'/node_modules/typescript');
const originalLoad=Module._load;
Module._load=function(specifier,parent,...args){
 if(specifier==='server-only')return{};
 if(specifier==='@/lib/security/guard')return{denyPost:()=>null};
 if(specifier==='@/lib/newsletter/discord-webhook')return{notifyDiscordNewsletter:async()=>{}};
 if(specifier==='next/server')return{NextResponse:{json:(data,init)=>({data,status:init?.status||200})}};
 if(specifier.startsWith('@/'))specifier=path.join(root,'src',specifier.slice(2));
 return originalLoad.call(this,specifier,parent,...args);
};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
async function main(){
 const audit=JSON.parse(fs.readFileSync(out+'/site-functional-audit.json','utf8')),base=audit.pages.live.base,assets=new Set(),imageUrls=new Set(),metadata=[],routes=audit.pages.live.pages.map(p=>p.route);
 let i=0;
 await Promise.all(Array.from({length:4},async()=>{while(i<routes.length){const route=routes[i++],html=await(await fetch(base+route)).text();
  for(const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)){const src=m[1].replace(/&amp;/g,'&');if(src.startsWith('/_next/image?')){assets.add(new URL(src,base).searchParams.get('url'));imageUrls.add(src);}else if(src.startsWith('/'))assets.add(src);}
  for(const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/[^"]+)"/g)){const asset=m[1].replace(/&amp;/g,'&');if(/\.(?:css|js|woff2?)(?:\?|$)/.test(asset))assets.add(asset);}
  const desc=html.match(/<meta name="description" content="([^"]*)"/);if(desc&&(/1.?2|49/.test(desc[1])))metadata.push({route,description:desc[1]});
 }}));
 const results=[];i=0;const list=[...assets].filter(Boolean);
 await Promise.all(Array.from({length:4},async()=>{while(i<list.length){const asset=list[i++];try{const r=await fetch(base+asset,{method:'HEAD',signal:AbortSignal.timeout(15000)});results.push({asset,status:r.status,type:r.headers.get('content-type')});}catch(e){results.push({asset,error:e.message});}}}));
 const images=[];for(const src of [...imageUrls].slice(0,5)){const r=await fetch(base+src,{signal:AbortSignal.timeout(20000)});images.push({src,status:r.status,type:r.headers.get('content-type')});await r.body?.cancel();}
 const {POST}=require(root+'/src/app/api/newsletter/route.ts'),realFetch=global.fetch,realLog=console.log;console.log=()=>{};
 const newsletter=[];process.env.KLAVIYO_API_KEY='qa_fake_public';process.env.KLAVIYO_LIST_ID='qa_fake_list';
 for(const status of [202,400,500]){global.fetch=async()=>new Response('{}',{status});const r=await POST(new Request('http://localhost/api/newsletter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'test.only@gmail.com',consent:true})}));newsletter.push({providerHttpStatus:status,response:r});}
 delete process.env.KLAVIYO_API_KEY;delete process.env.KLAVIYO_LIST_ID;newsletter.push({provider:'not configured',response:await POST(new Request('http://localhost/api/newsletter',{method:'POST',body:JSON.stringify({email:'test.only@gmail.com',consent:true})}))});
 global.fetch=realFetch;console.log=realLog;
 const result={liveReferencedAssets:{checked:results.length,failures:results.filter(r=>r.status!==200),optimizedImageSamples:images},metadata,newsletter};fs.writeFileSync(out+'/site-integration-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
