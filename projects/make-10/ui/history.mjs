import { availableDate } from './puzzles.mjs';
export function linkedDate(url,daily) {
  const dates=new URL(url).searchParams.getAll('date');
  return dates.length===1&&availableDate(dates[0],daily)&&dates[0]!==daily.date?dates[0]:null;
}
export function puzzleUrl(url,date,daily) {
  const next=new URL(url);next.searchParams.delete('date');
  if(date&&date!==daily.date)next.searchParams.set('date',date);
  return next.pathname+next.search+next.hash;
}
export function createHistory(controller,{location=globalThis.location,history=globalThis.history}={}) {
  let ticket=0;
  function update(replace) {
    const view=controller.view;if(!view.active)return;
    const url=puzzleUrl(location.href,view.active.date,view.daily);
    const current=new URL(location.href);
    if(current.pathname+current.search+current.hash!==url)history[replace?'replaceState':'pushState'](null,'',url);
  }
  async function navigate(date,replace=false) {
    const current=++ticket;
    const ok=await (date===null?controller.today():controller.selectDate(date));
    if(current===ticket)update(replace||!ok);
    return ok;
  }
  return {
    ...controller,
    async start(){const current=++ticket;const ok=await controller.start();if(!ok||current!==ticket)return;const date=linkedDate(location.href,controller.view.daily);if(date)await navigate(date,true);else update(true);},
    selectDate:date=>navigate(date),today:()=>navigate(null),
    pop:()=>navigate(linkedDate(location.href,controller.view.daily),true),
  };
}
