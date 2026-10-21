// Quick help articles: one per help topic id (the ids "Learn more" links send with the
// window 'app:help' event), written about this app's own features. Body blocks are
// paragraphs (strings) or bullet lists ({ list: [...] }).
import { BRAND } from '../../../shared/brand.js';
import { LIMITS, MAX_BYTES, FILE_TYPES, ASSET_GUIDES, capLabel } from '../../../shared/creative.js';

const N = BRAND.name;
// Upload rules and sizes come from the same values the edit page and the server use, so the
// articles can't drift from them.
const files = (kind) => `${FILE_TYPES[kind]}, up to ${capLabel(MAX_BYTES[kind])} each`;
const px = ([w, h]) => `${w} × ${h}`;
const shapes = (kind) => ASSET_GUIDES[kind].map((g) => `${g.shape}: ${px(g.best)} recommended, at least ${px(g.least)} to look sharp.`);

export const GROUPS = ['Building your ad', 'Reports and figures', `Using ${N}`];

export const ARTICLES = [
  // ---------- Building your ad ----------
  {
    id: 'images', group: GROUPS[0], title: 'Images for your ad', keywords: 'picture photo upload size ratio library jpg png',
    summary: `Each display or video ad needs at least 1 image and can have up to ${LIMITS.images}. Files can be ${files('image')}.`,
    body: [
      'Images are the pictures your ad can show. Add them on the ad’s edit page under Images, either from the asset library or by uploading your own files.',
      { list: [
        `At least 1 image is needed to save the ad, and you can add up to ${LIMITS.images}.`,
        `Files can be ${files('image')}.`,
        'A mix of shapes lets the ad fit more spaces:',
        ...shapes('image'),
        'Ad strength counts up to 5 images, so 5 or more images give the best rating.',
      ] },
      'Each saved ad keeps its own copy of the images it uses, so removing a picture from the asset library doesn’t change ads already saved with it.',
      'Only admins can add, upload or remove images. With read-only access you can look at an ad’s images but not change them.',
    ],
    related: ['logos', 'videos', 'ad-strength'],
  },
  {
    id: 'logos', group: GROUPS[0], title: 'Logos', keywords: 'brand mark square wide',
    summary: `Logos are optional. You can add up to ${LIMITS.logos} per ad, up to ${capLabel(MAX_BYTES.logo)} each; a square logo is recommended, and a wide 4:1 one can be added too.`,
    body: [
      'A logo helps people recognise your business in layouts that have room for one.',
      { list: [
        `Optional, up to ${LIMITS.logos} per ad.`,
        ...shapes('logo'),
        `${files('logo')}.`,
        'Adding at least one logo raises the ad’s strength rating.',
      ] },
    ],
    related: ['images', 'business-name', 'ad-strength'],
  },
  {
    id: 'videos', group: GROUPS[0], title: 'Videos', keywords: 'youtube link clip mp4 mov webm',
    summary: `Videos are optional. Add up to ${LIMITS.videos} per ad as YouTube links or from the asset library.`,
    body: [
      'A video lets the ad show in layouts that play video. Landscape, square and portrait videos of around 30 seconds work best.',
      { list: [
        `Optional, up to ${LIMITS.videos} per ad.`,
        'Paste a YouTube link, such as https://www.youtube.com/watch?v=…, or pick a video from the asset library.',
        `Video files uploaded to the library can be ${FILE_TYPES.video}, up to ${capLabel(MAX_BYTES.video)}.`,
        'Adding a video raises the ad’s strength rating.',
      ] },
    ],
    related: ['auto-video', 'images', 'ad-strength'],
  },
  {
    id: 'headlines', group: GROUPS[0], title: 'Headlines', keywords: 'title text short line characters',
    summary: `Short opening lines of up to ${LIMITS.headline} characters. Add between 1 and ${LIMITS.headlines}, each one different.`,
    body: [
      'Headlines are the first line of your ad. Layouts pick from the headlines you add, so each one should make sense on its own.',
      { list: [
        `At least 1 and up to ${LIMITS.headlines} per ad.`,
        `Up to ${LIMITS.headline} characters each.`,
        'No two headlines can be the same. Capital letters and extra spaces don’t make them different.',
        `Each headline you add raises the ad strength rating, so aim for ${LIMITS.headlines} different ones.`,
      ] },
    ],
    related: ['long-headline', 'descriptions', 'ad-strength'],
  },
  {
    id: 'long-headline', group: GROUPS[0], title: 'Long headline', keywords: 'title text longer line characters',
    summary: `One longer opening line of up to ${LIMITS.longHeadline} characters, used in bigger layouts.`,
    body: [
      'Layouts with more room show the long headline instead of a short headline, often together with a description.',
      { list: [
        'Required: every ad has exactly one.',
        `Up to ${LIMITS.longHeadline} characters.`,
        'A long headline of at least 30 characters helps the ad strength rating.',
      ] },
    ],
    related: ['headlines', 'descriptions'],
  },
  {
    id: 'descriptions', group: GROUPS[0], title: 'Descriptions', keywords: 'text detail body characters',
    summary: `Extra detail that follows the headline, up to ${LIMITS.description} characters each. Add between 1 and ${LIMITS.descriptions}.`,
    body: [
      'Descriptions add detail after your headline: what you offer, and why someone should click.',
      { list: [
        `At least 1 and up to ${LIMITS.descriptions} per ad.`,
        `Up to ${LIMITS.description} characters each.`,
        'No two descriptions can be the same.',
        `Each description you add raises the ad strength rating, so aim for ${LIMITS.descriptions} different ones.`,
      ] },
    ],
    related: ['headlines', 'long-headline'],
  },
  {
    id: 'business-name', group: GROUPS[0], title: 'Business name', keywords: 'brand company name',
    summary: `Your business or brand name, up to ${LIMITS.businessName} characters. Every ad needs one.`,
    body: [
      'The business name tells people who the ad is from. Some layouts show it next to your logo or under your headline.',
      { list: [
        'Required for every ad you edit on the edit page.',
        `Up to ${LIMITS.businessName} characters.`,
      ] },
    ],
    related: ['logos', 'final-url'],
  },
  {
    id: 'final-url', group: GROUPS[0], title: 'Final URL', keywords: 'link website landing page address',
    summary: 'The web page people reach after they click your ad. Use the full address, starting with http:// or https://.',
    body: [
      'The final URL is where your ad leads.',
      { list: [
        'Required for every ad you edit on the edit page.',
        'Use the full address, for example https://www.example.com/offers.',
        `Up to ${LIMITS.finalUrl.toLocaleString('en-US')} characters.`,
        'The previews show the site’s domain under your text.',
      ] },
      'To send mobile visitors to a different page, or to add tracking details, use Ad URL options.',
    ],
    related: ['url-options'],
  },
  {
    id: 'url-options', group: GROUPS[0], title: 'Ad URL options', keywords: 'tracking template suffix custom parameter mobile utm',
    summary: 'Optional tracking details and a separate mobile page, saved with the ad.',
    body: [
      'Open Ad URL options on the ad’s edit page, after Additional format options.',
      { list: [
        'Tracking template: the address used when someone clicks. Start it with {lpurl} (your final URL) or a full URL.',
        'Final URL suffix: details added to the end of your final URL, such as param1=value1&param2=value2.',
        `Custom parameters: up to ${LIMITS.customParams} name and value pairs, used in the template as {_name}. Names can have up to ${LIMITS.paramKey} letters, numbers or underscores; values up to ${LIMITS.paramValue} characters.`,
        'Mobile final URL: tick “Use a different final URL for mobile” to send phone visitors to another page.',
        'Test shows the addresses a click would use with these options, worked out on the page.',
      ] },
      `${N} doesn’t record clicks itself, so these options are kept with the ad but don’t change the figures in your reports.`,
    ],
    related: ['final-url'],
  },
  {
    id: 'native-formats', group: GROUPS[0], title: 'Native formats', keywords: 'look feel site app style',
    summary: 'Lets the ad take on the look of the site or app it appears on, using your own text and images.',
    body: [
      'The “Allow native formats” setting is under Additional format options on the ad’s edit page. It’s on for new ads.',
      'When it’s on, the ad can be drawn in the fonts and colors of the page around it, so it fits in. It still uses only the text and images you added.',
      'The setting is saved with the ad. Turn it off if the ad should always keep its own layout.',
    ],
    related: ['asset-enhancements'],
  },
  {
    id: 'asset-enhancements', group: GROUPS[0], title: 'How your assets are fitted to each space', keywords: 'enhancement crop shorten color adapt',
    summary: 'Layouts may crop images, shorten text or use one of your colors. Nothing new is created for you.',
    body: [
      'An ad can show in many shapes and sizes. To fit each one, a layout may crop your images, shorten your text, or use your main or accent color.',
      `${N} doesn’t create new images, text or videos for your ad: every layout is built only from the assets you added.`,
      'Use the previews on the edit page to see how your assets look in each layout before you save.',
    ],
    related: ['native-formats', 'images'],
  },
  {
    id: 'auto-video', group: GROUPS[0], title: 'Videos made from your assets', keywords: 'automatic auto-generated video slideshow created',
    summary: `${N} doesn’t turn your images into a video. To show in video layouts, add a video of your own.`,
    body: [
      'Some layouts play a video. If your ad has no video, the edit page preview shows an empty grey box in those layouts.',
      `The “Allow auto-generated video” setting under Additional format options is saved with the ad, but ${N} isn’t connected to a video service, so no video is made from your images or text.`,
      'To fill video layouts, add a YouTube link or a library video under Videos.',
    ],
    related: ['videos'],
  },
  {
    id: 'ad-strength', group: GROUPS[0], title: 'Ad strength', keywords: 'rating score quality excellent good average poor incomplete tips',
    summary: 'A rating of how fully your assets cover the places the ad can show: Incomplete, Poor, Average, Good or Excellent.',
    body: [
      'The edit page works out the rating from the ad’s content and shows tips to improve it.',
      { list: [
        'Incomplete: something required is missing (final URL, business name, an image, a headline, the long headline or a description).',
        'After that, the rating rises with more images (up to 5), more headlines and descriptions, a logo, a video and a long headline of 30 characters or more.',
      ] },
      'Admins can set the rating and the tips shown by hand in the edit page’s settings; the hand-set values then replace the worked-out ones.',
      'Ad strength is a guide only. It doesn’t change the ad’s figures.',
    ],
    related: ['images', 'headlines', 'descriptions'],
  },
  {
    id: 'ad-versions', group: GROUPS[0], title: 'Saving a new version of an ad', keywords: 'save review pending history version',
    summary: 'Each save replaces the ad’s content, is logged in Change history and, unless set otherwise, marks the ad for review.',
    body: [
      'When an admin saves changes on the edit page, the ad’s new text and images replace the old ones.',
      { list: [
        'The ad keeps its figures: the performance shown covers the ad before and after the change.',
        'When the ad’s content changes, its status becomes Pending (Under review), unless “After saving” in the page settings is set to “Keep the current status”.',
        `${N} doesn’t run a review itself, so Pending stays until an admin changes the ad’s status.`,
        'Every save is listed in Change history with a short before-and-after summary.',
      ] },
    ],
    related: ['change-history', 'ad-strength'],
  },

  // ---------- Reports and figures ----------
  {
    id: 'metrics', group: GROUPS[1], title: 'Performance figures', keywords: 'impressions clicks cost conversions ctr cpc edit total sample dash',
    summary: 'Figures such as impressions, clicks and cost are sample data. Admins can type new figures in, and every total follows.',
    body: [
      `The figures in ${N} are sample data that come with the account. Admins can double-click a figure in a row, a total row or a scorecard and type a new one: it’s spread over the days in the date range, and every total, scorecard and chart changes to match.`,
      { list: [
        'Impr., Clicks, Cost, Conversions and Conv. value are counted per ad and day.',
        'Other columns are worked out from those: CTR = Clicks ÷ Impr., Avg. CPC = Cost ÷ Clicks, Avg. CPM = Cost ÷ Impr. × 1,000, Conv. rate = Conversions ÷ Interactions, Cost / conv. = Cost ÷ Conversions.',
        'A dash (–) means there’s no value, for example a rate with nothing to divide by. It isn’t the same as zero.',
        'The scorecards above the chart compare the date range with the same number of days just before it.',
      ] },
      'Hover over a column header to see what the column means and how it’s worked out.',
    ],
    related: ['columns', 'reporting-delay', 'conversion-tracking'],
  },
  {
    id: 'columns', group: GROUPS[1], title: 'Choosing columns', keywords: 'modify columns hide show reset recommended order',
    summary: 'Use Columns in the table toolbar to pick which figures each table shows. Your choice is remembered in this browser.',
    body: [
      'Columns opens the Modify columns panel for the table you’re on. Apply uses your changes; Cancel leaves the table as it was.',
      { list: [
        'Tick the columns you want. Greyed-out columns have no data in this app and can’t be added.',
        'Drag the columns under Your columns to change their order. Columns with a lock, such as the name and status, are always shown.',
        '“Show recommended columns in your tables” adds or removes the recommended columns all at once.',
        'Tick “Save your column set” and give it a name to keep this choice and switch back to it later from Saved column sets.',
        'Each table (campaigns, ad groups, ads) keeps its own columns and column sets, saved in this browser.',
        'Hover over a recommended column’s header and choose “Don’t show this column” to remove it quickly. More › Reset columns in the table toolbar goes back to the default set.',
      ] },
    ],
    related: ['metrics', 'filters'],
  },
  {
    id: 'filters', group: GROUPS[1], title: 'Filters', keywords: 'status filter saved find narrow rows',
    summary: 'Filters narrow a table to the rows you want, such as only paused ad groups.',
    body: [
      'Filters are in the table toolbar: the funnel button, the chips next to it and Add filter.',
      { list: [
        'Status filters choose which statuses are listed. Removed items are never shown.',
        'Add filter › Saved filters has one filter per page for rows that may need attention: Disapproved ads (ads that aren’t eligible), Limited campaigns or Paused ad groups. Remove its chip to see every row again.',
        'To find rows by name or text, use Search in the table toolbar.',
      ] },
      'Filters change only which rows the table lists. The Total: Account row always covers every ad in the account.',
    ],
    related: ['views', 'segments', 'search'],
  },
  {
    id: 'segments', group: GROUPS[1], title: 'Segments', keywords: 'segment split day week month quarter year time',
    summary: 'Segments split each table row into smaller rows, for example one per day, month or ad format.',
    body: [
      'Use Segment in the table toolbar to see how a row’s figures break down.',
      { list: [
        'Time splits each row by day, week (starting Monday), month, quarter or year within your date range.',
        'Ad format splits each row by the type of its ads, such as responsive display ads.',
        `Segments that need data ${N} doesn’t record, such as device or network, are listed but can’t be used.`,
        'Choose None to go back to one row per item.',
      ] },
    ],
    related: ['filters', 'time-zone'],
  },
  {
    id: 'views', group: GROUPS[1], title: 'Views', keywords: 'view campaign type search video demand gen display all campaigns',
    summary: 'A view shows every campaign, or only campaigns of one type, across the table, scorecards and chart.',
    body: [
      'The view picker sits at the top of the Campaigns, Ad groups and Ads pages.',
      { list: [
        'All campaigns: every campaign in the account.',
        'Search, Video, Demand Gen or Display campaigns: only campaigns of that type, and their ad groups and ads.',
        'Opening a single campaign shows that campaign’s pages instead, with a campaign picker at the top.',
      ] },
    ],
    related: ['filters', 'segments'],
  },
  {
    id: 'reporting-delay', group: GROUPS[1], title: 'Reporting isn’t real-time', keywords: 'delay update refresh latest new day',
    summary: 'New figures are added about once an hour. Use Refresh in the top bar to load the latest.',
    body: [
      'Figures are stored per day. About once an hour, the server adds sample figures for any new day for campaigns that are running.',
      { list: [
        'Paused campaigns and ad groups record no activity while they’re paused.',
        'A page doesn’t update by itself: choose Refresh in the top bar to load the latest figures.',
      ] },
    ],
    related: ['time-zone', 'metrics'],
  },
  {
    id: 'time-zone', group: GROUPS[1], title: 'Dates and time zone', keywords: 'date range today timezone clock',
    summary: 'Reports cover whole calendar days. “Today” comes from your device’s clock.',
    body: [
      'Figures are stored by calendar day, so every date range covers whole days.',
      { list: [
        'The date picker works out today’s date from your device’s clock, and can’t go past it.',
        'Times in Change history and Feedback are shown in your device’s time zone.',
        'The arrows next to the date picker move the range back or forward by its own length.',
      ] },
    ],
    related: ['reporting-delay', 'segments'],
  },
  {
    id: 'conversion-tracking', group: GROUPS[1], title: 'Conversion tracking', keywords: 'conversions goals tag measure sale lead',
    summary: `Conversions are actions people take after interacting with your ad. In ${N}, conversion figures are sample data.`,
    body: [
      'A conversion is a valuable action, such as a purchase, sign-up or call, that happens after someone interacts with your ad.',
      `${N} doesn’t connect to your website, so there’s no tracking tag to install, and setting up conversion tracking isn’t available yet. The conversion figures you see come with the account’s sample data.`,
      'They appear in the Conversions, Conv. rate, Cost / conv. and Conv. value columns, and in the Platform Comparable columns for Demand Gen campaigns.',
    ],
    related: ['metrics', 'columns'],
  },

  // ---------- Using the app ----------
  {
    id: 'search', group: GROUPS[2], title: `Searching ${N}`, keywords: 'top search shortcut g t find page campaign',
    summary: 'The search box in the top bar finds pages, campaigns and help, and can ask Advisor a question. Press G then T to jump to it.',
    body: [
      'Click the search box, or press G and then T anywhere outside a text box.',
      { list: [
        'Before you type, it lists up to 5 campaigns (all but removed), the ones you opened most recently first, and some questions for Advisor.',
        'As you type, it lists matching pages, up to 5 campaigns and up to 2 help articles. Choosing a campaign opens its ad groups.',
        'Your own words are always listed last, under Ask Advisor: choose them to ask Advisor.',
        'Enter opens the highlighted result, which is the first one until you move with the arrow keys. Esc closes the list.',
      ] },
      'To find rows inside a table, use Search in the table toolbar instead.',
    ],
    related: ['advisor', 'filters'],
  },
  {
    id: 'appearance', group: GROUPS[2], title: 'Spacing', keywords: 'appearance density compact roomy row height large medium small extra',
    summary: 'Appearance in the top bar sets how much space tables, the side navigation and cards take up.',
    body: [
      'Choose Appearance, then a spacing: Large, Medium, Small or Extra small. Large is the standard look.',
      { list: [
        'Smaller spacing makes table rows and headers shorter, so more rows fit on the screen. Extra small also shows smaller ad thumbnails.',
        'The side navigation, scorecards and cards get tighter in the same steps.',
        'Your choice is remembered in this browser only. It doesn’t change anything for other people.',
      ] },
    ],
    related: ['columns', 'search'],
  },
  {
    id: 'advisor', group: GROUPS[2], title: 'Ask Advisor', keywords: 'chat question answer assistant',
    summary: 'Ask questions about the last 30 days of this account. Answers are worked out from your own figures.',
    body: [
      'Open Ask Advisor from the top bar, or type a question in the search box and choose it under Ask Advisor.',
      { list: [
        'It answers questions about the 30 days up to yesterday: top campaigns, spend and how it’s split, clicks and clickthrough rate, conversions, impressions, and which campaigns are paused or which ads aren’t running.',
        'It can also list the headlines of your search ads, starting with the ad that got the most clicks, to reuse as text assets.',
        'Answers are worked out from the account’s figures with fixed rules. No outside AI service is used, so a question it doesn’t recognise gets a list of what it can answer.',
        'Your last 20 questions are saved in this browser, even after you reload or sign out, until you choose Clear history under Earlier questions in the panel.',
      ] },
      'Ask Advisor and Quick help share the right side of the screen, so opening one closes the other.',
    ],
    related: ['ai-labels', 'search'],
  },
  {
    id: 'ai-labels', group: GROUPS[2], title: 'Suggestions and BETA labels', keywords: 'ai label generated suggested beta',
    summary: `${N} doesn’t use an outside AI service. Here’s where suggestions come from and what BETA means.`,
    body: [
      { list: [
        'Suggested images come from the built-in sample library.',
        'Text ideas are put together with fixed patterns from the words you type, your business name and final URL, or taken from text already in this account or from lists an admin has set up.',
        `${N} isn’t connected to an image-generation or stock-photo service. Places that would need one show pictures from the built-in library instead.`,
        'Advisor answers are worked out from your account’s figures with fixed rules.',
        'BETA marks features that are new and may change.',
      ] },
      'Review every suggestion before you add it to an ad.',
    ],
    related: ['ai-policy', 'advisor'],
  },
  {
    id: 'feedback', group: GROUPS[2], title: 'Sending feedback', keywords: 'feedback comment report problem idea',
    summary: 'Tell the account’s admins what works and what doesn’t. Anyone who can sign in can send feedback.',
    body: [
      'Choose Send feedback at the bottom of the top search list, in Ask Advisor’s More options menu, at the bottom of Quick help, or from any other Send feedback link you see.',
      { list: [
        'Pick what it’s about and write your message, up to 2,000 characters.',
        'Tick “Include the address of this page” if the page you’re on helps explain it.',
        'You can send up to 20 messages an hour.',
        'Admins read the latest 200 messages on the Feedback page.',
      ] },
    ],
    related: ['access'],
  },
  {
    id: 'change-history', group: GROUPS[2], title: 'Change history', keywords: 'log audit edits who changed',
    summary: 'A list of every change admins have saved, newest first. Only admins can see it.',
    body: [
      'Change history is in the side navigation for admins.',
      { list: [
        'It lists what admins add, delete and change (names, text, statuses, settings, uploads, ad content, account and billing details and the app card), with who made each change and the before and after values.',
        'It shows the latest 1,000 changes.',
        'Performance figures never appear here, because nobody can change them.',
      ] },
    ],
    related: ['ad-versions', 'access'],
  },
  {
    id: 'access', group: GROUPS[2], title: 'Admin and read-only access', keywords: 'role viewer admin permission sign in',
    summary: 'Admins can create and edit; read-only users see the same pages without the controls to change them.',
    body: [
      { list: [
        'Admins sign in on the admin site, under /admin. They can create, rename, edit and delete campaigns, ad groups and ads, upload images and videos, edit the billing profile and the app card, and read Change history and Feedback.',
        'Read-only users see the same reports and billing pages, but create, save and upload buttons are hidden for them.',
        'Performance figures are read-only for everyone.',
        'Anyone signed in can use Ask Advisor, Quick help, Send feedback and the Appearance spacing.',
      ] },
    ],
    related: ['change-history', 'metrics'],
  },
  {
    id: 'billing', group: GROUPS[2], title: 'Billing', keywords: 'billing spend budget estimate month invoice payment currency tax profile documents promotions transfers',
    summary: `Billing › Summary shows what the account has spent, worked out from its cost figures. ${N} has no payment provider connected, so it has no invoices, payments or balances.`,
    body: [
      'Choose Billing in the left rail to see its pages. Everyone who can sign in can open them.',
      { list: [
        'Summary: spend this month so far, last month and in the last 30 days (up to yesterday). These are the same cost figures your reports show, so they’re sample data too.',
        'Daily budgets adds up the daily budgets of the campaigns that are enabled.',
        'The estimated month total is this month’s spend so far plus the days left in the month times the daily budgets. It’s only an estimate: campaigns can spend more or less than their budget on any day.',
        'Settings: the billing profile (name, address, billing email, phone, tax ID and currency), also shown on Summary. Admins change a value by double-clicking it, and each change is listed in Change history. Read-only users can see the profile but not change it.',
        `The currency is a label for your records. ${N} doesn’t convert anything: costs and budgets stay as recorded, with the $ sign.`,
        `Billing activity, Documents, Payment methods, Promotions and Billing transfers would list records from a payment provider. None is connected to ${N}, and connecting one isn’t available yet, so these pages stay empty. Nobody can type such records in.`,
      ] },
      `${N} doesn’t send invoices or take payments.`,
    ],
    related: ['metrics', 'change-history', 'access'],
  },
  {
    id: 'app-card', group: GROUPS[2], title: 'The “Get the app” card', keywords: 'app mobile phone qr code scan download link card',
    summary: 'The card at the bottom of the side navigation shows a QR code for your app’s link. Read-only users see it once an admin adds a link.',
    body: [
      'The card sits under the Campaigns side navigation.',
      { list: [
        'Admins add the link on the card: choose “Add your app link” and enter the full address, starting with https://. “Change link” replaces it, and clearing it removes the QR code.',
        'The QR code is made from that exact link, so scanning it opens the same page as “Open link”.',
        'Admins can change the card’s title and text by double-clicking them. Clearing either brings back the standard wording.',
        'Read-only users see the card only once a link has been added.',
        'Collapse folds the card down to its title. Close hides it until you close this browser tab.',
        'Every change to the link, title or text is listed in Change history.',
      ] },
      `${N} doesn’t host or check the app: the link goes wherever the admin points it.`,
    ],
    related: ['access', 'change-history'],
  },
  {
    id: 'terms', group: GROUPS[2], title: 'Terms of service', keywords: 'terms legal data privacy',
    summary: `${N} doesn’t have its own terms of service text yet. Here’s what the app does with what you enter.`,
    body: [
      `The account owner hasn’t published terms of service for ${N} yet. Until they do, this is how the app handles your content:`,
      { list: [
        'Campaigns, ads, settings, feedback and change history are stored in this app’s database.',
        'Images and videos you upload are kept in the app’s media storage: the server’s own disk, or a file-hosting service if the account owner has connected one.',
        `${N} doesn’t publish ads anywhere: campaigns, ads and their figures exist only in this app.`,
      ] },
    ],
    related: ['ai-policy', 'access'],
  },
  {
    id: 'ai-policy', group: GROUPS[2], title: 'Generative AI use', keywords: 'ai policy generated content rights',
    summary: `${N} doesn’t use generative AI. Only add images, logos, videos and text you have the right to use.`,
    body: [
      `${N} isn’t connected to any outside AI, image or stock-photo service. Advisor answers are worked out from your account’s figures, and suggestions come from the built-in library, from the words you type, or from text already in the account.`,
      'You’re responsible for the content you add: only use images, logos, videos and text you have the right to use, and check that your ads are accurate.',
    ],
    related: ['ai-labels', 'terms'],
  },
];

export const ARTICLE = Object.fromEntries(ARTICLES.map((a) => [a.id, a]));

// The article that fits each page best ("Most relevant" when Quick help opens without a topic).
export const PAGE_TOPIC = {
  campaigns: 'views', adgroups: 'filters', ads: 'metrics', history: 'change-history', feedback: 'feedback', edit: 'images',
  'billing-summary': 'billing', 'billing-activity': 'billing', 'billing-documents': 'billing', 'billing-methods': 'billing',
  'billing-promotions': 'billing', 'billing-transfers': 'billing', 'billing-settings': 'billing',
};

// The searchable text of an article, lower case.
const textOf = (a) => [a.title, a.summary, a.keywords, ...a.body.flatMap((b) => (typeof b === 'string' ? [b] : b.list))]
  .join(' ').toLowerCase();
const HAYSTACK = new Map(ARTICLES.map((a) => [a.id, textOf(a)]));

// Articles that contain every word of the query (single letters are skipped), the ones whose
// title matches first.
export function searchArticles(query) {
  const q = String(query || '').trim().toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const hits = ARTICLES.filter((a) => words.every((w) => HAYSTACK.get(a.id).includes(w)));
  const score = (a) => (a.title.toLowerCase().includes(q) ? 0 : words.some((w) => a.title.toLowerCase().includes(w)) ? 1 : 2);
  return hits.map((a, i) => [score(a), i, a]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);
}
