import { createContext, useContext } from 'react';
import { DEFAULT_ACCOUNT } from '../../shared/brand.js';
import { ACCOUNT_DEFAULTS } from '../../shared/account.js';

export { DEFAULT_ACCOUNT, ACCOUNT_DEFAULTS };

// Account details shown in the top bar, tab title, advisor, the app card and the billing pages.
// Loaded from the server (admins can edit them); ACCOUNT_DEFAULTS is used until it arrives.
export const AccountContext = createContext({
  account: ACCOUNT_DEFAULTS, setAccount: () => {}, notify: () => {}, editAccount: async () => false, accountLoaded: false,
});
export const useAccount = () => useContext(AccountContext).account;
// One toast for the whole app (a later message replaces the earlier one).
export const useNotify = () => useContext(AccountContext).notify;
// Saves one account detail (admins); a refusal shows its message in the toast. Resolves to
// true once saved.
export const useEditAccount = () => useContext(AccountContext).editAccount;
export const useAccountLoaded = () => useContext(AccountContext).accountLoaded;
export const initialOf = (a) => (a.profileName || a.name || '?').trim().charAt(0).toUpperCase();
