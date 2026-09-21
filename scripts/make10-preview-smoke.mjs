// Invoke only after checking this deployment's environment and D1 binding via
// Cloudflare's deployment API. Test cookies are saved locally for scoped cleanup.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { publicAssets } from './lib/pages-assets.mjs';
const base=process.argv[2];assert(/^https:\/\/[a-f0-9]{8}\.website-6sn\.pages\.dev$/.test(base),'Use the verified immutable preview URL');
assert(process.argv.length===3||(process.argv.length===4&&process.argv[3]==='--reuse'),'Only --reuse is supported');
if(process.argv[3]!=='--reuse')assert(!existsSync('.wrangler/preview-test-identities.json'),'Clean up the previous owned fixtures before starting another run');
// Read the deployment record before issuing any data-changing HTTP request.
// Credentials stay in memory and are never printed or copied to the output.
const auth=readFileSync(`${process.env.APPDATA}/xdg.config/.wrangler/config/default.toml`,'utf8');
const token=auth.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];assert(token,'Refresh Wrangler login first');
const deployments=await fetch('https://api.cloudflare.com/client/v4/accounts/f384eb853e4900b8d1488f8578f9d221/pages/projects/website/deployments',{headers:{Authorization:`Bearer ${token}`}});
assert(deployments.ok,'Unable to verify preview binding');
const deployment=(await deployments.json()).result.find(d=>d.url===base);
assert.equal(deployment?.environment,'preview');assert.equal(deployment?.d1_databases?.make10_db?.id,'bd002a39-5ec1-49a0-837c-b26be92684a8');
const ids=[];const record=()=>writeFileSync('.wrangler/preview-test-identities.json',JSON.stringify({base,ids},null,2));
const req=(route,method='GET',body,cookie='')=>fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function json(route,method='GET',body,cookie=''){const r=await req(route,method,body,cookie);assert.equal(r.status,200,route);return r.json();}
const daily=await json('/api/make-10/daily');assert.equal(daily.launchDate,'2026-09-01');assert.equal(daily.ruleset,'basic-v1');
const archive=await json('/api/make-10/puzzle?date=2026-09-01');assert.equal(archive.puzzle,'3411');
const privateSequence=JSON.parse(readFileSync(`${process.env.USERPROFILE}/.make10-private/website/basic-v1-sequence.json`,'utf8'));
const index=Math.round((Date.parse(daily.date)-Date.parse(daily.launchDate))/86400000);assert.equal(daily.puzzle,privateSequence.sequence[index]);
for(const date of ['2099-01-01','2026-08-31'])for(const route of ['puzzle','status'])assert.equal((await req(`/api/make-10/${route}?date=${date}`)).status,404);
assert.equal((await req('/api/make-10/puzzle?date=bad')).status,400);
const unowned=await json('/api/make-10/status?date=2026-09-01');assert.deepEqual(unowned,{date:'2026-09-01',solved:false,methodsFound:0});
assert.deepEqual(await json('/api/make-10/progress'),{solvedDates:[]});
assert.equal((await req('/api/make-10/solutions')).status,405);
const cookies=[];
if(process.argv[3]==='--reuse') {
  const previous=JSON.parse(readFileSync('.wrangler/preview-test-identities.json','utf8'));assert.equal(previous.ids.length,2);
  for(const id of previous.ids){assert(/^[0-9a-f-]{36}$/.test(id));ids.push(id);cookies.push(`make10_player=${id}`);}
} else for(let i=0;i<2;i++){
  const r=await req('/api/make-10/player','POST');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});const c=r.headers.get('set-cookie');
  for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=31536000'])assert(c.includes(flag));
  cookies.push(c.split(';')[0]);ids.push(cookies.at(-1).split('=')[1]);record();
}
const payload={date:'2026-09-01',expression:'3*4-1-1'};
const first=await json('/api/make-10/solutions','POST',payload,cookies[0]);assert.equal(first.method.count,process.argv[3]==='--reuse'?2:1);assert(first.method.youWereFirst);
const second=await json('/api/make-10/solutions','POST',payload,cookies[1]);assert.equal(second.method.count,2);assert(!second.method.youWereFirst);
const retry=await json('/api/make-10/solutions','POST',payload,cookies[0]);assert(retry.method.alreadySubmitted);assert.equal(retry.method.count,2);
const other=await json('/api/make-10/solutions','POST',{...payload,expression:'3*(4-1)+1'},cookies[0]);assert.equal(other.otherMethods.length,1);
const status=await json('/api/make-10/status?date=2026-09-01','GET',undefined,cookies[0]);assert.equal(status.methodsFound,2);assert(status.solved);
assert.deepEqual(await json('/api/make-10/progress','GET',undefined,cookies[0]),{solvedDates:['2026-09-01']});
for(const body of [{...payload,expression:'3+4+1+1'},{...payload,expression:'x'.repeat(3000)},{...payload,result:10}])assert.equal((await req('/api/make-10/solutions','POST',body,cookies[0])).status,400);
for(const data of [first,second,retry,status,other])for(const id of ids)assert(!JSON.stringify(data).includes(id));
const assets=publicAssets(process.cwd());
for(const asset of assets){const r=await req('/'+asset);assert.equal(r.status,200,asset);}
for(const asset of ['wrangler.jsonc','package.json','.git/config','.make10-private/website/basic-v1-sequence.json','scripts/make10-freeze.mjs','tests/make-10/solutions.test.mjs','make10-migrations/0001_schedule.sql','lib/make10/solutions.mjs','projects/make-10/schedule/basic-v1-metadata.json','projects/make-10/engine/solver.mjs','_worker.js/index.js'])assert.equal((await req('/'+asset)).status,404,asset);
assert.equal((await req('/api/commander-draft/rooms/not-a-valid-room')).status,404);
console.log(JSON.stringify({base,daily,archive,first:first.method,second:second.method,retry:retry.method,status:{solved:status.solved,methodsFound:status.methodsFound},publicAssets:assets.length,security:'passed',privatePaths:'404',commanderRoute:'404 JSON route reachable'},null,2));
