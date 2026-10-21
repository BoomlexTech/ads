import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud, Trash2, Film } from 'lucide-react';
import { Modal, Field, Toggle } from './ui.jsx';
import { api } from './api.js';
import { fInt, fMoney, fMoney3, fCpm, trunc2, fPct, fmtDay, todayStr, addDays, daysBetween, CTA_OPTIONS } from './lib.js';

const LEVEL_NAME = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
// Meta's campaign objectives, in Ads Manager's order
const OBJECTIVES = [
  ['Awareness', 'Show your ads to people who are most likely to remember them.'],
  ['Traffic', 'Send people to a destination, like your website or app.'],
  ['Engagement', 'Get more messages, video views, post likes or Page followers.'],
  ['Leads', 'Collect leads for your business or brand.'],
  ['App promotion', 'Find new people to install your app and keep using it.'],
  ['Sales', 'Find people likely to purchase your product or service.'],
];

/* ------------------------------------------------------------------ create / edit entity */
export function EntityEditor({ mode, level, entity, tree, defaults = {}, onClose, onSaved, toast }) {
  const editing = mode === 'edit';
  const id = entity && (entity.entityId || entity.id);
  const [name, setName] = useState(entity?.name || '');
  const parents = level === 'adset' ? tree.campaigns : tree.adsets;
  const [parentId, setParentId] = useState(() => {
    if (level === 'campaign' || editing) return '';
    if (parents.some((p) => p._id === defaults.parentId)) return defaults.parentId; // only if it still exists
    const inCampaign = level === 'ad' && parents.find((p) => p.campaignId === defaults.campaignId); // else: inside the selected campaign
    return (inCampaign || parents[0])?._id || '';
  });
  const [budget, setBudget] = useState(entity?.budget != null && typeof entity.budget === 'number' ? entity.budget : 50);
  const [on, setOn] = useState(entity ? entity.status === 'on' : true);
  const [objective, setObjective] = useState(entity?.objective || 'Traffic');
  const [cr, setCr] = useState({
    pageName: entity?.pageName || '', primaryText: entity?.primaryText || '', headline: entity?.headline || '', description: entity?.description || '',
    cta: entity?.cta || 'Learn more', websiteUrl: entity?.websiteUrl || '', displayLink: entity?.displayLink || '',
  });
  const setC = (k) => (e) => setCr((c) => ({ ...c, [k]: e.target.value }));
  const [file, setFile] = useState(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const preview = useMemo(() => (file ? { url: URL.createObjectURL(file), type: file.type.startsWith('video') ? 'video' : 'image' } : null), [file]);
  const shown = preview || (!removeMedia && entity?.media?.url ? entity.media : null);

  const take = (f) => {
    if (!f) return;
    if (!/^(image\/(jpeg|png|gif|webp)|video\/(mp4|quicktime|webm))$/.test(f.type)) return toast('Use a JPG, PNG, GIF, WEBP, MP4, MOV or WEBM file', true);
    if (f.type.startsWith('image/') && f.size > 10 * 1024 * 1024) return toast('Images can be up to 10 MB (videos up to 50 MB)', true);
    if (f.size > 50 * 1024 * 1024) return toast('File is larger than 50 MB', true);
    setFile(f); setRemoveMedia(false);
  };
  const submit = async () => {
    if (!name.trim()) return toast('Enter a name', true);
    if (level === 'adset' && !(budget !== '' && Number.isFinite(+budget) && +budget >= 0)) return toast('Enter a valid daily budget (0 or more)', true);
    if (!editing && level !== 'campaign' && !parentId) return toast(level === 'ad' ? 'Create an ad set first' : 'Create a campaign first', true);
    const fd = new FormData();
    fd.append('name', name.trim()); fd.append('status', on ? 'on' : 'off');
    if (level !== 'campaign' && !editing) fd.append('parentId', parentId);
    if (level === 'adset') fd.append('dailyBudget', budget);
    if (level === 'campaign') fd.append('objective', objective);
    if (level === 'ad') { if (file) fd.append('media', file); if (removeMedia) fd.append('removeMedia', 'true'); for (const [k, v] of Object.entries(cr)) fd.append(k, v); }
    setBusy(true);
    try {
      await (editing ? api.update(level, id, fd) : api.create(level, fd));
      toast(editing ? 'Changes published' : `${LEVEL_NAME[level][0].toUpperCase() + LEVEL_NAME[level].slice(1)} published`);
      onSaved();
    } catch (e) { toast(e.message, true); setBusy(false); }
  };

  const isAd = level === 'ad';
  const title = `${LEVEL_NAME[level][0].toUpperCase() + LEVEL_NAME[level].slice(1)} ${editing ? 'edit' : 'creation'}`;
  const mediaForPreview = shown;

  return (
    <Modal title={editing ? `Edit ${LEVEL_NAME[level]}` : `Create ${LEVEL_NAME[level]}`} side={isAd ? 960 : 520} onClose={busy ? () => {} : onClose}
      footer={<><button className="btn" disabled={busy} onClick={onClose}>Close</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Publishing…' : 'Publish'}</button></>}>
      <div className={isAd ? 'edit-grid' : ''}>
        <div className="edit-form">
          <Field label={`${LEVEL_NAME[level][0].toUpperCase() + LEVEL_NAME[level].slice(1)} name`}>
            <input className="inp" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name your ${LEVEL_NAME[level]}`} />
          </Field>
          {level === 'campaign' && (
            <Field plain label="Campaign objective">
              <div className="objs" role="radiogroup">
                {OBJECTIVES.map(([o, d]) => (
                  <button type="button" key={o} role="radio" aria-checked={objective === o} className={`obj ${objective === o ? 'on' : ''}`} onClick={() => setObjective(o)}>
                    <i className="ring" /><span><b>{o}</b><small>{d}</small></span>
                  </button>
                ))}
              </div>
            </Field>
          )}
          {!editing && level !== 'campaign' && (
            <Field label={level === 'adset' ? 'Campaign' : 'Ad set'}>
              <select className="inp" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                {parents.map((p) => <option key={p._id} value={p._id}>{level === 'ad' ? `${p.name}  ·  ${tree.campaigns.find((c) => c._id === p.campaignId)?.name || ''}` : p.name}</option>)}
              </select>
            </Field>
          )}
          {level === 'adset' && <Field label="Budget and schedule · Daily budget (USD)"><input className="inp" type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>}

          {isAd && (
            <>
              <div className="sect">Identity</div>
              <Field label="Facebook Page"><input className="inp" value={cr.pageName} onChange={setC('pageName')} placeholder="Page name" maxLength={80} /></Field>

              <div className="sect">Ad setup · Media</div>
              <Field plain label="Image or video">
                {shown ? (
                  <div className="preview">
                    <div className="pv">{shown.type === 'video' ? <video src={shown.url} muted controls /> : <img src={shown.url} alt="" />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ? file.name : 'Current media'}</div>
                      <div style={{ color: '#65676b', fontSize: 12 }}>{shown.type === 'video' ? 'Video' : 'Image'}{file ? ` · ${(file.size / 1048576).toFixed(1)} MB · uploads when you publish` : ''}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn" onClick={() => input.current.click()}>Edit media</button>
                        <button type="button" className="btn" onClick={() => { setFile(null); setRemoveMedia(true); }}><Trash2 size={14} style={{ verticalAlign: -2 }} /> Remove</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`drop ${over ? 'over' : ''}`} onClick={() => input.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                    onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
                    <UploadCloud size={30} /><div style={{ fontWeight: 600, marginTop: 6 }}>Add media</div>
                    <div style={{ fontSize: 12 }}>Drag &amp; drop or click · JPG, PNG, GIF, WEBP up to 10 MB · MP4, MOV, WEBM up to 50 MB</div>
                  </div>
                )}
                <input ref={input} type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { take(e.target.files[0]); e.target.value = ''; }} />
              </Field>

              <div className="sect">Ad creative</div>
              <Field label="Primary text"><textarea className="inp" value={cr.primaryText} onChange={setC('primaryText')} placeholder="Tell people what your ad is about" maxLength={2000} /></Field>
              <Field label="Headline"><input className="inp" value={cr.headline} onChange={setC('headline')} placeholder="Write a short headline" maxLength={100} /></Field>
              <Field label="Description"><input className="inp" value={cr.description} onChange={setC('description')} placeholder="Include additional details" maxLength={200} /></Field>
              <div className="grid2">
                <Field label="Website URL"><input className="inp" value={cr.websiteUrl} onChange={setC('websiteUrl')} placeholder="http://www.example.com/page" maxLength={500} /></Field>
                <Field label="Display link"><input className="inp" value={cr.displayLink} onChange={setC('displayLink')} placeholder="Enter the link you want to show" maxLength={100} /></Field>
              </div>
              <Field label="Call to action">
                <select className="inp" value={cr.cta} onChange={setC('cta')}>{CTA_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select>
              </Field>
            </>
          )}
          <div className="sect">{title === 'Ad edit' || title === 'Ad creation' ? 'Delivery' : 'Status'}</div>
          <Field label="Status">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle large on={on} onChange={setOn} label="Status" /><span>{on ? 'Active' : 'Off'}</span></div>
          </Field>
        </div>

        {isAd && (
          <div>
            <div className="pv-title">Ad preview</div>
            <AdPreview cr={cr} media={mediaForPreview} name={name} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// Facebook-feed style preview of the creative, like the "Ad preview" pane in Ads Manager
export function AdPreview({ cr, media, name }) {
  const page = cr.pageName || name || 'Your Page';
  const dom = (cr.displayLink || cr.websiteUrl || 'example.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return (
    <div className="pv-card">
      <div className="pv-head">
        <div className="pv-av">{page.trim()[0]?.toUpperCase() || 'A'}</div>
        <div><div className="pv-page">{page}</div><div className="pv-sub">Sponsored · 🌐</div></div>
      </div>
      <div className="pv-text">{cr.primaryText || 'Primary text appears here.'}</div>
      <div className="pv-media">{media ? (media.type === 'video' ? <video src={media.url} muted controls /> : <img src={media.url} alt="" />) : 'Your image or video'}</div>
      <div className="pv-link">
        <div><div className="pv-dom">{dom}</div><div className="pv-hl">{cr.headline || 'Headline'}</div>{cr.description && <div className="pv-ds">{cr.description}</div>}</div>
        {cr.cta && cr.cta !== 'No button' && <span className="pv-cta">{cr.cta}</span>}
      </div>
      <div className="pv-foot"><span>Like</span><span>Comment</span><span>Share</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ daily data editor (with live formulas) */
const r2 = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// Editing one field re-computes its dependents. Held constant unless edited: CPM, CTR, reach %.
function applyEdit(m, f, raw, base) {
  const v = raw === '' || Number.isNaN(+raw) ? 0 : Math.max(0, +raw);
  const rr = base.rr; // reach % captured when the field got focus - not re-derived from rounded values
  const n = { ...m, [f]: v };
  const fromImp = (imp) => { n.impressions = Math.round(imp); n.reach = Math.min(n.impressions, Math.round(n.impressions * rr)); n.clicks = Math.round((n.impressions * n.ctr) / 100); };
  if (f === 'spend') fromImp(m.cpm > 0 ? (v / m.cpm) * 1000 : m.impressions);
  if (f === 'cpm') fromImp(v > 0 ? (m.spend / v) * 1000 : m.impressions);
  if (f === 'impressions') { fromImp(v); n.cpm = n.impressions ? (m.spend / n.impressions) * 1000 : m.cpm; }
  if (f === 'reach') n.reach = Math.min(Math.round(v), m.impressions);
  if (f === 'ctr') { n.ctr = Math.min(100, v); n.clicks = Math.round((m.impressions * n.ctr) / 100); }
  if (f === 'clicks') { n.clicks = Math.min(Math.round(v), m.impressions); n.ctr = m.impressions ? (n.clicks / m.impressions) * 100 : 0; }
  if (f === 'cpc') { n.clicks = Math.min(v > 0 ? Math.round(m.spend / v) : m.clicks, m.impressions); n.ctr = m.impressions ? (n.clicks / m.impressions) * 100 : 0; }
  if (f !== 'cpc') n.cpc = n.clicks ? n.spend / n.clicks : 0;
  return n;
}
const blank = (base) => {
  const cpm = base?.impressions && base.spend > 0 ? (base.spend / base.impressions) * 1000 : 0.65;
  const ctr = base?.impressions ? (base.linkClicks / base.impressions) * 100 : 3;
  const rr = base?.impressions ? base.reach / base.impressions : 0.92;
  const spend = base?.spend ?? 50;
  const impressions = Math.round((spend / cpm) * 1000);
  const clicks = Math.round((impressions * ctr) / 100);
  return { spend, cpm, impressions, reach: Math.round(impressions * rr), ctr, clicks, cpc: clicks ? spend / clicks : 0 };
};
const fromStat = (s) => ({ spend: s.spend, cpm: s.impressions ? (s.spend / s.impressions) * 1000 : 0, impressions: s.impressions, reach: s.reach,
  ctr: s.impressions ? (s.linkClicks / s.impressions) * 100 : 0, clicks: s.linkClicks, cpc: s.linkClicks ? s.spend / s.linkClicks : 0 });

export function StatEditor({ ad, range, onClose, onSaved, toast }) {
  const adId = ad.entityId || ad.id;
  const today = todayStr();
  const [tab, setTab] = useState('single');
  const [list, setList] = useState([]);
  const [date, setDate] = useState(range.to > today ? today : range.to);
  const [m, setM] = useState(null);
  const [editing, setEditing] = useState(null); // {field, raw}
  const baseRef = useRef({ rr: 0.92 }); // held ratios, captured on focus
  const dirty = useRef(false); // unsaved typing - must not be wiped when the list reloads
  const shownDate = useRef(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState({ from: range.from, to: range.to > today ? today : range.to, dailySpend: 50, cpm: 0.65, ctr: 3.2, reachRate: 90, variance: 10, overwrite: true });

  const load = async () => setList(await api.stats(adId));
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [adId]); // eslint-disable-line
  const existing = list.find((s) => s.date === date);
  // (re)populate the form whenever date or the list changes, but not while typing
  useEffect(() => {
    if (dirty.current && shownDate.current === date) return; // same day, user is mid-edit: keep their input
    const next = existing ? fromStat(existing) : blank(list[0]);
    dirty.current = false; shownDate.current = date;
    baseRef.current = { rr: next.impressions ? next.reach / next.impressions : 0.92 };
    setEditing(null); setM(next);
  }, [date, list]); // eslint-disable-line

  const change = (f, raw) => { dirty.current = true; setEditing({ field: f, raw }); setM((cur) => applyEdit(cur, f, raw, baseRef.current)); };
  const val = (f, digits) => (editing?.field === f ? editing.raw : f === 'cpm' ? trunc2(m[f]).toFixed(2) : m[f].toFixed(digits)); // CPM: two decimals, cut off

  const save = async () => {
    setBusy(true);
    try {
      await api.saveStat({ adId, date, spend: r2(m.spend), impressions: m.impressions, reach: m.reach, linkClicks: m.clicks });
      toast(`${existing ? 'Updated' : 'Added'} data for ${fmtDay(date)}`);
      dirty.current = false;
      await load(); onSaved();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const del = async (s) => {
    if (!window.confirm(`Delete data for ${fmtDay(s.date)}?`)) return;
    try { await api.deleteStat(s._id); toast('Data deleted'); await load(); onSaved(); } catch (e) { toast(e.message, true); }
  };
  const runBulk = async () => {
    if (!bulk.from || !bulk.to || bulk.from > bulk.to) return toast('Choose a valid date range', true);
    if (!(+bulk.ctr >= 0 && +bulk.ctr <= 100) || !(+bulk.reachRate >= 0 && +bulk.reachRate <= 100) || !(+bulk.variance >= 0 && +bulk.variance <= 100)) return toast('CTR, reach % and variance must be between 0 and 100', true);
    setBusy(true);
    try {
      const res = await api.bulk({ adId, ...bulk, reachRate: bulk.reachRate / 100 });
      toast(`Generated ${res.days} day(s) of data`);
      await load(); onSaved();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const est = useMemo(() => {
    const d = bulk.from && bulk.to && bulk.from <= bulk.to ? daysBetween(bulk.from, bulk.to) : 0;
    const spend = d * +bulk.dailySpend, imp = +bulk.cpm > 0 ? (spend / +bulk.cpm) * 1000 : 0;
    return { d, spend, imp, clicks: (imp * +bulk.ctr) / 100 };
  }, [bulk]);

  if (!m) return null;
  const freq = m.reach ? m.impressions / m.reach : null;
  const num = (label, f, digits, prefix, hint, calc) => (
    <Field label={label} hint={hint}>
      <input className={`inp ${calc ? 'calc' : ''}`} inputMode="decimal" value={(prefix && editing?.field !== f ? prefix : '') + val(f, digits)}
        onFocus={(e) => { baseRef.current = { rr: m.impressions ? m.reach / m.impressions : baseRef.current.rr }; setEditing({ field: f, raw: String(f === 'cpm' ? trunc2(m[f]) : r2(m[f], digits)) }); setTimeout(() => e.target.select(), 0); }}
        onBlur={() => setEditing(null)} onChange={(e) => change(f, e.target.value.replace(/[^0-9.]/g, ''))} />
    </Field>
  );
  const bk = (k, label, hint, step = 'any') => (
    <Field label={label} hint={hint}><input className="inp" type="number" step={step} min="0" max={k === 'ctr' || k === 'reachRate' ? 100 : undefined} value={bulk[k]} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value })} /></Field>
  );

  return (
    <Modal wide title={`Add / edit data · ${ad.name}`} onClose={onClose}
      footer={tab === 'single'
        ? <><span className="l">Totals, CPM, CTR &amp; CPC in the table recalculate from this data.</span><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : existing ? 'Update day' : 'Save day'}</button></>
        : <><span className="l">{est.d} day(s) · ≈ {fMoney(est.spend)} spent · ≈ {fInt(est.imp)} impressions · ≈ {fInt(est.clicks)} clicks</span><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={busy} onClick={runBulk}>{busy ? 'Generating…' : 'Generate data'}</button></>}>
      <div className="seg"><button className={tab === 'single' ? 'on' : ''} onClick={() => setTab('single')}>Single day</button><button className={tab === 'bulk' ? 'on' : ''} onClick={() => setTab('bulk')}>Bulk generate</button></div>

      {tab === 'single' ? (
        <>
          <div className="formula">Edit any value, the others follow: <code>Impressions = Spend ÷ CPM × 1000</code> · <code>CPM = Spend ÷ Impressions × 1000</code> · <code>Clicks = Impressions × CTR</code> · <code>CPC = Spend ÷ Clicks</code> · <code>Frequency = Impressions ÷ Reach</code></div>
          <div className="grid3">
            <Field label="Date" hint={<span className={`pill ${existing ? 'edit' : 'new'}`}>{existing ? 'editing existing' : 'new entry'}</span>}>
              <input className="inp" type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} />
            </Field>
            {num('Amount spent', 'spend', 2, '$')}
            {num('CPM', 'cpm', 3, '$', 'per 1,000 impr.')}
            {num('Impressions', 'impressions', 0)}
            {num('Reach', 'reach', 0)}
            <Field label="Frequency" hint="calculated"><input className="inp calc" readOnly value={freq ? freq.toFixed(2) : '—'} /></Field>
            {num('Link clicks', 'clicks', 0)}
            {num('CTR (all)', 'ctr', 2, '', '%')}
            {num('CPC (all)', 'cpc', 4, '$')}
          </div>
        </>
      ) : (
        <>
          <div className="formula">Fills every day in the range from a few knobs (random ±variance per day). Each day: <code>Impressions = Spend ÷ CPM × 1000</code>, <code>Reach = Impressions × reach %</code>, <code>Clicks = Impressions × CTR</code>.</div>
          <div className="grid3">
            <Field label="From"><input className="inp" type="date" max={today} value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value > today ? today : e.target.value })} /></Field>
            <Field label="To"><input className="inp" type="date" max={today} value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value > today ? today : e.target.value })} /></Field>
            {bk('dailySpend', 'Daily spend ($)')}
            {bk('cpm', 'CPM ($)', 'per 1,000 impr.', '0.01')}
            {bk('ctr', 'CTR (all) %', 'max 100')}
            {bk('reachRate', 'Reach % of impressions', 'max 100')}
            {bk('variance', 'Daily variance ±%')}
            <Field label="Existing days"><select className="inp" value={bulk.overwrite ? 'o' : 's'} onChange={(e) => setBulk({ ...bulk, overwrite: e.target.value === 'o' })}><option value="o">Overwrite</option><option value="s">Skip (keep existing)</option></select></Field>
          </div>
        </>
      )}

      <div style={{ fontWeight: 600, margin: '8px 0 6px' }}>Daily history <span className="pill">{list.length}</span></div>
      <div className="scroll">
        <table className="mini">
          <thead><tr><th>Date</th><th>Spent</th><th>Impressions</th><th>CPM</th><th>Reach</th><th>Clicks</th><th>CTR</th><th>CPC</th><th /></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s._id} className={s.date === date ? 'cur' : ''} onClick={() => { setTab('single'); setDate(s.date); }}>
                <td>{fmtDay(s.date)}</td><td>{fMoney(s.spend)}</td><td>{fInt(s.impressions)}</td>
                <td>{fCpm(s.impressions ? (s.spend / s.impressions) * 1000 : null)}</td><td>{fInt(s.reach)}</td><td>{fInt(s.linkClicks)}</td>
                <td>{fPct(s.impressions ? (s.linkClicks / s.impressions) * 100 : null)}</td><td>{fMoney3(s.linkClicks ? s.spend / s.linkClicks : null)}</td>
                <td><button className="del" onClick={(e) => { e.stopPropagation(); del(s); }} aria-label="Delete"><Trash2 size={15} /></button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="9" style={{ textAlign: 'center', color: '#65676b', padding: 20 }}>No data yet. Add a day above or bulk generate.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
