import React, { useMemo } from 'react';
import { Modal } from './ui.jsx';
import { AnalyseIcon } from './icons.jsx';
import { fInt, fMoney, fMoney3, fCpm, fPct, pctChange } from './lib.js';

// "Analyse" in Ads Manager: plain-language read-out of what the table is showing right now
export default function Analyse({ rows, totals, prevTotals, level, rangeText, onClose }) {
  const noun = level === 'ad' ? 'ads' : level === 'adset' ? 'ad sets' : 'campaigns';
  const cards = useMemo(() => {
    const live = rows.filter((r) => r.hasData);
    const out = [];
    if (!live.length) return [{ t: 'No delivery in this period', d: `None of the ${noun} shown delivered in ${rangeText}. Try a longer date range.` }];
    const by = (fn, dir = 1) => [...live].sort((a, b) => dir * ((fn(a) ?? Infinity) - (fn(b) ?? Infinity)))[0];
    out.push({ t: 'Summary', d: `${live.length} ${noun} spent ${fMoney(totals.spend)} in ${rangeText}, delivering ${fInt(totals.impressions)} impressions to ${fInt(totals.reach)} accounts and ${fInt(totals.linkClicks)} link clicks (CTR ${fPct(totals.ctr)}, CPC ${fMoney3(totals.cpc)}, CPM ${fMoney(totals.cpm)}).` });
    if (prevTotals) {
      const ch = (k) => pctChange(totals[k], prevTotals[k]);
      const f = (v) => (v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
      out.push({ t: 'Versus the comparison period', d: `Amount spent ${f(ch('spend'))}, impressions ${f(ch('impressions'))}, link clicks ${f(ch('linkClicks'))}, CPM ${f(ch('cpm'))}.` });
    }
    const top = by((r) => -r.spend);
    if (live.length > 1 && totals.spend) out.push({ t: 'Biggest spender', d: `${top.name} took ${fMoney(top.spend)} — ${((top.spend / totals.spend) * 100).toFixed(0)}% of the total.` });
    const cheap = by((r) => r.cpm), dear = by((r) => r.cpm, -1);
    if (live.length > 1 && cheap.cpm != null) {
      out.push({ t: 'Lowest CPM', d: `${cheap.name} reaches people at ${fCpm(cheap.cpm)} per 1,000 impressions${totals.cpm ? `, ${Math.round((1 - cheap.cpm / totals.cpm) * 100)}% below the average of ${fMoney(totals.cpm)}` : ''}.` });
      if (dear.cpm / cheap.cpm > 1.25) out.push({ t: 'Opportunity', d: `${dear.name} costs ${fCpm(dear.cpm)} per 1,000 impressions, ${Math.round((dear.cpm / cheap.cpm - 1) * 100)}% more than ${cheap.name}. Consider moving budget to the cheaper ${noun.slice(0, -1)}.` });
    }
    const ctr = by((r) => r.ctr, -1);
    if (ctr.ctr != null) out.push({ t: 'Best click-through rate', d: `${ctr.name} has a CTR of ${fPct(ctr.ctr)} (${fInt(ctr.linkClicks)} link clicks at ${fMoney3(ctr.cpc)} each).` });
    const hiFreq = live.filter((r) => r.frequency > 1.5);
    if (hiFreq.length) out.push({ t: 'Frequency', d: `${hiFreq.map((r) => r.name).join(', ')} ${hiFreq.length > 1 ? 'are' : 'is'} showing to each person more than 1.5 times on average. Fresh creative can help avoid ad fatigue.` });
    const off = rows.filter((r) => r.status === 'off' && r.hasData);
    if (off.length) out.push({ t: 'Turned off', d: `${off.length} ${off.length > 1 ? noun : noun.slice(0, -1)} delivered earlier in this period but ${off.length > 1 ? 'are' : 'is'} now off: ${off.map((r) => r.name).join(', ')}.` });
    return out;
  }, [rows, totals, prevTotals, noun, rangeText]);

  return (
    <Modal side={520} title="Analyse" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="an-head"><AnalyseIcon /><span>Insights for the {noun} in your table · {rangeText}</span></div>
      {cards.map((c, i) => <div className="an-card" key={i}><b>{c.t}</b><p>{c.d}</p></div>)}
      <p className="an-note">Generated from the figures currently shown, so search, filters and the date range all apply.</p>
    </Modal>
  );
}
