import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const opts = { timestamps: true };

export const Campaign = model('Campaign', new Schema({
  name: { type: String, required: true },
  status: { type: String, enum: ['on', 'off'], default: 'on' },
  objective: { type: String, default: 'Traffic' },
  deliveryOverride: { type: String, default: '' },
  // value cells the admin emptied, per column id: the cell shows a dash instead of the calculated figure
  textOverrides: { type: Map, of: String, default: {} },
}, opts));

export const AdSet = model('AdSet', new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['on', 'off'], default: 'on' },
  dailyBudget: { type: Number, default: 0 },
  bidStrategy: { type: String, default: 'Highest volume' },
  deliveryOverride: { type: String, default: '' },
  // value cells the admin emptied, per column id: the cell shows a dash instead of the calculated figure
  textOverrides: { type: Map, of: String, default: {} },
}, opts));

export const Ad = model('Ad', new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  adSetId: { type: Schema.Types.ObjectId, ref: 'AdSet', required: true, index: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['on', 'off'], default: 'on' },
  media: {
    url: String, publicId: String,
    type: { type: String, enum: ['image', 'video'] },
    provider: String,
  },
  // ad creative, as in Ads Manager's ad form
  pageName: { type: String, default: '' },
  primaryText: { type: String, default: '' },
  headline: { type: String, default: '' },
  description: { type: String, default: '' },
  cta: { type: String, default: 'Learn more' },
  websiteUrl: { type: String, default: '' },
  displayLink: { type: String, default: '' },
  deliveryOverride: { type: String, default: '' },
  // value cells the admin emptied, per column id: the cell shows a dash instead of the calculated figure
  textOverrides: { type: Map, of: String, default: {} },
}, opts));

// One row per ad per day. Everything else (CPM, CTR, CPC...) is derived.
const stat = new Schema({
  adId: { type: Schema.Types.ObjectId, ref: 'Ad', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  spend: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  linkClicks: { type: Number, default: 0 },
}, opts);
stat.index({ adId: 1, date: 1 }, { unique: true });
stat.index({ date: 1 });
export const Stat = model('Stat', stat);

// The names shown in the account panel of the top bar. One document (_id 'account'); the admin renames them in place.
// The ad account number itself is a constant of the client and is not stored here.
export const SETTING_DEFAULTS = { portfolioName: 'Wolf777', accountName: 'Wolf777 Ads', secondPortfolioName: 'Second portfolio', profileName: 'Admin' };
export const Setting = model('Setting', new Schema({
  _id: { type: String, default: 'account' },
  portfolioName: { type: String, default: SETTING_DEFAULTS.portfolioName },
  accountName: { type: String, default: SETTING_DEFAULTS.accountName },
  secondPortfolioName: { type: String, default: SETTING_DEFAULTS.secondPortfolioName },
  profileName: { type: String, default: SETTING_DEFAULTS.profileName },
}, opts));

export const History = model('History', new Schema({
  entityType: String, // campaign | adset | ad | stat | account (a rename in the account panel)
  entityId: String,
  entityName: String,
  by: String,
  action: String,
  summary: String,
  changes: [{ field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
}, opts));
