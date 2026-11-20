export const COOP_MAX_DAYS_PER_SYNC = 2;
export const NEST_QUEUE_LIMIT = 10;
const NEST_UID = /^rpn_[a-f0-9]{32}$/;
const NEST_CREATE_KEY = /^nest-[a-f0-9]{32}$/;
const NEST_CODE = /^NEST-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const NEST_ACTIONS = Object.freeze(['feed', 'rest', 'pet', 'play', 'train', 'story_care', 'hatch', 'skin']);
const NEST_HINTS = Object.freeze({
    feed: 'recently fed by co-guardian', rest: 'well-rested with co-guardian', pet: 'recently comforted by co-guardian',
    play: 'recently played with co-guardian', train: 'recently trained with co-guardian',
    story_care: 'recently cared for by co-guardian', hatch: 'recently hatched with co-guardian', skin: 'tended by co-guardian',
});
const NEST_DELTAS = Object.freeze({
    fullnessDelta: [-12, 35], energyDelta: [-15, 40], moodDelta: [-15, 20],
    bondDelta: [0, 8], warmthDelta: [0, 25], daysDelta: [0, COOP_MAX_DAYS_PER_SYNC],
});

export function nestSanitizeLabel(value) {
    const text = String(value ?? '').trim();
    if (/\bsk-[a-z0-9_-]{6,}|\b(?:data|blob|javascript):/iu.test(text)) return '';
    return [...text.replace(/[^\p{L}\p{M}\p{N} '_.’-]/gu, '')].slice(0, 32).join('').trim();
}

function nestInt(value, min, max, fallback = 0) {
    return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback));
}

function nestKey(value) {
    return typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : '';
}

function nestStage(days) {
    return days >= 45 ? 'adult' : days >= 21 ? 'teen' : days >= 7 ? 'child' : 'infant';
}

export function nestPassport(item, kind) {
    // Deliberate projection: never spread the chat, pet's traits, media or turn data.
    if (kind !== 'egg' && kind !== 'companion') throw new Error('invalid_input');
    return {
        kind, name: nestSanitizeLabel(item.name) || 'Companion', archetype: nestKey(item.archetype) || 'familiar_fox',
        speciesKey: nestKey(item.speciesKey), gender: ['male', 'female'].includes(item.gender) ? item.gender : 'neutral',
        ageDays: kind === 'egg' ? 0 : nestInt(item.ageDays, 0, 36500),
        fullness: nestInt(item.fullness, 20, 100, 85), energy: nestInt(item.energy, 20, 100, 90),
        mood: nestInt(item.mood, 20, 100, 85), bond: nestInt(item.bond, 0, 100, 35),
        warmth: nestInt(item.warmth, 0, 100), eggSkin: nestKey(item.eggSkin), rarity: nestKey(item.rarity),
        ...(/^rpr_[A-Za-z0-9_-]{1,44}$/.test(item.relicUid) ? { relicUid: item.relicUid } : {}),
    };
}

export function nestCareBody(raw) {
    if (!NEST_ACTIONS.includes(raw?.action)) throw new Error('invalid_input');
    const body = { action: raw.action };
    for (const [key, [lo, hi]] of Object.entries(NEST_DELTAS)) {
        const value = nestInt(raw[key], lo, hi);
        if (value) body[key] = value;
    }
    if (raw.action === 'hatch') {
        body.hatch = true;
        if (nestSanitizeLabel(raw.name)) body.name = nestSanitizeLabel(raw.name);
    }
    if (raw.action === 'skin') {
        body.eggSkin = nestKey(raw.eggSkin);
        if (!body.eggSkin) throw new Error('invalid_input');
    }
    return body;
}

function nestSafeEvent(event) {
    if (!NEST_ACTIONS.includes(event?.action) || !['owner', 'partner'].includes(event.actorRole)
        || !Number.isSafeInteger(event.seq) || event.seq < 1) return null;
    const out = { action: event.action, seq: event.seq, actorRole: event.actorRole, at: nestInt(event.at, 0, Number.MAX_SAFE_INTEGER) };
    for (const [key, [lo, hi]] of Object.entries(NEST_DELTAS)) {
        const v = nestInt(event[key], lo, hi);
        if (v) out[key] = v;
    }
    return out;
}

export function nestLinkFields(raw) {
    const carried = raw.cradleRemoteLabel === true ? { cradleRemoteLabel: true } : {};
    if (!NEST_UID.test(raw.sharedNestUid) || !['owner', 'partner'].includes(raw.sharedRole)) {
        if (typeof raw.nestCreateKey === 'string' && NEST_CREATE_KEY.test(raw.nestCreateKey)) carried.nestCreateKey = raw.nestCreateKey;
        return carried;
    }
    return {
        ...carried, sharedNestUid: raw.sharedNestUid, sharedRole: raw.sharedRole,
        sharedRev: nestInt(raw.sharedRev, 1, Number.MAX_SAFE_INTEGER, 1),
        sharedPartnerAlias: nestSanitizeLabel(raw.sharedPartnerAlias),
        lastSeenEventSeq: nestInt(raw.lastSeenEventSeq, 0, Number.MAX_SAFE_INTEGER),
        nestHint: NEST_ACTIONS.includes(raw.nestHint) ? raw.nestHint : '',
        nestEvents: (Array.isArray(raw.nestEvents) ? raw.nestEvents.slice(-3).map(nestSafeEvent).filter(Boolean) : []),
        nestCanRotate: raw.nestCanRotate === true,
        ...(NEST_CODE.test(raw.nestInvite) ? { nestInvite: raw.nestInvite } : {}),
    };
}

export function nestPrefsFields(raw) {
    const ops = [];
    for (const op of Array.isArray(raw.pendingNestOps) ? raw.pendingNestOps.slice(0, NEST_QUEUE_LIMIT) : []) {
        if (!NEST_UID.test(op?.uid) || !['owner', 'partner'].includes(op.role) || !/^nest-[a-f0-9]{32,64}$/.test(op.key)) continue;
        try { ops.push({ uid: op.uid, key: op.key, role: op.role, care: nestCareBody(op.care) }); } catch { /* invalid local record */ }
    }
    return { guardianAlias: nestSanitizeLabel(raw.guardianAlias), pendingNestOps: ops };
}

export function nestHintFor(item) {
    return item.sharedNestUid && NEST_ACTIONS.includes(item.nestHint) ? NEST_HINTS[item.nestHint] : '';
}

export function nestConsumeHints(companions) {
    let consumed = false;
    for (const item of companions) {
        if (!nestHintFor(item)) continue;
        item.nestHint = '';
        consumed = true;
    }
    return consumed;
}

const NEST_PROMPT_NAME = /^[\p{L}\p{M}\p{N}]+(?:[ '’-][\p{L}\p{M}\p{N}]+){0,2}$/u;
const NEST_PROMPT_BLOCKLIST = /\b(?:system|ignore|instruct\w*|prompt|assistant|developer|user|override|rule\w*|script\w*|roleplay|jailbreak|систем\w*|игнор\w*|инструкц\w*|промпт\w*|правил\w*|забудь\w*|скрипт\w*)\b/iu;

export function nestIsSafePromptName(value) {
    const clean = nestSanitizeLabel(value);
    return Boolean(clean && [...clean].length <= 24 && NEST_PROMPT_NAME.test(clean) && !NEST_PROMPT_BLOCKLIST.test(clean));
}

export function nestPromptName(item, index = 0) {
    if (!item?.sharedNestUid && !item?.cradleRemoteLabel) return item?.name || '';
    const clean = nestSanitizeLabel(item.name);
    return nestIsSafePromptName(clean) ? clean : `Shared companion ${index + 1}`;
}

export function nestProjectCare(item, care) {
    for (const [delta, stat, floor] of [
        ['fullnessDelta', 'fullness', 20], ['energyDelta', 'energy', 20], ['moodDelta', 'mood', 20],
        ['bondDelta', 'bond', 0], ['warmthDelta', 'warmth', 0],
    ]) {
        if (care[delta] && stat in item) item[stat] = nestInt(item[stat] + care[delta], floor, 100);
    }
    if (care.daysDelta && item.stage) {
        item.ageDays = nestInt(item.ageDays + care.daysDelta, 0, 36500);
        const stage = nestStage(item.ageDays);
        if (stage !== item.stage) item.needsStageArt = true;
        item.stage = stage;
    }
    if (care.eggSkin) item.eggSkin = care.eggSkin;
}

export function nestQueueCare(prefs, item, raw, key) {
    const pending = prefs.pendingNestOps || [];
    if (!item.sharedNestUid || pending.some(op => op.uid === item.sharedNestUid && op.key === key)) return false;
    if (pending.some(op => op.uid === item.sharedNestUid && op.care.hatch)) throw new Error('hatch_pending');
    if (pending.length >= NEST_QUEUE_LIMIT) throw new Error('queue_full');
    if (!/^nest-[a-f0-9]{32,64}$/.test(key)) throw new Error('invalid_input');
    const care = nestCareBody(raw);
    prefs.pendingNestOps = [...pending, { uid: item.sharedNestUid, role: item.sharedRole, key, care }];
    nestProjectCare(item, care);
    return true;
}

export async function nestOperationKey(turnKey = '') {
    const bytes = turnKey
        ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(turnKey)))
        : globalThis.crypto.getRandomValues(new Uint8Array(16));
    return 'nest-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function nestStoryOps(companions, delta) {
    const shared = companions.filter(item => item.sharedNestUid);
    if (!shared.length) return [];
    const careList = (Array.isArray(delta.companionCare) ? delta.companionCare : [delta.companionCare]).slice(0, 6);
    return shared.flatMap(item => {
        const ownName = String(item.name || '').toLowerCase();
        const itemIdx = companions.indexOf(item);
        const promptName = nestPromptName(item, itemIdx).toLowerCase();
        const fallbackSlot = `shared companion ${itemIdx + 1}`;
        const mood = nestInt(delta.companionMoodDelta, -15, 15);
        const care = { action: 'story_care', daysDelta: delta.daysElapsed, moodDelta: mood };
        for (const entry of careList) {
            if (!entry || typeof entry !== 'object') continue;
            const target = String(entry.target ?? entry.name ?? '').trim().toLowerCase();
            if (companions.length > 1 && target && !['all', 'both', '*', 'все', 'оба', 'every', promptName, ownName, fallbackSlot, item.archetype, item.speciesKey].includes(target)) continue;
            const bounded = nestCareBody({ ...entry, action: 'story_care', daysDelta: 0, warmthDelta: 0 });
            for (const key of ['fullnessDelta', 'energyDelta', 'bondDelta', 'moodDelta']) care[key] = (care[key] || 0) + (bounded[key] || 0);
            if (!mood && !bounded.moodDelta && (bounded.fullnessDelta >= 8 || bounded.energyDelta >= 15 || bounded.bondDelta >= 2)) care.moodDelta += 4;
        }
        const body = nestCareBody(care);
        return Object.keys(body).length > 1 ? [{ item, care: body }] : [];
    });
}

export function nestSnapshot(raw, current) {
    if (!NEST_UID.test(raw?.nestUid) || !['owner', 'partner'].includes(raw.role) ||
        !Number.isSafeInteger(raw.revision) || raw.revision < 1 || !raw.companion) throw new Error('invalid_input');
    if (current?.sharedNestUid && (current.sharedRole !== raw.role || current.sharedRev > raw.revision)) return null;
    const pet = nestPassport(raw.companion, raw.companion.kind);
    if (pet.kind === 'companion') pet.stage = nestStage(pet.ageDays);
    if (raw.role !== 'owner') delete pet.relicUid;
    const events = Array.isArray(raw.events) ? raw.events.slice(-12).map(nestSafeEvent).filter(Boolean) : [];
    const seq = current?.lastSeenEventSeq ?? raw.revision;
    const newest = events.filter(event => event.seq > seq && event.actorRole !== raw.role).at(-1);
    const { kind, ...publicPet } = pet;
    return { kind, fields: {
        ...publicPet, relicUid: pet.relicUid,
        ...nestLinkFields({
            cradleRemoteLabel: true, sharedNestUid: raw.nestUid, sharedRole: raw.role, sharedRev: raw.revision,
            sharedPartnerAlias: raw.partnerAlias, lastSeenEventSeq: Math.max(seq, ...events.map(e => e.seq)),
            nestHint: newest?.action || current?.nestHint, nestEvents: events, nestCanRotate: raw.canRotate,
            nestInvite: raw.canRotate ? (raw.inviteCode ?? current?.nestInvite) : '',
        }),
        // Also removes the cached invite as soon as a partner joins.
        ...(raw.canRotate ? {} : { nestInvite: '' }),
    } };
}

export function nestDetach(item) {
    if (item.sharedRole === 'partner') delete item.relicUid;
    for (const key of ['sharedNestUid', 'sharedRole', 'sharedRev', 'sharedPartnerAlias', 'lastSeenEventSeq', 'nestHint', 'nestEvents', 'nestInvite', 'nestCanRotate']) {
        delete item[key];
    }
    item.cradleCarry = true;
}

export class nestTransport {
    constructor(api) { this.api = api; }
    async request(suffix = '', { body, key, method = 'POST' } = {}) {
        const data = await this.api.request('/v1/rp/nests' + suffix, {
            method, body, timeout: 12000, ...(key ? { headers: { 'Idempotency-Key': key } } : {}),
        });
        if (data?.success !== true || !Object.hasOwn(data, 'data')) throw new Error('invalid_response');
        return data.data;
    }
    create(guardianAlias, companion, key) { return this.request('', { body: { guardianAlias, companion }, key }); }
    join(guardianAlias, inviteCode, acceptKind) { return this.request('/join', { body: { guardianAlias, inviteCode, acceptKind } }); }
    list() { return this.request('', { method: 'GET' }); }
    care(op) { return this.request('/' + op.uid + '/care', { body: op.care, key: op.key }); }
    rotate(uid) { return this.request('/' + uid + '/invite/rotate'); }
    leave(uid) { return this.request('/' + uid + '/leave'); }
}
