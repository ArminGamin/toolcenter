const fs=require('node:fs');const out='D:/toolsai/control-center/output';
async function main(){
const prior=JSON.parse(fs.readFileSync(out+'/site-fix-functional-audit.json','utf8')),results={};
for(const [key,{base,pages}] of Object.entries(prior.pages)){
 const sitemap=await(await fetch(base+'/sitemap.xml')).text(),locs=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),robots=await(await fetch(base+'/robots.txt')).text();
 const productRoutes=pages.filter(p=>p.route.startsWith('/produktai/')&&!p.notFound).map(p=>p.route),errors=[],summaries=[];let i=0;
 await Promise.all(Array.from({length:4},async()=>{while(i<productRoutes.length){const route=productRoutes[i++],html=await(await fetch(base+route)).text();
  function nodes(v){return Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'?[v,...nodes(v['@graph']||[])]:[];}
  const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],json=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>{try{return nodes(JSON.parse(m[1]));}catch{return[];}}),product=json.find(j=>j?.['@type']==='Product');
  if(!canonical?.endsWith(route))errors.push({route,issue:'incorrect or missing canonical',canonical});
  if(!product?.offers)errors.push({route,issue:'missing Product offers schema'});
  if(!locs.some(l=>l.endsWith(route)))errors.push({route,issue:'product missing from sitemap'});
  summaries.push({route,canonical,productSchema:!!product?.offers});
 }}));
 const privatePages=[];for(const route of ['/checkout','/checkout/success','/checkout/recover']){const html=await(await fetch(base+route)).text();privatePages.push({route,robots:html.match(/<meta name="robots" content="([^"]+)"/)?.[1]});}
 const feed=await(await fetch(base+'/feed.xml')).text(),feedItems=[...feed.matchAll(/<item>/g)].length;
 results[key]={productsChecked:productRoutes.length,errors,sitemapLocations:locs.length,duplicateSitemapLocations:locs.length-new Set(locs).size,sitemapIncludesCheckout:locs.filter(l=>l.includes('/checkout')),robots,privatePages,feedItems,summaries};
}
fs.writeFileSync(out+'/site-fix-seo-audit.json',JSON.stringify(results,null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([key,r])=>[key,{...r,summaries:undefined}]))));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

