import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api.js';
import { useNotify } from '../../account.js';
import { Dropdown, Icon, MenuItem, useOutside, openHelp } from '../Common.jsx';
import { BRAND } from '../../../../shared/brand.js';
import {
  aspectLabel, fmtBytes, isYouTube, LIMITS, youTubeId, youTubeUrl, ASSET_GUIDES, FILE_TYPES, MAX_BYTES, capLabel,
  normText, textIdeas, TEXT_LIMIT,
} from '../../../../shared/creative.js';
import './assets.css';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const TILE_H = 95;

// (admin: uploading saves only for admins; the tab shows for everyone.)
const TABS = {
  image: [
    { key: 'suggested', label: 'Suggested', source: 'suggested' },
    { key: 'library', label: 'Asset library' },
    { key: 'generated', label: 'Generated', source: 'generated' },
    { key: 'website', label: 'Website or social', source: 'website' },
    { key: 'upload', label: 'Upload', source: 'upload', admin: true },
    { key: 'stock', label: 'Free stock images', source: 'stock' },
  ],
  logo: [
    { key: 'suggested', label: 'Suggested', source: 'suggested' },
    { key: 'library', label: 'Asset library' },
    { key: 'website', label: 'Website or social', source: 'website' },
    { key: 'upload', label: 'Upload', source: 'upload', admin: true },
  ],
};

// The smallest sharp size for each shape, and the file types and cap the upload takes.
const guideLines = (kind) => [
  ...ASSET_GUIDES[kind].map((g) => `${g.shape}: at least ${g.least[0]} × ${g.least[1]}`),
  `${FILE_TYPES[kind]}, up to ${capLabel(MAX_BYTES[kind])}`,
];

// Library item -> the copy stored on the ad (so the ad survives a library delete).
export function refOf(asset) {
  if (asset.kind === 'video') return { assetId: asset.id, url: asset.url, title: asset.title || asset.name || 'Video' };
  return { assetId: asset.id, url: asset.url, w: asset.w || 0, h: asset.h || 0, bytes: asset.bytes || 0, name: asset.name || '' };
}

const refKey = (r) => r.assetId || r.url;
const sameRef = (r, a) => (r.assetId && r.assetId === a.id) || r.url === a.url;
// A list of picks without the library item `a` (for onDrop below).
export const withoutAsset = (list, a) => (list || []).filter((r) => !sameRef(r, a));
const isPicked = (list, a) => list.some((r) => sameRef(r, a));
const sameList = (a, b) => a.length === b.length && a.every((r, i) => refKey(r) === refKey(b[i]));
const tileWidth = (w, h, cap = 170) => (w && h ? Math.round(Math.min(cap, Math.max(48, (TILE_H * w) / h))) : TILE_H);
const nameHas = (a, q) => !q.trim() || `${a.name || ''} ${a.title || ''}`.toLowerCase().includes(q.trim().toLowerCase());
let seq = 0;
const uid = () => `up${Date.now().toString(36)}${(seq += 1)}`;

function readImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const tabbable = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);

// The side panel (Quick help, opened by the Learn more links in a dialog, or Ask Advisor) stays
// usable while a dialog is open. It only counts while it shows above the dialog.
const SIDE_PANEL = '.advisor';
const inSidePanel = (el) => el instanceof Element && !!el.closest(SIDE_PANEL);
function shownSidePanel() {
  const p = document.querySelector(SIDE_PANEL);
  const r = p?.getBoundingClientRect();
  if (!r || !r.width || !r.height) return null;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
  return hit && p.contains(hit) ? p : null;
}

// Keyboard handling for the dialogs: focus moves in (to `first`, or the dialog itself), Tab
// stays inside, Esc calls onEsc, and focus goes back to the opener on close. Capture phase, so
// the page underneath never sees these keys. A menu or help card open inside the dialog closes
// first: its Dropdown handles that Esc itself. Keys typed in the side panel are left to it, and
// Tab goes round the dialog and the panel together, so keyboard users can reach and leave it.
export function useModal(boxRef, onEsc, first) {
  const esc = useRef(onEsc);
  esc.current = onEsc;
  useEffect(() => {
    const back = document.activeElement;
    const box0 = boxRef.current;
    ((first && box0?.querySelector(first)) || box0)?.focus();
    const onKey = (e) => {
      const box = boxRef.current;
      if (!box || e.isComposing) return;
      const inSide = inSidePanel(e.target);
      if (e.key === 'Escape') {
        if (inSide || box.querySelector('.popover')) return;
        e.stopPropagation();
        esc.current();
      } else if (e.key === 'Tab') {
        const els = tabbable(box);
        if (!els.length) return;
        const panel = shownSidePanel();
        const side = panel ? tabbable(panel) : [];
        const at = document.activeElement;
        const head = els[0];
        const tail = els[els.length - 1];
        let to = null;
        if (inSide) {
          // Inside the panel the browser moves focus; only its ends lead back into the dialog.
          if (!side.length) return;
          if (!e.shiftKey && at === side[side.length - 1]) to = head;
          else if (e.shiftKey && at === side[0]) to = tail;
        } else if (!box.contains(at)) to = e.shiftKey ? tail : head;
        else if (e.shiftKey && (at === head || at === box)) to = side[side.length - 1] || tail;
        else if (!e.shiftKey && at === tail) to = side[0] || head;
        if (to) { e.preventDefault(); to.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (back?.isConnected && typeof back.focus === 'function') back.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function HelpTip({ kind, align = 'right' }) {
  const logo = kind === 'logo';
  return (
    <Dropdown align={align} className="adlg-helpdd" trigger={(open, toggle) => (
      <button type="button" className={`adlg-helpbtn ${open ? 'open' : ''}`} aria-label={`${logo ? 'Logo' : 'Image'} requirements`}
        aria-expanded={open} onClick={toggle}><Icon name="help" /></button>
    )}>
      {(close) => (
        <div className="adlg-helpcard">
          <div className="adlg-helpcard-title">{logo ? 'Logo' : 'Image'} requirements</div>
          <ul>{guideLines(logo ? 'logo' : 'image').map((t) => <li key={t}>{t}</li>)}</ul>
          <button type="button" className="adlg-learn" data-help={logo ? 'logos' : 'images'}
            onClick={() => { close(); openHelp(logo ? 'logos' : 'images'); }}>Learn more</button>
        </div>
      )}
    </Dropdown>
  );
}

function Spinner({ label, small }) {
  return (
    <div className={`adlg-loading ${small ? 'small' : ''}`} role="status">
      <span className="adlg-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

function Tile({ a, on, logo, canEdit, onToggle, onDelete }) {
  const w = tileWidth(a.w, a.h);
  const cap = [aspectLabel(a.w, a.h), fmtBytes(a.bytes)].filter(Boolean).join(' · ');
  return (
    <div className="adlg-item" style={{ width: w }}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={on}
        aria-label={a.name || (logo ? 'Logo' : 'Image')}
        title={a.name || ''}
        className={`adlg-tile ${on ? 'on' : ''} ${logo ? 'logo' : ''}`}
        style={{ width: w }}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          onToggle();
        }}
      >
        <img src={a.url} alt="" loading="lazy" draggable={false} />
        {on && <span className="adlg-check"><Icon name="check_circle" fill /></span>}
        {canEdit && !a.ref && (
          <button type="button" className="adlg-del" data-tip="Delete" aria-label="Delete from asset library"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Icon name="delete" />
          </button>
        )}
      </div>
      <div className="adlg-cap" title={cap}>{cap || a.name}</div>
    </div>
  );
}

function PendingTile({ p }) {
  const w = tileWidth(p.w, p.h);
  return (
    <div className="adlg-item" style={{ width: w }}>
      <div className="adlg-tile pending" style={{ width: w }}>
        <img src={p.preview} alt="" draggable={false} />
        <span className="adlg-tile-spin"><span className="adlg-spin" /></span>
        <span className="adlg-prog"><span /></span>
      </div>
      <div className="adlg-cap" title={p.name}>Uploading {p.name}</div>
    </div>
  );
}

function Grid({ items, pending = [], picked, logo, canEdit, onToggle, onDelete, emptyText }) {
  if (!items.length && !pending.length) {
    return (
      <div className="adlg-empty">
        <Icon name="photo_library" />
        <span>{emptyText}</span>
      </div>
    );
  }
  return (
    <div className="adlg-grid">
      {pending.map((p) => <PendingTile key={p.id} p={p} />)}
      {items.map((a) => (
        <Tile key={a.id} a={a} logo={logo} on={isPicked(picked, a)} canEdit={canEdit} onToggle={() => onToggle(a)} onDelete={() => onDelete(a)} />
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="adlg-search">
      <Icon name="search" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button type="button" className="adlg-search-clear" aria-label="Clear search" onClick={() => onChange('')}><Icon name="close" /></button>}
    </label>
  );
}

// Image / logo picker: a sheet over the right 80% of the window with source tabs on top and the
// ad's current picks pinned below. Nothing reaches the ad until Save. Every tab lists images in
// the asset library by where they came from; nothing here creates or fetches images.
// `selected` is the edit page's form, `saved` the ad as last saved (the server only keeps a
// deleted library file while a saved ad uses it). onDrop(asset) is called when a library delete
// also takes a pick out of the form, since that pick can no longer be saved.
export default function AssetDialog({ kind = 'image', selected, saved, max, canEdit, initialTab, onSave, onDrop, onClose }) {
  const notify = useNotify();
  const isLogo = kind === 'logo';
  const limit = max || (isLogo ? LIMITS.logos : LIMITS.images);
  const noun = isLogo ? 'logos' : 'images';
  const one = isLogo ? 'logo' : 'image';
  // (Every tab shows for everyone; uploading does nothing for read-only users.)
  const tabs = TABS[isLogo ? 'logo' : 'image'];

  const [tab, setTab] = useState(() => (tabs.some((t) => t.key === initialTab) ? initialTab : 'suggested'));
  const [assets, setAssets] = useState(null);
  const initial = useRef(selected || []);
  const onSaved = saved || initial.current; // the picks the saved ad keeps a copy of
  const [picked, setPicked] = useState(() => [...(selected || [])]);
  const [pending, setPending] = useState([]); // uploads in flight
  const [uploadedIds, setUploadedIds] = useState([]); // uploaded from the Upload tab while open
  const [libQuery, setLibQuery] = useState('');
  const [stockQuery, setStockQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [stripOpen, setStripOpen] = useState(true);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [flash, setFlash] = useState(false);
  const [detail, setDetail] = useState(null); // { ref, left, top }
  const [addFromUp, setAddFromUp] = useState(false);

  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const stripRef = useRef(null);
  const detailRef = useRef(null);
  const fileRef = useRef(null);
  const sourceRef = useRef('upload');
  const dragDepth = useRef(0);
  const pickedRef = useRef(picked); // latest picks, for the upload loop between renders
  pickedRef.current = picked;

  useModal(sheetRef, () => (detail ? setDetail(null) : onClose()));
  useOutside(detailRef, () => setDetail(null), !!detail);

  useEffect(() => {
    let live = true;
    api.assets(kind)
      .then((d) => { if (live) setAssets(d.assets || []); })
      .catch((err) => {
        if (!live) return;
        setAssets([]);
        notify(err.message);
      });
    return () => { live = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [tab]);

  const list = assets || [];
  const ofSource = (s) => list.filter((a) => a.source === s);
  const pendingFor = (s) => pending.filter((p) => p.source === s);
  const dirty = !sameList(picked, initial.current);
  // The ad's own picks that match no library item (an older copy, or a deleted asset). The Asset
  // library tab lists them too, so one removed from the strip (now or before) can be picked again.
  const onAd = [];
  if (assets) {
    for (const r of [...initial.current, ...onSaved]) {
      if (r?.url && !list.some((a) => sameRef(r, a)) && !onAd.some((x) => x.url === r.url)) {
        onAd.push({ id: `ad:${r.url}`, url: r.url, w: r.w, h: r.h, bytes: r.bytes, name: r.name, ref: r });
      }
    }
  }

  const toggle = (a) => {
    if (isPicked(picked, a)) {
      setPicked((p) => p.filter((r) => !sameRef(r, a)));
    } else if (picked.length >= limit) {
      notify(`You can add up to ${limit} ${noun}`);
    } else {
      setPicked((p) => [...p, a.ref || refOf(a)]);
    }
  };

  const removeAsset = async (a) => {
    if (!canEdit) return;
    const label = a.name || `this ${one}`;
    // The saved ad keeps its copy. A pick it doesn't use yet (picked now, or in an earlier visit
    // to this dialog but not saved with the ad) goes with the asset, as its file is deleted too.
    const kept = isPicked(onSaved, a);
    const inForm = isPicked(initial.current, a);
    const unsavedPick = !kept && (inForm || isPicked(picked, a));
    const msg = unsavedPick
      ? `Delete "${label}" from the asset library? It will also be removed from the ${noun} you picked for this ad.`
      : `Delete "${label}" from the asset library? Ads that already use it keep their copy.`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteAsset(a.id);
      setAssets((l) => (l || []).filter((x) => x.id !== a.id));
      setUploadedIds((ids) => ids.filter((id) => id !== a.id));
      if (!kept) {
        setPicked((p) => withoutAsset(p, a));
        // Out of the edit page's form too, so Cancel doesn't leave a pick that can't be saved.
        if (inForm) {
          initial.current = withoutAsset(initial.current, a);
          onDrop?.(a);
        }
      }
      setDetail((d) => (d && sameRef(d.ref, a) ? null : d));
    } catch (err) {
      notify(err.message);
    }
  };

  const uploadFiles = async (fileList, source) => {
    if (!canEdit) return;
    const files = [...(fileList || [])];
    const typed = files.filter((f) => IMAGE_TYPES.includes(f.type));
    if (typed.length < files.length) notify('Only JPG, PNG, GIF and WebP images can be uploaded');
    // The same cap the server checks (logos are smaller), so a big file isn't sent for nothing.
    const cap = MAX_BYTES[kind];
    const ok = typed.filter((f) => f.size <= cap);
    if (ok.length < typed.length) {
      const big = typed.filter((f) => f.size > cap);
      notify(`${isLogo ? 'Logos' : 'Images'} can be up to ${capLabel(cap)}, so ${big.length === 1 ? `“${big[0].name}” wasn’t` : `${big.length} files weren’t`} uploaded`);
    }
    if (!ok.length) return;
    const items = await Promise.all(ok.map(async (file) => {
      const preview = URL.createObjectURL(file);
      return { id: uid(), file, name: file.name, source, preview, ...(await readImageSize(preview)) };
    }));
    setPending((p) => [...p, ...items]);
    // One at a time so the new picks land in the order the files were chosen.
    let full = 0; // uploaded, but no room left on the ad
    for (const it of items) {
      try {
        const { asset } = await api.uploadAsset(it.file, { kind, source, w: it.w, h: it.h });
        setAssets((l) => [asset, ...(l || []).filter((x) => x.id !== asset.id)]);
        if (source === 'upload') setUploadedIds((ids) => [asset.id, ...ids]);
        const cur = pickedRef.current;
        if (isPicked(cur, asset)) continue;
        if (cur.length >= limit) { full += 1; continue; }
        const ref = refOf(asset);
        pickedRef.current = [...cur, ref];
        setPicked((p) => (p.length < limit && !isPicked(p, asset) ? [...p, ref] : p));
      } catch (err) {
        notify(err.message);
      } finally {
        setPending((p) => p.filter((x) => x.id !== it.id));
        URL.revokeObjectURL(it.preview);
      }
    }
    if (full) {
      notify(`You can add up to ${limit} ${noun}, so ${full} uploaded ${full === 1 ? `${one} was` : `${noun} were`} added to your asset library only`);
    }
  };

  const chooseFiles = (source) => {
    if (!canEdit) return;
    sourceRef.current = source;
    fileRef.current?.click();
  };

  const drop = {
    onDragEnter: (e) => { e.preventDefault(); dragDepth.current += 1; setDragOver(true); },
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: () => { dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); } },
    onDrop: (e) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      uploadFiles(e.dataTransfer.files, 'upload');
    },
  };

  const review = () => {
    setStripOpen(true);
    setBannerHidden(false);
    setFlash(true);
    requestAnimationFrame(() => {
      const el = stripRef.current;
      if (!el) return;
      el.scrollTo({ left: 0, behavior: 'smooth' });
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  const openDetail = (r, tileEl) => {
    const s = sheetRef.current.getBoundingClientRect();
    const t = tileEl.getBoundingClientRect();
    setDetail({ ref: r, left: Math.max(16, Math.min(t.left - s.left, s.width - 296)), top: t.top - s.top - 8 });
  };

  const addHere = (source) => (
    <button type="button" className="adlg-outline" onClick={() => chooseFiles(source)}>
      <Icon name="add" />Add to this tab
    </button>
  );
  const gridProps = { picked, logo: isLogo, canEdit, onToggle: toggle, onDelete: removeAsset, emptyText: `No ${noun} here yet` };
  const loading = assets === null;

  // A tab of library items from one source: its heading, a plain line on what's in it, the grid.
  const sourceTab = (source, title, about, note = null) => (
    <>
      <div className="adlg-row">
        <div className="adlg-based"><b>{title}</b><span className="adlg-url">{about}</span></div>
        <span className="spacer" />
        {addHere(source)}
      </div>
      {note}
      {loading ? <Spinner /> : <Grid {...gridProps} items={ofSource(source)} pending={pendingFor(source)} />}
    </>
  );

  let content;
  if (tab === 'suggested') {
    content = sourceTab('suggested', 'Suggested for your ad', `${isLogo ? 'Logos' : 'Images'} in your asset library marked as suggestions`);
  } else if (tab === 'library') {
    const extra = onAd.filter((a) => nameHas(a, libQuery));
    const lib = list.filter((a) => nameHas(a, libQuery));
    const none = libQuery.trim() ? `No ${noun} match “${libQuery.trim()}”` : `No ${noun} here yet`;
    content = (
      <>
        <div className="adlg-row">
          <SearchBox value={libQuery} onChange={setLibQuery} placeholder={`Search ${noun} by name`} />
          <span className="spacer" />
          {!loading && <span className="adlg-count">{list.length} {list.length === 1 ? one : noun}</span>}
        </div>
        {loading ? <Spinner /> : extra.length > 0 ? (
          <>
            <div className="adlg-subhead">In your ad <span className="adlg-small">Not in your asset library</span></div>
            <Grid {...gridProps} items={extra} />
            <div className="adlg-subhead">In your asset library</div>
            {lib.length > 0 ? <Grid {...gridProps} items={lib} /> : <div className="adlg-small adlg-none">{none}</div>}
          </>
        ) : <Grid {...gridProps} items={lib} emptyText={none} />}
      </>
    );
  } else if (tab === 'generated') {
    content = sourceTab('generated', 'Generated images', 'Images in your asset library that were made with an image tool', (
      <div className="adlg-hint adlg-hint-gen">
        <Icon name="info" />
        <div>
          <b>{BRAND.name} doesn’t create images</b>
          <p>
            This tab lists generated images that were added to your asset library{canEdit ? ', for example with “Add to this tab”' : ''}.
            Generated images can contain mistakes, so review each one before you add it to your ad.
          </p>
        </div>
      </div>
    ));
  } else if (tab === 'website') {
    content = sourceTab('website', 'From websites and social media', `${isLogo ? 'Logos' : 'Images'} saved to your asset library from web pages`);
  } else if (tab === 'upload') {
    const done = uploadedIds.map((id) => list.find((a) => a.id === id)).filter(Boolean);
    content = (
      <>
        <div className="adlg-note">
          Add {noun} that meet the size and file-type requirements. You can change how each {one} is cropped later
          <HelpTip kind={kind} align="left" />
        </div>
        <div className={`adlg-drop ${dragOver ? 'over' : ''}`} {...drop} data-testid="asset-dropzone">
          <div className="adlg-drop-title">{dragOver ? 'Drop files to upload them' : 'To upload your media, drag files here'}</div>
          <div className="adlg-or">or</div>
          <div className="adlg-drop-btns">
            <button type="button" className="btn-primary adlg-btn" onClick={() => chooseFiles('upload')}>Upload from computer</button>
            <Dropdown align="left" panelClass={addFromUp ? 'adlg-up' : ''} trigger={(open, toggle) => (
              <button type="button" className={`adlg-outline ${open ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open}
                onClick={(e) => {
                  // Open upwards when the scrolling area has no room below the button (it would be clipped).
                  const b = bodyRef.current.getBoundingClientRect();
                  const r = e.currentTarget.getBoundingClientRect();
                  setAddFromUp(b.bottom - r.bottom < 150 && r.top - b.top > b.bottom - r.bottom);
                  toggle();
                }}>
                Add from<Icon name="arrow_drop_down" className="adlg-caret" />
              </button>
            )}>
              {(close) => (
                <div className="menu adlg-menu">
                  <MenuItem onClick={() => { close(); setTab('library'); }}>Asset library</MenuItem>
                  <MenuItem onClick={() => { close(); setTab('website'); }}>Website or social</MenuItem>
                  {!isLogo && <MenuItem onClick={() => { close(); setTab('stock'); }}>Free stock images</MenuItem>}
                </div>
              )}
            </Dropdown>
          </div>
        </div>
        {(done.length > 0 || pendingFor('upload').length > 0) && (
          <>
            <div className="adlg-subhead">Uploaded</div>
            <Grid {...gridProps} items={done} pending={pendingFor('upload')} />
          </>
        )}
      </>
    );
  } else if (tab === 'stock') {
    content = (
      <>
        <div className="adlg-row">
          <SearchBox value={stockQuery} onChange={setStockQuery} placeholder="Search stock images by name" />
          <span className="adlg-small">Stock images saved in your asset library</span>
          <span className="spacer" />
          {addHere('stock')}
        </div>
        {loading ? <Spinner /> : (
          <Grid {...gridProps} items={ofSource('stock').filter((a) => nameHas(a, stockQuery))} pending={pendingFor('stock')}
            emptyText={stockQuery.trim() ? `No stock images match “${stockQuery.trim()}”` : 'No images here yet'} />
        )}
      </>
    );
  }

  const d = detail?.ref;
  return createPortal(
    <div className="adlg-root" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <div className="adlg-scrim" onClick={onClose} />
      <section className="adlg-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="adlg-title" tabIndex={-1} data-testid="asset-dialog">
        <header className="adlg-head">
          <button type="button" className="adlg-x" data-tip="Close" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
          <h2 id="adlg-title">Choose up to {limit} {noun} for your ad</h2>
          <span className="spacer" />
          <HelpTip kind={kind} />
        </header>

        <nav className="adlg-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`adlg-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              <span>{t.label}</span>
              {t.beta && <span className="adlg-beta">Beta</span>}
            </button>
          ))}
        </nav>

        <div className="adlg-body" ref={bodyRef} role="tabpanel">{content}</div>

        <div className={`adlg-picked ${stripOpen ? 'open' : ''}`}>
          <button type="button" className="adlg-picked-head" aria-expanded={stripOpen} onClick={() => setStripOpen((o) => !o)}>
            <span>{isLogo ? 'Logos' : 'Images'} for your ad ({picked.length}/{limit})</span>
            <Icon name={stripOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
          </button>
          {stripOpen && (
            <>
              {!bannerHidden && (
                <div className="adlg-banner" role="note">
                  <Icon name="info" />
                  <span className="adlg-banner-text">
                    Some regions may require ads that use AI-made or AI-edited assets to be labelled. Using this feature doesn’t by itself make your ad compliant.
                  </span>
                  <button type="button" className="adlg-link" onClick={() => setBannerHidden(true)}>Dismiss</button>
                  <button type="button" className="adlg-link" data-help="ai-labels" onClick={() => openHelp('ai-labels')}>Learn more</button>
                  <button type="button" className="btn-primary adlg-btn" onClick={review}>Review assets</button>
                </div>
              )}
              <div className={`adlg-strip ${flash ? 'flash' : ''}`} ref={stripRef} onScroll={() => detail && setDetail(null)} onAnimationEnd={() => setFlash(false)}>
                {picked.length === 0 && <div className="adlg-strip-empty">No {noun} selected yet. Select {noun} above to add them to your ad.</div>}
                {picked.map((r, i) => (
                  <div className={`adlg-stile ${isLogo ? 'logo' : ''}`} key={`${refKey(r)}-${i}`} style={{ width: tileWidth(r.w, r.h, 182) }} title={r.name || ''}>
                    <img src={r.url} alt="" draggable={false} />
                    <div className="adlg-shover">
                      {/* Read-only details (name, size, shape); there's no cropping or editing here. */}
                      <button type="button" className="adlg-sbtn" data-tip="Details" aria-label={`Details for ${r.name || one}`}
                        onClick={(e) => openDetail(r, e.currentTarget.closest('.adlg-stile'))}>
                        <Icon name="info" />
                      </button>
                      <button type="button" className="adlg-sbtn" data-tip="Remove" aria-label={`Remove ${r.name || one}`}
                        onClick={() => { setDetail(null); setPicked((p) => p.filter((_, j) => j !== i)); }}>
                        <Icon name="cancel" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="adlg-foot">
          <button type="button" className="btn-primary adlg-save" disabled={!dirty} onClick={() => onSave(picked)}>Save</button>
          <button type="button" className="btn-text" onClick={onClose}>Cancel</button>
          <p className="adlg-legal">
            By adding {isLogo ? 'a logo' : 'an image'} from an upload, a website or a URL, you confirm you have all the rights needed to use it
            and permission to share it with {BRAND.name} for advertising on your behalf. If you add a generated asset, you confirm you’ve
            reviewed it and that it’s accurate and follows the advertising policies and applicable laws. Generated assets are covered by
            the <button type="button" className="adlg-inline" data-help="terms" onClick={() => openHelp('terms')}>{BRAND.name} Terms of Service</button> and
            the <button type="button" className="adlg-inline" data-help="ai-policy" onClick={() => openHelp('ai-policy')}>{BRAND.name} Generative AI Use Policy</button>.
          </p>
        </footer>

        {d && (
          <div className="adlg-detail" ref={detailRef} style={{ left: detail.left, top: detail.top }} role="dialog" aria-label={`${isLogo ? 'Logo' : 'Image'} details`}>
            <div className="adlg-detail-head">
              <span>{isLogo ? 'Logo' : 'Image'} details</span>
              <button type="button" className="iconbtn sm" aria-label="Close details" onClick={() => setDetail(null)}><Icon name="close" /></button>
            </div>
            <img className={isLogo ? 'logo' : ''} src={d.url} alt="" />
            <dl>
              <dt>Name</dt><dd title={d.name || ''}>{d.name || '—'}</dd>
              <dt>Size</dt><dd>{d.w && d.h ? `${d.w} × ${d.h}` : '—'}{d.bytes ? ` · ${fmtBytes(d.bytes)}` : ''}</dd>
              <dt>Shape</dt><dd>{aspectLabel(d.w, d.h) || '—'}</dd>
            </dl>
            <p className="adlg-detail-note">Used as it is. Some ad layouts crop {noun} to fit, so keep the main subject near the centre.</p>
          </div>
        )}

        <input ref={fileRef} type="file" multiple hidden accept={IMAGE_TYPES.join(',')}
          onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; uploadFiles(f, sourceRef.current); }} />
      </section>
    </div>,
    document.body,
  );
}

// ---------- Videos ----------

const vKey = (v) => v.assetId || v.url;
const vSame = (v, a) => (v.assetId && v.assetId === a.id) || v.url === a.url;
const vSig = (list) => JSON.stringify(list.map((v) => [vKey(v), v.title]));
const isVideoFile = (f) => VIDEO_TYPES.includes(f.type) || /\.(mp4|mov|webm)$/i.test(f.name || '');

function VideoThumb({ youtube, small }) {
  return (
    <span className={`vdlg-thumb ${small ? 'small' : ''} ${youtube ? 'yt' : ''}`}>
      {youtube ? <Icon name="smart_display" fill /> : <Icon name="play_arrow" fill />}
    </span>
  );
}

// "Add videos": library videos plus pasted YouTube links, up to `max`.
export function VideoDialog({ selected, max, canEdit, onSave, onClose }) {
  const notify = useNotify();
  const limit = max || LIMITS.videos;
  const [videos, setVideos] = useState(null);
  const initial = useRef(selected || []);
  const [picked, setPicked] = useState(() => [...(selected || [])]);
  const [q, setQ] = useState('');
  const [pending, setPending] = useState([]);
  const fileRef = useRef(null);
  const dlgRef = useRef(null);

  useModal(dlgRef, onClose, '.vdlg-search input');

  useEffect(() => {
    let live = true;
    api.assets('video')
      .then((d) => { if (live) setVideos(d.assets || []); })
      .catch((err) => {
        if (!live) return;
        setVideos([]);
        notify(err.message);
      });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim();
  const urlMode = /^https?:\/\//i.test(query) || /youtu/i.test(query);
  const dirty = vSig(picked) !== vSig(initial.current);
  const full = () => notify(`You can add up to ${limit} videos`);

  const toggle = (a) => {
    if (picked.some((v) => vSame(v, a))) setPicked((p) => p.filter((v) => !vSame(v, a)));
    else if (picked.length >= limit) full();
    else setPicked((p) => [...p, refOf({ ...a, kind: 'video' })]);
  };

  // Pasted links are stored in one canonical form (the shared check the server uses too).
  const addUrl = (raw) => {
    const id = youTubeId(raw);
    if (!id) return false;
    if (picked.some((v) => !v.assetId && youTubeId(v.url) === id)) notify('This video is already in your ad');
    else if (picked.length >= limit) full();
    else setPicked((p) => [...p, { url: youTubeUrl(raw), title: 'YouTube video' }]);
    setQ('');
    return true;
  };

  const upload = async (fileList) => {
    if (!canEdit) return;
    const files = [...(fileList || [])];
    const typed = files.filter(isVideoFile);
    if (typed.length < files.length) notify('Only MP4, MOV and WebM videos can be uploaded');
    const ok = typed.filter((f) => f.size <= MAX_BYTES.video);
    if (ok.length < typed.length) notify(`Videos can be up to ${capLabel(MAX_BYTES.video)}`);
    for (const file of ok) {
      const id = uid();
      setPending((p) => [...p, { id, name: file.name }]);
      try {
        const { asset } = await api.uploadAsset(file, { kind: 'video', source: 'upload' });
        setVideos((l) => [asset, ...(l || []).filter((x) => x.id !== asset.id)]);
        setPicked((p) => (p.length < limit && !p.some((v) => vSame(v, asset)) ? [...p, refOf({ ...asset, kind: 'video' })] : p));
      } catch (err) {
        notify(err.message);
      } finally {
        setPending((p) => p.filter((x) => x.id !== id));
      }
    }
  };

  const save = () => onSave(picked.map((v) => {
    const yt = !v.assetId && isYouTube(v.url);
    return { ...v, url: yt ? youTubeUrl(v.url) : v.url, title: String(v.title || '').trim() || (yt ? 'YouTube video' : 'Video') };
  }));
  const shown = (videos || []).filter((a) => urlMode || nameHas(a, query));

  return createPortal(
    <div className="vdlg-root">
      <div className="adlg-scrim" onClick={onClose} />
      <section className="vdlg" ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="vdlg-title" tabIndex={-1} data-testid="video-dialog">
        <header className="vdlg-head">
          <h2 id="vdlg-title">Add videos</h2>
          <span className="spacer" />
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="vdlg-tools">
          <label className="adlg-search vdlg-search">
            <Icon name="search" />
            <input value={q} placeholder="Search for a video or paste a YouTube URL" aria-label="Search for a video or paste a YouTube URL"
              onChange={(e) => setQ(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (isYouTube(text)) { e.preventDefault(); addUrl(text); }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && urlMode && !addUrl(query)) notify('Enter a YouTube URL, like https://www.youtube.com/watch?v=…'); }} />
            {q && <button type="button" className="adlg-search-clear" aria-label="Clear" onClick={() => setQ('')}><Icon name="close" /></button>}
          </label>
          <button type="button" className="adlg-outline" onClick={() => canEdit && fileRef.current?.click()}>
            <Icon name="upload" />Upload video
          </button>
        </div>

        <div className="vdlg-body">
          {urlMode && query && (
            isYouTube(query) ? (
              <button type="button" className="vdlg-row vdlg-paste" onClick={() => addUrl(query)}>
                <VideoThumb youtube />
                <span className="vdlg-title"><b>YouTube video</b><span className="vdlg-sub">{youTubeUrl(query)}</span></span>
                <span className="vdlg-add"><Icon name="add" />Add</span>
              </button>
            ) : (
              <div className="adlg-error vdlg-urlerr">Enter a YouTube URL, like https://www.youtube.com/watch?v=… or https://youtu.be/…</div>
            )
          )}

          <div className="vdlg-label">Your videos</div>
          {videos === null ? <Spinner small /> : (
            <div className="vdlg-list">
              {pending.map((p) => (
                <div className="vdlg-row pending" key={p.id}>
                  <span className="vdlg-thumb"><span className="adlg-spin" /></span>
                  <span className="vdlg-title">Uploading {p.name}…</span>
                </div>
              ))}
              {shown.map((a) => {
                const on = picked.some((v) => vSame(v, a));
                return (
                  <button type="button" key={a.id} className={`vdlg-row ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(a)}>
                    <VideoThumb />
                    <span className="vdlg-title" title={a.title || a.name}>{a.title || a.name || 'Video'}</span>
                    <Icon name={on ? 'check_box' : 'check_box_outline_blank'} fill={on} className="vdlg-check" />
                  </button>
                );
              })}
              {!shown.length && !pending.length && (
                <div className="vdlg-empty">{query && !urlMode ? `No videos match “${query}”` : 'No videos here yet'}</div>
              )}
            </div>
          )}

          <div className="vdlg-label">Videos for your ad ({picked.length}/{limit})</div>
          {picked.length === 0 ? <div className="vdlg-empty">No videos selected yet</div> : (
            <div className="vdlg-list">
              {picked.map((v, i) => (
                <div className="vdlg-row sel" key={`${vKey(v)}-${i}`}>
                  <VideoThumb youtube={isYouTube(v.url)} small />
                  {/* Every video's title can be changed for this ad (library videos keep their own name). */}
                  <span className="vdlg-title">
                    <input className="vdlg-title-input" value={v.title} maxLength={100} aria-label="Video title"
                      onChange={(e) => { const t = e.target.value; setPicked((p) => p.map((x, j) => (j === i ? { ...x, title: t } : x))); }} />
                    {v.assetId ? null
                      : v.own ? <span className="vdlg-sub">This ad’s uploaded video</span>
                        : isYouTube(v.url)
                          ? <span className="vdlg-sub" title={v.url}>{v.url}</span>
                          : <span className="vdlg-sub vdlg-bad" title={v.url}>Not a YouTube link, so it can’t be saved: {v.url}</span>}
                  </span>
                  <button type="button" className="iconbtn sm" aria-label={`Remove ${v.title || 'video'}`} onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}>
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="vdlg-foot">
          <button type="button" className="btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary adlg-save" disabled={!dirty} onClick={save}>Save</button>
        </footer>

        <input ref={fileRef} type="file" multiple hidden accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; upload(f); }} />
      </section>
    </div>,
    document.body,
  );
}

// ---------- Text ideas: "Choose up to 5 headlines" ----------

const TEXT_NOUN = {
  headline: { one: 'headline', many: 'headlines', title: 'Headlines', topic: 'headlines' },
  longHeadline: { one: 'long headline', many: 'long headlines', title: 'Long headline', topic: 'long-headline' },
  description: { one: 'description', many: 'descriptions', title: 'Descriptions', topic: 'descriptions' },
};
const IDEA_RUNS = 8; // generated batches kept per ad and kind, newest first
const textKey = (s) => normText(s).toLowerCase();
const textLen = (s) => [...normText(s)].length;

// GET /api/text-assets: every text the ads use (read-only).
function fetchTextAssets(kind) {
  if (api.textAssets) return api.textAssets(kind);
  return fetch(`/api/text-assets?${new URLSearchParams({ kind })}`, { credentials: 'same-origin' }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
    return data;
  });
}

// Generated batches are kept in this browser only, so earlier ideas are still there next time.
function loadRuns(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((r) => r && typeof r.at === 'string' && Array.isArray(r.ideas)) : [];
  } catch {
    return [];
  }
}
function storeRuns(key, runs) {
  try {
    if (runs.length) localStorage.setItem(key, JSON.stringify(runs.slice(0, IDEA_RUNS)));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked (private window): the ideas last until the dialog closes.
  }
}

function ago(at, now = Date.now()) {
  const s = Math.round((now - new Date(at).getTime()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

// "More ideas" for headlines, the long headline or descriptions: a sheet like the image picker,
// with Suggested (the admin's suggestions for this ad), Asset library (texts other ads use) and
// Generated (ideas built from the advertiser's own words, see textIdeas) on top, and the ad's
// picks below, where they can be typed, edited and removed. Save only updates the edit page's
// form; the page's own Save keeps it.
export function TextDialog({ kind = 'headline', adId, items, max, suggestions = [], context = {}, onSave, onClose }) {
  const notify = useNotify();
  const n = TEXT_NOUN[kind] || TEXT_NOUN.headline;
  const limit = TEXT_LIMIT[kind] || LIMITS.headline;
  const many = max > 1;
  const sugg = [...new Map((suggestions || []).map((s) => [textKey(s), normText(s)]).filter(([k]) => k)).values()];
  const tabs = [
    kind !== 'longHeadline' && { key: 'suggested', label: 'Suggested' },
    { key: 'library', label: 'Asset library' },
    { key: 'generated', label: 'Generated' },
  ].filter(Boolean);
  const initial = useRef((items || []).map(normText).filter(Boolean));
  const [picked, setPicked] = useState(() => [...initial.current]);
  const [tab, setTab] = useState(() => (kind !== 'longHeadline' && sugg.length ? 'suggested' : 'generated'));
  const [lib, setLib] = useState(null); // null while loading, then { items } or { error }
  const [q, setQ] = useState('');
  const [input, setInput] = useState('');
  const runsKey = `${BRAND.slug}.ideas.${adId || 'ad'}.${kind}`;
  const [runs, setRuns] = useState(() => loadRuns(runsKey));
  const [genNote, setGenNote] = useState('');
  const [stripOpen, setStripOpen] = useState(true);
  const [edit, setEdit] = useState(null); // { at: index in picked, or -1 for a new one; text; err }
  const editNow = useRef(null); // the edit a late blur may still commit (cleared on Esc)
  editNow.current = edit;
  const [flash, setFlash] = useState(false);
  const [, setClock] = useState(0);
  const sheetRef = useRef(null);
  const inputRef = useRef(null);
  const full = picked.length >= max;
  const blocked = many && full; // a full list takes no more until one is removed (a single one is replaced)
  const dirty = picked.length !== initial.current.length || picked.some((p, i) => p !== initial.current[i]);

  useModal(sheetRef, () => {
    if (editNow.current) { editNow.current = null; setEdit(null); } else onClose();
  }, '.adlg-tab[aria-selected="true"]');

  useEffect(() => {
    if (tab !== 'library' || lib) return undefined;
    let live = true;
    fetchTextAssets(kind)
      .then((d) => { if (live) setLib({ items: d.items || [] }); })
      .catch((e) => { if (live) setLib({ error: e.message || 'The asset library couldn’t be loaded' }); });
    return () => { live = false; };
  }, [tab, lib, kind]);
  // Keeps "5 minutes ago" current while the dialog stays open.
  useEffect(() => {
    const t = setInterval(() => setClock((x) => x + 1), 60e3);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (edit) inputRef.current?.focus(); }, [edit?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOn = (s) => picked.some((p) => textKey(p) === textKey(s));
  const nudge = () => { setStripOpen(true); setFlash(true); };
  const toggle = (text) => {
    const t = normText(text);
    if (!t) return;
    editNow.current = null;
    setEdit(null);
    if (isOn(t)) { setPicked((p) => p.filter((x) => textKey(x) !== textKey(t))); return; }
    if (textLen(t) > limit) { notify(`This ${n.one} is longer than ${limit} characters`); return; }
    if (!many) { setPicked([t]); return; }
    if (full) { notify(`You can add up to ${max} ${n.many}`); nudge(); return; }
    setPicked((p) => [...p, t]);
  };
  const startCreate = () => {
    if (blocked) { notify(`You can add up to ${max} ${n.many}`); nudge(); return; }
    setStripOpen(true);
    setEdit({ at: -1, text: '', err: '' });
  };
  const commitEdit = () => {
    const e = editNow.current;
    if (!e) return;
    const t = normText(e.text);
    const fail = (err) => setEdit({ ...e, err });
    if (!t) {
      if (e.at >= 0) setPicked((p) => p.filter((_, j) => j !== e.at));
    } else if (textLen(t) > limit) {
      fail(`Use ${limit} characters or fewer`);
      return;
    } else if (picked.some((p, j) => j !== e.at && textKey(p) === textKey(t))) {
      fail(`This ${n.one} is already in your ad`);
      return;
    } else if (e.at >= 0) {
      setPicked((p) => p.map((x, j) => (j === e.at ? t : x)));
    } else {
      setPicked((p) => (many ? [...p, t] : [t]));
    }
    editNow.current = null;
    setEdit(null);
  };
  const generate = () => {
    if (!input.trim()) return;
    const ideas = textIdeas({
      kind, description: input, businessName: context.businessName, finalUrl: context.finalUrl, headlines: context.headlines, exclude: picked,
    });
    if (!ideas.length) {
      setGenNote(`No ${n.many} could be built from that text. Try a few short phrases about what you offer.`);
      return;
    }
    setGenNote('');
    const next = [{ at: new Date().toISOString(), input: normText(input).slice(0, 160), ideas }, ...runs].slice(0, IDEA_RUNS);
    setRuns(next);
    storeRuns(runsKey, next);
  };
  const adText = [context.longHeadline, ...(context.descriptions || [])].map(normText).filter(Boolean).join('\n');

  const chip = (text, title) => {
    const on = isOn(text);
    return (
      <button key={textKey(text)} type="button" className={`tdlg-chip ${on ? 'on' : ''} ${!on && (blocked || textLen(text) > limit) ? 'off' : ''}`}
        aria-pressed={on} title={title} onClick={() => toggle(text)}>
        {on && <Icon name="done" />}<span>{text}</span>
      </button>
    );
  };

  let content;
  if (tab === 'suggested') {
    content = (
      <>
        <p className="tdlg-intro">{n.title} suggested for this ad in its page settings. Select one to add it to your ad, and again to take it out.</p>
        {sugg.length ? <div className="tdlg-chips">{sugg.map((s) => chip(s))}</div> : (
          <div className="adlg-empty"><Icon name="lightbulb" /><span>No suggested {n.many} for this ad yet. Try the Generated tab.</span></div>
        )}
      </>
    );
  } else if (tab === 'library') {
    const term = q.trim().toLowerCase();
    const shown = (lib?.items || []).filter((it) => !term || it.text.toLowerCase().includes(term));
    content = (
      <>
        <div className="adlg-row">
          <SearchBox value={q} onChange={setQ} placeholder={`Search ${n.many}`} />
          <span className="spacer" />
          {lib?.items && <span className="adlg-count">{lib.items.length} {lib.items.length === 1 ? n.one : n.many}</span>}
        </div>
        <p className="tdlg-intro">{n.title} your ads use, most used first.</p>
        {!lib ? <Spinner /> : lib.error ? (
          <div className="adlg-error tdlg-err">{lib.error} <button type="button" className="adlg-link" onClick={() => setLib(null)}>Try again</button></div>
        ) : shown.length ? (
          <div className="tdlg-chips" data-testid="text-library">
            {shown.map((it) => chip(it.text, `Used in ${it.ads} ad${it.ads === 1 ? '' : 's'}`))}
          </div>
        ) : (
          <div className="adlg-empty"><Icon name="search" /><span>{term ? `No ${n.many} match “${q.trim()}”` : `No ${n.many} here yet`}</span></div>
        )}
      </>
    );
  } else {
    content = (
      <div className="tdlg-gen">
        <div className="tdlg-form">
          <h3>Build {n.many} from your own words</h3>
          <label className="tdlg-field">
            <span>Describe what you’re advertising</span>
            <textarea value={input} rows={6} maxLength={LIMITS.ideaInput} data-testid="idea-input"
              placeholder="What do you offer, who is it for, and what makes it different?"
              onChange={(e) => { setInput(e.target.value); setGenNote(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); }} />
          </label>
          <div className="tdlg-under">
            {adText && <button type="button" className="adlg-link tdlg-fill" onClick={() => setInput(adText.slice(0, LIMITS.ideaInput))}>Use your ad’s text</button>}
            <span className="spacer" />
            <span className="adlg-small">{input.length} / {LIMITS.ideaInput}</span>
          </div>
          <button type="button" className="btn-primary adlg-btn tdlg-go" disabled={!input.trim()} onClick={generate}>Generate ideas</button>
          {genNote && <div className="adlg-error tdlg-err" role="alert">{genNote}</div>}
          <p className="tdlg-honest">
            Ideas are built with fixed templates from what you type, your business name, your website address and your current headlines.
            No AI service is used and nothing is sent anywhere. Check each idea before you use it.
          </p>
        </div>
        <div className="tdlg-results" aria-live="polite" data-testid="idea-results">
          <div className="tdlg-results-head">
            <h3>Ideas</h3>
            <span className="spacer" />
            {runs.length > 0 && <button type="button" className="adlg-link" onClick={() => { setRuns([]); storeRuns(runsKey, []); }}>Clear ideas</button>}
          </div>
          {runs.length === 0 ? (
            <div className="adlg-empty"><Icon name="lightbulb" /><span>Describe what you’re advertising, then select Generate ideas.</span></div>
          ) : runs.map((r) => (
            <div className="tdlg-run" key={r.at}>
              <div className="tdlg-run-head">
                <span className="tdlg-run-in" title={r.input}>“{r.input}”</span>
                <span className="adlg-small">{ago(r.at)}</span>
              </div>
              <div className="tdlg-chips">{r.ideas.map((s) => chip(s))}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const editor = edit && (
    <span className={`tdlg-edit ${edit.err ? 'err' : ''}`} key="editor">
      <input ref={inputRef} value={edit.text} maxLength={200} placeholder={`Type a ${n.one}`}
        aria-label={edit.at >= 0 ? `Edit ${n.one}` : `New ${n.one}`} aria-invalid={edit.err ? true : undefined}
        onChange={(e) => setEdit({ ...edit, text: e.target.value, err: '' })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } }}
        onBlur={commitEdit} />
      <span className={`tdlg-edit-count ${textLen(edit.text) > limit ? 'over' : ''}`}>{textLen(edit.text)} / {limit}</span>
      {edit.err && <span className="tdlg-edit-err" role="alert">{edit.err}</span>}
    </span>
  );

  return createPortal(
    <div className="adlg-root">
      <div className="adlg-scrim" onClick={onClose} />
      <section className="adlg-sheet tdlg" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="tdlg-title" tabIndex={-1} data-testid="text-dialog">
        <header className="adlg-head">
          <button type="button" className="adlg-x" data-tip="Close" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
          <h2 id="tdlg-title">{many ? `Choose up to ${max} ${n.many}` : `Choose a ${n.one}`}</h2>
          <span className="spacer" />
          <button type="button" className="adlg-helpbtn" aria-label={`About ${n.many}`} data-help={n.topic} onClick={() => openHelp(n.topic)}>
            <Icon name="help" />
          </button>
        </header>

        <div className="tdlg-tabbar">
          <nav className="adlg-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`adlg-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="adlg-outline tdlg-create-top" disabled={blocked} onClick={startCreate}><Icon name="add" />Create</button>
        </div>

        <div className="adlg-body" role="tabpanel">{content}</div>

        <div className={`adlg-picked ${stripOpen ? 'open' : ''}`}>
          <button type="button" className="adlg-picked-head" aria-expanded={stripOpen} onClick={() => setStripOpen((o) => !o)}>
            <span>{n.title} for your ad ({picked.length}/{max})</span>
            <Icon name={stripOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
          </button>
          {stripOpen && (
            <>
              {blocked && (
                <div className="tdlg-full" role="status">
                  <Icon name="check_circle" />
                  <span>You’ve picked all {max} {n.many}. To add a different one, remove one from your ad first.</span>
                </div>
              )}
              <div className={`tdlg-tray ${flash ? 'flash' : ''}`} onAnimationEnd={() => setFlash(false)} data-testid="text-tray">
                <button type="button" className="tdlg-create" disabled={blocked} onClick={startCreate}><Icon name="add" />Create</button>
                {edit?.at === -1 && editor}
                {picked.map((t, i) => (edit?.at === i ? editor : (
                  <span key={`${textKey(t)}-${i}`} className={`tdlg-pick ${textLen(t) > limit ? 'over' : ''}`}
                    title={textLen(t) > limit ? `Too long: ${textLen(t)} / ${limit} characters` : undefined}>
                    <span className="tdlg-pick-t">{t}</span>
                    <button type="button" className="tdlg-pick-btn" data-tip="Edit" aria-label={`Edit ${t}`}
                      onClick={() => setEdit({ at: i, text: t, err: '' })}><Icon name="edit" /></button>
                    {/* An edit still open further along moves back with its pick, so committing it
                        later changes that pick and no other. Pressing Remove doesn't take focus from
                        an open edit: its blur would show the edit's error, reflow the tray and move
                        this button out from under the pointer before the click lands. */}
                    <button type="button" className="tdlg-pick-btn" data-tip="Remove" aria-label={`Remove ${t}`}
                      onMouseDown={(e) => { if (edit) e.preventDefault(); }}
                      onClick={() => {
                        setEdit((e) => (e && e.at > i ? { ...e, at: e.at - 1 } : e));
                        setPicked((p) => p.filter((_, j) => j !== i));
                      }}><Icon name="close" /></button>
                  </span>
                )))}
                {!picked.length && !edit && <span className="tdlg-none">No {n.many} yet. Pick some above or select Create to type your own.</span>}
              </div>
            </>
          )}
        </div>

        <footer className="adlg-foot">
          <button type="button" className="btn-primary adlg-save" disabled={!dirty} onClick={() => onSave(picked)}>Save</button>
          <button type="button" className="btn-text" onClick={onClose}>Cancel</button>
          <p className="adlg-legal">Saving puts these {n.many} in the form. Select Save on the edit page to keep them.</p>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
