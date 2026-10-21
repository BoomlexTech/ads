// Account details admins edit besides the top bar ones: the "Get the app" card at the bottom of
// the side navigation, and the billing profile (Billing > Settings). The server checks every
// value against these limits and choices, and the editors use the same ones.
import { BRAND, DEFAULT_ACCOUNT } from './brand.js';

// Billing currency: a label shown on the billing pages. It never converts any figure.
export const CURRENCIES = [
  ['USD', 'US dollar'], ['INR', 'Indian rupee'], ['EUR', 'Euro'], ['GBP', 'British pound'],
  ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['SGD', 'Singapore dollar'], ['AED', 'UAE dirham'],
];
export const CURRENCY_CODES = CURRENCIES.map(([code]) => code);
export const currencyName = (code) => CURRENCIES.find(([c]) => c === code)?.[1] || code;

export const APP_CARD_DEFAULTS = {
  appUrl: '',
  appTitle: `Get the ${BRAND.name} app`,
  appText: 'Scan to download the app and get updates for your campaigns on the go',
};
export const BILLING_DEFAULTS = {
  billingName: '', billingAddress: '', billingEmail: '', billingPhone: '', taxId: '', currency: 'USD',
};
// Every account detail, as shown until an admin changes it.
export const ACCOUNT_DEFAULTS = { ...DEFAULT_ACCOUNT, ...APP_CARD_DEFAULTS, ...BILLING_DEFAULTS };

// Longest value each text field takes (characters).
export const ACCOUNT_MAX = {
  // App link: 200 at most, so its QR code on the card stays dense enough to scan.
  appUrl: 200, appTitle: 60, appText: 160,
  billingName: 100, billingAddress: 300, billingEmail: 200, billingPhone: 40, taxId: 40,
};
// Most lines a billing address keeps.
export const ADDRESS_LINES = 8;

// Column names in Change history.
export const ACCOUNT_LABELS = {
  id: 'Account ID', name: 'Account name', email: 'Account email', profileName: 'Profile name', avatar: 'Profile photo',
  appUrl: 'App link', appTitle: 'App card title', appText: 'App card text',
  billingName: 'Billing name', billingAddress: 'Billing address', billingEmail: 'Billing email',
  billingPhone: 'Billing phone', taxId: 'Tax ID', currency: 'Billing currency',
};
