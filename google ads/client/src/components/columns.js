import { METRICS } from '../../../shared/metrics.js';

// Non-number columns. Each table (level) offers its own set, see LEVELS.
export const ATTR_COLS = {
  strength: { label: 'Ad strength', dashed: true, help: 'How well your ad follows best practices.' },
  adType: { label: 'Ad type' },
  video: { label: 'Video', help: 'Videos used by this ad.' },
  campaignType: { label: 'Campaign type' },
  optScore: { label: 'Optimization score', dashed: true, help: 'How well the campaign is set to perform: 100% means it can perform at its full potential.' },
  targetCpa: { label: 'Target CPA', help: 'The average amount you’d like to pay for a conversion in this ad group.' },
  groupType: { label: 'Ad group type', help: 'The kind of ads this ad group runs. It follows the campaign type unless set.' },
};

export const colLabel = (k) => ATTR_COLS[k]?.label ?? METRICS[k]?.label ?? k;
export const isMetric = (k) => !!METRICS[k];
// Quick help topic behind a column's "Learn more" link.
export const helpTopic = (k) => (k === 'strength' ? 'ad-strength' : isMetric(k) ? 'metrics' : 'columns');
const known = (k) => !!ATTR_COLS[k] || isMetric(k);

export const DEFAULT_COLS = ['strength', 'adType', 'avgCpv', 'avgCpm', 'clicks', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'video',
  'convPlatform', 'costPerConvPlatform', 'convValueCostPlatform', 'convRate', 'conversions', 'costPerConv'];

// Per table: the "Modify columns" title, columns that are always shown, the attribute columns
// it offers, its default column set and where the choice is remembered (the ads key is unchanged).
export const LEVELS = {
  campaigns: {
    noun: 'campaigns', locked: ['Campaign', 'Budget', 'Status'], attrs: ['optScore', 'campaignType'], storeKey: 'ap.cols.campaigns',
    defaults: ['optScore', 'campaignType', 'convValue', 'conversions', 'convRate', 'clicks', 'impressions', 'ctr', 'avgCpc', 'cost', 'costPerConv'].filter(known),
  },
  adgroups: {
    noun: 'ad groups', locked: ['Ad group', 'Campaign', 'Status'], attrs: ['targetCpa', 'groupType'], storeKey: 'ap.cols.adgroups',
    defaults: ['targetCpa', 'conversions', 'costPerConv', 'groupType', 'clicks', 'impressions', 'ctr', 'avgCpc', 'cost', 'convRate', 'convValue'].filter(known),
  },
  ads: {
    noun: 'ads', locked: ['Ad', 'Campaign', 'Ad group', 'Status'], attrs: ['strength', 'adType', 'video', 'campaignType'], storeKey: 'ap.cols.v2',
    defaults: DEFAULT_COLS,
  },
};

// A saved column list, minus anything this table doesn't offer.
export const colsFor = (level, list) => (Array.isArray(list) ? list : LEVELS[level].defaults)
  .filter((k, i, a) => a.indexOf(k) === i && (isMetric(k) || LEVELS[level].attrs.includes(k)));

const unavailable = (label) => ({ label });

// Sections of the "Modify columns" panel. Items without a key are listed but
// unavailable in this demo.
export const SECTIONS = [
  { title: 'Recommended columns', items: ['strength', 'convRate', 'conversions', 'costPerConv'] },
  { title: 'Performance', items: ['clicks', 'cost', 'impressions', 'ctr', 'interactions', 'interactionRate',
    { label: 'Engagements' }, { label: 'Engagement rate' }, 'avgCpc', 'avgCost', { label: 'Avg. CPE' }, 'avgCpm',
    'avgCpv', { label: 'Video views' }, { label: 'Watch time' }, { label: 'Avg. watch time / impr.' },
    { label: 'Impr. (Abs. Top) %' }, { label: 'Impr. (Top) %' }] },
  { title: 'Viewability', items: [{ label: 'Viewable impr.' }, { label: 'Non-viewable impr.' }, { label: 'Measurable impr.' },
    { label: 'Non-measurable impr.' }, { label: 'Measurable cost' }, { label: 'Measurable rate' }, { label: 'Avg. viewable CPM' },
    { label: 'Viewable CTR' }, { label: 'Viewable rate' }] },
  { title: 'Conversions', items: ['conversions', 'costPerConv', 'convRate', METRICS.convValue ? 'convValue' : unavailable('Conv. value'), { label: 'Conv. value / cost' },
    { label: 'Conv. value / click' }, { label: 'Value / conv.' }, { label: 'All conv.' }, { label: 'Cost / all conv.' },
    { label: 'All conv. rate' }, { label: 'Orders' }, { label: 'Revenue' }, { label: 'Avg. order value' }, { label: 'Gross profit' },
    { label: 'Cross-device conv.' }, { label: 'New customers' }, 'convPlatform', 'costPerConvPlatform', 'convValueCostPlatform'] },
  { title: 'Attribution', items: [{ label: 'Conversions (by conv. time)' }, { label: 'View-through conv.' }] },
  { title: 'Attributes', items: ['adType', 'video', 'campaignType', { label: 'Final URL' }, { label: 'Labels' }] },
  { title: 'Analytics', items: [{ label: 'Bounce rate' }, { label: 'Pages / session' }, { label: 'Avg. session duration (seconds)' }] },
  { title: 'Call details', items: [{ label: 'Phone calls' }, { label: 'Phone impr.' }, { label: 'PTR' }] },
  { title: 'Message details', items: [{ label: 'Message chats' }, { label: 'Message impr.' }] },
  { title: 'Earned actions', items: [{ label: 'Earned views' }, { label: 'Earned subscribers' }] },
  { title: 'Shorts ads actions', items: [{ label: 'Shorts views' }] },
  { title: 'Custom columns', items: [] },
];

const ATTRIBUTES = {
  campaigns: ['optScore', 'campaignType', { label: 'Bid strategy type' }, { label: 'Labels' }],
  adgroups: ['targetCpa', 'groupType', { label: 'Default max. CPC' }, { label: 'Labels' }],
};

// The panel's sections for one table: its own attribute columns, and no ad-only ones elsewhere.
export function sectionsFor(level) {
  if (level === 'ads' || !LEVELS[level]) return SECTIONS;
  return SECTIONS.map((s) => {
    if (s.title === 'Attributes') return { ...s, items: ATTRIBUTES[level] };
    return { ...s, items: s.items.filter((it) => typeof it !== 'string' || isMetric(it) || LEVELS[level].attrs.includes(it)) };
  });
}
