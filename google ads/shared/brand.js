// The one place for the app's identity: product name and logo (top bar, sign-in page,
// tab titles, footer, favicon via vite.config.js, page address) and the sample account.
const name = 'Google Ads';

export const BRAND = {
  name,
  logo: '/favicon.svg',
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, ''),
};

// Browser tab title for every page. Leave it empty ('') and each page shows its own title
// ("Ads-<account name>-<product name>", "Edit ad-…", "Sign in - …"); type text here and
// every page's tab shows exactly that text instead, e.g. const TAB_TITLE = 'Google Ads';
export const TAB_TITLE = 'Ads-bb7-Google Ads';
export const tabTitle = (pageTitle) => TAB_TITLE || pageTitle;

// Account shown until an admin edits it (the edited details are stored in the database).
export const DEFAULT_ACCOUNT = { id: '123-456-7890', name: 'Demo Account', email: 'demo@example.com' };
