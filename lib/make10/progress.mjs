import { identify, json } from './identity.mjs';
import { RULESET, PUZZLE_COUNT, isValidDate, sydneyDate, resolveSequenceIndex, calendarDaysBetween } from '../../projects/make-10/schedule/dates.mjs';

export function dateAtIndex(launch,index) {
  const date=new Date(`${launch}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+index);
  return date.toISOString().slice(0,10);
}
export async function handleProgress(request,env,mode,{now=Date.now,log=console.error}={}) {
  if(request.method!=='GET')return json({error:'method_not_allowed'},405,{Allow:'GET'});
  const launch=env.MAKE10_LAUNCH_DATE;
  if(!isValidDate(launch))return json({error:'launch_date_not_configured'},503);
  try {
    const today=sydneyDate(now()),db=env.make10_db;
    let date,index;
    if(mode==='status') {
      const dates=new URL(request.url).searchParams.getAll('date');
      if(dates.length!==1||!isValidDate(dates[0]))return json({error:'invalid_date'},400);
      date=dates[0];const resolved=resolveSequenceIndex({launchDate:launch,date});
      if(date>today||resolved.status!=='available')return json({error:'not_available'},404);
      index=resolved.index;
      if(!await db.prepare('SELECT puzzle_code FROM make10_puzzles WHERE ruleset=? AND sequence_index=?').bind(RULESET,index).first())return json({error:'puzzle_unavailable'},503);
    }
    const player=await identify(request,db);
    const unsolved=()=>json(mode==='status'?{date,solved:false,methodsFound:0}:{solvedDates:[]});
    // Reads never mint a cookie or write a player. Unknown cookie has no history.
    if(player.fresh)return unsolved();
    if(mode==='progress') {
      const last=Math.min(PUZZLE_COUNT-1,calendarDaysBetween(launch,today));
      if(last<0)return unsolved();
      const rows=await db.prepare(`SELECT DISTINCT p.sequence_index FROM make10_player_methods p
        JOIN make10_puzzles s USING(ruleset,sequence_index)
        WHERE p.player_id=? AND p.ruleset=? AND p.sequence_index BETWEEN 0 AND ? ORDER BY p.sequence_index`).bind(player.id,RULESET,last).all();
      return json({solvedDates:rows.results.map(r=>dateAtIndex(launch,r.sequence_index))});
    }
    // This ownership query gates every expression/statistics lookup.
    const own=await db.prepare(`SELECT method_hash FROM make10_player_methods
      WHERE player_id=? AND ruleset=? AND sequence_index=? ORDER BY submitted_at DESC,method_hash ASC LIMIT 1`).bind(player.id,RULESET,index).first();
    if(!own)return unsolved();
    const results=await db.batch([
      db.prepare(`SELECT display_expression AS expression,first_player_id=? AS youWereFirst,
        (SELECT COUNT(*) FROM make10_player_methods p WHERE p.ruleset=m.ruleset AND p.sequence_index=m.sequence_index AND p.method_hash=m.method_hash) AS count
        FROM make10_solution_methods m WHERE ruleset=? AND sequence_index=? AND method_hash=?`).bind(player.id,RULESET,index,own.method_hash),
      db.prepare(`SELECT COUNT(*) AS count FROM make10_player_methods WHERE player_id=? AND ruleset=? AND sequence_index=?`).bind(player.id,RULESET,index),
      db.prepare(`SELECT display_expression AS expression,COUNT(p.player_id) AS count FROM make10_solution_methods m
        JOIN make10_player_methods p USING(ruleset,sequence_index,method_hash)
        WHERE m.ruleset=? AND m.sequence_index=? AND m.method_hash!=?
        GROUP BY m.method_hash ORDER BY count DESC,m.first_discovered_at ASC,m.method_hash ASC`).bind(RULESET,index,own.method_hash),
    ]);
    const method=results[0].results[0];
    return json({date,solved:true,methodsFound:results[1].results[0].count,method:{expression:method.expression,count:method.count,youWereFirst:Boolean(method.youWereFirst),alreadySubmitted:true},otherMethods:results[2].results.map(({expression,count})=>({expression,count}))});
  } catch(error){log('Make 10 progress unavailable',error);return json({error:'service_unavailable'},503);}
}
