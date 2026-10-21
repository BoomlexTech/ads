// Campaign and ad group attributes shown on the Campaigns / Ad groups pages and their
// status bars. Stored values may be missing on older data; these helpers give the
// value to show in that case. Used by client and server.

export const CAMPAIGN_TYPES = ['Search', 'Video', 'Demand Gen', 'Display'];
export const CAMPAIGN_STATUS_LABELS = ['Eligible', 'Eligible (Limited)', 'Paused', 'Ended', 'Pending', 'Not eligible'];
export const AD_GROUP_STATUS_LABELS = ['Eligible', 'Eligible (Limited)', 'Paused', 'Pending', 'Not eligible'];
export const AD_GROUP_TYPES = ['Display', 'Standard', 'Video', 'Demand Gen'];
const GROUP_TYPE_FOR = { Search: 'Standard', Video: 'Video', 'Demand Gen': 'Demand Gen', Display: 'Display' };

// Status column / status bar text: an admin-set label wins; otherwise it follows on/off.
export const campaignStatusLabel = (c) => c?.statusLabel || (c?.status === 'paused' ? 'Paused' : 'Eligible');
export const adGroupStatusLabel = (g) => g?.statusLabel || (g?.status === 'paused' ? 'Paused' : 'Eligible');
export const adGroupType = (g, campaignType) => g?.groupType || GROUP_TYPE_FOR[campaignType] || 'Standard';

// Optimization score: a percentage 0-100 with one decimal, or null (shown as a dash).
export function parseScore(text) {
  const s = String(text ?? '').trim().replace(/%$/, '').trim();
  if (!s) return null;
  if (!/^\d{1,3}(\.\d)?$/.test(s)) return undefined;
  const n = Number(s);
  return n <= 100 ? n : undefined;
}
export const formatScore = (n) => (n == null ? '–' : `${Number(n).toFixed(1)}%`);
