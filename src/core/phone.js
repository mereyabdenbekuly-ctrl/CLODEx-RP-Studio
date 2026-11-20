// M4 «Смартфон / Дневник персонажа и Лента мира».
// Pure data module: append-only journal (./journal.js), replay by activeTurnKeys,
// skin detection and media prompt builders. It NEVER performs network requests:
// photo/voice generation is Click-to-Reveal and is executed by the UI layer
// (confirmPaid + maxAutoSpendUsd), which then calls phoneReveal() with the saved path.
import { jrAppend, jrGc, jrReplay, jrSizeBytes } from './journal.js';

export const PHONE_STORE_VERSION = 1;
export const PHONE_KINDS = Object.freeze(['note', 'dm', 'feed', 'photo', 'voice']);
export const PHONE_SKINS = Object.freeze(['auto', 'smartphone', 'grimoire']);
export const PHONE_MAX_EVENTS_PER_TURN = 2;
export const PHONE_MAX_ENTRIES = 120;
export const PHONE_MAX_BYTES = 48000;
export const PHONE_MIN_TURNS_BETWEEN = 3;
export const PHONE_OP_ADD = 'phone.add';
export const PHONE_OP_REVEAL = 'phone.reveal';
export const PHONE_LIMITS = Object.freeze({ author: 48, text: 420, mediaPrompt: 360, mediaPath: 512, id: 64, turnKey: 160, source: 32 });

const PHONE_MAX_SEEN = 480;
const PHONE_HARD_MAX_OPS = 720;

export function phoneSanitizeText(value, max = 400) {
    if (value === null || value === undefined) return '';
    let s = typeof value === 'string' ? value : (typeof value === 'number' || typeof value === 'boolean') ? String(value) : '';
    if (!s) return '';
    s = s
        .replace(/<[^>]{0,200}>/g, ' ')                       // no markup from LLM
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/[ \t\r\n]+/g, ' ')
        .trim();
    if (s.length > max) s = `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
    return s;
}

export function phoneHash(str) {
    let h = 0x811c9dc5;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
}

function phoneSafeId(value) {
    return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, PHONE_LIMITS.id);
}

function phoneSafeTurnKey(value) {
    return phoneSanitizeText(value, PHONE_LIMITS.turnKey);
}

function phoneSafeSource(value) {
    const source = String(value ?? 'tracker').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, PHONE_LIMITS.source);
    return source || 'tracker';
}

function phoneSafeMediaPath(value) {
    const s = phoneSanitizeText(value, PHONE_LIMITS.mediaPath);
    if (!s) return '';
    if (/^\s*(javascript|vbscript|data:text|file):/i.test(s)) return '';
    return s;
}

function phoneJournalAppend(store, op) {
    const res = jrAppend(store.journal, op);
    if (Array.isArray(res)) store.journal = res;
    else if (res && Array.isArray(res.journal)) store.journal = res.journal;
    return store;
}

function phoneSanitizeEntry(raw, fallback = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const kindRaw = String(raw.kind ?? fallback.kind ?? '').toLowerCase().trim();
    const kind = PHONE_KINDS.includes(kindRaw) ? kindRaw : '';
    if (!kind) return null;
    const author = phoneSanitizeText(raw.author, PHONE_LIMITS.author);
    const text = phoneSanitizeText(raw.text, PHONE_LIMITS.text);
    const mediaPrompt = (kind === 'photo' || kind === 'voice') ? phoneSanitizeText(raw.mediaPrompt, PHONE_LIMITS.mediaPrompt) : '';
    if (!text && !mediaPrompt) return null;
    return {
        id: phoneSafeId(raw.id ?? fallback.id),
        kind,
        author,
        text,
        mediaPrompt,
        mediaPath: phoneSafeMediaPath(raw.mediaPath),
        turnKey: phoneSafeTurnKey(raw.turnKey ?? fallback.turnKey),
    };
}

export function phoneCreateStore() {
    return { version: PHONE_STORE_VERSION, journal: [], skin: 'auto', seenIds: [] };
}

export function phoneNormalizeStore(raw) {
    const store = phoneCreateStore();
    if (!raw || typeof raw !== 'object') return store;
    store.skin = PHONE_SKINS.includes(raw.skin) ? raw.skin : 'auto';
    if (Array.isArray(raw.seenIds)) {
        store.seenIds = [...new Set(raw.seenIds.map(phoneSafeId).filter(Boolean))].slice(-PHONE_MAX_SEEN);
    }
    if (Array.isArray(raw.journal)) {
        for (const op of raw.journal) {
            if (!op || typeof op !== 'object') continue;
            const turnKey = phoneSafeTurnKey(op.turnKey);
            if (!turnKey) continue;
            const base = { id: op.id, kind: op.kind, turnKey, source: phoneSafeSource(op.source), at: Number.isFinite(op.at) ? op.at : 0 };
            if (op.kind === PHONE_OP_ADD) {
                const entry = phoneSanitizeEntry(op.payload, { turnKey });
                if (!entry || !entry.id) continue;
                entry.turnKey = turnKey;
                store.journal.push({ ...base, payload: entry });
            } else if (op.kind === PHONE_OP_REVEAL) {
                const entryId = phoneSafeId(op.payload?.entryId);
                const mediaPath = phoneSafeMediaPath(op.payload?.mediaPath);
                if (!entryId || !mediaPath) continue;
                store.journal.push({ ...base, payload: { entryId, mediaPath } });
            }
        }
        if (store.journal.length > PHONE_HARD_MAX_OPS) store.journal = store.journal.slice(-PHONE_HARD_MAX_OPS);
    }
    return store;
}

// 10.6: the phoneEvents block is only added to the tracker schema when
// counters.turnsSinceLastPhone >= 3.
export function phoneShouldInclude(state) {
    const n = Number(state?.counters?.turnsSinceLastPhone);
    return Number.isFinite(n) && n >= PHONE_MIN_TURNS_BETWEEN;
}

// Appends up to 2 sanitized events created by `turnKey`. Idempotent per turnKey:
// a repeated sync of the same turn does not duplicate entries. Mutates and returns the store.
export function phoneIngestEvents(store, events, turnKey, { source = 'tracker' } = {}) {
    if (!store || typeof store !== 'object') return store;
    if (!Array.isArray(store.journal)) store.journal = [];
    const key = phoneSafeTurnKey(turnKey);
    const origin = phoneSafeSource(source);
    if (!key || !Array.isArray(events) || events.length === 0) return store;
    if (store.journal.some((op) => op && op.kind === PHONE_OP_ADD && op.turnKey === key && phoneSafeSource(op.source) === origin)) return store;
    const usedIds = new Set(store.journal.filter((op) => op?.kind === PHONE_OP_ADD).map((op) => op.payload?.id));
    let added = 0;
    for (let i = 0; i < events.length && added < PHONE_MAX_EVENTS_PER_TURN; i += 1) {
        const entry = phoneSanitizeEntry({ ...(events[i] && typeof events[i] === 'object' ? events[i] : {}), id: '', mediaPath: '' }, { turnKey: key });
        if (!entry) continue;
        let id = `ph-${phoneHash(`${key}|${origin}|${i}|${entry.kind}|${entry.text}`)}`;
        let n = 1;
        while (usedIds.has(id)) id = `ph-${phoneHash(`${key}|${i}|${entry.text}|${n++}`)}`;
        usedIds.add(id);
        entry.id = id;
        entry.turnKey = key;
        phoneJournalAppend(store, { kind: PHONE_OP_ADD, turnKey: key, source: origin, payload: entry });
        added += 1;
    }
    if (store.journal.length > PHONE_HARD_MAX_OPS) store.journal = store.journal.slice(-PHONE_HARD_MAX_OPS);
    return store;
}

function phoneReducer(acc, op) {
    if (!op || !op.payload) return acc;
    if (op.kind === PHONE_OP_ADD) {
        const entry = { ...op.payload, turnKey: op.turnKey, mediaPath: op.payload.mediaPath || '' };
        if (!entry.id) return acc;
        acc.map.delete(entry.id);
        acc.map.set(entry.id, entry);
    } else if (op.kind === PHONE_OP_REVEAL) {
        const entry = acc.map.get(op.payload.entryId);
        if (entry && op.payload.mediaPath) entry.mediaPath = op.payload.mediaPath;
    }
    return acc;
}

// Rebuilds the visible feed from operations whose turnKey is active.
// → { entries: [...oldest→newest, ≤ 120], unseen }
export function phoneView(store, activeTurnKeys) {
    const journal = Array.isArray(store?.journal) ? store.journal : [];
    const active = Array.isArray(activeTurnKeys) ? activeTurnKeys : [];
    const acc = jrReplay(journal, active, phoneReducer, { map: new Map() }) || { map: new Map() };
    const entries = [...acc.map.values()].slice(-PHONE_MAX_ENTRIES).map((e) => ({ ...e }));
    const seen = new Set(Array.isArray(store?.seenIds) ? store.seenIds : []);
    const unseen = entries.reduce((n, e) => n + (seen.has(e.id) ? 0 : 1), 0);
    return { entries, unseen };
}

// Records the saved media path for a photo/voice entry after a paid click.
// The reveal op is bound to the entry's own turnKey (so the media lives exactly as long
// as the entry); `turnKey` is the fallback when the entry is unknown.
export function phoneReveal(store, entryId, mediaPath, turnKey) {
    if (!store || typeof store !== 'object') return store;
    if (!Array.isArray(store.journal)) store.journal = [];
    const id = phoneSafeId(entryId);
    const path = phoneSafeMediaPath(mediaPath);
    if (!id || !path) return store;
    const addOp = [...store.journal].reverse().find((op) => op?.kind === PHONE_OP_ADD && op.payload?.id === id);
    if (addOp && addOp.payload.kind !== 'photo' && addOp.payload.kind !== 'voice') return store;
    const key = phoneSafeTurnKey(addOp?.turnKey || turnKey);
    if (!key) return store;
    return phoneJournalAppend(store, { kind: PHONE_OP_REVEAL, turnKey: key, payload: { entryId: id, mediaPath: path } });
}

export function phoneMarkSeen(store, entryIds) {
    if (!store || typeof store !== 'object') return store;
    const ids = (Array.isArray(entryIds) ? entryIds : [entryIds]).map(phoneSafeId).filter(Boolean);
    const set = new Set(Array.isArray(store.seenIds) ? store.seenIds : []);
    for (const id of ids) {
        set.delete(id);
        set.add(id);
    }
    store.seenIds = [...set].slice(-PHONE_MAX_SEEN);
    return store;
}

export function phoneSetSkin(store, skin) {
    if (store && typeof store === 'object') store.skin = PHONE_SKINS.includes(skin) ? skin : 'auto';
    return store;
}

// Physical cleanup (10.1): deleted messages (and everything after them, computed by the
// adapter) or the 48 KB limit (oldest dead-branch ops first). Also drops seenIds of gone entries.
export function phoneGc(store, { deletedTurnKeys = [], activeTurnKeys = [], maxBytes = PHONE_MAX_BYTES } = {}) {
    if (!store || typeof store !== 'object' || !Array.isArray(store.journal)) return store;
    const res = jrGc(store.journal, { deletedTurnKeys, activeTurnKeys, maxBytes });
    if (Array.isArray(res)) store.journal = res;
    else if (res && Array.isArray(res.journal)) store.journal = res.journal;
    const deleted = new Set(deletedTurnKeys || []);
    if (deleted.size) store.journal = store.journal.filter((op) => !deleted.has(op?.turnKey));
    // Keep at most 120 live entries: evict the oldest active entries beyond the cap.
    const adds = store.journal.filter((op) => op?.kind === PHONE_OP_ADD);
    if (adds.length > PHONE_MAX_ENTRIES) {
        const activeSet = new Set(activeTurnKeys || []);
        const live = adds.filter((op) => activeSet.has(op.turnKey));
        const dead = adds.filter((op) => !activeSet.has(op.turnKey));
        const dropIds = new Set();
        for (const op of dead.slice(0, Math.max(0, adds.length - PHONE_MAX_ENTRIES))) dropIds.add(op.payload.id);
        if (live.length > PHONE_MAX_ENTRIES) for (const op of live.slice(0, live.length - PHONE_MAX_ENTRIES)) dropIds.add(op.payload.id);
        if (dropIds.size) {
            store.journal = store.journal.filter((op) => !dropIds.has(op?.kind === PHONE_OP_ADD ? op.payload?.id : op?.payload?.entryId));
        }
    }
    // Still above the byte budget (only live entries left): evict the oldest entries.
    let guard = 0;
    while (jrSizeBytes(store.journal) > maxBytes && guard < PHONE_HARD_MAX_OPS) {
        guard += 1;
        const oldest = store.journal.find((op) => op?.kind === PHONE_OP_ADD);
        if (!oldest) break;
        const dropId = oldest.payload?.id;
        store.journal = store.journal.filter((op) => op !== oldest && !(op?.kind === PHONE_OP_REVEAL && op.payload?.entryId === dropId));
    }
    const existing = new Set(store.journal.filter((op) => op?.kind === PHONE_OP_ADD).map((op) => op.payload.id));
    store.seenIds = (store.seenIds || []).filter((id) => existing.has(id));
    return store;
}

const PHONE_GRIMOIRE_HINTS = [
    'fantasy', 'medieval', 'magic', 'mage', 'wizard', 'witch', 'sorcer', 'dragon', 'kingdom', 'king', 'queen',
    'knight', 'castle', 'sword', 'elf', 'elves', 'dwarf', 'orc', 'grimoire', 'spell', 'tavern', 'inquisit',
    'dante', 'inferno', 'purgatory', 'demon', 'empire', 'duke', 'lord', 'monaster', 'abbey', 'scroll',
    'фэнтези', 'средневек', 'маги', 'маг ', 'волшеб', 'ведьм', 'колдун', 'чародей', 'дракон',
    'корол', 'рыцар', 'замок', 'замк', 'меч ', 'эльф', 'гном', 'орк', 'гримуар',
    'заклин', 'таверн', 'трактир', 'инквизиц', 'данте', 'ад ', 'чистилищ', 'демон', 'империя', 'герцог',
    'лорд', 'монастыр', 'свиток', 'княж', 'боярин',
];
const PHONE_SMARTPHONE_HINTS = [
    'modern', 'cyber', 'neon', 'smartphone', 'phone', 'internet', 'social media', 'instagram', 'office', 'city',
    'metro', 'subway', 'school', 'college', 'university', 'apartment', 'car ', 'corporat', 'hacker', 'android',
    'современ', 'кибер', 'неон', 'смартфон', 'телефон', 'интернет', 'соцсет', 'офис', 'город', 'метро',
    'школ', 'универ', 'колледж', 'квартир', 'машин', 'корпорац', 'хакер', 'андроид', 'мегаполис', 'клуб',
];

// 'smartphone' for modern/cyberpunk, 'grimoire' (letters) for fantasy/medieval/Dante.
export function phoneDetectSkin(state, charDescription) {
    const world = state?.world || {};
    const text = ` ${[world.location, world.weather, world.setting, world.genre, charDescription]
        .filter((v) => typeof v === 'string').join(' ').slice(0, 6000).toLowerCase().replace(/ё/g, 'е')
        .replace(/[^a-z0-9а-я]+/g, ' ')} `;
    // Hints match at a word start (' hint'); a trailing space in a hint means a whole word.
    let fantasy = 0;
    let modern = 0;
    for (const h of PHONE_GRIMOIRE_HINTS) if (text.includes(` ${h}`)) fantasy += 1;
    for (const h of PHONE_SMARTPHONE_HINTS) if (text.includes(` ${h}`)) modern += 1;
    if (world.disclosureMode === 'medieval') fantasy += 2;
    return fantasy > modern ? 'grimoire' : 'smartphone';
}

export function phoneResolveSkin(store, state, charDescription) {
    const manual = store?.skin;
    if (manual === 'smartphone' || manual === 'grimoire') return manual;
    return phoneDetectSkin(state, charDescription);
}

function phoneVitalsMood(vitals) {
    const v = vitals && typeof vitals === 'object' ? (vitals.vitals && typeof vitals.vitals === 'object' ? vitals.vitals : vitals) : {};
    const hr = Number(v.heartRate) || 72;
    const br = Number(v.breathRate) || 14;
    const stress = Number(v.stress) || 0;
    const resp = String(v.respiration || '');
    const circ = String(v.circulation || '');
    const breathless = resp === 'breathless' || resp === 'rapid' || br >= 24;
    const racing = hr >= 110 || circ === 'adrenaline';
    const flushed = circ === 'flushed';
    const pale = circ === 'pallor' || circ === 'hypovolemia';
    const tense = stress >= 65;
    const calm = !breathless && !racing && !tense && hr <= 85;
    return { breathless, racing, flushed, pale, tense, calm };
}

// English prompt for Nano Banana. Only built on click; the module does not send it.
export function phoneBuildPhotoPrompt(entry, { charName = '', charDescription = '', vitals = null, skin = 'smartphone' } = {}) {
    const name = phoneSanitizeText(charName, 48) || 'the character';
    const subject = phoneSanitizeText(entry?.mediaPrompt || entry?.text, 300);
    const looks = phoneSanitizeText(charDescription, 320);
    const mood = phoneVitalsMood(vitals);
    const moodBits = [];
    if (mood.flushed) moodBits.push('flushed cheeks');
    if (mood.breathless) moodBits.push('slightly out of breath');
    if (mood.racing) moodBits.push('excited, intense gaze');
    if (mood.pale) moodBits.push('pale, tired face');
    if (mood.tense) moodBits.push('tense expression');
    if (mood.calm && !moodBits.length) moodBits.push('relaxed expression');
    const style = skin === 'grimoire'
        ? 'hand-painted miniature portrait on aged parchment, ink and watercolor, candlelight, tucked into a sealed letter'
        : 'candid smartphone selfie, vertical 9:16 framing, natural phone camera look, soft ambient light, shallow depth of field';
    const parts = [
        `${style}.`,
        `Subject: ${name}${looks ? `, appearance: ${looks}` : ''}.`,
        subject ? `Scene: ${subject}.` : '',
        moodBits.length ? `Mood: ${moodBits.join(', ')}.` : '',
        'Consistent character design, no text, no watermark, no UI overlays.',
    ];
    return parts.filter(Boolean).join(' ').slice(0, 1200);
}

// TTS text with an emotional stage mark derived from the current pulse/breathing.
export function phoneBuildVoiceText(entry, vitals) {
    const text = phoneSanitizeText(entry?.text || entry?.mediaPrompt, PHONE_LIMITS.text);
    if (!text) return '';
    const ru = /[а-яё]/i.test(text);
    const mood = phoneVitalsMood(vitals);
    let mark = '';
    if (mood.breathless && mood.racing) mark = ru ? 'задыхаясь, взволнованно' : 'breathless, heart racing';
    else if (mood.breathless) mark = ru ? 'тяжело дыша' : 'breathing heavily';
    else if (mood.racing) mark = ru ? 'взволнованно, торопливо' : 'excited, hurried';
    else if (mood.pale) mark = ru ? 'устало, тихо' : 'weak, quiet';
    else if (mood.tense) mark = ru ? 'напряжённо' : 'tense';
    else if (mood.flushed) mark = ru ? 'смущённо' : 'flustered';
    else if (mood.calm) mark = ru ? 'спокойно, вполголоса' : 'calm, softly';
    return mark ? `(${mark}) ${text}` : text;
}

// Approximate duration for the «🎙 Голосовое 0:12» placeholder (no generation needed).
export function phoneVoiceDuration(entry) {
    const text = phoneSanitizeText(entry?.text || entry?.mediaPrompt, PHONE_LIMITS.text);
    const words = text ? text.split(/\s+/).length : 0;
    const secs = Math.max(2, Math.min(90, Math.round(words / 2.4)));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// Short English hint for world.pendingMemoryHint («Предъявить в следующем ходу»).
export function phoneBuildPresentHint(entry) {
    const kind = PHONE_KINDS.includes(entry?.kind) ? entry.kind : 'note';
    const author = phoneSanitizeText(entry?.author, PHONE_LIMITS.author);
    const text = phoneSanitizeText(entry?.text || entry?.mediaPrompt, 160);
    if (!text) return '';
    const what = { note: 'a secret note', dm: 'a private message', feed: 'a public post', photo: 'a hidden photo', voice: 'a voice message' }[kind];
    return `{{user}} confronts {{char}} with ${what}${author ? ` by ${author}` : ''}: "${text.replace(/"/g, "'")}"`.slice(0, 280);
}
