// Append-only operation journal shared by the phone (M4) and wiki (M5) stores (v1.3, spec 10.1 / 11).
//
// - Every operation carries the `turnKey` of the message/variant that produced it.
// - The current view is rebuilt by replaying only operations whose turnKey is in `activeTurnKeys`
//   (keys of the visible messages of the active branch). Swipes never delete anything, so returning
//   to a previous variant restores its data (A -> B -> A).
// - Physical cleanup (jrGc) happens only on message deletion or when the journal approaches its
//   size limit (oldest "dead branch" operations are evicted first).
// - An operation with an empty turnKey is global: it is always active and never evicted as dead.
//
// Flat-bundler safe: every top-level name is jr*-prefixed; only `export function` / `export const`.

export const JR_MAX_BYTES = 48000;
const JR_KEY_MAX = 200;
const JR_KIND_MAX = 40;

let jrSeq = 0;

export function jrTurnKey(id, variant = 0, salt = '') {
    const cleanId = String(id ?? '').trim();
    const cleanVariant = String(variant ?? 0).trim() || '0';
    const cleanSalt = String(salt ?? '').trim();
    return `${cleanId}:${cleanVariant}${cleanSalt ? `#${cleanSalt}` : ''}`.slice(0, JR_KEY_MAX);
}

// Message identity without variant and salt: '12:3#ab' -> '12'; legacy 'msg-1' -> 'msg-1'.
export function jrTurnBase(turnKey) {
    const raw = String(turnKey ?? '');
    const hash = raw.indexOf('#');
    const noSalt = hash === -1 ? raw : raw.slice(0, hash);
    const colon = noSalt.lastIndexOf(':');
    return colon === -1 ? noSalt : noSalt.slice(0, colon);
}

function jrMakeId(journal) {
    jrSeq = (jrSeq + 1) % 0x10_0000;
    const rand = Math.floor(Math.random() * 0x10_0000).toString(36);
    return `op${Date.now().toString(36)}${journal.length.toString(36)}${jrSeq.toString(36)}${rand}`.slice(0, 40);
}

function jrClonePayload(payload) {
    if (payload === undefined) return null;
    try {
        return structuredClone(payload);
    } catch {
        return JSON.parse(JSON.stringify(payload));
    }
}

// Mutates `journal` (push) and returns the appended operation.
export function jrAppend(journal, { kind, turnKey = '', payload = null, source = '' } = {}) {
    if (!Array.isArray(journal)) throw new TypeError('jrAppend: journal must be an array');
    const cleanKind = String(kind ?? '').trim().slice(0, JR_KIND_MAX);
    if (!cleanKind) throw new TypeError('jrAppend: kind is required');
    const op = {
        id: jrMakeId(journal),
        kind: cleanKind,
        turnKey: String(turnKey ?? '').slice(0, JR_KEY_MAX),
        payload: jrClonePayload(payload),
        at: Date.now(),
    };
    const cleanSource = String(source ?? '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 32);
    if (cleanSource) op.source = cleanSource;
    journal.push(op);
    return op;
}

function jrKeySet(keys) {
    if (keys === null || keys === undefined) return null;
    if (keys instanceof Set) return keys;
    if (Array.isArray(keys)) return new Set(keys.map(k => String(k ?? '')));
    return new Set([String(keys)]);
}

function jrIsActive(op, activeSet) {
    if (!op || typeof op !== 'object') return false;
    if (!op.turnKey) return true;
    return activeSet === null || activeSet.has(op.turnKey);
}

// Replays operations in insertion order, only those with an active turnKey.
// activeTurnKeys: string[] | Set<string>; null/undefined means "everything is active".
// reducer(acc, op) returns the next accumulator; returning undefined keeps `acc` (mutating reducers).
export function jrReplay(journal, activeTurnKeys, reducer, initial) {
    let acc = initial;
    if (!Array.isArray(journal) || typeof reducer !== 'function') return acc;
    const activeSet = jrKeySet(activeTurnKeys);
    for (const op of journal) {
        if (!jrIsActive(op, activeSet)) continue;
        const next = reducer(acc, op);
        if (next !== undefined) acc = next;
    }
    return acc;
}

function jrUtf8Length(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const next = text.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                bytes += 4;
                i += 1;
            } else {
                bytes += 3;
            }
        } else bytes += 3;
    }
    return bytes;
}

export function jrSizeBytes(journal) {
    if (journal === undefined) return 0;
    let json;
    try {
        json = JSON.stringify(journal);
    } catch {
        return 0;
    }
    return json ? jrUtf8Length(json) : 0;
}

// Cleans the journal IN PLACE and returns the same array:
// 1) removes operations whose turnKey is in deletedTurnKeys;
// 2) while larger than maxBytes, evicts the oldest dead operations (non-empty turnKey not in activeTurnKeys);
// 3) only with evictActive: true, evicts the oldest remaining operations as a last resort.
export function jrGc(journal, {
    deletedTurnKeys = [],
    activeTurnKeys = [],
    maxBytes = JR_MAX_BYTES,
    evictActive = false,
} = {}) {
    if (!Array.isArray(journal)) return journal;
    const deleted = jrKeySet(deletedTurnKeys) || new Set();
    const limit = Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0 ? Number(maxBytes) : JR_MAX_BYTES;

    const kept = journal.filter(op => op && typeof op === 'object' && !(op.turnKey && deleted.has(op.turnKey)));

    let size = jrSizeBytes(kept);
    if (size > limit) {
        const activeSet = jrKeySet(activeTurnKeys) || new Set();
        // Sizes are summed per operation; separators are accounted for with +1 byte each.
        for (let i = 0; i < kept.length && size > limit;) {
            const op = kept[i];
            if (op.turnKey && !activeSet.has(op.turnKey)) {
                size -= jrSizeBytes(op) + 1;
                kept.splice(i, 1);
            } else {
                i += 1;
            }
        }
        if (evictActive) {
            while (kept.length && size > limit) {
                size -= jrSizeBytes(kept[0]) + 1;
                kept.shift();
            }
        }
    }

    journal.splice(0, journal.length, ...kept);
    return journal;
}
