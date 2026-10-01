const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('D:/jaukumas/node_modules/typescript');
const root = 'D:/jaukumas';
const originalLoad = Module._load;
Module._load = function(specifier, parent, ...args) {
  if (specifier === '@/lib/analytics') return { track() {} };
  if (specifier.startsWith('@/')) specifier = path.join(root, 'src', specifier.slice(2));
  return originalLoad.call(this, specifier, parent, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {products}=require(root+'/src/lib/data/products.ts');
const {resolveItems,subtotalOf}=require(root+'/src/lib/cart/store.ts');
const {buildOrder,parseLines}=require(root+'/src/lib/cart/server-order.ts');
const {addonAmounts}=require(root+'/src/lib/cart/addons.ts');
const {MYSTERY_GIFT}=require(root+'/src/lib/cart/mystery-gift.ts');
const {store}=require(root+'/src/lib/config/store.config.ts');
const {formatPrice}=require(root+'/src/lib/format.ts');
const failures=[];let checked=0,variants=0;
function check(lines,addons,mystery){
 const subtotal=subtotalOf(resolveItems(lines));
 const gift=mystery?MYSTERY_GIFT.priceCents:0;
 const expected=subtotal+gift+addonAmounts(subtotal+gift,addons).total+(mystery||subtotal>=store.shipping.freeThresholdCents?0:store.shipping.flatRateCents);
 const order=buildOrder(parseLines(lines),addons,mystery);
 checked++;
 if('error'in order||order.totalCents!==expected) failures.push({lines,expected,actual:order.totalCents,error:order.error});
 if(!('error'in order)){
  const stripeTotal=order.lineItems.reduce((s,l)=>s+l.quantity*l.price_data.unit_amount,0)+order.shippingCents;
  if(stripeTotal!==expected) failures.push({lines,expected,stripeTotal});
 }
}
for(const p of products){
 if(!Number.isSafeInteger(p.priceCents)||p.priceCents<=0||!p.variants.some(v=>v.id===p.defaultVariantId))failures.push({slug:p.slug,issue:'invalid catalog price/default variant'});
 if(p.compareAtPriceCents!=null&&(!Number.isSafeInteger(p.compareAtPriceCents)||p.compareAtPriceCents<=p.priceCents))failures.push({slug:p.slug,issue:'invalid crossed-out price'});
 for(const v of p.variants){
  variants++;
  if(!Number.isSafeInteger(p.priceCents+(v.priceDeltaCents||0)))failures.push({slug:p.slug,issue:'invalid variant amount'});
  if(!p.inStock)continue;
  for(let qty=1;qty<=10;qty++)for(let mask=0;mask<16;mask++)check([{slug:p.slug,variantId:v.id,qty}],{protection:!!(mask&1),donation:!!(mask&2),priority:!!(mask&4)},!!(mask&8));
 }
}
for(let count=2;count<=30;count++)for(let mask=0;mask<16;mask++)check(products.slice(0,count).map((p,i)=>({slug:p.slug,variantId:p.defaultVariantId,qty:1+i%3})),{protection:!!(mask&1),donation:!!(mask&2),priority:!!(mask&4)},!!(mask&8));
const p=products[0],none={protection:false,donation:false,priority:false};
const result={products:products.length,variants,normalScenarios:checked,normalFailures:failures,shippingCents:store.shipping.flatRateCents,freeShippingThresholdCents:store.shipping.freeThresholdCents,priceExamples:{one:formatPrice(p.priceCents),two:formatPrice(resolveItems([{slug:p.slug,variantId:p.defaultVariantId,qty:2}])[0].lineTotalCents)},edgeCases:[]};
for(const [name,lines] of [['fractional quantity',[{slug:p.slug,variantId:p.defaultVariantId,qty:1.5}]],['31 distinct lines',products.slice(0,31).map(p=>({slug:p.slug,variantId:p.defaultVariantId,qty:1}))]]){
 const uiSubtotal=subtotalOf(resolveItems(lines));const order=buildOrder(parseLines(lines),none,false);
 result.edgeCases.push({name,uiSubtotal,serverSubtotal:order.subtotal,differenceCents:order.subtotal-uiSubtotal});
}
fs.writeFileSync('D:/toolsai/control-center/output/store-price-audit.json',JSON.stringify(result,null,2));
let capture;
const stripeMock={paymentIntents:{create:async(params)=>{capture=params;return{client_secret:'audit_only_not_a_real_secret'};}},checkout:{sessions:{create:async(params)=>{capture=params;return{url:'https://audit.invalid'};}}}};
const existingLoad=Module._load;
Module._load=function(specifier,parent,...args){
 if(specifier==='@/lib/stripe')return{getStripe:()=>stripeMock};
 if(specifier==='next/server')return{NextResponse:{json:(body,options)=>({body,status:options?.status??200})},after:()=>{}};
 if(specifier==='@/lib/security/guard')return{denyPost:()=>null};
 if(specifier==='@/lib/checkout/customer')return{validateCustomer:()=>({errors:{},value:{name:'Audit',surname:'Only',email:'audit@example.invalid',phone:'+37060000000',address:'Test',city:'Vilnius',postalCode:'01100'}})};
 if(specifier==='@/lib/email/templates')return{orderSnapshot:()=>({}),snapshotMetadata:()=>({})};
 if(specifier==='@/lib/email/tokens')return{readCartSession:()=>null};
 if(specifier.endsWith('/instrumentation'))return{posthogLoggerProvider:null};
 return existingLoad.call(this,specifier,parent,...args);
};
async function completeAudit(){
 const intent=require(root+'/src/app/api/checkout/intent/route.ts').POST;
 const hosted=require(root+'/src/app/api/checkout/route.ts').POST;
 let routeChecks=0;const routeFailures=[];
 for(const p of products.filter(p=>p.inStock))for(const qty of [1,2,3,10])for(let mask=0;mask<16;mask++){
  const input={lines:[{slug:p.slug,variantId:p.defaultVariantId,qty}],addons:{protection:!!(mask&1),donation:!!(mask&2),priority:!!(mask&4)},mysteryGift:!!(mask&8),customer:{}};
  const expected=buildOrder(parseLines(input.lines),input.addons,input.mysteryGift).totalCents;
  for(const [name,route]of[['intent',intent],['hosted',hosted]]){
   capture=null;const response=await route(new Request('https://audit.invalid/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));routeChecks++;
   const actual=name==='intent'?capture?.amount:capture?.line_items.reduce((s,l)=>s+l.quantity*l.price_data.unit_amount,0)+capture?.shipping_options[0].shipping_rate_data.fixed_amount.amount;
   if(response.status!==200||actual!==expected||name==='intent'&&capture.currency!=='eur')routeFailures.push({name,slug:p.slug,qty,mask,expected,actual,status:response.status});
  }
 }
 const live=[];let index=0;
 function nodes(value){return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value['@graph']||[])]:[];}
 await Promise.all(Array.from({length:4},async()=>{
  while(index<products.length){const p=products[index++];
   try{
    const response=await fetch('https://www.kaledukampelis.com/produktai/'+p.slug,{signal:AbortSignal.timeout(20000)});const html=await response.text();
    const schemas=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>nodes(JSON.parse(m[1])));
    const product=schemas.find(s=>s['@type']==='Product');const price=Math.round(Number(product?.offers?.price)*100);
    const shown=html.includes(formatPrice(p.priceCents))||html.includes(formatPrice(p.priceCents).replace(/\u00a0/g,' '));
    live.push({slug:p.slug,status:response.status,expected:p.priceCents,livePrice:price,visiblePriceFound:shown,match:response.ok&&price===p.priceCents&&shown});
   }catch(error){live.push({slug:p.slug,error:error.message,match:false});}
  }
 }));
 result.paymentRoutes={checks:routeChecks,failures:routeFailures,mockedStripe:true};result.liveCatalog={checked:live.length,matched:live.filter(r=>r.match).length,results:live};
 fs.writeFileSync('D:/toolsai/control-center/output/store-price-audit.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({products:result.products,variants:result.variants,scenarios:checked,failures:failures.length,paymentRoutes:result.paymentRoutes,liveChecked:live.length,liveMatched:result.liveCatalog.matched,liveFailures:live.filter(r=>!r.match),edgeCases:result.edgeCases}));
 process.exitCode=failures.length||routeFailures.length||live.some(r=>!r.match)?1:0;
}
completeAudit().catch(error=>{console.error(error.stack);process.exitCode=1;});
