'use strict';

/* =====================================================================
   CringeBox - meme soundboard
   ===================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Constants ---------- */
const DB_NAME = 'CringeBoxDB';
const STORE = 'pads';
const THEME_KEY = 'cringebox_theme';
const DEFAULT_PAD_COUNT = 9;
const KEYS = '123456789qwertyuiopasdfghjklzxcvbnm'.split('');
const MIN_CUT = 0.02; // seconds
const CEILING = 0.98;  // max peak after gain (~ -0.2 dBFS), avoids clipping

// Muted palette so a full board is colorful but not harsh
const PALETTE = [
    '#e0605f', '#e58a55', '#d9ac3f', '#8dba55', '#46b392', '#43a8be',
    '#5b86e0', '#8479dc', '#b06cd6', '#d96aa6', '#7f8da0', '#b98767'
];

const ICON_CHOICES = [
    'Volume2', 'Sparkles', 'Laugh', 'Smile', 'Angry', 'Frown', 'Skull', 'Ghost',
    'Flame', 'Zap', 'Bell', 'Siren', 'Megaphone', 'Mic', 'Music', 'Drum', 'Guitar',
    'Bomb', 'Wind', 'CloudLightning', 'Heart', 'ThumbsUp', 'ThumbsDown', 'Star',
    'Crown', 'Trophy', 'PartyPopper', 'Rocket', 'Cat', 'Dog', 'Bird', 'Fish', 'Bug',
    'Pizza', 'Coffee', 'Beer', 'Gamepad2', 'Eye', 'Hand', 'Baby', 'Swords', 'Car',
    'Plane', 'Tv', 'Clapperboard', 'Hammer', 'Ear', 'Radio'
];

// First match wins - order matters
const KEYWORD_ICONS = [
    [/fart|toot|gas\b|wind|burp/i, 'Wind'],
    [/boom|explo|bomb|blast|bang|gun|shot/i, 'Bomb'],
    [/scream|yell|shout|aaa|ahh|argh/i, 'Megaphone'],
    [/laugh|haha|lol|giggle|cackle|chuckle/i, 'Laugh'],
    [/fuck|shit|damn|curse|swear|bitch|ass\b/i, 'Angry'],
    [/angry|mad|rage|furious/i, 'Angry'],
    [/sad|cry|sob|violin|tear|sorry|sigh/i, 'Frown'],
    [/death|dead|die|oof|skull|kill|rip\b/i, 'Skull'],
    [/spook|ghost|scary|horror|creepy|halloween/i, 'Ghost'],
    [/airhorn|horn|siren|alarm|police|emergency/i, 'Siren'],
    [/bell|ding|ring|notif|chime|ping/i, 'Bell'],
    [/applause|clap|cheer|party|celebrat|yay/i, 'PartyPopper'],
    [/meow|cat\b|kitty|nya/i, 'Cat'],
    [/bark|dog|woof|puppy/i, 'Dog'],
    [/bird|duck|quack|chicken|tweet|rooster/i, 'Bird'],
    [/fire|lit\b|hot\b|burn|flame/i, 'Flame'],
    [/thunder|lightning|storm|electric|shock/i, 'CloudLightning'],
    [/drum|snare|kick|bongo/i, 'Drum'],
    [/guitar|riff/i, 'Guitar'],
    [/music|song|beat|bass|dj\b|remix|melody|sing/i, 'Music'],
    [/love|heart|kiss|romance|uwu|aww/i, 'Heart'],
    [/wow|woah|whoa|omg|amaz|incredible|wowww|sugoi|kawaii|senpai|anime|japan/i, 'Sparkles'],
    [/yes|correct|win|victory|success|nice|good/i, 'ThumbsUp'],
    [/\bno+\b|nope|wrong|fail|error|bad|incorrect|buzzer/i, 'ThumbsDown'],
    [/sus\b|among|impostor|imposter|look|watch|stare/i, 'Eye'],
    [/baby|kid|child|cry baby/i, 'Baby'],
    [/mic|speech|talk|voice|announce/i, 'Mic'],
    [/punch|hit|slap|smack|bonk|hand/i, 'Hand'],
    [/sword|slash|fight|attack|katana/i, 'Swords'],
    [/pizza|eat|food|yum|munch|nom/i, 'Pizza'],
    [/coffee|tea\b|drink|slurp/i, 'Coffee'],
    [/game|mario|level|coin|pixel|8-?bit/i, 'Gamepad2'],
    [/rocket|space|launch|nasa/i, 'Rocket'],
    [/car\b|vroom|engine|drift|honk/i, 'Car'],
    [/plane|jet|fly|flight/i, 'Plane'],
    [/king|queen|crown|royal|boss/i, 'Crown'],
    [/trophy|champion|winner/i, 'Trophy'],
    [/movie|film|cinema|trailer|dramatic/i, 'Clapperboard'],
    [/tv\b|news|breaking/i, 'Tv'],
    [/hammer|bonk|nail|build/i, 'Hammer'],
    [/smile|happy|joy|fun/i, 'Smile'],
    [/star\b|magic|sparkle|shine/i, 'Star']
];

const ICON_ALIASES = {
    Ellipsis: 'MoreHorizontal', MoreHorizontal: 'Ellipsis',
    CircleX: 'XCircle', XCircle: 'CircleX'
};

/* ---------- Small helpers ---------- */
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
}
function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function fgFor(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1a1d23' : '#ffffff';
}
function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
}
function fmt(t) { return `${t.toFixed(3)}s`; }
function isDark() { return document.documentElement.classList.contains('dark'); }

/* ---------- Icons (Lucide, rendered as inline SVG) ---------- */
function getIconNode(name) {
    const L = window.lucide;
    if (!L || !L.icons) return null;
    const n = L.icons[name] || L.icons[ICON_ALIASES[name]];
    if (!n) return null;
    let node = Array.isArray(n) ? n : (n.iconNode || null);
    if (!node) return null;
    // Some Lucide builds wrap icons as ['svg', attrs, children]; unwrap to the children list
    if (node[0] === 'svg' && Array.isArray(node[2])) node = node[2];
    // Keep only well-formed [tag, attrs] entries
    return node.filter(c => Array.isArray(c) && typeof c[0] === 'string' && c[1] && typeof c[1] === 'object');
}
function iconExists(name) { const n = getIconNode(name); return !!(n && n.length); }
function iconSvg(name, size = 20, cls = '') {
    const node = getIconNode(name);
    const inner = node && node.length
        ? node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
        : '<circle cx="12" cy="12" r="9"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${inner}</svg>`;
}
function hydrateIcons(root = document) {
    root.querySelectorAll('i[data-icon]').forEach(el => {
        const tmp = document.createElement('div');
        tmp.innerHTML = iconSvg(el.dataset.icon, Number(el.dataset.size) || 18, el.className);
        el.replaceWith(tmp.firstChild);
    });
}
function availableIcons() { return ICON_CHOICES.filter(iconExists); }

/* ---------- IndexedDB ---------- */
let dbPromise = null;
function openDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    return dbPromise;
}
async function dbTx(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
const dbGetAll = () => dbTx('readonly', s => s.getAll());
const dbPut = (pad) => dbTx('readwrite', s => { s.put(pad); });
const dbDelete = (id) => dbTx('readwrite', s => { s.delete(id); });
const dbClear = () => dbTx('readwrite', s => { s.clear(); });

/* ---------- State ---------- */
let pads = [];                 // [{id,pos,name,color,icon,blob,start,end,duration}]
const buffers = new Map();     // id -> AudioBuffer
const padEls = new Map();      // id -> element
let ctx = null;
let current = null;            // currently playing { src, gain, padId, t0, dur, done, onEnd, finish }
let ed = null;                 // editor state
const padById = (id) => pads.find(p => p.id === id);

function newPad() {
    return { id: uid(), pos: pads.length, name: '', color: '', icon: '', blob: null, start: 0, end: 0, duration: 0, gain: 1 };
}
function savePad(pad) {
    pad.pos = pads.indexOf(pad);
    return dbPut(pad);
}
function saveOrder() {
    return Promise.all(pads.map((p, i) => { p.pos = i; return dbPut(p); }));
}

/* ---------- Audio engine ---------- */
function ensureCtx() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC({ latencyHint: 'interactive' });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

async function getBuffer(pad) {
    if (buffers.has(pad.id)) return buffers.get(pad.id);
    const ab = await pad.blob.arrayBuffer();
    const buf = await ensureCtx().decodeAudioData(ab);
    buffers.set(pad.id, buf);
    return buf;
}

function stopAll() {
    const c = current;
    if (!c) return;
    current = null;
    try {
        const t = ctx.currentTime;
        c.gain.gain.cancelScheduledValues(t);
        c.gain.gain.setValueAtTime(c.gain.gain.value, t);
        c.gain.gain.linearRampToValueAtTime(0, t + 0.008);
        c.src.stop(t + 0.012);
    } catch (e) { /* already stopped */ }
    c.finish();
}

function playBuffer(buf, start, end, padId, onEnd, vol = 1) {
    const c = ensureCtx();
    stopAll();
    const dur = Math.max(0.01, end - start);
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    const t = c.currentTime;
    const fadeIn = Math.min(0.004, dur / 4);
    const fadeOut = Math.min(0.008, dur / 4);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + fadeIn);
    gain.gain.setValueAtTime(vol, t + dur - fadeOut);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(gain).connect(c.destination);
    src.start(t, start, dur);

    const cur = { src, gain, padId, t0: t, dur, done: false, onEnd };
    cur.finish = () => {
        if (cur.done) return;
        cur.done = true;
        if (current === cur) current = null;
        updatePlayingUI();
        if (cur.onEnd) cur.onEnd();
    };
    src.onended = cur.finish;
    current = cur;
    updatePlayingUI();
    return cur;
}

function triggerPad(pad) {
    if (!pad || !pad.blob) return;
    const buf = buffers.get(pad.id);
    if (buf) { startPad(pad, buf); return; }
    getBuffer(pad).then(b => startPad(pad, b)).catch(() => toast('Could not decode this audio'));
}
function startPad(pad, buf) {
    const end = Math.min(pad.end || buf.duration, buf.duration);
    const start = clamp(pad.start || 0, 0, Math.max(0, end - MIN_CUT));
    playBuffer(buf, start, end, pad.id, null, pad.gain > 0 ? pad.gain : 1);
}

// Peak and gated RMS (ignores near-silent 50 ms windows) of buf between start..end seconds
function analyze(buf, start, end) {
    const sr = buf.sampleRate;
    const s = Math.max(0, Math.floor(start * sr));
    const e = Math.min(buf.length, Math.ceil(end * sr));
    const data = [];
    for (let c = 0; c < buf.numberOfChannels; c++) data.push(buf.getChannelData(c));
    const win = Math.max(1, Math.floor(sr * 0.05));
    const gate = 1e-5; // -50 dBFS (power)
    let peak = 0, sumAll = 0, countAll = 0;
    for (let i = s; i < e; i += win) {
        const stop = Math.min(e, i + win);
        let sum = 0, n = 0;
        for (let j = i; j < stop; j++) {
            for (let c = 0; c < data.length; c++) {
                const v = data[c][j];
                const a = v < 0 ? -v : v;
                if (a > peak) peak = a;
                sum += v * v;
                n++;
            }
        }
        if (n && sum / n > gate) { sumAll += sum; countAll += n; }
    }
    return { peak, rms: countAll ? Math.sqrt(sumAll / countAll) : 0 };
}
const toDb = (g) => 20 * Math.log10(g);
const fromDb = (db) => Math.pow(10, db / 20);
const fmtDb = (g) => { const d = toDb(g); return `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`; };

const stopBtn = $('#stop-btn');
function updatePlayingUI() {
    const cur = current;
    padEls.forEach((el, id) => {
        const on = cur && cur.padId === id;
        el.classList.remove('playing');
        if (on) {
            void el.offsetWidth; // restart the progress animation on re-trigger
            const prog = el.querySelector('.pad-progress');
            if (prog) prog.style.animationDuration = cur.dur + 's';
            el.classList.add('playing');
        }
    });
    const showStop = cur && cur.padId !== 'preview';
    stopBtn.classList.toggle('translate-y-24', !showStop);
    stopBtn.classList.toggle('opacity-0', !showStop);
    stopBtn.classList.toggle('pointer-events-none', !showStop);
}
stopBtn.addEventListener('click', stopAll);

/* ---------- Auto style ---------- */
function cleanName(raw) {
    let n = (raw || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-+]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) n = 'Sound';
    return n.length > 40 ? n.slice(0, 40).trim() : n;
}
function keywordIcon(name) {
    for (const [re, icon] of KEYWORD_ICONS) if (re.test(name) && iconExists(icon)) return icon;
    return null;
}
function autoStyle(pad, name) {
    pad.name = name;
    const icons = availableIcons();
    pad.icon = keywordIcon(name) || icons[hash(name) % Math.max(1, icons.length)] || 'Volume2';
    const used = new Set(pads.filter(p => p !== pad && p.color).map(p => p.color));
    const free = PALETTE.filter(c => !used.has(c));
    const list = free.length ? free : PALETTE;
    pad.color = list[hash(name) % list.length];
}

/* ---------- Toast & modals ---------- */
const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('opacity-0', 'translate-y-2');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('opacity-0', 'translate-y-2'), 2600);
}

const modalStack = [];
function openModal(el) {
    el.classList.remove('hidden');
    el._openedAt = Date.now();
    modalStack.push(el);
    document.body.style.overflow = 'hidden';
}
function closeModal(el) {
    el.classList.add('hidden');
    const i = modalStack.indexOf(el);
    if (i >= 0) modalStack.splice(i, 1);
    if (!modalStack.length) document.body.style.overflow = '';
}
function requestClose(el) {
    if (el.id === 'edit-modal') closeEditor();
    else if (el.id === 'dialog-modal') closeDialog(null);
    else closeModal(el);
}
document.querySelectorAll('.modal').forEach(m => {
    m.querySelector('[data-backdrop]').addEventListener('click', () => {
        if (Date.now() - m._openedAt > 350) requestClose(m);
    });
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => requestClose(m)));
});

const dialogModal = $('#dialog-modal');
let dialogResolve = null;
function closeDialog(val) {
    closeModal(dialogModal);
    const r = dialogResolve;
    dialogResolve = null;
    if (r) r(val);
}
function askDialog({ title, text, buttons }) {
    return new Promise(resolve => {
        if (dialogResolve) closeDialog(null);
        $('#dialog-title').textContent = title;
        $('#dialog-text').textContent = text;
        const box = $('#dialog-buttons');
        box.innerHTML = '';
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn ' + (b.cls || '');
            btn.textContent = b.label;
            btn.addEventListener('click', () => closeDialog(b.value));
            box.appendChild(btn);
        });
        dialogResolve = resolve;
        openModal(dialogModal);
    });
}
const confirmDialog = (title, text, okLabel = 'Delete') => askDialog({
    title, text,
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, cls: 'btn-primary' }]
});

/* ---------- Grid rendering & pad interaction ---------- */
const grid = $('#grid');

function buildPad(pad, index) {
    const el = document.createElement('div');
    el.className = 'pad ' + (pad.blob ? 'filled' : 'empty');
    el.setAttribute('role', 'button');
    el.dataset.id = pad.id;
    const key = KEYS[index] ? `<span class="pad-key">${KEYS[index].toUpperCase()}</span>` : '';

    if (pad.blob) {
        el.style.setProperty('--pad', pad.color);
        el.style.setProperty('--pad-fg', fgFor(pad.color));
        el.innerHTML = `${key}
            <button type="button" class="pad-menu" aria-label="Edit pad">${iconSvg('Ellipsis', 16)}</button>
            ${iconSvg(pad.icon || 'Volume2', 40, 'pad-icon')}
            <span class="pad-name">${esc(pad.name)}</span>
            <span class="pad-progress"></span>`;
    } else {
        el.innerHTML = `${key}${iconSvg('Plus', 40, 'pad-icon')}<span class="pad-sub">Add sound</span>`;
    }

    let press = null;
    el.addEventListener('pointerdown', (e) => {
        if (arranging) { startDrag(e, el); return; }
        if (e.target.closest('.pad-menu') || (e.button !== undefined && e.button > 0)) return;
        ensureCtx();
        if (!pad.blob) return;
        press = { x: e.clientX, y: e.clientY, long: false };
        press.timer = setTimeout(() => {
            if (!press) return;
            press.long = true;
            if (current && current.padId === pad.id) stopAll();
            openEditor(pad.id);
        }, 600);
        triggerPad(pad);
    });
    el.addEventListener('pointermove', (e) => {
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) {
            clearTimeout(press.timer);
            if (!press.long && current && current.padId === pad.id) stopAll(); // user is scrolling, not tapping
            press = null;
        }
    });
    const endPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
    el.addEventListener('pointerup', endPress);
    el.addEventListener('pointerleave', endPress);
    el.addEventListener('pointercancel', () => {
        if (press && !press.long && current && current.padId === pad.id) stopAll();
        endPress();
    });
    el.addEventListener('click', (e) => {
        if (arranging) return;
        if (e.target.closest('.pad-menu')) { openEditor(pad.id); return; }
        if (!pad.blob) openSource(pad.id);
    });
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (arranging) return;
        if (pad.blob) openEditor(pad.id); else openSource(pad.id);
    });
    return el;
}

function render() {
    grid.innerHTML = '';
    padEls.clear();
    pads.forEach((p, i) => {
        const el = buildPad(p, i);
        grid.appendChild(el);
        padEls.set(p.id, el);
    });
    updatePlayingUI();
}

/* ---------- Arrange mode: drag pads to reorder (mouse + touch) ---------- */
let arranging = false;
let drag = null;
const hintEl = $('#hint');
const HINT_HTML = hintEl.innerHTML;

function setArranging(on) {
    arranging = on;
    if (on) stopAll();
    grid.classList.toggle('arranging', on);
    $('#arrange-btn').classList.toggle('btn-primary', on);
    const label = $('#arrange-label');
    label.textContent = on ? 'Done' : 'Arrange';
    label.classList.toggle('hidden', !on); // "Done" is always visible; "Arrange" text only on wider screens
    hintEl.innerHTML = on ? 'Drag pads to reorder &middot; press <b>Done</b> when finished' : HINT_HTML;
}
$('#arrange-btn').addEventListener('click', () => setArranging(!arranging));

function startDrag(e, el) {
    if (drag || (e.button !== undefined && e.button > 0)) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('pad-ghost');
    ghost.classList.remove('playing');
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.appendChild(ghost);
    el.classList.add('drag-placeholder');
    drag = { el, ghost, offX: e.clientX - r.left, offY: e.clientY - r.top, x: e.clientX, y: e.clientY, raf: 0 };
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    drag.raf = requestAnimationFrame(dragAutoScroll);
}
function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.ghost.style.left = (drag.x - drag.offX) + 'px';
    drag.ghost.style.top = (drag.y - drag.offY) + 'px';
    reorderAt(drag.x, drag.y);
}
function reorderAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const target = hit && hit.closest('#grid .pad');
    if (!target || target === drag.el) return;
    const kids = Array.from(grid.children);
    if (kids.indexOf(drag.el) < kids.indexOf(target)) target.after(drag.el);
    else target.before(drag.el);
}
function dragAutoScroll() {
    if (!drag) return;
    const top = document.querySelector('header').getBoundingClientRect().bottom + 40;
    const bottom = window.innerHeight - 60;
    if (drag.y < top) { window.scrollBy(0, -12); reorderAt(drag.x, drag.y); }
    else if (drag.y > bottom) { window.scrollBy(0, 12); reorderAt(drag.x, drag.y); }
    drag.raf = requestAnimationFrame(dragAutoScroll);
}
async function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    d.ghost.remove();
    d.el.classList.remove('drag-placeholder');
    const order = Array.from(grid.children).map(c => c.dataset.id);
    if (order.some((id, i) => !pads[i] || pads[i].id !== id)) {
        pads = order.map(padById).filter(Boolean);
        await saveOrder();
    }
    render(); // refresh key badges for the new order
}

/* ---------- Adding audio ---------- */
const sourceModal = $('#source-modal');
const sourceFile = $('#source-file');
const sourceUrl = $('#source-url');
const sourceStatus = $('#source-status');
let sourceTarget = null;

function setSourceStatus(msg, isError = true) {
    sourceStatus.textContent = msg;
    sourceStatus.className = 'text-xs rounded-lg px-3 py-2 ' + (isError
        ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500');
    sourceStatus.classList.toggle('hidden', !msg);
}

function openSource(padId) {
    sourceTarget = padId;
    const pad = padById(padId);
    $('#source-title').textContent = pad && pad.blob ? 'Replace audio' : 'Add audio';
    $('#source-remove').classList.toggle('hidden', !!(pad && pad.blob));
    sourceUrl.value = '';
    setSourceStatus('');
    openModal(sourceModal);
}

async function ingest(pad, blob, nameHint) {
    const raw = await blob.arrayBuffer();
    let buf;
    try {
        buf = await ensureCtx().decodeAudioData(raw.slice(0));
    } catch (e) {
        throw new Error('That file could not be read as audio.');
    }
    pad.blob = new Blob([raw], { type: blob.type || 'audio/mpeg' });
    pad.duration = buf.duration;
    pad.start = 0;
    pad.end = buf.duration;
    buffers.set(pad.id, buf);
    if (!pad.name) autoStyle(pad, cleanName(nameHint));
    await savePad(pad);
}

// Fill `files` into the target pad, then into following empty pads (creating more if needed)
async function ingestFiles(files, targetId) {
    const list = Array.from(files);
    let targetIndex = pads.findIndex(p => p.id === targetId);
    if (targetIndex < 0) targetIndex = 0;
    let firstPad = null, ok = 0, fail = 0;
    for (let i = 0; i < list.length; i++) {
        let pad;
        if (i === 0) pad = pads[targetIndex];
        else {
            pad = pads.slice(targetIndex + 1).find(p => !p.blob);
            if (!pad) { pad = newPad(); pads.push(pad); }
        }
        try {
            await ingest(pad, list[i], list[i].name);
            if (!firstPad) firstPad = pad;
            ok++;
        } catch (e) { fail++; }
    }
    await saveOrder();
    render();
    if (fail) toast(`${fail} file${fail > 1 ? 's' : ''} could not be read as audio`);
    if (ok === 1 && firstPad) openEditor(firstPad.id);
    else if (ok > 1) toast(`Added ${ok} sounds`);
}

$('#source-pick').addEventListener('click', () => sourceFile.click());
sourceFile.addEventListener('change', async () => {
    const files = sourceFile.files;
    if (!files || !files.length) return;
    const target = sourceTarget;
    closeModal(sourceModal);
    await ingestFiles(files, target);
    sourceFile.value = '';
});

async function loadFromUrl() {
    const url = sourceUrl.value.trim();
    if (!url) return;
    const btn = $('#source-load');
    btn.disabled = true;
    setSourceStatus('Downloading...', false);
    try {
        let res;
        try {
            res = await fetch(url);
        } catch (e) {
            throw new Error("This site doesn't allow other apps to read its audio (CORS). Download the file and use \"Choose audio file\" instead.");
        }
        if (!res.ok) throw new Error(`The server answered ${res.status}. Check the link.`);
        const blob = await res.blob();
        if (!blob.size) throw new Error('The link returned an empty file.');
        let name = 'Sound';
        try {
            const last = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (last) name = decodeURIComponent(last);
        } catch (e) { /* ignore */ }
        const pad = padById(sourceTarget);
        if (!pad) throw new Error('Pad not found.');
        await ingest(pad, blob, name);
        closeModal(sourceModal);
        render();
        openEditor(pad.id);
    } catch (e) {
        setSourceStatus(e.message || 'Could not load that link.');
    } finally {
        btn.disabled = false;
    }
}
$('#source-load').addEventListener('click', loadFromUrl);
sourceUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadFromUrl(); } });

$('#source-remove').addEventListener('click', async () => {
    const id = sourceTarget;
    closeModal(sourceModal);
    await removePad(id);
});

/* ---------- Pad management ---------- */
async function addEmptyPad() {
    const pad = newPad();
    pads.push(pad);
    await savePad(pad);
    render();
    const el = padEls.get(pad.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function removePad(id) {
    const pad = padById(id);
    if (!pad) return;
    if (current && current.padId === id) stopAll();
    pads.splice(pads.indexOf(pad), 1);
    buffers.delete(id);
    await dbDelete(id);
    await saveOrder();
    render();
}

async function clearPad(pad) {
    if (current && current.padId === pad.id) stopAll();
    buffers.delete(pad.id);
    Object.assign(pad, { name: '', color: '', icon: '', blob: null, start: 0, end: 0, duration: 0, gain: 1 });
    await savePad(pad);
    render();
}

async function duplicatePad(pad) {
    const copy = {
        ...pad,
        id: uid(),
        name: `${pad.name} copy`.slice(0, 40)
    };
    pads.splice(pads.indexOf(pad) + 1, 0, copy);
    if (buffers.has(pad.id)) buffers.set(copy.id, buffers.get(pad.id));
    await saveOrder();
    render();
    toast('Pad duplicated');
}

/* ---------- Export / Import ---------- */
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}
async function exportPads(list, filename) {
    const filled = list.filter(p => p.blob);
    if (!filled.length) { toast('Nothing to export yet'); return; }
    toast('Preparing export...');
    const out = [];
    for (const p of filled) {
        out.push({
            name: p.name, color: p.color, icon: p.icon,
            start: p.start, end: p.end, duration: p.duration, gain: p.gain > 0 ? p.gain : 1,
            audio: await blobToDataUrl(p.blob)
        });
    }
    const file = new Blob([JSON.stringify({ app: 'cringebox', version: 1, pads: out })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Exported ${filled.length} pad${filled.length > 1 ? 's' : ''}`);
}

async function importFile(file) {
    let data;
    try {
        data = JSON.parse(await file.text());
        if (!data || data.app !== 'cringebox' || !Array.isArray(data.pads)) throw new Error();
    } catch (e) {
        toast('That is not a CringeBox file');
        return;
    }
    const incoming = [];
    for (const item of data.pads) {
        try {
            const blob = await (await fetch(item.audio)).blob();
            incoming.push({
                id: uid(), name: String(item.name || 'Sound').slice(0, 40),
                color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : PALETTE[0],
                icon: String(item.icon || 'Volume2'),
                blob,
                duration: Number(item.duration) || 0,
                start: Number(item.start) || 0,
                end: Number(item.end) || Number(item.duration) || 0,
                gain: Number(item.gain) > 0 ? Number(item.gain) : 1
            });
        } catch (e) { /* skip broken item */ }
    }
    if (!incoming.length) { toast('No sounds found in that file'); return; }

    const hasContent = pads.some(p => p.blob);
    let mode = 'add';
    if (hasContent) {
        mode = await askDialog({
            title: `Import ${incoming.length} sound${incoming.length > 1 ? 's' : ''}`,
            text: 'Add them to your current board, or replace the whole board?',
            buttons: [
                { label: 'Cancel', value: null },
                { label: 'Replace board', value: 'replace', cls: 'btn-danger' },
                { label: 'Add to board', value: 'add', cls: 'btn-primary' }
            ]
        });
        if (!mode) return;
    }
    if (mode === 'replace') {
        stopAll();
        pads = [];
        buffers.clear();
        await dbClear();
    }
    for (const inc of incoming) {
        const slot = pads.find(p => !p.blob);
        if (slot) Object.assign(slot, { ...inc, id: slot.id });
        else pads.push({ ...inc, pos: pads.length });
    }
    while (pads.length < DEFAULT_PAD_COUNT) pads.push(newPad());
    await saveOrder();
    render();
    predecodeAll();
    toast(`Imported ${incoming.length} sound${incoming.length > 1 ? 's' : ''}`);
}

function predecodeAll() {
    pads.forEach(p => { if (p.blob && !buffers.has(p.id)) getBuffer(p).catch(() => {}); });
}

/* ---------- Editor (trim, name, color, icon) ---------- */
const editModal = $('#edit-modal');
const editName = $('#edit-name');
const editZoom = $('#edit-zoom');

function findSound(buf) {
    const n = buf.length, ch = buf.numberOfChannels;
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let peak = 0;
    for (let c = 0; c < ch; c++) for (let i = 0; i < n; i++) { const v = Math.abs(data[c][i]); if (v > peak) peak = v; }
    const thresh = Math.min(0.0056, peak * 0.1); // about -45 dB (or 10% of peak for very quiet files)
    let first = -1, last = -1;
    for (let i = 0; i < n && first < 0; i++) for (let c = 0; c < ch; c++) if (Math.abs(data[c][i]) > thresh) { first = i; break; }
    for (let i = n - 1; i >= 0 && last < 0; i--) for (let c = 0; c < ch; c++) if (Math.abs(data[c][i]) > thresh) { last = i; break; }
    return { first, last, sr: buf.sampleRate };
}

async function openEditor(id) {
    const pad = padById(id);
    if (!pad || !pad.blob) return;
    stopAll();
    let buf;
    try { buf = await getBuffer(pad); } catch (e) { toast('Could not decode this audio'); return; }
    ed = {
        id, buf,
        name: pad.name, color: pad.color, icon: pad.icon || 'Volume2',
        start: clamp(pad.start || 0, 0, buf.duration),
        end: clamp(pad.end || buf.duration, 0, buf.duration),
        gain: pad.gain > 0 ? pad.gain : 1, peak: 0,
        ws: null, regions: null, region: null, raf: 0, fit: 1
    };
    if (ed.end - ed.start < MIN_CUT) { ed.start = 0; ed.end = buf.duration; }
    refreshPeak();

    editName.value = ed.name;
    editZoom.value = 0;
    $('#edit-zoom-label').textContent = '1.0x';
    $('#edit-icon-search').value = '';
    renderColors();
    renderIconGrid('');
    updateEditPreview();
    updateTimes();
    updatePreviewBtn(false);
    openModal(editModal);
    requestAnimationFrame(buildWave);
}

function buildWave() {
    if (!ed) return;
    const container = $('#edit-wave');
    container.innerHTML = '';
    const dark = isDark();
    ed.fit = Math.max(1, container.clientWidth / ed.buf.duration);

    const ws = WaveSurfer.create({
        container,
        height: window.innerWidth < 640 ? 110 : 140,
        waveColor: dark ? '#5b6472' : '#a3acb9',
        progressColor: ed.color,
        cursorColor: '#f43f5e',
        cursorWidth: 2,
        barWidth: 2, barGap: 1, barRadius: 2,
        normalize: true,
        interact: false,
        autoCenter: false
    });
    const regions = ws.registerPlugin(WaveSurfer.Regions.create());
    ed.ws = ws;
    ed.regions = regions;

    const sync = (r) => {
        if (!ed) return;
        ed.start = clamp(r.start, 0, ed.buf.duration);
        ed.end = clamp(r.end, 0, ed.buf.duration);
        updateTimes();
    };
    regions.on('region-update', sync);
    regions.on('region-updated', (r) => { sync(r); refreshPeak(); });

    ws.on('ready', () => {
        if (!ed || ed.ws !== ws) return;
        ed.region = regions.addRegion({
            id: 'cut', start: ed.start, end: ed.end,
            drag: false, resize: true, minLength: MIN_CUT,
            color: rgba(ed.color, 0.22)
        });
    });
    ws.on('error', () => toast('Could not draw the waveform'));
    ws.loadBlob(padById(ed.id).blob);
}

function updateTimes() {
    if (!ed) return;
    $('#edit-start').textContent = fmt(ed.start);
    $('#edit-end').textContent = fmt(ed.end);
    $('#edit-len').textContent = fmt(Math.max(0, ed.end - ed.start));
}
function updateEditPreview() {
    if (!ed) return;
    const box = $('#edit-preview');
    box.style.background = ed.color;
    box.style.color = fgFor(ed.color);
    box.innerHTML = iconSvg(ed.icon, 24);
}
function updatePreviewBtn(playing) {
    const btn = $('#btn-preview');
    btn.querySelector('svg').outerHTML = iconSvg(playing ? 'Square' : 'Play', 16);
    $('#btn-preview-text').textContent = playing ? 'Stop' : 'Preview';
}

function renderColors() {
    const box = $('#edit-colors');
    box.innerHTML = '';
    PALETTE.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch' + (c.toLowerCase() === ed.color.toLowerCase() ? ' sel' : '');
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', () => setEditColor(c));
        box.appendChild(b);
    });
    const custom = document.createElement('label');
    custom.className = 'swatch flex items-center justify-center overflow-hidden relative';
    custom.style.background = 'conic-gradient(#e0605f, #d9ac3f, #8dba55, #43a8be, #8479dc, #d96aa6, #e0605f)';
    custom.title = 'Custom color';
    custom.innerHTML = '<input type="color" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">';
    const inp = custom.querySelector('input');
    inp.value = /^#[0-9a-f]{6}$/i.test(ed.color) ? ed.color : '#888888';
    inp.addEventListener('input', () => setEditColor(inp.value, true));
    box.appendChild(custom);
}
function setEditColor(c, keepCustomInput = false) {
    if (!ed) return;
    ed.color = c;
    if (!keepCustomInput) renderColors();
    else box_selectNone();
    updateEditPreview();
    if (ed.ws) ed.ws.setOptions({ progressColor: c });
    if (ed.region) ed.region.setOptions({ color: rgba(c, 0.22) });
}
function box_selectNone() {
    document.querySelectorAll('#edit-colors .swatch.sel').forEach(s => s.classList.remove('sel'));
}

function renderIconGrid(query) {
    const box = $('#edit-icons');
    box.innerHTML = '';
    const q = query.trim().toLowerCase();
    let names;
    if (q) {
        const all = window.lucide && window.lucide.icons ? Object.keys(window.lucide.icons) : [];
        names = all.filter(n => n.toLowerCase().includes(q)).slice(0, 72);
    } else {
        names = availableIcons();
    }
    if (!names.length) {
        box.innerHTML = '<p class="muted text-xs col-span-full py-2">No icons found.</p>';
        return;
    }
    names.forEach(n => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-opt' + (ed && n === ed.icon ? ' sel' : '');
        b.title = n;
        b.innerHTML = iconSvg(n, 20);
        b.addEventListener('click', () => {
            ed.icon = n;
            box.querySelectorAll('.icon-opt.sel').forEach(s => s.classList.remove('sel'));
            b.classList.add('sel');
            updateEditPreview();
        });
        box.appendChild(b);
    });
}
$('#edit-icon-search').addEventListener('input', (e) => renderIconGrid(e.target.value));
editName.addEventListener('input', () => { if (ed) ed.name = editName.value; });

function setRegion(start, end) {
    ed.start = start;
    ed.end = end;
    if (ed.region) ed.region.setOptions({ start, end });
    updateTimes();
    refreshPeak();
}

/* Volume (per pad gain, in dB) */
const editVol = $('#edit-vol');
function refreshPeak() {
    if (!ed) return;
    ed.peak = analyze(ed.buf, ed.start, ed.end).peak;
    updateVolUI();
}
function updateVolUI() {
    if (!ed) return;
    editVol.value = clamp(toDb(ed.gain), Number(editVol.min), Number(editVol.max));
    $('#edit-vol-label').textContent = fmtDb(ed.gain);
    $('#edit-clip').classList.toggle('hidden', !(ed.peak * ed.gain > 1.0001));
}
editVol.addEventListener('input', () => {
    if (!ed) return;
    ed.gain = fromDb(Number(editVol.value));
    updateVolUI();
});
$('#edit-vol-reset').addEventListener('click', () => { if (ed) { ed.gain = 1; updateVolUI(); } });
$('#edit-vol-max').addEventListener('click', () => {
    if (!ed) return;
    if (!ed.peak) { toast('No sound in the selected part'); return; }
    ed.gain = CEILING / ed.peak;
    updateVolUI();
    toast(`Volume ${fmtDb(ed.gain)} - loudest without clipping`);
});
function nudge(which, delta) {
    if (!ed) return;
    if (which === 'start') setRegion(clamp(ed.start + delta, 0, ed.end - MIN_CUT), ed.end);
    else setRegion(ed.start, clamp(ed.end + delta, ed.start + MIN_CUT, ed.buf.duration));
}
/* Keep a handle visible when the waveform is zoomed in */
function revealTime(t) {
    if (!ed || !ed.ws) return;
    try {
        const w = $('#edit-wave').clientWidth;
        const total = ed.ws.getWrapper().scrollWidth || w;
        const pxps = total / ed.buf.duration;
        const x = t * pxps, scroll = ed.ws.getScroll();
        const pad = w * 0.15;
        if (x < scroll + pad || x > scroll + w - pad) ed.ws.setScroll(Math.max(0, x - w / 2));
    } catch (e) { /* ignore until ready */ }
}

/* Hold a +/- button to repeat, speeding up the longer it is held */
function holdRepeat(btn, which, dir) {
    let timer = 0, t0 = 0;
    const step = () => {
        const held = performance.now() - t0;
        const amt = held > 3000 ? 1 : held > 1500 ? 0.1 : 0.01;
        nudge(which, dir * amt);
        revealTime(which === 'start' ? ed.start : ed.end);
        timer = setTimeout(step, 60);
    };
    const stop = () => { clearTimeout(timer); timer = 0; };
    btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        t0 = performance.now();
        nudge(which, dir * 0.01);
        timer = setTimeout(step, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('click', (e) => { if (e.detail === 0) nudge(which, dir * 0.01); }); // keyboard
}
holdRepeat($('#start-minus'), 'start', -1);
holdRepeat($('#start-plus'), 'start', 1);
holdRepeat($('#end-minus'), 'end', -1);
holdRepeat($('#end-plus'), 'end', 1);

/* Drag the Start / End readouts left-right to scrub the handle.
   Slow drag = fine (2ms per px), fast drag = big jumps (scaled to clip length). */
document.querySelectorAll('[data-scrub]').forEach(el => {
    const which = el.dataset.scrub;
    let lastX = 0, lastT = 0, pos = 0, active = false;
    el.addEventListener('pointerdown', (e) => {
        if (!ed || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        active = true;
        lastX = e.clientX; lastT = performance.now();
        pos = which === 'start' ? ed.start : ed.end;
        el.classList.add('active');
    });
    el.addEventListener('pointermove', (e) => {
        if (!active || !ed) return;
        const now = performance.now();
        const dx = e.clientX - lastX;
        const dt = Math.max(1, now - lastT);
        lastX = e.clientX; lastT = now;
        if (!dx) return;
        const speed = Math.abs(dx) / dt;                         // px per ms
        const fine = 0.002;
        const fast = Math.max(fine, ed.buf.duration / 300);      // ~300px of fast drag covers the whole clip
        const k = Math.min(1, speed / 2) ** 2;
        pos += dx * (fine + (fast - fine) * k);
        if (which === 'start') {
            pos = clamp(pos, 0, ed.end - MIN_CUT);
            ed.start = pos;
        } else {
            pos = clamp(pos, ed.start + MIN_CUT, ed.buf.duration);
            ed.end = pos;
        }
        if (ed.region) ed.region.setOptions({ start: ed.start, end: ed.end });
        updateTimes();
        revealTime(pos);
    });
    const end = () => {
        if (!active) return;
        active = false;
        el.classList.remove('active');
        refreshPeak();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
});

$('#btn-snap').addEventListener('click', () => {
    if (!ed) return;
    const { first, sr } = findSound(ed.buf);
    if (first < 0) { toast('No sound found in this clip'); return; }
    const target = Math.max(0, first / sr - 0.005);
    if (target >= ed.end - MIN_CUT) { toast('The sound starts after the end handle'); return; }
    if (target < 0.001 && ed.start < 0.001) { toast('Already starts right at the sound'); return; }
    setRegion(target, ed.end);
    toast(`Start snapped to ${fmt(target)}`);
});
$('#btn-trim-end').addEventListener('click', () => {
    if (!ed) return;
    const { last, sr } = findSound(ed.buf);
    if (last < 0) { toast('No sound found in this clip'); return; }
    const target = Math.min(ed.buf.duration, last / sr + 0.03);
    if (target <= ed.start + MIN_CUT) { toast('The sound ends before the start handle'); return; }
    setRegion(ed.start, target);
    toast(`End trimmed to ${fmt(target)}`);
});
$('#btn-reset-trim').addEventListener('click', () => { if (ed) setRegion(0, ed.buf.duration); });

function previewToggle() {
    if (!ed) return;
    if (current && current.padId === 'preview') { stopAll(); return; }
    const myEd = ed;
    const cur = playBuffer(ed.buf, ed.start, ed.end, 'preview', () => {
        cancelAnimationFrame(myEd.raf);
        if (ed === myEd) {
            updatePreviewBtn(false);
            try { myEd.ws.setTime(myEd.start); } catch (e) { /* ignore */ }
        }
    }, ed.gain);
    updatePreviewBtn(true);
    const tick = () => {
        if (ed !== myEd || current !== cur) return;
        try { myEd.ws.setTime(myEd.start + (ctx.currentTime - cur.t0)); } catch (e) { /* ignore */ }
        myEd.raf = requestAnimationFrame(tick);
    };
    tick();
}
$('#btn-preview').addEventListener('click', previewToggle);

/* Zoom: slider, mouse wheel, pinch */
function applyZoomValue(v) {
    if (!ed || !ed.ws) return;
    v = clamp(v, 0, 100);
    editZoom.value = v;
    const mult = Math.pow(60, v / 100);
    $('#edit-zoom-label').textContent = `${mult.toFixed(1)}x`;
    try { ed.ws.zoom(ed.fit * mult); } catch (e) { /* ignore until ready */ }
}
editZoom.addEventListener('input', (e) => applyZoomValue(Number(e.target.value)));
const waveCard = $('#edit-wave-card');
waveCard.addEventListener('wheel', (e) => {
    if (!ed || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    applyZoomValue(Number(editZoom.value) + (e.deltaY < 0 ? 6 : -6));
}, { passive: false });

let pinchDist = 0, pinchStart = 0;
const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
waveCard.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) { pinchDist = touchDist(e.touches); pinchStart = Number(editZoom.value); }
}, { passive: true });
waveCard.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !pinchDist) return;
    e.preventDefault();
    const scale = touchDist(e.touches) / pinchDist;
    applyZoomValue(pinchStart + Math.log(scale) / Math.log(60) * 100);
}, { passive: false });
waveCard.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinchDist = 0; }, { passive: true });

/* Save / close / pad actions */
function commitEdits() {
    const pad = padById(ed.id);
    pad.name = (ed.name || '').trim() || 'Untitled';
    pad.color = ed.color;
    pad.icon = ed.icon;
    pad.start = ed.start;
    pad.end = ed.end;
    pad.gain = ed.gain;
    return savePad(pad);
}
function closeEditor() {
    stopAll();
    if (ed) {
        cancelAnimationFrame(ed.raf);
        try { ed.ws && ed.ws.destroy(); } catch (e) { /* ignore */ }
        ed = null;
    }
    closeModal(editModal);
}
$('#edit-save').addEventListener('click', async () => {
    if (!ed) return;
    await commitEdits();
    closeEditor();
    render();
});

$('#act-duplicate').addEventListener('click', async () => {
    if (!ed) return;
    await commitEdits();
    const pad = padById(ed.id);
    closeEditor();
    await duplicatePad(pad);
});
$('#act-replace').addEventListener('click', async () => {
    if (!ed) return;
    await commitEdits();
    const id = ed.id;
    closeEditor();
    render();
    openSource(id);
});
$('#act-export').addEventListener('click', async () => {
    if (!ed) return;
    await commitEdits();
    const pad = padById(ed.id);
    render();
    exportPads([pad], `${pad.name.replace(/[^\w\- ]+/g, '').trim() || 'pad'}.cringebox`);
});
$('#act-clear').addEventListener('click', async () => {
    if (!ed) return;
    const pad = padById(ed.id);
    if (!(await confirmDialog('Clear this pad?', 'The audio, name, color and icon will be removed. The empty slot stays.', 'Clear'))) return;
    closeEditor();
    await clearPad(pad);
});
$('#act-remove').addEventListener('click', async () => {
    if (!ed) return;
    const id = ed.id;
    if (!(await confirmDialog('Remove this pad?', 'The pad and its audio will be deleted from the board.', 'Remove'))) return;
    closeEditor();
    await removePad(id);
});

/* ---------- Header: board menu, add pad, theme, install ---------- */
const boardMenu = $('#board-menu');
$('#board-menu-btn').addEventListener('click', (e) => { e.stopPropagation(); boardMenu.classList.toggle('hidden'); });
document.addEventListener('click', (e) => {
    if (!boardMenu.classList.contains('hidden') && !boardMenu.contains(e.target)) boardMenu.classList.add('hidden');
});
$('#add-pad-btn').addEventListener('click', addEmptyPad);

$('#m-export').addEventListener('click', () => { boardMenu.classList.add('hidden'); exportPads(pads, 'CringeBox-board.cringebox'); });
$('#m-import').addEventListener('click', () => { boardMenu.classList.add('hidden'); $('#import-file').click(); });
$('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await importFile(f);
});
$('#m-maxall').addEventListener('click', () => {
    boardMenu.classList.add('hidden');
    levelPads('max');
});
$('#m-level').addEventListener('click', async () => {
    boardMenu.classList.add('hidden');
    if (!pads.some(p => p.blob)) { toast('Add some sounds first'); return; }
    const mode = await askDialog({
        title: 'Level volume of all pads',
        text: 'Match loudness: every pad plays at the same level - the loudest level at which no pad clips.\n\nMax each: every pad as loud as it can go without clipping (pads may still differ in loudness).\n\nThis replaces each pad\'s current volume setting.',
        buttons: [
            { label: 'Cancel', value: null },
            { label: 'Max each', value: 'max' },
            { label: 'Match loudness', value: 'match', cls: 'btn-primary' }
        ]
    });
    if (mode) levelPads(mode);
});

// mode: 'max' = each pad as loud as possible without clipping; 'match' = same loudness for all, no clipping
async function levelPads(mode) {
    const filled = pads.filter(p => p.blob);
    if (!filled.length) { toast('Add some sounds first'); return; }
    const stats = [];
    for (const p of filled) {
        try {
            const buf = await getBuffer(p);
            const end = Math.min(p.end || buf.duration, buf.duration);
            const s = analyze(buf, p.start || 0, end);
            if (s.peak > 0 && s.rms > 0) stats.push({ p, ...s });
        } catch (e) { /* skip undecodable */ }
    }
    if (!stats.length) { toast('No audible sound found'); return; }
    if (mode === 'max') {
        stats.forEach(s => { s.p.gain = CEILING / s.peak; });
    } else {
        // Each pad's loudest clean level is rms * (CEILING / peak); the quietest of those is the shared target
        const target = Math.min(...stats.map(s => s.rms * CEILING / s.peak));
        stats.forEach(s => { s.p.gain = target / s.rms; });
    }
    await saveOrder();
    toast(mode === 'max' ? `Maximized ${stats.length} pads` : `Leveled ${stats.length} pads to the same loudness`);
}
$('#m-clean').addEventListener('click', async () => {
    boardMenu.classList.add('hidden');
    const empties = pads.filter(p => !p.blob);
    if (!empties.length) { toast('No empty pads to remove'); return; }
    for (const p of empties) await dbDelete(p.id);
    pads = pads.filter(p => p.blob);
    await saveOrder();
    render();
    toast(`Removed ${empties.length} empty pad${empties.length > 1 ? 's' : ''}`);
});
$('#m-reset').addEventListener('click', async () => {
    boardMenu.classList.add('hidden');
    if (!(await confirmDialog('Clear the whole board?', 'Every pad and sound will be deleted. Export first if you want a backup.', 'Clear all'))) return;
    stopAll();
    buffers.clear();
    await dbClear();
    pads = [];
    for (let i = 0; i < DEFAULT_PAD_COUNT; i++) pads.push(newPad());
    await saveOrder();
    render();
});

$('#theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    updateThemeColorMeta();
});
function updateThemeColorMeta() {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = isDark() ? '#0c0e12' : '#f6f7f9';
}

let deferredPrompt = null;
const installBtn = $('#pwa-install-btn');
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
});
installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
});

/* ---------- Keyboard ---------- */
document.addEventListener('pointerdown', () => ensureCtx(), { passive: true });

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toUpperCase();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable;

    if (e.key === 'Escape') {
        if (modalStack.length) { e.preventDefault(); requestClose(modalStack[modalStack.length - 1]); }
        else if (!boardMenu.classList.contains('hidden')) boardMenu.classList.add('hidden');
        else if (arranging) setArranging(false);
        else stopAll();
        return;
    }
    if (typing) return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        if (ed && modalStack[modalStack.length - 1] === editModal) previewToggle();
        else if (!modalStack.length) stopAll();
        return;
    }
    if (modalStack.length || e.repeat) return;
    const idx = KEYS.indexOf(e.key.toLowerCase());
    if (idx >= 0 && pads[idx] && pads[idx].blob) {
        ensureCtx();
        triggerPad(pads[idx]);
    }
});

/* ---------- Init ---------- */
async function init() {
    try {
        if (localStorage.getItem(THEME_KEY) === 'light') document.documentElement.classList.remove('dark');
    } catch (e) { /* ignore */ }
    updateThemeColorMeta();
    try { hydrateIcons(); } catch (e) { console.warn('Icon rendering failed:', e); }

    try {
        pads = (await dbGetAll()).sort((a, b) => (a.pos || 0) - (b.pos || 0));
    } catch (e) {
        toast('Storage is unavailable - pads will not be saved');
        pads = [];
    }
    if (!pads.length) {
        for (let i = 0; i < DEFAULT_PAD_COUNT; i++) pads.push(newPad());
        try { await saveOrder(); } catch (e) { /* ignore */ }
    }
    render();
    predecodeAll();

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker registration failed:', err));
    }
}
init();
