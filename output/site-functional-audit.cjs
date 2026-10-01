const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root='D:/jaukumas',out='D:/toolsai/control-center/output';
const ts=require(root+'/node_modules/typescript');
const originalLoad=Module._load;
Module._load=function(specifier,parent,...args){
 if(specifier==='server-only')return{};
 if(specifier.startsWith('@/'))specifier=path.join(root,'src',specifier.slice(2));
 return originalLoad.call(this,specifier,parent,...args);
};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {products}=require(root+'/src/lib/data/products.ts');
const {collections}=require(root+'/src/lib/data/collections.ts');
const {searchProducts}=require(root+'/src/lib/search.ts');
const {validateCustomer}=require(root+'/src/lib/checkout/customer.ts');
const {csrfMatches,CSRF_COOKIE,CSRF_HEADER}=require(root+'/src/lib/security/csrf.ts');
const {takeToken}=require(root+'/src/lib/security/rate-limit.ts');
const result={checks:[],dataIssues:[],quiz:{},pages:{},assets:{},api:[]};
function check(name,fn){try{fn();result.checks.push({name,pass:true});}catch(e){result.checks.push({name,pass:false,error:e.message});}}
check('all products can be found by their complete name',()=>{for(const p of products)assert(searchProducts(p.name).some(r=>r.slug===p.slug),p.slug);});
check('Lithuanian accents do not prevent search',()=>assert.deepEqual(searchProducts('žvakė').map(p=>p.slug),searchProducts('zvake').map(p=>p.slug)));
check('empty and unmatched queries have no results',()=>{assert.equal(searchProducts('').length,0);assert.equal(searchProducts('zzzzqqqqxx').length,0);});
const person={email:'audit.only@gmail.com',name:'Ąžuolas',surname:'Žiema',address:'Testų gatvė 12',city:'Šiauliai',region:'',postalCode:'01100',phone:'+37060000000'};
check('valid Lithuanian customer fields are accepted',()=>assert.equal(Object.keys(validateCustomer(person).errors).length,0));
check('empty customer fields are rejected',()=>assert.equal(Object.keys(validateCustomer({}).errors).length,7));
check('valid company email is accepted',()=>assert.equal(validateCustomer({...person,email:'audit@example.lt'}).errors.email,undefined));
check('CSRF matching token accepted and mismatch rejected',()=>{const req=token=>new Request('http://localhost/',{headers:{cookie:`${CSRF_COOKIE}=sampletoken`,[CSRF_HEADER]:token}});assert(csrfMatches(req('sampletoken')));assert(!csrfMatches(req('othertoken1')));assert(!csrfMatches(new Request('http://localhost/')));});
check('checkout rate limit blocks ninth request',()=>{for(let i=0;i<8;i++)assert(takeToken('qa-isolated','checkout').ok);assert(!takeToken('qa-isolated','checkout').ok);});
check('bad encoded CSRF cookie is handled without throwing',()=>assert.equal(csrfMatches(new Request('http://localhost/',{headers:{cookie:`${CSRF_COOKIE}=%ZZ`,[CSRF_HEADER]:'x'}})),false));
for(const p of products){
 for(const slug of p.pairsWith||[])if(!products.some(p=>p.slug===slug))result.dataIssues.push({product:p.slug,missingRelatedProduct:slug});
 for(const image of [...p.images,...p.variants.flatMap(v=>v.images||[])])if(image.startsWith('/')&&!fs.existsSync(root+'/public'+image))result.dataIssues.push({product:p.slug,missingImage:image});
}
const quizSource=fs.readFileSync(root+'/src/components/commerce/gift-finder-quiz.tsx','utf8');
const quizAst=ts.createSourceFile('quiz.tsx',quizSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const selected=quizAst.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['steps','budgetRange'].includes(d.name.getText(quizAst)))||ts.isFunctionDeclaration(n)&&n.name?.text==='scoreProducts');
const quizJs=ts.transpileModule(selected.map(n=>n.getText(quizAst)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {steps,budgetRange,scoreProducts}=new Function('products',quizJs+';return {steps,budgetRange,scoreProducts};')(products);
let quizCount=0,noResults=0,overBudget=0,topOverBudget=0;const examples=[];
for(const r of steps[0].options)for(const b of steps[1].options)for(const v of steps[2].options)for(const o of steps[3].options){
 const answers={recipient:r.value,budget:b.value,vibe:v.value,occasion:o.value},matches=scoreProducts(answers),max=budgetRange[b.value][1];quizCount++;
 if(!matches.length)noResults++;
 if(matches.some(x=>x.p.priceCents>max)){overBudget++;if(examples.length<5)examples.push({answers,overBudget:matches.filter(x=>x.p.priceCents>max).map(x=>({slug:x.p.slug,priceCents:x.p.priceCents})),maxCents:max});}
 if(matches[0]?.p.priceCents>max)topOverBudget++;
}
result.quiz={combinations:quizCount,noResults,combinationsWithOverBudgetResults:overBudget,topResultOverBudget:topOverBudget,examples};
const staticPaths=['/','/rask-dovana','/duk','/pristatymas','/kontaktai','/apie-mus','/pirkimo-taisykles','/privatumo-politika','/slapuku-politika','/issaugotos-dovanos','/krepselis','/checkout','/checkout/success','/checkout/recover','/dekojame','/tiktok','/instagram','/straipsniai','/paieska?q=%C5%BEvak%C4%97','/paieska?q=zzzzqqqqxx','/robots.txt','/sitemap.xml','/feed.xml'];
const routes=[...new Set([...staticPaths,...products.map(p=>'/produktai/'+p.slug),...collections.map(c=>'/dovanos/'+c.slug)])];
const redirects={'/apmokejimas':'/checkout','/produktai/sventinis-dovanu-krepselis':'/produktai/namu-kino-projektorius','/produktai/bluetooth-grotuvas-garsas':'/produktai/isoreine-baterija-kelione','/produktai/aromaterapijos-zvakide-sventinis-vakaras':'/produktai/aromaterapijos-zvake-zvakiu-vakaras','/produktai/smarves-difuzorius-lazdelemis':'/produktai/kvapo-difuzorius-lazdelemis','/produktai/belaidis-ikroviklis-azuolas':'/produktai/belaidis-ikroviklis-medis','/produktai/galaktikos-projektorius-astronautas':'/produktai/galaktikos-projektorius-zvaigzdziu-kelione'};
async function parallel(items,fn){let i=0;await Promise.all(Array.from({length:4},async()=>{while(i<items.length)await fn(items[i++]);}));}
async function crawl(base,key){
 const pages=[],links=new Set(),assets=new Set();
 await parallel(routes,async route=>{try{
  const started=Date.now(),response=await fetch(base+route,{signal:AbortSignal.timeout(20000)}),html=await response.text();
  const entry={route,status:response.status,notFound:html.includes('NEXT_HTTP_ERROR_FALLBACK;404'),serverError:html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),title:html.match(/<title>([^<]+)<\/title>/)?.[1],ms:Date.now()-started};
  pages.push(entry);
  for(const m of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)"/g))if(m[1].startsWith('/')&&!m[1].startsWith('//'))links.add(m[1].replace(/&amp;/g,'&').split('#')[0]);
  for(const m of html.matchAll(/(?:src|href)="(\/[^"<>]+\.(?:webp|png|jpg|jpeg|svg|woff2?|css|js)(?:\?[^"<>]*)?)"/g))assets.add(m[1].replace(/&amp;/g,'&'));
 }catch(e){pages.push({route,error:e.message});}});
 const extra=[...links].filter(p=>!routes.includes(p)&&!p.startsWith('/api/')&&!p.startsWith('/checkout/recover?'));
 const linked=[];
 await parallel(extra,async route=>{try{const response=await fetch(base+route,{signal:AbortSignal.timeout(15000)}),html=await response.text();linked.push({route,status:response.status,notFound:html.includes('NEXT_HTTP_ERROR_FALLBACK;404')});}catch(e){linked.push({route,error:e.message});}});
 const assetResults=[];
 const catalogAssets=products.flatMap(p=>[...p.images,...p.variants.flatMap(v=>v.images||[])]);
 await parallel([...new Set([...assets,...catalogAssets])],async asset=>{try{const response=await fetch(base+asset,{method:'HEAD',signal:AbortSignal.timeout(15000)});assetResults.push({asset,status:response.status,type:response.headers.get('content-type')});}catch(e){assetResults.push({asset,error:e.message});}});
 const redirectResults=[];
 await parallel(Object.entries(redirects),async([route,target])=>{const response=await fetch(base+route,{redirect:'manual'});redirectResults.push({route,status:response.status,location:response.headers.get('location'),expected:target});});
 const negative=[];
 for(const route of ['/qa-page-that-does-not-exist','/produktai/qa-product-that-does-not-exist','/dovanos/qa-collection-that-does-not-exist','/straipsniai/qa-article-that-does-not-exist']){
  const response=await fetch(base+route);const html=await response.text();negative.push({route,status:response.status,has404:html.includes('NEXT_HTTP_ERROR_FALLBACK;404')||html.includes('Šis puslapis dingo kaip sniegas')});
 }
 result.pages[key]={base,checked:pages.length,failures:pages.filter(p=>p.status!==200||p.notFound||p.serverError||p.error),pages,extraLinks:linked,brokenExtraLinks:linked.filter(p=>p.status>=400||p.notFound||p.error),redirects:redirectResults,negative};
 result.assets[key]={checked:assetResults.length,failures:assetResults.filter(a=>a.status!==200||a.error),results:assetResults};
}
async function main(){
 await crawl('http://127.0.0.1:3000','local');
 await crawl('https://www.kaledukampelis.com','live');
 for(const route of ['/api/checkout','/api/checkout/intent','/api/checkout/reminders','/api/checkout/recover','/api/newsletter','/api/stripe/webhook']){
  const response=await fetch('http://127.0.0.1:3000'+route,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  result.api.push({route,test:'missing CSRF or webhook signature',status:response.status});
 }
 for(const route of ['/api/checkout/session','/api/checkout/session?payment_intent=invalid','/api/email/unsubscribe','/api/checkout/recover']){
  const response=await fetch('http://127.0.0.1:3000'+route,{redirect:'manual'});result.api.push({route,test:'missing or invalid query token',status:response.status});
 }
 fs.writeFileSync(out+'/site-functional-audit.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,pages:Object.fromEntries(Object.entries(result.pages).map(([k,v])=>[k,{checked:v.checked,failures:v.failures,brokenExtraLinks:v.brokenExtraLinks,negative:v.negative,redirects:v.redirects}])),assets:Object.fromEntries(Object.entries(result.assets).map(([k,v])=>[k,{checked:v.checked,failures:v.failures}]))}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
