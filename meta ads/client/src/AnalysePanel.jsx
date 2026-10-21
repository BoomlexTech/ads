import React, { useMemo, useState } from 'react';
import { fInt, fMoney, fMoney3, fCpm, fPct, pctChange } from './lib.js';
import { MetaAILogo, IcHamburger, IcCompose, IcCalendar, IcExpand, IcClose, IcInfo, IcClip, IcPlus, IcStop, IcSend } from './fid-ai-icons.jsx';
import './fid-ai.css';

// The Meta AI business assistant panel ("Analyse"): a chat-style panel with a consent card; after "Continue" it answers with
// an analysis of the figures currently shown in the table. Props: ctx = { rows, totals, prevTotals, level, rangeText }, onClose.
export function insights({ rows, totals, prevTotals, level, rangeText }) {
  const noun = level === 'ad' ? 'ads' : level === 'adset' ? 'ad sets' : 'campaigns';
  const live = rows.filter((r) => r.hasData);
  if (!live.length) return [{ t: 'No delivery in this period', d: `None of the ${noun} shown delivered in ${rangeText}. Try a longer date range.` }];
  const out = [];
  const by = (fn, dir = 1) => [...live].filter((r) => fn(r) != null).sort((a, b) => dir * (fn(a) - fn(b)))[0] || {}; // rows without the metric never win
  out.push({ t: 'Summary', d: `${live.length} ${noun} spent ${fMoney(totals.spend)} in ${rangeText}, delivering ${fInt(totals.impressions)} impressions to ${fInt(totals.reach)} accounts and ${fInt(totals.linkClicks)} link clicks (CTR ${fPct(totals.ctr)}, CPC ${fMoney3(totals.cpc)}, CPM ${fMoney(totals.cpm)}).` });
  if (prevTotals) {
    const f = (v) => (v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
    out.push({ t: 'Versus the comparison period', d: `Amount spent ${f(pctChange(totals.spend, prevTotals.spend))}, impressions ${f(pctChange(totals.impressions, prevTotals.impressions))}, link clicks ${f(pctChange(totals.linkClicks, prevTotals.linkClicks))}, CPM ${f(pctChange(totals.cpm, prevTotals.cpm))}.` });
  }
  const top = by((r) => -r.spend);
  if (live.length > 1 && totals.spend) out.push({ t: 'Biggest spender', d: `${top.name} took ${fMoney(top.spend)}, ${((top.spend / totals.spend) * 100).toFixed(0)}% of the total.` });
  const cheap = by((r) => r.cpm), dear = by((r) => r.cpm, -1);
  if (live.length > 1 && cheap.cpm != null) {
    out.push({ t: 'Lowest CPM', d: `${cheap.name} reaches people at ${fCpm(cheap.cpm)} per 1,000 impressions${totals.cpm ? `, ${Math.round((1 - cheap.cpm / totals.cpm) * 100)}% below the average of ${fMoney(totals.cpm)}` : ''}.` });
    if (dear.cpm / cheap.cpm > 1.25) out.push({ t: 'Recommendation', d: `${dear.name} costs ${fCpm(dear.cpm)} per 1,000 impressions, ${Math.round((dear.cpm / cheap.cpm - 1) * 100)}% more than ${cheap.name}. Consider moving budget to the cheaper one.` });
  }
  const ctr = by((r) => r.ctr, -1);
  if (ctr.ctr != null) out.push({ t: 'Best click-through rate', d: `${ctr.name} has a CTR of ${fPct(ctr.ctr)} (${fInt(ctr.linkClicks)} link clicks at ${fMoney3(ctr.cpc)} each).` });
  const hi = live.filter((r) => r.frequency > 1.5);
  if (hi.length) out.push({ t: 'Frequency', d: `${hi.map((r) => r.name).join(', ')} ${hi.length > 1 ? 'are' : 'is'} reaching each person more than 1.5 times on average. Fresh creative can help avoid ad fatigue.` });
  const off = rows.filter((r) => r.status === 'off' && r.hasData);
  if (off.length) out.push({ t: 'Turned off', d: `${off.map((r) => r.name).join(', ')} delivered earlier in this period but ${off.length > 1 ? 'are' : 'is'} now off.` });
  return out;
}

export default function AnalysePanel({ ctx, onClose }) {
  const [step, setStep] = useState('consent'); // consent -> answered
  const cards = useMemo(() => (step === 'answered' ? insights(ctx) : []), [step, ctx]);
  return (
    <aside className="ai-pane fid-ai" aria-label="Meta AI business assistant">
      <div className="fid-ai-head">
        <button className="fid-ai-ib fid-ai-menu" aria-label="Menu"><IcHamburger /></button>
        <button className="fid-ai-ib fid-ai-new" aria-label="New chat"><IcCompose /></button>
        <button className="fid-ai-ib fid-ai-hist" aria-label="History"><IcCalendar /></button>
        <span className="fid-ai-brand"><MetaAILogo size={31.6} /><span className="fid-ai-beta">Beta</span></span>
        <button className="fid-ai-ib fid-ai-exp" aria-label="Expand"><IcExpand /></button>
        <button className="fid-ai-ib fid-ai-x" onClick={onClose} aria-label="Close"><IcClose /></button>
      </div>
      <div className="fid-ai-body">
        <div className="fid-ai-note">You're asking Meta AI business assistant</div>
        <div className="fid-ai-me">Analyse my account performance over the past 30 days and give me any recommendations that could help improve it.</div>
        {step === 'consent' ? (
          <>
            <div className="fid-ai-wait"><MetaAILogo size={19} small />Waiting for your response</div>
            <div className="fid-ai-card">
              <div className="fid-ai-ct"><IcInfo /><b>Start using Meta AI</b></div>
              <p>Your interactions with this business assistant will be used to improve AI at Meta. <a>Learn about your right to object.</a></p>
              <p>By continuing, you agree to our <a>Beta</a>, <a>Privacy</a>, <a>Meta AI</a> and <a>Supplemental</a> Terms.</p>
              <div className="fid-ai-btns"><button className="fid-ai-b pri" onClick={() => setStep('answered')}>Continue</button><button className="fid-ai-b" onClick={onClose}>Not now</button></div>
            </div>
          </>
        ) : (
          <div className="fid-ai-ans">
            <div className="fid-ai-wait"><MetaAILogo size={19} small />Here is what I found</div>
            {cards.map((c, i) => <div className={`fid-ai-card fid-ai-ac${c.t === 'Recommendation' ? ' rec' : ''}`} key={i}><b>{c.t}</b><p>{c.d}</p></div>)}
            <p className="fid-ai-gen">Generated from the figures currently shown in your table, so search, filters and the date range all apply.</p>
          </div>
        )}
      </div>
      <div className="fid-ai-foot">
        <div className="fid-ai-comp">
          <div className="fid-ai-reply">Add a reply...</div>
          <div className="fid-ai-tools">
            <button type="button" className="fid-ai-chip"><IcClip />Add file</button>
            <button type="button" className="fid-ai-chip"><IcPlus />Select ad</button>
            <i className="fid-ai-send">{step === 'consent' ? <IcStop /> : <IcSend />}</i>
          </div>
        </div>
      </div>
    </aside>
  );
}
