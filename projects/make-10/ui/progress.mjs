import { availableDate } from './puzzles.mjs';
import { validateSaved } from './save.mjs';
export function createProgress({fetcher=fetch,onChange=()=>{},onSolved=()=>{}}={}) {
  const solvedDates=new Set();let selection=0,revision=0;
  async function get(url) {
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{const response=await fetcher(url,{credentials:'same-origin',cache:'no-store',signal:abort.signal});if(!response.ok)throw new Error('Progress unavailable');return await response.json();}finally{clearTimeout(timer);}
  }
  return {
    solvedDates,
    cancel(){selection++;},
    mark(date){selection++;revision++;solvedDates.add(date);onChange();},
    async refresh(daily) {
      const current=++revision;
      try{const data=await get('/api/make-10/progress');if(!Array.isArray(data.solvedDates)||!data.solvedDates.every(date=>availableDate(date,daily)))throw new Error('Invalid progress');
        if(current!==revision)return;solvedDates.clear();data.solvedDates.forEach(date=>solvedDates.add(date));onChange();
      }catch{/* A failed progress request must not discard an editable attempt. */}
    },
    async restore(active) {
      const current=++selection;
      try{const data=await get(`/api/make-10/status?date=${active.date}`);if(current!==selection||data.date!==active.date)return;
        if(data.solved===true){validateSaved(data,active.date);if(!Number.isSafeInteger(data.methodsFound)||data.methodsFound<1)throw new Error('Invalid status');revision++;solvedDates.add(active.date);onChange();onSolved(data,active);}
        else if(data.solved===false){solvedDates.delete(active.date);onChange();}
      }catch{/* Keep the local expression when offline; never infer a solve. */}
    },
  };
}
