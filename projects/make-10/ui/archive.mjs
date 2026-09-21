import { monthCells, monthTitle, formatDate } from './puzzles.mjs';

export function setupArchive(controller) {
  const $ = id => document.getElementById(id), dialog = $('calendar');
  $('archive').addEventListener('click', () => controller.open());
  $('calendar-close').addEventListener('click', () => controller.close());
  $('calendar-today').addEventListener('click', () => controller.today());
  $('previous-month').addEventListener('click', () => controller.navigate(-1));
  $('next-month').addEventListener('click', () => controller.navigate(1));
  dialog.addEventListener('cancel', event => { event.preventDefault(); controller.close(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) controller.close();
  });
  return {
    render(view) {
      if (!view.open) {
        if (dialog.open) { dialog.close(); $('archive').focus(); }
        return;
      }
      const focusDate = document.activeElement?.dataset.date;
      $('calendar-month').textContent = monthTitle(view.month);
      $('previous-month').disabled = view.month <= view.daily.launchDate.slice(0, 7);
      $('next-month').disabled = view.month >= view.daily.date.slice(0, 7);
      $('calendar-today').disabled = view.busy;
      $('calendar-days').setAttribute('aria-busy', String(view.busy));
      $('calendar-days').replaceChildren(...monthCells(view.month, view.daily, view.active).map(cell => {
        if (!cell) { const spacer = document.createElement('span'); spacer.setAttribute('aria-hidden', 'true'); return spacer; }
        const el = document.createElement('button'); el.type = 'button'; el.textContent = cell.day;
        el.dataset.date = cell.date; el.disabled = cell.disabled;
        el.setAttribute('aria-label', formatDate(cell.date)); el.setAttribute('aria-pressed', String(cell.selected));
        if (cell.today) el.setAttribute('aria-current', 'date');
        el.addEventListener('click', () => controller.selectDate(cell.date));
        return el;
      }));
      $('calendar-status').textContent = view.busy ? 'Loading…' : view.error;
      if (!dialog.open) {
        dialog.showModal();
        dialog.querySelector('[aria-pressed="true"]:not(:disabled)')?.focus();
      } else if (focusDate) dialog.querySelector(`[data-date="${focusDate}"]`)?.focus();
    },
  };
}
