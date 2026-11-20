import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanionFromArchetype } from '../src/core/companion.js';
import { gaNormalizeEgg, gaNormalizePrefs } from '../src/core/gacha.js';
import { GIFT_MAX_BYTES, GIFT_PREFIX, giftPackage, giftParse, giftRecallSent, giftRedeem, giftSend } from '../src/core/gift.js';
import { createChatState, restoreCheckpointBefore, saveCheckpoint } from '../src/core/physiology.js';

const giftSkin = 'obsidian_kintsugi';
const giftFixture = () => ({
    ...createCompanionFromArchetype('familiar_fox', { customName: 'Кицу' }),
    eggSkin: giftSkin, portraitPath: '/private/portrait.png', videoPath: '/private/video.mp4',
    videoTaskId: 'private-task', artPath: '/private/art.png',
});
const giftEggFixture = () => ({
    ...gaNormalizeEgg({ id: 'egg-gift', archetype: 'familiar_fox', eggSkin: giftSkin, name: 'Лисёнок', warmth: 43 }),
    artPath: '/private/egg.png',
});

for (const [kind, fixture] of [['companion', giftFixture], ['egg', giftEggFixture]]) {
    test(`CLXPET1 and .clodex-pet round-trip a ${kind}, without paths or ownership`, () => {
        const original = fixture();
        const { code, json, capsule } = giftPackage(original, kind, { fromAlias: 'Лидия', note: 'Для тебя', now: 1795180000000 });
        assert.ok(code.startsWith(GIFT_PREFIX));
        assert.ok(Buffer.byteLength(json, 'utf8') <= GIFT_MAX_BYTES);
        assert.deepEqual(giftParse(code), capsule);
        assert.deepEqual(giftParse(json), capsule);
        for (const field of ['id', 'portraitPath', 'videoPath', 'videoTaskId', 'artPath', 'relicUid', 'sharedNestUid']) {
            assert.equal(Object.hasOwn(capsule.payload, field), false, field);
        }
        assert.equal(capsule.fromAlias, 'Лидия');
        assert.equal(capsule.note, 'Для тебя');
        assert.throws(() => giftPackage({ ...original, relicUid: 'rpr_private' }, kind), /relic/);
        assert.throws(() => giftPackage({ ...original, sharedNestUid: 'rpn_' + '1'.repeat(32) }, kind), /shared/);
        const prefs = gaNormalizePrefs({});
        const state = createChatState('2026-11-20');
        const { entity } = giftRedeem(state, prefs, code);
        assert.equal(entity.name, original.name);
        assert.equal(entity.eggSkin, giftSkin);
        assert.equal(entity.needsStageArt, true);
        assert.deepEqual(prefs.unlockedEggSkins, [giftSkin]);
        assert.equal((kind === 'companion' ? state.companions : prefs.pendingEggs)[0], entity);
        assert.match(state.world.pendingMemoryHint, /gifted/);
        assert.throws(() => giftRedeem(state, prefs, json), /alreadyRedeemed/);
    });
}

test('Send removes the active pet even after a local swipe; explicit recall consumes the same backup locally', () => {
    const state = createChatState('2026-11-20');
    const prefs = gaNormalizePrefs({});
    const original = giftFixture();
    state.companions.push(original);
    saveCheckpoint(state, '1:0');
    const sent = giftSend(state, prefs, 'companion', original.id);
    assert.deepEqual(state.companions, []);
    assert.deepEqual(prefs.sentGifts, [sent]);
    assert.throws(() => giftRedeem(state, prefs, sent.code), /sentHere/);
    saveCheckpoint(state, '2:0');
    assert.equal(restoreCheckpointBefore(state, '2:0'), true);
    assert.deepEqual(state.companions, []);
    const restored = giftRecallSent(state, prefs, sent.giftId);
    assert.equal(restored.entity.name, original.name);
    assert.deepEqual(prefs.sentGifts, []);
    assert.deepEqual(prefs.redeemedGiftIds, [sent.giftId]);
    assert.throws(() => giftRedeem(state, prefs, sent.code), /alreadyRedeemed/);
});

test('Sending an egg removes it from the Altar; a full recipient retains its inventory and can retry later', () => {
    const state = createChatState('2026-11-20');
    const prefs = gaNormalizePrefs({ pendingEggs: [giftEggFixture()] });
    const sent = giftSend(state, prefs, 'egg', 'egg-gift');
    assert.equal(prefs.pendingEggs.length, 0);
    const recipient = gaNormalizePrefs({ pendingEggs: Array.from({ length: 24 }, (_, i) => ({ ...giftEggFixture(), id: 'egg-' + i })) });
    assert.throws(() => giftRedeem(state, recipient, sent.code), /full/);
    assert.equal(recipient.pendingEggs.length, 24);
    assert.deepEqual(recipient.redeemedGiftIds, []);
    recipient.pendingEggs.pop();
    giftRedeem(state, recipient, sent.code);
    assert.equal(recipient.pendingEggs.length, 24);
});

test('Capsules reject markup, active URLs, secrets, invalid types, overflowing UTF-8, and non-canonical Base64', () => {
    const { capsule } = giftPackage(giftFixture(), 'companion');
    for (const note of ['<script>script()</script>', '<b>html</b>', '&#60;script', 'note\nsk-fixturesecret1234', 'sk-fixturesecret1234',
        'data:text/plain,abc', 'blob:https://example.test/a', 'javascript:alert(1)', 'hello\u202efriend']) {
        assert.throws(() => giftParse(JSON.stringify({ ...capsule, note })), /invalid/);
    }
    assert.throws(() => giftParse(JSON.stringify({ ...capsule, giftId: [capsule.giftId] })), /invalid/);
    assert.throws(() => giftParse(JSON.stringify({ ...capsule, payload: { ...capsule.payload, portraitPath: 'x' } })), /invalid/);
    assert.throws(() => giftParse(JSON.stringify({ ...capsule, note: '🐈'.repeat(1100) })), /tooLarge/);
    for (const b64 of ['aaa=', 'b', 'ab', '!', '_w']) assert.throws(() => giftParse(GIFT_PREFIX + b64), /invalid/);
});
