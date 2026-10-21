import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAccount, useEditAccount } from '../account.js';
import { Icon } from './Common.jsx';
import { EditText, EditSelect } from './Editable.jsx';
import { BRAND, tabTitle } from '../../../shared/brand.js';
import { ACCOUNT_MAX, CURRENCIES, currencyName } from '../../../shared/account.js';
import { formatValue } from '../../../shared/metrics.js';
import { todayISO, addDays, daysBetween, fmtRange } from '../../../shared/dates.js';
import './billing.css';

// Rail > Billing. Summary works out spend from the account's own cost figures and shows the
// billing profile; Settings holds the billing profile (admins edit it, everyone can read it).
// The other pages would list records from a payment provider. None is connected, so they say
// so: nothing on them is made up, and there is nothing to type in.
export const BILLING_PAGES = {
  'billing-summary': { label: 'Summary', title: 'Billing summary', path: '/aw/billing/summary', icon: 'credit_card' },
  'billing-activity': { label: 'Billing activity', title: 'Billing activity', path: '/aw/billing/activity', icon: 'receipt_long', empty: 'billing activity' },
  'billing-documents': { label: 'Documents', title: 'Documents', path: '/aw/billing/documents', icon: 'description', empty: 'documents' },
  'billing-methods': { label: 'Payment methods', title: 'Payment methods', path: '/aw/billing/paymentmethods', icon: 'credit_card', empty: 'payment methods' },
  'billing-promotions': { label: 'Promotions', title: 'Promotions', path: '/aw/billing/promotions', icon: 'sell', empty: 'promotions' },
  'billing-transfers': { label: 'Billing transfers', title: 'Billing transfers', path: '/aw/billing/transfers', icon: 'swap_horiz', empty: 'billing transfers' },
  'billing-settings': { label: 'Settings', title: 'Billing settings', path: '/aw/billing/settings', icon: 'settings' },
};
export const isBillingPage = (p) => typeof p === 'string' && Object.prototype.hasOwnProperty.call(BILLING_PAGES, p);

const openHelp = () => window.dispatchEvent(new CustomEvent('app:help', { detail: { topic: 'billing' } }));
function LearnMore() {
  return <button type="button" className="btn-text bill-learn" data-help="billing" onClick={openHelp}>Learn more</button>;
}

// First and last day of the month holding a date.
const monthStart = (iso) => `${iso.slice(0, 8)}01`;
const monthEnd = (iso) => addDays(monthStart(addDays(monthStart(iso), 32)), -1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (iso) => MONTHS[Number(iso.slice(5, 7)) - 1];

// Spend figures, worked out from the account's daily cost (cents) and its campaigns' budgets.
// today: 'YYYY-MM-DD'; series: [{ date, cost }]; campaigns: [{ status, budget }].
export function billingFigures(today, series, campaigns) {
  const sum = (from, to) => {
    let s = 0;
    let n = 0;
    for (const p of series) {
      if (p.date >= from && p.date <= to && p.cost != null) { s += p.cost; n++; }
    }
    return n ? s : null;
  };
  const first = monthStart(today);
  const last = monthEnd(today);
  const prevEnd = addDays(first, -1);
  const prevStart = monthStart(prevEnd);
  const yesterday = addDays(today, -1);
  const enabled = campaigns.filter((c) => c.status === 'enabled' && c.budget != null);
  const budgets = enabled.reduce((s, c) => s + c.budget, 0);
  const thisMonth = sum(first, today);
  const remaining = daysBetween(today, last);
  return {
    thisMonth: { value: thisMonth, from: first, to: today },
    lastMonth: { value: sum(prevStart, prevEnd), from: prevStart, to: prevEnd },
    last30: { value: sum(addDays(yesterday, -29), yesterday), from: addDays(yesterday, -29), to: yesterday },
    budgets: { value: budgets, campaigns: enabled.length },
    estimate: { value: (thisMonth ?? 0) + remaining * budgets, remaining, month: monthName(today), to: last },
  };
}
// The report range that covers every figure above.
export function billingRange(today) {
  const prevStart = monthStart(addDays(monthStart(today), -1));
  const l30 = addDays(today, -30);
  return { from: prevStart < l30 ? prevStart : l30, to: today };
}

function Figure({ id, label, value, sub, estimate }) {
  return (
    <div className={`bill-fig ${estimate ? 'estimate' : ''}`} data-testid="billing-figure" data-fig={id}>
      <div className="bill-fig-label">
        {label}
        {estimate && <span className="bill-tag">Estimate</span>}
      </div>
      <div className="bill-fig-value" data-testid="billing-value">{formatValue('cost', value)}</div>
      <div className="bill-fig-sub">{sub}</div>
    </div>
  );
}

function Summary({ canEdit }) {
  const [figs, setFigs] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => {
      const today = todayISO();
      api.report(billingRange(today))
        .then((r) => { if (live) { setFigs(billingFigures(today, r.series || [], r.campaigns || [])); setError(''); } })
        .catch((e) => { if (live) setError(e.message); });
    };
    load();
    window.addEventListener('app:refresh', load);
    return () => {
      live = false;
      window.removeEventListener('app:refresh', load);
    };
  }, []);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return (
    <>
      <section className="card bill-card" aria-label="Costs">
        <h2 className="bill-head">Costs</h2>
        {error && <div className="empty">{error}</div>}
        {!figs && !error && <div className="bill-loading">Loading…</div>}
        {figs && (
          <div className="bill-figs">
            <Figure id="thisMonth" label="This month so far" value={figs.thisMonth.value} sub={fmtRange(figs.thisMonth.from, figs.thisMonth.to)} />
            <Figure id="lastMonth" label="Last month" value={figs.lastMonth.value} sub={fmtRange(figs.lastMonth.from, figs.lastMonth.to)} />
            <Figure id="last30" label="Last 30 days" value={figs.last30.value} sub={fmtRange(figs.last30.from, figs.last30.to)} />
            <Figure id="budgets" label="Daily budgets" value={figs.budgets.value} sub={`Per day, ${plural(figs.budgets.campaigns, 'enabled campaign')}`} />
            <Figure id="estimate" estimate label={`Estimated ${figs.estimate.month} total`} value={figs.estimate.value}
              sub={`This month so far + ${plural(figs.estimate.remaining, 'remaining day')} × daily budgets`} />
          </div>
        )}
        <p className="bill-note">
          Figures come from your account&apos;s cost data. The estimated total assumes every enabled campaign spends its full daily budget for
          the rest of the month, so actual cost can be higher or lower.
          <LearnMore />
        </p>
      </section>
      <BillingProfile canEdit={canEdit} />
    </>
  );
}

const PROFILE = [
  { field: 'billingName', label: 'Name', hint: 'The person or business billed' },
  { field: 'billingAddress', label: 'Address', multiline: true },
  { field: 'billingEmail', label: 'Billing email' },
  { field: 'billingPhone', label: 'Phone' },
  { field: 'taxId', label: 'Tax ID', hint: 'For example a VAT, GST or EIN number' },
];

function BillingProfile({ canEdit }) {
  const account = useAccount();
  const save = useEditAccount();
  const notSet = <span className="bill-unset">Not set</span>;
  return (
    <section className="card bill-card" aria-label="Billing profile" data-testid="billing-profile">
      <h2 className="bill-head">Billing profile</h2>
      {canEdit && <p className="bill-hint">Double-click a value to change it. Changes are saved straight away and listed in Change history.</p>}
      <dl className="bill-profile">
        {PROFILE.map((f) => (
          <div className="bill-row" key={f.field} data-testid="billing-field" data-field={f.field}>
            <dt>{f.label}{f.hint && <small>{f.hint}</small>}</dt>
            <dd className={f.multiline ? 'lines' : ''}>
              <EditText value={account[f.field] || ''} canEdit={canEdit} multiline={f.multiline} maxLength={ACCOUNT_MAX[f.field]}
                label={`billing ${f.label.toLowerCase().replace(/^billing /, '')}`} onSave={(v) => save(f.field, v)}>
                {account[f.field] ? <span className="bill-val">{account[f.field]}</span> : notSet}
              </EditText>
            </dd>
          </div>
        ))}
        <div className="bill-row" data-testid="billing-field" data-field="currency">
          <dt>Currency<small>Shown for reference only</small></dt>
          <dd>
            <EditSelect value={account.currency} canEdit={canEdit} label="billing currency"
              options={CURRENCIES.map(([c, n]) => [c, `${c} – ${n}`])} onSave={(v) => save('currency', v)}>
              <span className="bill-val">{account.currency} – {currencyName(account.currency)}</span>
            </EditSelect>
            <p className="bill-sub">
              {BRAND.name} doesn&apos;t convert any figures: costs and budgets stay exactly as recorded in the account and keep their $ sign,
              whichever currency is chosen here.
            </p>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Empty({ spec }) {
  return (
    <section className="card bill-empty" data-testid="billing-empty">
      <Icon name={spec.icon} className="bill-empty-ic" />
      <p>No {spec.empty} to show. These appear when a payment provider is connected to {BRAND.name}.</p>
      <LearnMore />
    </section>
  );
}

export default function BillingPage({ page, canEdit }) {
  const spec = BILLING_PAGES[page];
  const account = useAccount();
  useEffect(() => { document.title = tabTitle(`${spec.title}-${account.name}-${BRAND.name}`); }, [spec.title, account.name]);
  return (
    <div className="page bill-page" data-level={page} data-testid="billing-page">
      <div className="titlebar"><h1>{spec.title}</h1></div>
      {page === 'billing-summary' && <Summary canEdit={canEdit} />}
      {page === 'billing-settings' && (
        <>
          <BillingProfile canEdit={canEdit} />
          <p className="bill-note outside">
            These details are kept with the account for your records. {BRAND.name} has no payment provider connected, so it doesn&apos;t
            send invoices or take payments. <LearnMore />
          </p>
        </>
      )}
      {spec.empty && <Empty spec={spec} />}
    </div>
  );
}
