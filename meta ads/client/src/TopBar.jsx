import React from 'react';
import { Menu } from './ui.jsx';
import OppScore from './OppScore.jsx';
import AccountPanel, { ACCOUNT_ID, DEFAULT_NAMES, firstLetter } from './AccountPanel.jsx';
import { TbCaret, AcctGlyph, RefreshGlyph, DotsGlyph, FbBadge, BinGlyph } from './fid-topbar-icons.jsx';
import './fid-topbar.css';

// The top bar: page title, account selector (opens the account panel), Opportunity score, "Updated ..." text, refresh,
// "Discard Drafts" + "Review and publish (N)" while something is in draft (otherwise a grey "Review and publish"), the "..." menu and the profile avatar.
// (Matched to the real Ads Manager; the page background behind it is painted in fid-topbar.css.)
//   level ('campaign' | 'adset' | 'ad')   user (email)   initial (avatar letter)   narrow (an AI panel is open: shorter layout)
//   updatedText ("Updated just now")   score (0-100)   menus + open(key)(bool): open/close state of the dropdowns
//   onRefresh()   onOpenAnalyse()   onProfile()   onShortcuts()   onReset()   comingSoon(what) -> handler   toast(msg, isError)
//   names { portfolioName, accountName, secondPortfolioName, profileName }   admin (bool: the names can be renamed in the panel)
//   onSaveNames(patch) -> Promise   drafts (how many campaigns + ad sets + ads are "In draft")   onPublish()   onDiscard()
export default function TopBar({ level, user, initial, narrow, updatedText, score, menus, open, onRefresh, onOpenAnalyse, onProfile, onShortcuts, onReset, comingSoon, toast,
  names = DEFAULT_NAMES, admin = false, onSaveNames, drafts = 0, onPublish, onDiscard }) {
  const account = `${names.accountName} (${ACCOUNT_ID})`;
  return (
    <header className={`topbar fid-topbar ${narrow ? 'is-narrow' : ''}`}>
      <h1>{{ campaign: 'Campaigns', adset: 'Ad sets', ad: 'Ads' }[level]}</h1>
      <Menu open={!!menus.acct} setOpen={open('acct')} className="fid-acct-pop"
        button={(
          <button className="acct fid-acct" aria-haspopup="dialog" aria-expanded={!!menus.acct}>
            <span className="acct-av" aria-hidden="true">{firstLetter(names.portfolioName)}</span>
            <span className="acct-sep" aria-hidden="true" />
            <span className="acct-ic" aria-hidden="true"><AcctGlyph /></span>
            <span className="acct-t">{account}</span>
            <TbCaret />
          </button>
        )}>
        {(close) => <AccountPanel names={names} admin={admin} onSaveNames={onSaveNames} toast={toast} comingSoon={comingSoon} close={close} />}
      </Menu>
      <OppScore score={score} onOpenAnalyse={onOpenAnalyse} />
      <span className="grow" />
      {!narrow && <span className="upd">{updatedText}</span>}
      <button className="tb sq fid-tb-btn" title="Refresh" aria-label="Refresh" onClick={onRefresh}><RefreshGlyph /></button>
      {/* nothing in draft: the grey "Review and publish" only. Something set to "In draft" in the admin panel: "Discard Drafts" and the
          blue "Review and publish (N)", N = how many campaigns + ad sets + ads are in draft */}
      {drafts > 0
        ? (
          <>
            <button className="tb fid-tb-btn fid-tb-discard" onClick={onDiscard}><BinGlyph />Discard Drafts</button>
            <button className="tb pubbtn fid-tb-btn fid-tb-pub is-live" onClick={onPublish}>Review and publish ({drafts})</button>
          </>
        )
        : <button className="tb pubbtn fid-tb-btn fid-tb-pub" disabled>Review and publish</button>}
      <Menu open={!!menus.dots} setOpen={open('dots')} right className="fid-dots-pop"
        button={<button className="tb sq fid-tb-btn" title="More options" aria-label="More options" aria-haspopup="menu" aria-expanded={!!menus.dots}><DotsGlyph /></button>}>
        {(close) => (
          <div className="fid-tbm fid-tbm-dots">
            <button className="fid-tbm-item" onClick={() => { close(); onReset(); }}>Reset Ads Manager…</button>
            <button className="fid-tbm-item" onClick={() => { close(); onShortcuts(); }}>Keyboard shortcuts (Ctrl + Shift + /)</button>
          </div>
        )}
      </Menu>
      <button className="avatar fid-avatar" title={user} aria-label="Your profiles" onClick={onProfile}><span className="fid-av-l">{initial}</span><i className="fid-av-fb"><FbBadge /></i></button>
    </header>
  );
}
