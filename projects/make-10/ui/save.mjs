export const methodMessage = method => method.youWereFirst ? 'First to find this method.' : `${method.count} ${method.count===1?'player':'players'} found this method.`;
function validMethod(method) {
  return method && typeof method.expression==='string' && method.expression.length<=256 && Number.isSafeInteger(method.count) && method.count>0;
}
export function validateSaved(data,date) {
  if(!data||data.date!==date||data.solved!==true||!validMethod(data.method)||typeof data.method.youWereFirst!=='boolean'||typeof data.method.alreadySubmitted!=='boolean'||!Array.isArray(data.otherMethods)||!data.otherMethods.every(validMethod)) throw new Error('Invalid save response');
  return data;
}
export function createSaveController({fetcher=fetch,onChange=()=>{},log=console.warn}={}) {
  const view={phase:'idle',attempt:null,result:null}; let token=0,abort;
  const emit=()=>onChange(view);
  function reset() {token++;abort?.abort();view.phase='idle';view.attempt=null;view.result=null;emit();}
  async function retry() {
    if(!view.attempt||view.phase==='saving') return;
    const current=++token, attempt=view.attempt, requestAbort=new AbortController(); abort=requestAbort;
    const timeout=setTimeout(()=>requestAbort.abort(),15000);
    view.phase='saving';view.result=null;emit();
    try {
      const options={method:'POST',credentials:'same-origin',cache:'no-store',signal:requestAbort.signal};
      const identity=await fetcher('/api/make-10/player',options);
      if(!identity.ok) throw new Error(`Identity HTTP ${identity.status}`);
      if(current!==token) return;
      const response=await fetcher('/api/make-10/solutions',{...options,headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt)});
      if(!response.ok) throw new Error(`Solution HTTP ${response.status}`);
      const data=validateSaved(await response.json(),attempt.date);
      if(current!==token) return;
      view.result=data;view.phase='saved';emit();
    } catch(error) {
      if(current!==token) return;
      log('Make 10 save/validation failure',error.message);
      view.phase='failed';emit();
    } finally {clearTimeout(timeout);}
  }
  return {view,reset,retry,restore(data){reset();view.result=validateSaved(data,data.date);view.phase='saved';emit();},start(date,expression){reset();view.attempt={date,expression};return retry();}};
}
