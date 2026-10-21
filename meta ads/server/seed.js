import 'dotenv/config';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { Campaign, AdSet, Ad, Stat, History } from './models.js';
import { resolveStat, addDays } from './formulas.js';

const today = () => new Date().toISOString().slice(0, 10);
const j = (p) => 1 + (Math.random() * 2 - 1) * p;

async function fill(ad, days, spend, cpm, ctr) {
  const t = today();
  const rows = [];
  for (let i = 0; i < days; i++) {
    const v = resolveStat({ spend: spend * j(0.12), cpm: cpm * j(0.06), ctr: ctr * j(0.08), reachRate: 0.9 + Math.random() * 0.05 });
    rows.push({ adId: ad._id, date: addDays(t, -i), ...v });
  }
  await Stat.insertMany(rows);
}

export async function seed() {
  const camp = await Campaign.create({ name: 'Wolf777 – India Traffic', objective: 'Traffic' });
  const camp2 = await Campaign.create({ name: 'Wolf777 – Retargeting', objective: 'Traffic' });
  // the account currency is shown as US dollars; the sample daily budgets and CPMs keep the scale the demo has used so far
  const s1 = await AdSet.create({ campaignId: camp._id, name: 'IND – Broad 18-45', dailyBudget: 10000 });
  const s2 = await AdSet.create({ campaignId: camp2._id, name: 'IND – Site visitors 30d', dailyBudget: 3500 });
  const mk = (s, name) => Ad.create({ campaignId: s.campaignId, adSetId: s._id, name });
  const a1 = await mk(s1, 'Wolf777 ads IND 1');
  const a2 = await mk(s1, 'Wolf777 AD IND 3.0');
  const a3 = await mk(s2, 'Wolf777 Retarget Video');
  await fill(a1, 90, 4630, 54, 3.3); // days, daily spend, CPM (per 1,000 impressions), CTR %
  await fill(a2, 90, 4530, 53, 3.2);
  await fill(a3, 60, 1490, 91, 2.4);
  await History.create({ entityType: 'campaign', entityId: String(camp._id), entityName: camp.name, action: 'Created', summary: 'Data imported' });
  console.log('Seeded demo data');
}

export async function seedIfEmpty() {
  if (!(await Campaign.estimatedDocumentCount())) await seed();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mongoose.connect(process.env.MONGO_URI);
  if (process.argv.includes('--reset')) await Promise.all([Campaign, AdSet, Ad, Stat, History].map((m) => m.deleteMany({})));
  await seed();
  await mongoose.disconnect();
}
