import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

import {
    embedCharacterCardInPng,
    embedRelicInCharacterCard,
    extractCharacterCardFromPng,
    extractRelicFromCharacterCard,
} from '../src/core/pngCard.js';
import {
    REL_PUBLIC_JWK,
    relAttachToCard,
    relBytesToBase64Url,
    relCanonicalPayload,
    relNormalizePublicJwk,
    relPublicBadge,
    relParseSignedPayload,
    relVerifyCard,
    relVerifyCert,
    relVerifyInventory,
} from '../src/core/relic.js';
import { gaHatchEgg, gaQueueVerifiedRelicEgg, gaWarmEgg } from '../src/core/gacha.js';
import { physDecodeSnapshot, physEncodeSnapshot } from '../src/core/physiology.js';

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function certificate() {
    return {
        v: 1,
        iss: 'clodex.xyz',
        relicUid: 'rpr_test001',
        edition: 'ash_seraph_2026',
        serial: 17,
        maxSupply: 100,
        rarity: 'mythic',
        eggSkin: 'seraph_porcelain',
        archetype: 'celestial_wisp',
        genes: { affinity: 'ash', power: 7, nested: { z: true, a: 1 } },
        issuedAt: 1_763_000_000,
    };
}

async function signedCertificate(makePayload = relCanonicalPayload) {
    const pair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    );
    const payload = makePayload(certificate());
    const signature = new Uint8Array(await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        new TextEncoder().encode(payload),
    ));
    const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
    return { payload, signature: relBytesToBase64Url(signature), publicJwk };
}

test('ES256 relic certificates verify and tampering is unverified', async () => {
    const signed = await signedCertificate();
    assert.ok(relNormalizePublicJwk(signed.publicJwk));
    assert.equal(await relVerifyCert(signed.payload, signed.signature, {
        publicJwk: signed.publicJwk,
        cryptoImpl: webcrypto,
    }), true);

    const tamperedSerial = JSON.parse(signed.payload);
    tamperedSerial.serial += 1;
    assert.equal(await relVerifyCert(JSON.stringify(tamperedSerial), signed.signature, {
        publicJwk: signed.publicJwk,
        cryptoImpl: webcrypto,
    }), false);

    const tamperedRarity = JSON.parse(signed.payload);
    tamperedRarity.rarity = 'common';
    assert.equal(await relVerifyCert(JSON.stringify(tamperedRarity), signed.signature, {
        publicJwk: signed.publicJwk,
        cryptoImpl: webcrypto,
    }), false);

    const tamperedGenes = JSON.parse(signed.payload);
    tamperedGenes.genes.power = 999;
    assert.equal(await relVerifyCert(JSON.stringify(tamperedGenes), signed.signature, {
        publicJwk: signed.publicJwk,
        cryptoImpl: webcrypto,
    }), false);
});

test('verify and export the original Go-style JSON, not an equivalent JS serialization', async () => {
    const signed = await signedCertificate(value => relCanonicalPayload({ ...value, genes: { trait: 'Ash & Wings' } }).replace('&', '\\u0026'));
    const options = { publicJwk: signed.publicJwk, cryptoImpl: webcrypto };
    const card = relAttachToCard({ data: { name: 'Ash Seraph' } }, signed.payload, signed.signature);
    const png = embedCharacterCardInPng(Buffer.from(TINY_PNG_B64, 'base64'), card);
    const decoded = extractCharacterCardFromPng(png);
    assert.equal((await relVerifyCard(decoded, options)).verified, true);
    assert.equal((await relVerifyCard(decoded, { cryptoImpl: webcrypto })).verified, false);
    assert.equal(await relVerifyCert(JSON.stringify(JSON.parse(signed.payload)), signed.signature, options), false);
    assert.equal(relParseSignedPayload(signed.payload).genes.trait, 'Ash & Wings');
});

test('purchased relic claims survive hatching and a chat checkpoint without duplicating the egg', async () => {
    const signed = await signedCertificate();
    const options = { publicJwk: signed.publicJwk, cryptoImpl: webcrypto };
    const inventory = await relVerifyInventory([
        { payload: signed.payload, sig: signed.signature, verified: false },
        { payload: signed.payload.replace('17', '18'), sig: signed.signature, verified: true },
    ], options);
    assert.equal(inventory.size, 1);
    const { claims } = inventory.get('rpr_test001');
    const queued = gaQueueVerifiedRelicEgg({}, claims);
    assert.equal(queued.ok, true);
    assert.equal(gaQueueVerifiedRelicEgg(queued.prefs, claims).ok, false);
    const warmed = gaWarmEgg(queued.prefs, queued.egg.id, 100);
    const hatched = gaHatchEgg(warmed.prefs, queued.egg.id);
    assert.equal(hatched.ok, true);
    assert.equal(gaQueueVerifiedRelicEgg(hatched.prefs, claims).reason, 'already_added');
    const { companions } = physDecodeSnapshot(physEncodeSnapshot({ companions: [{ ...hatched.egg, id: 'comp-ash' }] }));
    assert.equal(companions[0].relicUid, claims.relicUid);
    assert.equal(companions[0].rarity, claims.rarity);
    assert.equal(companions[0].eggSkin, claims.eggSkin);
});

test('malformed JWK, signature, JSON, and badges never become verified', async () => {
    const signed = await signedCertificate();
    assert.equal(relNormalizePublicJwk({ ...signed.publicJwk, x: 'bad!' }), null);
    assert.equal(relNormalizePublicJwk({ ...signed.publicJwk, alg: 'RS256' }), null);
    assert.equal(await relVerifyCert(signed.payload, 'not-a-signature', {
        publicJwk: signed.publicJwk,
        cryptoImpl: webcrypto,
    }), false);
    assert.equal(await relVerifyCert('{broken', signed.signature, {
        publicJwk: signed.publicJwk,
        cryptoImpl: webcrypto,
    }), false);
    assert.equal(relPublicBadge('{broken', true), 'Unverified custom pet');
    assert.equal(relPublicBadge(signed.payload, false), 'Unverified custom pet');
});

test('relic extension survives PNG CCv2 card round-trip', () => {
    const payload = relCanonicalPayload(certificate());
    const card = embedRelicInCharacterCard({ data: { name: 'Ash Seraph' } }, payload, 'signature');
    const embedded = embedCharacterCardInPng(Buffer.from(TINY_PNG_B64, 'base64'), card);
    const extracted = extractCharacterCardFromPng(embedded);
    assert.deepEqual(extractRelicFromCharacterCard(extracted), { payload, sig: 'signature' });
});

test('pinned production clodex.xyz REL_PUBLIC_JWK is frozen and WebCrypto-importable', async () => {
    assert.ok(REL_PUBLIC_JWK && Object.isFrozen(REL_PUBLIC_JWK));
    const normalized = relNormalizePublicJwk(REL_PUBLIC_JWK);
    assert.ok(normalized);
    assert.equal(normalized.alg, 'ES256');
    assert.equal(normalized.crv, 'P-256');
    const imported = await webcrypto.subtle.importKey(
        'jwk',
        normalized,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
    );
    assert.equal(imported.type, 'public');
});

