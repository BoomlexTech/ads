// Hover-card content for table column headers. Each paragraph is either a string
// or { b: 'bold lead', t: 'rest of the text' }. `recommended` adds the
// "recommended column" footer with "Don't show this column".

export const RECOMMENDED = new Set(['strength', 'convRate', 'conversions', 'costPerConv']);

const REC_NOTE = 'This column is recommended for this table based on your account and campaign settings.';

export const COLUMN_HELP = {
  name: { paras: ['A preview of the ad: its headlines, descriptions, images or videos.'] },
  campaign: { paras: ['The campaign this ad belongs to.'] },
  adGroup: { paras: ['The ad group this ad belongs to.'] },
  status: { paras: ['Whether the ad can run right now, and if it can’t, the reasons why.'] },
  strength: {
    paras: ['Ad strength rates how relevant and varied your ad’s headlines and descriptions are. More relevant, distinct content makes it more likely that the right ad reaches the right customer and performs well.'],
    link: 'Learn more',
    note: 'This column is recommended for this table because you use responsive search ads.',
  },
  adType: { paras: ['The format of the ad, for example a responsive search ad or a video ad.'] },
  video: { paras: ['The videos this ad uses. Select a video to see its details.'] },
  campaignType: { paras: ['The type of campaign this ad runs in, such as Search, Video, Display or Demand Gen.'] },
  impressions: { paras: ['Counted each time your ad is shown on a search results page, a website or a feed.'], link: 'Learn more' },
  clicks: { paras: ['Counted each time someone clicks your ad.'], link: 'Learn more' },
  ctr: { paras: ['Clickthrough rate (CTR) shows how often people who see your ad end up clicking it: clicks divided by impressions.'], link: 'Learn more' },
  avgCpc: { paras: ['Average cost per click (avg. CPC) is your total cost divided by your total clicks.'], link: 'Learn more' },
  avgCpm: { paras: ['Average cost per thousand impressions (CPM) is what you paid on average for every 1,000 times your ad was shown.'] },
  interactions: {
    paras: [
      'An interaction is the main thing people do with an ad format: clicks on text ads, views on video ads, and so on.',
      'Interactions show whether your ads are reaching your performance goals.',
    ],
  },
  interactionRate: { paras: ['Interaction rate shows how often people interact with your ad after it’s shown: interactions divided by impressions.'], link: 'Learn more' },
  avgCost: {
    paras: [
      { b: 'Average cost is what you paid on average for each interaction.', t: '' },
      { b: 'How it works:', t: ' your total cost divided by your total number of interactions.' },
      { b: 'Example:', t: ' if one interaction cost $0.30 and another cost $0.40, your average cost for them is $0.35.' },
    ],
    link: 'More about interactions',
  },
  avgCpv: {
    paras: ['Average cost per view (avg. CPV) is what you paid on average for each view of your video ads: the video ads’ cost divided by their views.'],
    link: 'Learn more about cost-per-view bidding',
  },
  cost: { paras: ['The total you spent on clicks and impressions during this period.'], link: 'Learn more' },
  convPlatform: {
    paras: [
      '“Conv. (Platform Comparable)” counts conversions the way other ad platforms do: it includes view-through conversions and only credits the campaign type that served the ad.',
      'Use it to compare results with campaigns on other ad platforms. It’s for reporting only and is available for Demand Gen campaigns.',
    ],
    link: 'Learn more',
  },
  costPerConvPlatform: {
    paras: ['“Cost / Conv. (Platform Comparable)” is the average cost of one platform-comparable conversion for a campaign type: your cost divided by Conv. (Platform Comparable).'],
  },
  convValueCostPlatform: {
    paras: ['“Conv. value / Cost (Platform Comparable)” is the conversion value of your Demand Gen campaigns divided by their cost, counted the way other ad platforms count it. Other campaign types show a dash.'],
  },
  convRate: {
    paras: [
      'Conversion rate (“Conv. rate”) shows how often, on average, an interaction leads to a conversion: conversions divided by interactions.',
      'Only interactions that can lead to a conversion are counted.',
    ],
    link: 'Learn more',
  },
  conversions: {
    paras: [
      '“Conversions” counts the valuable actions people took after interacting with your ads, from every action included in this column.',
      'Each conversion action’s settings decide whether its conversions are counted here.',
    ],
    link: 'Learn more',
  },
  costPerConv: {
    paras: [
      'Cost per conversion (“Cost / conv.”) is what one conversion cost on average: your cost divided by your conversions.',
      'If you track several conversion actions, your overall cost per conversion can be lower than the cost of each action.',
    ],
    link: 'Learn more',
  },
};

export function helpFor(key) {
  const h = COLUMN_HELP[key];
  if (!h) return null;
  if (RECOMMENDED.has(key)) return { ...h, recommended: true, note: h.note || REC_NOTE };
  return h;
}
