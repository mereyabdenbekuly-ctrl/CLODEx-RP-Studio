import { COMPANION_ARCHETYPES, COMPANION_STAGES, normalizeCompanion } from './companion.js';
import { EGG_SKINS, GA_ARCHETYPES, GA_RARITIES, gaNormalizeEgg } from './gacha.js';

export const GIFT_MAX_BYTES = 4096;
export const GIFT_PREFIX = 'CLXPET1:';
const GIFT_ID = /^gft_[a-f0-9]{16}$/;
const GIFT_FORBIDDEN = /[<>\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]|\bsk-[a-z0-9_-]{6,}|\b(?:data|blob|javascript):|&(?:lt|gt|#\d+|#x[0-9a-f]+);/iu;
const GIFT_FIELDS = ['format', 'version', 'giftId', 'issuedAt', 'fromAlias', 'note', 'kind', 'payload'];
const GIFT_COMMON = ['name', 'archetype', 'rarity', 'eggSkin', 'mutationTrait'];
const GIFT_COMPANION = [...GIFT_COMMON, 'speciesKey', 'gender', 'stage', 'ageDays', 'fullness', 'mood', 'bond', 'energy', 'traits'];
const GIFT_EGG = [...GIFT_COMMON, 'warmth'];

function giftFail(reason = 'invalid') {
    throw new Error(reason);
}

function giftObject(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).every(k => fields.includes(k))) giftFail();
}

function giftText(value, max) {
    if (typeof value !== 'string' || [...value].length > max || GIFT_FORBIDDEN.test(value)) giftFail();
    return value.trim();
}

function giftEnum(value, allowed) {
    if (!allowed.includes(value)) giftFail();
    return value;
}

function giftNumber(value, max) {
    if (!Number.isInteger(value) || value < 0 || value > max) giftFail();
    return value;
}

function giftValidate(capsule) {
    giftObject(capsule, GIFT_FIELDS);
    if (capsule.format !== 'clodex-pet' || capsule.version !== 1 || typeof capsule.giftId !== 'string' || !GIFT_ID.test(capsule.giftId)) giftFail();
    const kind = giftEnum(capsule.kind, ['egg', 'companion']);
    giftNumber(capsule.issuedAt, Number.MAX_SAFE_INTEGER);
    const fromAlias = giftText(capsule.fromAlias ?? '', 32);
    const note = giftText(capsule.note ?? '', 140);
    const p = capsule.payload;
    giftObject(p, kind === 'egg' ? GIFT_EGG : GIFT_COMPANION);
    const payload = {
        name: giftText(p.name, 80),
        archetype: giftEnum(p.archetype, kind === 'egg' ? GA_ARCHETYPES : COMPANION_ARCHETYPES),
    };
    if (p.rarity !== undefined) payload.rarity = giftEnum(p.rarity, GA_RARITIES);
    if (p.eggSkin !== undefined) payload.eggSkin = giftEnum(p.eggSkin, EGG_SKINS.map(s => s.id));
    if (p.mutationTrait !== undefined) payload.mutationTrait = giftText(p.mutationTrait, 120);
    if (kind === 'egg') {
        payload.warmth = giftNumber(p.warmth, 100);
    } else {
        if (typeof p.speciesKey !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(p.speciesKey) || GIFT_FORBIDDEN.test(p.speciesKey)) giftFail();
        payload.speciesKey = p.speciesKey;
        payload.gender = giftEnum(p.gender, ['female', 'male', 'neutral']);
        payload.stage = giftEnum(p.stage, COMPANION_STAGES);
        payload.ageDays = giftNumber(p.ageDays, 36500);
        for (const k of ['fullness', 'mood', 'bond', 'energy']) payload[k] = giftNumber(p[k], 100);
        if (!Array.isArray(p.traits) || p.traits.length > 4) giftFail();
        payload.traits = p.traits.map(v => giftText(v, 44));
    }
    return { format: 'clodex-pet', version: 1, giftId: capsule.giftId, issuedAt: capsule.issuedAt, fromAlias, note, kind, payload };
}

function giftBytesToUrl(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function giftParse(input) {
    const value = String(input ?? '').trim();
    const encoded = value.startsWith(GIFT_PREFIX);
    let bytes;
    if (encoded) {
        const b64 = value.slice(GIFT_PREFIX.length);
        if (b64.length > Math.ceil(GIFT_MAX_BYTES * 4 / 3)) giftFail('tooLarge');
        if (!/^[A-Za-z0-9_-]+$/.test(b64) || b64.length % 4 === 1) giftFail();
        try {
            bytes = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        } catch { giftFail(); }
        if (giftBytesToUrl(bytes) !== b64) giftFail();
    } else {
        if (value.length > GIFT_MAX_BYTES) giftFail('tooLarge');
        bytes = new TextEncoder().encode(value);
    }
    if (bytes.length > GIFT_MAX_BYTES) giftFail('tooLarge');
    let raw;
    try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { giftFail(); }
    return giftValidate(raw);
}

export function giftPackage(entity, kind, { fromAlias = '', note = '', now = Date.now(), cryptoImpl = globalThis.crypto } = {}) {
    if (!entity || entity.hatched) giftFail();
    if (entity.relicUid) giftFail('relic');
    if (entity.sharedNestUid) giftFail('shared');
    giftEnum(kind, ['companion', 'egg']);
    const normalized = kind === 'egg' ? gaNormalizeEgg(entity) : normalizeCompanion(entity);
    const fields = kind === 'egg' ? GIFT_EGG : GIFT_COMPANION;
    const payload = Object.fromEntries(fields.filter(f => normalized[f] !== undefined).map(f => [f, normalized[f]]));
    const id = cryptoImpl.getRandomValues(new Uint8Array(8));
    const giftId = 'gft_' + Array.from(id, b => b.toString(16).padStart(2, '0')).join('');
    const capsule = giftValidate({ format: 'clodex-pet', version: 1, giftId, issuedAt: Math.floor(now / 1000), fromAlias, note, kind, payload });
    const json = JSON.stringify(capsule);
    const bytes = new TextEncoder().encode(json);
    if (bytes.length > GIFT_MAX_BYTES) giftFail('tooLarge');
    return { capsule, json, code: GIFT_PREFIX + giftBytesToUrl(bytes) };
}

export function giftSend(state, prefs, kind, id, options) {
    const list = kind === 'egg' ? prefs.pendingEggs : state.companions;
    const index = list.findIndex(e => e.id === id);
    const { capsule, code } = giftPackage(list[index], kind, options);
    const sent = { giftId: capsule.giftId, name: capsule.payload.name, kind, code, sentAt: capsule.issuedAt };
    list.splice(index, 1);
    if (kind === 'companion') state.cradleRemoved = [...new Set([...(state.cradleRemoved || []), id])].slice(-100);
    prefs.sentGifts = [...(prefs.sentGifts || []), sent].slice(-5);
    return sent;
}

export function giftRedeem(state, prefs, input) {
    const capsule = giftParse(input);
    if (prefs.redeemedGiftIds?.includes(capsule.giftId)) giftFail('alreadyRedeemed');
    // On the sender's device the backup can only be used by explicit recall.
    if (prefs.sentGifts?.some(item => item.giftId === capsule.giftId)) giftFail('sentHere');
    const egg = capsule.kind === 'egg';
    const list = egg ? prefs.pendingEggs : state.companions;
    if (list.some(item => item.id === capsule.giftId)) giftFail('alreadyRedeemed');
    if (list.length >= (egg ? 24 : 6)) giftFail('full');
    const local = { ...capsule.payload, id: capsule.giftId, needsStageArt: true, cradleCarry: true };
    const entity = egg ? gaNormalizeEgg(local) : normalizeCompanion(local);
    list.push(entity);
    prefs.redeemedGiftIds = [...(prefs.redeemedGiftIds || []), capsule.giftId].slice(-100);
    if (capsule.payload.eggSkin && !prefs.unlockedEggSkins?.includes(capsule.payload.eggSkin)) {
        prefs.unlockedEggSkins = [...(prefs.unlockedEggSkins || []), capsule.payload.eggSkin];
    }
    if (state.world) state.world.pendingMemoryHint = egg
        ? 'A gifted egg has arrived in the Cradle.'
        : 'A gifted companion has arrived in the Cradle.';
    return { capsule, entity };
}

export function giftRecallSent(state, prefs, giftId) {
    const sent = (prefs.sentGifts || []).find(item => item.giftId === giftId);
    if (!sent) giftFail();
    const history = prefs.sentGifts;
    prefs.sentGifts = history.filter(item => item !== sent);
    try { return giftRedeem(state, prefs, sent.code); }
    catch (err) {
        prefs.sentGifts = history;
        throw err;
    }
}
