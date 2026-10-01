const fs=require('node:fs');
const ts=require('D:/jaukumas/node_modules/typescript');
const source=fs.readFileSync('D:/jaukumas/src/components/commerce/checkout-experience.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const start=compiled.indexOf('async function onSubmit(e) {');
let depth=0,end=start;
for(let i=compiled.indexOf('{',start);i<compiled.length;i++){if(compiled[i]==='{')depth++;if(compiled[i]==='}'&&--depth===0){end=i+1;break;}}
const body=compiled.slice(start,end);
let busy=false,submitRelease,intentRelease,sent,confirmed,visibleTotal=2939;
const originalModel={form:{},stripeEnabled:true,mystery:false,totalCents:2939,setBanner(){},setErrors(){},markPaid(){}};
const deps={model:originalModel,cart:{lines:[{slug:'aromaterapijos-zvake-zvakiu-vakaras',variantId:'sventinis-vakaras',qty:1}],clearCart(){}},customer_1:{validateCustomer:()=>({errors:{},value:{}})},FIELD_ORDER:[],paymentReady:true,stripe:{confirmPayment:async options=>{confirmed=options;return{paymentIntent:{status:'succeeded',id:'audit_only'}};}},elements:{submit:()=>new Promise(resolve=>{submitRelease=resolve;})},setBusy:value=>{busy=value;},csrf_client_1:{apiHeaders:()=>({})},addons_1:{readCartAddons:()=>({protection:true,donation:false,priority:false})},router:{push(){}},window:{location:{origin:'https://audit.invalid'}},stripeBanner:()=>'',document:{getElementById:()=>null},fetch:async(url,input)=>{sent=JSON.parse(input.body);return new Promise(resolve=>{intentRelease=()=>resolve({ok:true,status:200,json:async()=>({clientSecret:'mock_intent_for_2939'})});});}};
const submit=new Function(...Object.keys(deps),body+';return onSubmit;')(...Object.values(deps));
async function test(){
 const pending=submit({preventDefault(){}});
 submitRelease({});await new Promise(resolve=>setImmediate(resolve));
 // React replaces the model after the still-enabled gift toggle changes.
 visibleTotal=3539;
 intentRelease();await pending;
 const result={stripeMocked:true,paymentWasBusy:true,submittedMysteryGift:sent.mysteryGift,submittedDisplayedTotalCents:originalModel.totalCents,visibleTotalAfterToggleCents:visibleTotal,confirmationStillCalled:!!confirmed,differenceCents:visibleTotal-originalModel.totalCents};
 fs.writeFileSync('D:/toolsai/control-center/output/payment-change-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
test().catch(error=>{console.error(error.stack);process.exitCode=1;});
