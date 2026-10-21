import mongoose from 'mongoose';

const { Schema } = mongoose;

export const Campaign = mongoose.model('Campaign', new Schema({
  name: String,
  type: String, // 'Search' | 'Video' | 'Demand Gen' | 'Display'
  status: String, // 'enabled' | 'paused' | 'removed'
  order: Number,
  budget: Number, // cents per day; null = none
  statusLabel: { type: String, default: '' }, // '' = follows status (see shared/entities.js)
  statusReasons: [String],
  optimizationScore: { type: Number, default: null }, // 0-100
}));

export const AdGroup = mongoose.model('AdGroup', new Schema({
  campaignId: { type: Schema.Types.ObjectId, index: true },
  name: String,
  status: String, // 'enabled' | 'paused'
  statusLabel: { type: String, default: '' },
  statusReasons: [String],
  targetCpa: { type: Number, default: null }, // cents
  groupType: { type: String, default: '' }, // '' = from the campaign type
}));

export const Ad = mongoose.model('Ad', new Schema({
  campaignId: { type: Schema.Types.ObjectId, index: true },
  adGroupId: { type: Schema.Types.ObjectId, index: true },
  name: String,
  format: String, // 'video' | 'display' | 'search'
  adType: String,
  status: String,
  headlines: [String],
  extraCounts: [Number],
  mediaCount: Number,
  hue: Number,
  strength: String,
  eligibility: String, // 'Eligible' | 'Not eligible'
  reasons: [String],
  videoTitle: String,
  // This ad's own Campaign / Ad group column text; empty shows the campaign's / ad group's name.
  campaignLabel: String,
  adGroupLabel: String,
  displayUrl: String,
  description: String,
  profile: String,
  media: { url: String, publicId: String, type: { type: String }, provider: String },
  // Display ad edit page content (see shared/creative.js); save with markModified('creative').
  creative: Schema.Types.Mixed,
  order: Number,
}));

// Image / logo / video library used by the display ad edit page. Ads keep their own copy
// of each picked asset, so removing one here never breaks an ad.
export const Asset = mongoose.model('Asset', new Schema({
  kind: { type: String, index: true }, // 'image' | 'logo' | 'video'
  source: String, // 'suggested' | 'generated' | 'website' | 'stock' | 'upload'
  url: String,
  publicId: String,
  provider: String, // 'cloudinary' | 'local' | 'sample'
  type: { type: String }, // 'image' | 'video'
  w: Number,
  h: Number,
  bytes: Number,
  name: String,
  title: String,
  createdAt: { type: Date, default: Date.now },
}));

const statSchema = new Schema({
  adId: Schema.Types.ObjectId,
  adGroupId: Schema.Types.ObjectId,
  campaignId: Schema.Types.ObjectId,
  date: String, // YYYY-MM-DD
  impressions: { type: Number, default: null },
  clicks: { type: Number, default: null },
  cost: { type: Number, default: null }, // cents
  conversions: { type: Number, default: null }, // hundredths
  convValue: { type: Number, default: null }, // hundredths
});
statSchema.index({ adId: 1, date: 1 }, { unique: true });
statSchema.index({ date: 1 });
export const Stat = mongoose.model('Stat', statSchema);

export const History = mongoose.model('History', new Schema({
  at: { type: Date, default: Date.now },
  user: String,
  level: String,
  entityName: String,
  metric: String,
  column: String,
  from: String,
  to: String,
  range: String,
  before: String,
  after: String,
  detail: String,
}));

// Messages sent with "Send feedback" by any signed-in user; admins read the latest.
export const Feedback = mongoose.model('Feedback', new Schema({
  at: { type: Date, default: Date.now, index: true },
  user: String,
  role: String, // 'admin' | 'viewer'
  about: String, // what it is about (a feature or page name)
  text: String,
  page: String, // the page address, when the sender chose to include it; '' otherwise
}));

// Small settings, one document each: 'account' (editable account details shown in the top
// bar), 'sampleAssets' (set once the built-in library was added).
export const Setting = mongoose.model('Setting', new Schema({
  key: { type: String, unique: true },
  value: Schema.Types.Mixed,
}));
