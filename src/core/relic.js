// R1: offline ES256 verification and read-only relic sync helpers.

export const REL_CERT_VERSION = 1;
// Replaced by the packager only from the operator-provided public key. Neither
// a downloaded catalogue nor a card/prefs file can appoint its own verifier.
export const REL_PUBLIC_JWK = /* rel:public-key */ null;

function relBase64UrlToBytes(value) {
    const raw = String(value ?? '');
    if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid base64url value.');
    const text = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
    if (typeof atob === 'function') {
        const binary = atob(padded);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
        return out;
    }
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(padded, 'base64'));
    throw new Error('Base64 decoder unavailable.');
}

export function relBytesToBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function relDecodeFixedBase64Url(value, expectedLength) {
    const bytes = relBase64UrlToBytes(value);
    if (bytes.length !== expectedLength) throw new Error('Invalid fixed-length base64url value.');
    return bytes;
}

/** Return a safe, immutable-ish ES256 JWK or null for any malformed input. */
export function relNormalizePublicJwk(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.hasOwn(value, 'd')) return null;
    const kty = String(value.kty ?? '').trim();
    const crv = String(value.crv ?? '').trim();
    const x = String(value.x ?? '').trim();
    const y = String(value.y ?? '').trim();
    if (kty !== 'EC' || crv !== 'P-256') return null;
    if (value.alg !== undefined && String(value.alg).trim() !== 'ES256') return null;
    if (value.use !== undefined && String(value.use).trim() !== 'sig') return null;
    try {
        relDecodeFixedBase64Url(x, 32);
        relDecodeFixedBase64Url(y, 32);
    } catch {
        return null;
    }
    return Object.freeze({
        kty,
        crv,
        x,
        y,
        alg: 'ES256',
        use: 'sig',
        ext: true,
    });
}

function relCleanText(value, max = 256) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function relStableValue(value) {
    if (Array.isArray(value)) return value.map(relStableValue);
    if (!value || typeof value !== 'object') return value;
    const out = Object.create(null);
    for (const key of Object.keys(value).sort()) out[key] = relStableValue(value[key]);
    return out;
}

export function relParseSignedPayload(payload) {
    if (typeof payload !== 'string' || payload.length > 16_384) throw new Error('Invalid certificate payload.');
    const fields = JSON.parse(payload);
    if (!fields || fields.v !== REL_CERT_VERSION || fields.iss !== 'clodex.xyz'
        || typeof fields.relicUid !== 'string' || !/^rpr_[A-Za-z0-9]{1,44}$/.test(fields.relicUid)
        || typeof fields.edition !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(fields.edition)
        || !Number.isSafeInteger(fields.serial) || fields.serial < 1
        || !Number.isSafeInteger(fields.maxSupply) || fields.maxSupply < fields.serial
        || !['ssr', 'mythic'].includes(fields.rarity)
        || typeof fields.eggSkin !== 'string' || !/^[a-z0-9_]{1,48}$/.test(fields.eggSkin)
        || typeof fields.archetype !== 'string' || !/^[a-z0-9_]{1,48}$/.test(fields.archetype)
        || !fields.genes || typeof fields.genes !== 'object' || Array.isArray(fields.genes)
        || !Number.isSafeInteger(fields.issuedAt) || fields.issuedAt <= 0) {
        throw new Error('Invalid certificate payload fields.');
    }
    return fields;
}

export function relCanonicalPayload(payload) {
    if (typeof payload === 'string') {
        // Verify and preserve the exact UTF-8 bytes signed by Go. JS and Go can
        // serialize the same JSON differently (escaping, integer-like gene keys).
        relParseSignedPayload(payload);
        return payload;
    }
    const source = payload;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid certificate payload.');
    const read = (camel, snake = camel) => source[camel] ?? source[snake];
    let genes = read('genes');
    if (typeof genes === 'string') {
        try { genes = JSON.parse(genes); } catch { throw new Error('Invalid certificate genes.'); }
    }
    if (!genes || typeof genes !== 'object' || Array.isArray(genes)) throw new Error('Invalid certificate genes.');
    const ordered = {
        v: Number(read('v') ?? REL_CERT_VERSION),
        iss: relCleanText(read('iss') || 'clodex.xyz', 64),
        relicUid: relCleanText(read('relicUid', 'relic_uid'), 48),
        edition: relCleanText(read('edition', 'edition_key'), 64),
        serial: Number(read('serial', 'serial_number') || 0),
        maxSupply: Number(read('maxSupply', 'max_supply') || 0),
        rarity: relCleanText(read('rarity'), 24),
        eggSkin: relCleanText(read('eggSkin', 'egg_skin'), 48),
        archetype: relCleanText(read('archetype'), 48),
        genes: relStableValue(genes),
        issuedAt: Number(read('issuedAt', 'issued_at') || 0),
    };
    const canonical = JSON.stringify(ordered);
    relParseSignedPayload(canonical);
    return canonical;
}

export function relDecodeSignature(signature) {
    const bytes = relBase64UrlToBytes(signature);
    if (bytes.length !== 64) throw new Error('Invalid ES256 signature length.');
    return bytes;
}

export async function relVerifyCert(certPayload, certSignature, { publicJwk = REL_PUBLIC_JWK, cryptoImpl = globalThis.crypto } = {}) {
    try {
        relParseSignedPayload(certPayload);
        const sig = relDecodeSignature(certSignature);
        const normalizedJwk = relNormalizePublicJwk(publicJwk);
        if (!normalizedJwk || !cryptoImpl?.subtle) return false;
        const key = await cryptoImpl.subtle.importKey('jwk', normalizedJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return await cryptoImpl.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(certPayload));
    } catch {
        return false;
    }
}

export function relAttachToCard(cardObject, certPayload, certSignature) {
    const card = cardObject && typeof cardObject === 'object' ? cardObject : {};
    if (!card.data || typeof card.data !== 'object') card.data = {};
    if (!card.data.extensions || typeof card.data.extensions !== 'object') card.data.extensions = {};
    card.data.extensions.clodex_rp_relic = {
        payload: relCanonicalPayload(certPayload),
        sig: relCleanText(certSignature, 256),
    };
    return card;
}

export function relReadFromCard(cardObject) {
    const value = cardObject?.data?.extensions?.clodex_rp_relic;
    if (!value || typeof value !== 'object') return null;
    if (!value.payload || !value.sig) return null;
    return { payload: String(value.payload), sig: String(value.sig) };
}

export async function relVerifyCard(cardObject, options = {}) {
    const relic = relReadFromCard(cardObject);
    if (!relic) return { verified: false, relic: null };
    return { verified: await relVerifyCert(relic.payload, relic.sig, options), relic };
}

export function relPublicBadge(certPayload, verified) {
    if (verified !== true) return 'Unverified custom pet';
    try {
        const payload = JSON.parse(relCanonicalPayload(certPayload));
        return `✦ Verified Relic #${String(payload.serial).padStart(4, '0')} / ${payload.maxSupply}`;
    } catch {
        return 'Unverified custom pet';
    }
}

export async function relSyncCatalog(api, signal) {
    if (!api?.rpRelicCatalog) return { editions: [], publicKeyJwk: null, unavailable: true };
    try {
        const payload = await api.rpRelicCatalog(signal);
        const publicKeyJwk = relNormalizePublicJwk(payload?.publicKeyJwk || payload?.public_key_jwk);
        return { editions: Array.isArray(payload?.editions) ? payload.editions : Array.isArray(payload?.data) ? payload.data : [], publicKeyJwk, unavailable: false };
    } catch {
        return { editions: [], publicKeyJwk: null, unavailable: true };
    }
}

export async function relSyncInventory(api, signal, { publicJwk = REL_PUBLIC_JWK } = {}) {
    if (!api?.rpRelicInventory) return { relics: [], unavailable: true };
    try {
        const payload = await api.rpRelicInventory(signal);
        const source = Array.isArray(payload?.relics) ? payload.relics : Array.isArray(payload?.data) ? payload.data : [];
        const relics = await Promise.all(source.map(async (raw) => {
            const item = raw && typeof raw === 'object' ? { ...raw } : {};
            const certPayload = item.certPayload ?? item.cert_payload ?? item.payload;
            const certSignature = item.certSignature ?? item.cert_signature ?? item.sig;
            item.payload = typeof certPayload === 'string' ? certPayload : '';
            item.sig = typeof certSignature === 'string' ? certSignature : '';
            const verified = await relVerifyCert(item.payload, item.sig, { publicJwk });
            return { payload: item.payload, sig: item.sig, verified };
        }));
        return { relics, unavailable: false };
    } catch {
        return { relics: [], unavailable: true };
    }
}

export async function relVerifyInventory(relics, options = {}) {
    const results = await Promise.all(relics.map(async ({ payload, sig }) => {
        if (!await relVerifyCert(payload, sig, options)) return null;
        const claims = relParseSignedPayload(payload);
        return [claims.relicUid, { payload, sig, claims }];
    }));
    return new Map(results.filter(Boolean));
}

export function relMintUrl(editionKey) {
    const edition = encodeURIComponent(String(editionKey || '').slice(0, 64));
    return `https://clodex.xyz/console/rp-relics?edition=${edition}`;
}

