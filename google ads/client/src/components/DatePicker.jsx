import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, Dropdown } from './Common.jsx';
import { addDays, parseISO, toISO, fmtDay, fmtRange } from '../../../shared/dates.js';

// The week presets come in a Sunday-start version (listed) and a Monday-start one (`variantOf`,
// picked from the preset's arrow); `week` is the short text of each choice.
export function presets(today, dataStart) {
  const y = addDays(today, -1);
  const d = parseISO(today);
  const dow = d.getDay();
  const mon = (dow + 6) % 7;
  const first = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'yesterday', label: 'Yesterday', from: y, to: y },
    { key: 'thisweek', label: 'This week (Sun – Today)', short: 'This week', week: 'Sun – Today', sub: true, from: addDays(today, -dow), to: today },
    { key: 'last7', label: 'Last 7 days', from: addDays(y, -6), to: y },
    { key: 'lastweek', label: 'Last week (Sun – Sat)', short: 'Last week', week: 'Sun – Sat', sub: true, from: addDays(today, -dow - 7), to: addDays(today, -dow - 1) },
    { key: 'last14', label: 'Last 14 days', from: addDays(y, -13), to: y },
    { key: 'thismonth', label: 'This month', from: first, to: today },
    { key: 'last30', label: 'Last 30 days', from: addDays(y, -29), to: y },
    { key: 'lastmonth', label: 'Last month', from: toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: addDays(first, -1) },
    { key: 'all', label: 'All time', from: dataStart, to: today },
    { key: 'thisweekMon', variantOf: 'thisweek', label: 'This week (Mon – Today)', short: 'This week', week: 'Mon – Today', from: addDays(today, -mon), to: today },
    { key: 'lastweekMon', variantOf: 'lastweek', label: 'Last week (Mon – Sun)', short: 'Last week', week: 'Mon – Sun', from: addDays(today, -mon - 7), to: addDays(today, -mon - 1) },
  ];
}

export function rangeLabel(range, list) {
  const p = list.find((x) => x.from === range.from && x.to === range.to);
  return p ? p.short || p.label : 'Custom';
}

const MON_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// M/D/YYYY, as the End date field shows it.
function fmtNumeric(iso) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// A typed date ("Oct 1, 2026", "10/1/2026" or "2026-10-01") as YYYY-MM-DD, or null.
function parseTyped(text) {
  const t = String(text || '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  let d = iso ? new Date(+iso[1], iso[2] - 1, +iso[3]) : us ? new Date(+us[3], us[1] - 1, +us[2]) : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  // Reject roll-overs such as 2/31.
  if (iso && d.getDate() !== +iso[3]) return null;
  if (us && d.getDate() !== +us[2]) return null;
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return toISO(d);
}

// Start / End date box: shows the date, and takes a typed one (Enter or leaving the box applies it).
function DateField({ label, value, show, onSet }) {
  const [text, setText] = useState(null);
  const commit = () => {
    if (text == null) return;
    const iso = parseTyped(text);
    setText(null);
    if (iso && iso !== value) onSet(iso);
  };
  return (
    <label className="dp-input">
      <span>{label}</span>
      <input value={text ?? (value ? show(value) : '')} aria-label={label.replace('*', '')}
        onFocus={(e) => { setText(value ? show(value) : ''); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.stopPropagation(); setText(null); } }} />
    </label>
  );
}

// Months from the first month with data through the current month.
function monthList(dataStart, today) {
  const out = [];
  const s = parseISO(dataStart);
  const e = parseISO(today);
  for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

function Month({ y, m, draft, picking, hover, today, onPick, setHover }) {
  const first = new Date(y, m, 1);
  const lead = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const label = `${MON_SHORT[m]} ${y}`;
  const cells = [];
  // The month label sits in the empty leading cells when there is room for it (3+ cells),
  // otherwise it gets a row of its own.
  if (lead >= 3) {
    cells.push(<div key="t" className="cal-title" style={{ gridColumn: `1 / span ${lead}` }}>{label}</div>);
  } else {
    cells.push(<div key="t" className="cal-title" style={{ gridColumn: '1 / -1' }}>{label}</div>);
    for (let i = 0; i < lead; i++) cells.push(<span key={`e${i}`} />);
  }
  const end = picking && hover ? hover : draft.to;
  const lo = end && end < draft.from ? end : draft.from;
  const hi = end && end < draft.from ? draft.from : end;
  for (let day = 1; day <= days; day++) {
    const iso = toISO(new Date(y, m, day));
    const inRange = lo && hi && lo !== hi && iso >= lo && iso <= hi;
    const edge = iso === draft.from || iso === draft.to;
    cells.push(
      <button key={iso} type="button" disabled={iso > today} data-date={iso}
        className={`cal-day ${inRange ? 'in' : ''} ${edge ? 'edge' : ''} ${iso === today ? 'today' : ''}`}
        onClick={() => onPick(iso)} onMouseEnter={() => setHover(iso)}>{day}</button>,
    );
  }
  return <div className="cal-month cal-grid" data-month={`${y}-${m}`}>{cells}</div>;
}

function Panel({ range, today, dataStart, onApply, close }) {
  const list = presets(today, dataStart);
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const [custom, setCustom] = useState(() => rangeLabel(range, list) === 'Custom');
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState(null);
  // Which week preset has its Sunday / Monday choice open.
  const [weekOpen, setWeekOpen] = useState(null);
  const months = monthList(dataStart < today ? dataStart : today, today);
  const [shown, setShown] = useState(months.length - 1);
  const ref = useRef(null);
  const scrollRef = useRef(null);

  // Open over the trigger, then keep the whole panel inside the visible part of #main.
  useLayoutEffect(() => {
    const panel = ref.current;
    const pop = panel?.parentElement;
    if (!panel || !pop) return undefined;
    const place = () => {
      pop.style.top = '-9px';
      panel.style.maxHeight = '';
      const main = document.getElementById('main');
      const mr = main ? main.getBoundingClientRect() : null;
      const lo = Math.max(0, mr ? mr.top + main.clientTop : 0) + 8;
      const hi = Math.min(window.innerHeight, mr ? mr.top + main.clientTop + main.clientHeight : window.innerHeight) - 8;
      const r = panel.getBoundingClientRect();
      let up = Math.max(0, r.bottom - hi);
      if (r.top - up < lo) up = r.top - lo;
      pop.style.top = `${-9 - up}px`;
      const r2 = panel.getBoundingClientRect();
      if (r2.bottom > hi) panel.style.maxHeight = `${Math.max(240, hi - r2.top)}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  // Scroll the selected month into view on open.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const d = parseISO(draft.from || today);
    const el = box.querySelector(`[data-month="${d.getFullYear()}-${d.getMonth()}"]`);
    if (el) box.scrollTop = el.offsetTop - 72;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const els = [...box.querySelectorAll('.cal-month')];
    let idx = 0;
    els.forEach((el, i) => { if (el.offsetTop <= box.scrollTop + 100) idx = i; });
    setShown(idx);
  };
  useEffect(onScroll, []);

  const goMonth = (n) => {
    const box = scrollRef.current;
    const els = box ? [...box.querySelectorAll('.cal-month')] : [];
    const i = Math.max(0, Math.min(els.length - 1, shown + n));
    if (els[i]) box.scrollTo({ top: els[i].offsetTop, behavior: 'smooth' });
  };

  const pick = (iso) => {
    setCustom(true);
    if (!picking) {
      setDraft({ from: iso, to: iso });
      setPicking(true);
    } else {
      setDraft(iso < draft.from ? { from: iso, to: draft.from } : { from: draft.from, to: iso });
      setPicking(false);
    }
  };
  // A typed Start or End date: kept inside the data range, the other end moves if needed.
  const typed = (end, iso) => {
    const lo = dataStart < today ? dataStart : today;
    const v = iso < lo ? lo : iso > today ? today : iso;
    setCustom(true);
    setPicking(false);
    setDraft((d) => (end === 'from' ? { from: v, to: d.to && d.to >= v ? d.to : v } : { from: d.from && d.from <= v ? d.from : v, to: v }));
  };
  // "N days up to today / yesterday": a range that would start before the data does starts on
  // its first day instead (so no length typed here asks the server for a range it refuses).
  const nDays = (n, upTo) => {
    if (!(n >= 1)) return;
    const to = upTo === 'today' ? today : addDays(today, -1);
    const lo = dataStart < today ? dataStart : today;
    let from = addDays(to, -(n - 1));
    if (from < lo) from = lo < to ? lo : to;
    setDraft({ from, to });
    setCustom(true);
    setPicking(false);
  };
  const apply = () => {
    if (!draft.from || !draft.to) return;
    onApply({ from: draft.from, to: draft.to });
    close();
  };
  const cur = months[shown] || months[months.length - 1];

  return (
    <div className="dp-panel" ref={ref} role="dialog" aria-label="Select date range">
      <div className="dp-presets">
        <button type="button" className={`dp-preset ${custom ? 'selected' : ''}`} onClick={() => setCustom(true)}>Custom</button>
        <div className="dp-div" />
        {list.filter((p) => !p.variantOf).map((p) => {
          const on = (x) => !custom && x.from === draft.from && x.to === draft.to;
          const pick = (x) => { onApply({ from: x.from, to: x.to }); close(); };
          if (!p.sub) {
            return (
              <button key={p.key} type="button" className={`dp-preset ${on(p) ? 'selected' : ''}`} onClick={() => pick(p)}>
                <span>{p.label}</span>
              </button>
            );
          }
          // Week presets: the row applies the week shown (Sunday start unless the Monday one is
          // in use); its arrow opens the choice of first day of the week.
          const choices = [p, list.find((x) => x.variantOf === p.key)].filter(Boolean);
          const shown = choices.find(on) || p;
          const isOpen = weekOpen === p.key;
          return (
            <div key={p.key} className="dp-week">
              <div className={`dp-preset dp-week-row ${on(shown) ? 'selected' : ''}`}>
                <button type="button" className="dp-week-main" onClick={() => pick(shown)}><span>{shown.label}</span></button>
                <button type="button" className="dp-week-arrow" aria-expanded={isOpen} aria-label={`First day of the week for ${p.short}`}
                  data-testid={`week-start-${p.key}`} onClick={() => setWeekOpen(isOpen ? null : p.key)}>
                  <Icon name={isOpen ? 'arrow_drop_down' : 'arrow_right'} fill className="dp-sub" />
                </button>
              </div>
              {isOpen && (
                <div className="dp-week-opts" role="group" aria-label="Week starts on">
                  <div className="dp-week-title">Week starts on</div>
                  {choices.map((x) => (
                    <button key={x.key} type="button" className={`dp-preset dp-week-opt ${on(x) ? 'selected' : ''}`} onClick={() => pick(x)}>
                      <span>{x.week}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="dp-div low" />
        {[['today', 'days up to today'], ['yesterday', 'days up to yesterday']].map(([k, label]) => (
          <label key={k} className="dp-ndays">
            <input type="text" inputMode="numeric" defaultValue={30} maxLength={4} aria-label={`Number of ${label}`}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v !== e.target.value) e.target.value = v;
                nDays(Number(v), k);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="dp-right">
        <div className="dp-inputs">
          <DateField label="Start date*" value={draft.from} show={fmtDay} onSet={(iso) => typed('from', iso)} />
          <span className="dp-sep">–</span>
          <DateField label="End date*" value={draft.to} show={fmtNumeric} onSet={(iso) => typed('to', iso)} />
        </div>
        <div className="cal-head">
          <span className="cal-head-label">{cur ? `${MON_SHORT[cur.m]} ${cur.y}` : ''}<Icon name="arrow_drop_down" /></span>
          <span className="spacer" />
          <button type="button" className="iconbtn dp-nav" onClick={() => goMonth(-1)} disabled={shown <= 0} aria-label="Previous month"><Icon name="chevron_left" /></button>
          <button type="button" className="iconbtn dp-nav" onClick={() => goMonth(1)} disabled={shown >= months.length - 1} aria-label="Next month"><Icon name="chevron_right" /></button>
        </div>
        <div className="cal-grid cal-dow">{DOW.map((x, i) => <span key={i}>{x}</span>)}</div>
        <div className="cal-scroll" ref={scrollRef} onScroll={onScroll} onMouseLeave={() => setHover(null)}>
          {months.map(({ y, m }) => (
            <Month key={`${y}-${m}`} y={y} m={m} draft={draft} picking={picking} hover={hover} today={today} onPick={pick} setHover={setHover} />
          ))}
        </div>
      </div>
      <div className="dp-foot">
        <button type="button" className="btn-text" onClick={close}>Cancel</button>
        <button type="button" className="btn-text" disabled={!draft.from || !draft.to} onClick={apply}>Apply</button>
      </div>
    </div>
  );
}

// format: how the box writes the range (the Ads pages use the default).
export default function DatePicker({ range, today, dataStart, onChange, format = fmtRange }) {
  // Just picked a range: the box shows a blue border until focus moves elsewhere.
  const [picked, setPicked] = useState(false);
  const btn = useRef(null);
  const apply = (r) => {
    onChange(r);
    setPicked(true);
    requestAnimationFrame(() => btn.current?.focus());
  };
  return (
    <Dropdown className="dp" align="right" panelClass="dp-pop" trigger={(open, toggle) => (
      <button type="button" ref={btn} className={`dp-trigger ${open ? 'open' : ''} ${picked && !open ? 'picked' : ''}`} onClick={toggle}
        onBlur={() => setPicked(false)} data-testid="date-trigger">
        <span>{format(range.from, range.to)}</span>
        <Icon name="arrow_drop_down" />
      </button>
    )}>
      {(close) => <Panel range={range} today={today} dataStart={dataStart} onApply={apply} close={close} />}
    </Dropdown>
  );
}
