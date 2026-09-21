export const COOKIE_NAME = 'make10_player';
export const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});

export function rejectRequest(request) {
  if (request.method !== 'POST') return json({ error:'method_not_allowed' },405,{Allow:'POST'});
  const origin=request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({error:'forbidden'},403);
}

export async function identify(request, db) {
  const cookies=(request.headers.get('Cookie')??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(`${COOKIE_NAME}=`));
  const value=cookies.length===1 ? cookies[0].slice(COOKIE_NAME.length+1) : '';
  // Only IDs previously minted by this server are accepted; a client-chosen UUID
  // is not an identity. UUIDs are bearer credentials, kept out of response JSON.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    const row=await db.prepare('SELECT player_id FROM make10_players WHERE player_id = ?').bind(value).first();
    if(row) return {id:value, fresh:false};
  }
  return {id:crypto.randomUUID(),fresh:true};
}
export function identityHeaders(request, player) {
  return player.fresh ? {'Set-Cookie':`${COOKIE_NAME}=${player.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol==='https:'?'; Secure':''}`} : {};
}

// Establish the cookie before sending a solution, so even a lost first save
// response can be retried with the same browser identity.
export async function handlePlayer(request, env, {now=Date.now,log=console.error}={}) {
  const rejected=rejectRequest(request); if(rejected) return rejected;
  try {
    const player=await identify(request,env.make10_db);
    if(player.fresh) await env.make10_db.prepare('INSERT INTO make10_players (player_id,created_at) VALUES (?,?)').bind(player.id,new Date(now()).toISOString()).run();
    return json({ok:true},200,identityHeaders(request,player));
  } catch(error) {log('Make 10 identity unavailable',error); return json({error:'service_unavailable'},503);}
}
