// one-off: convert the sample money in the LIVE database from dollar scale to rupee scale (x83), with a backup first
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import { Campaign, AdSet, Stat, History } from './models.js';

const F = 83;
const BACKUP = 'C:/Users/priya/AppData/Local/Temp/claude/C--Users-priya-OneDrive-Desktop-meta-ads/abeab50f-b1f9-420f-8413-302caa4567fd/scratchpad/backup_pre_rupee.json';
await mongoose.connect(process.env.MONGO_URI);
const stats = await Stat.find().lean();
const adsets = await AdSet.find().lean();
const total = stats.reduce((s, x) => s + x.spend, 0);
console.log('stat rows:', stats.length, ' ad sets:', adsets.length, ' total spend now:', total.toFixed(2), ' budgets:', adsets.map((a) => a.dailyBudget).join(','));
if (total > 500000 || adsets.some((a) => a.dailyBudget >= 5000)) { console.log('looks already converted - nothing done'); await mongoose.disconnect(); process.exit(0); }
fs.writeFileSync(BACKUP, JSON.stringify({ at: new Date().toISOString(), factor: F, stats: stats.map((x) => ({ _id: x._id, spend: x.spend })), adsets: adsets.map((a) => ({ _id: a._id, dailyBudget: a.dailyBudget })) }));
console.log('backup written');
await Stat.bulkWrite(stats.map((x) => ({ updateOne: { filter: { _id: x._id }, update: { $set: { spend: Math.round(x.spend * F * 100) / 100 } } } })));
await AdSet.bulkWrite(adsets.filter((a) => a.dailyBudget > 0).map((a) => ({ updateOne: { filter: { _id: a._id }, update: { $set: { dailyBudget: Math.max(100, Math.round((a.dailyBudget * F) / 100) * 100) } } } })));
const c = await Campaign.findOne().lean();
await History.create({ entityType: 'campaign', entityId: String(c?._id || ''), entityName: 'All campaigns', by: 'System', action: 'Edited data', summary: 'Sample amounts converted from dollars to rupees (spend and budgets x83)' });
const after = await Stat.find().lean(); const ad2 = await AdSet.find().lean();
console.log('total spend after:', after.reduce((s, x) => s + x.spend, 0).toFixed(2), ' budgets:', ad2.map((a) => a.dailyBudget).join(','));
await mongoose.disconnect();
