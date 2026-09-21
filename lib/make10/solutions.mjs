import { parse, evaluate, canonical, format } from '../../projects/make-10/engine/expression.mjs';
import { equal, rational } from '../../projects/make-10/engine/rational.mjs';
import { RULESET, isValidDate, sydneyDate, resolveSequenceIndex } from '../../projects/make-10/schedule/dates.mjs';
import { identify, identityHeaders, json, rejectRequest } from './identity.mjs';

export async function methodHash(canonicalMethod,ruleset=RULESET) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${ruleset}\n${canonicalMethod}`));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function validateSolution(source,puzzle) {
  if(typeof source!=='string'||source.length===0||source.length>256) throw new Error('Invalid expression');
  const ast=parse(source.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-'),puzzle);
  const value=evaluate(ast);
  if(value===null||!equal(value,rational(10))) throw new Error('Expression must equal ten');
  const canonicalMethod=canonical(ast);
  return {canonicalMethod,hash:await methodHash(canonicalMethod),expression:format(ast).replaceAll('*','×').replaceAll('/','÷').replaceAll('-','−')};
}
async function body(request) {
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw new Error('Invalid body');
  if(Number(request.headers.get('Content-Length'))>2048) throw new Error('Body too large');
  const reader=request.body?.getReader(); if(!reader) throw new Error('Missing body');
  const chunks=[]; let length=0;
  try {
    while(true) {
      const {done,value}=await reader.read(); if(done) break;
      length+=value.byteLength; if(length>2048) {await reader.cancel();throw new Error('Body too large');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(length); let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!data||Array.isArray(data)||Object.keys(data).sort().join(',')!=='date,expression'||!isValidDate(data.date)||typeof data.expression!=='string') throw new Error('Invalid body');
  return data;
}

export async function handleSolutions(request,env,{now=Date.now,log=console.error}={}) {
  const rejected=rejectRequest(request); if(rejected) return rejected;
  let submitted;
  try {submitted=await body(request);} catch {return json({error:'invalid_submission'},400);}
  if(!isValidDate(env.MAKE10_LAUNCH_DATE)) return json({error:'launch_date_not_configured'},503);
  try {
    const instant=now(), date=submitted.date;
    if(date>sydneyDate(instant)) return json({error:'not_available'},404);
    const resolved=resolveSequenceIndex({launchDate:env.MAKE10_LAUNCH_DATE,date});
    if(resolved.status!=='available') return json({error:'not_available'},404);
    const db=env.make10_db, index=resolved.index;
    const row=await db.prepare('SELECT puzzle_code FROM make10_puzzles WHERE ruleset = ? AND sequence_index = ? LIMIT 1').bind(RULESET,index).first();
    if(!row) return json({error:'puzzle_unavailable'},503);
    let solution;
    try {solution=await validateSolution(submitted.expression,row.puzzle_code);} catch {return json({error:'invalid_solution'},400);}
    const player=await identify(request,db), timestamp=new Date(instant).toISOString();
    const statements=[
      db.prepare('INSERT INTO make10_players (player_id,created_at) VALUES (?,?) ON CONFLICT(player_id) DO NOTHING').bind(player.id,timestamp),
      db.prepare('INSERT INTO make10_solution_methods (ruleset,sequence_index,method_hash,canonical_method,display_expression,first_discovered_at,first_player_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(ruleset,sequence_index,method_hash) DO NOTHING').bind(RULESET,index,solution.hash,solution.canonicalMethod,solution.expression,timestamp,player.id),
      db.prepare('INSERT INTO make10_player_methods (player_id,ruleset,sequence_index,method_hash,submitted_at) VALUES (?,?,?,?,?) ON CONFLICT(player_id,ruleset,sequence_index,method_hash) DO NOTHING').bind(player.id,RULESET,index,solution.hash,timestamp),
      db.prepare(`SELECT m.display_expression AS expression, m.first_player_id = ? AS youWereFirst,
        (SELECT COUNT(*) FROM make10_player_methods p WHERE p.ruleset=m.ruleset AND p.sequence_index=m.sequence_index AND p.method_hash=m.method_hash) AS count
        FROM make10_solution_methods m WHERE m.ruleset=? AND m.sequence_index=? AND m.method_hash=?`).bind(player.id,RULESET,index,solution.hash),
      db.prepare(`SELECT m.display_expression AS expression, COUNT(p.player_id) AS count
        FROM make10_solution_methods m JOIN make10_player_methods p USING(ruleset,sequence_index,method_hash)
        WHERE m.ruleset=? AND m.sequence_index=? AND m.method_hash!=?
        GROUP BY m.method_hash ORDER BY count DESC,m.first_discovered_at ASC,m.method_hash ASC`).bind(RULESET,index,solution.hash),
    ];
    // D1 batch is transactional. Unique keys choose one first discoverer;
    // the player INSERT's change count distinguishes retries within that batch.
    const result=await db.batch(statements);
    const method=result[3].results[0];
    return json({date,solved:true,method:{expression:method.expression,count:method.count,youWereFirst:Boolean(method.youWereFirst),alreadySubmitted:result[2].meta.changes===0},otherMethods:result[4].results.map(({expression,count})=>({expression,count}))},200,identityHeaders(request,player));
  } catch(error) {log('Make 10 solution save failed',error);return json({error:'service_unavailable'},503);}
}
