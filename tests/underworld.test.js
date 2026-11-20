import assert from 'node:assert/strict';
import test from 'node:test';

import { gaCreateSummon } from '../src/core/gacha.js';
import { jrTurnKey } from '../src/core/journal.js';
import { phoneCreateStore, phoneGc, phoneIngestEvents, phoneView } from '../src/core/phone.js';
import { createChatState, restoreCheckpointExact, saveCheckpoint } from '../src/core/physiology.js';
import {
    UW_PRESET_VALUES,
    uwBlackjackAction,
    uwCardLabel,
    uwCreateState,
    uwHandTotal,
    uwOnTurnCommitted,
    uwPawnCollateral,
    uwPawnInventoryItem,
    uwRedeemCollateral,
    uwRollDice,
    uwStartBlackjack,
    uwTakeLoan,
} from '../src/core/underworld.js';

test('A → B → A restores the loan and SMS only on A without rolling back global summons', () => {
    const state = createChatState('2026-11-19');
    const phone = phoneCreateStore();
    const first = jrTurnKey(1, 0);
    const a = jrTurnKey(2, 0);
    const b = jrTurnKey(2, 1);
    saveCheckpoint(state, first);

    const roll = uwRollDice(state.underworld, { bet: 100, side: 'over', rng: () => 0 });
    assert.equal(roll.win, false);
    assert.equal(state.underworld.cash, 400);
    assert.equal(uwTakeLoan(state.underworld, 60).ok, true);
    const notices = uwOnTurnCommitted(state.underworld, {
        t: (key, data) => data ? `${key}: ${data.debt}` : key,
    });
    phoneIngestEvents(phone, notices, a, { source: 'collector' });
    const summon = gaCreateSummon({}, { cash: state.underworld.cash, cost: 50, rng: () => 0.4 });
    assert.equal(summon.ok, true);
    const globalPrefs = summon.prefs;
    state.underworld.cash = summon.cash;
    saveCheckpoint(state, a);
    const walletA = structuredClone(state.underworld);
    const inboxA = phoneView(phone, [first, a]);
    assert.equal(inboxA.entries.length, 1);
    assert.match(inboxA.entries[0].text, /60/);

    assert.equal(restoreCheckpointExact(state, first), true);
    saveCheckpoint(state, b);
    assert.equal(state.underworld.cash, 500);
    assert.equal(state.underworld.debt, 0);
    assert.deepEqual(phoneView(phone, [first, b]).entries, []);

    assert.equal(restoreCheckpointExact(state, a), true);
    assert.deepEqual(state.underworld, walletA);
    assert.deepEqual(phoneView(phone, [first, a]), inboxA);
    phoneGc(phone, { deletedTurnKeys: [a], activeTurnKeys: [first, b] });
    assert.equal(phoneView(phone, [first, a]).entries.length, 0);
    assert.equal(globalPrefs.ssrPity, 1);
    assert.deepEqual(globalPrefs.unlockedEggSkins, [summon.egg.eggSkin]);
});

test('Continuous debt emits collector DMs on turns 1-3, voice threat on turn 3 with 15% interest, and next notice on turn 6', () => {
    const uw = uwCreateState({ skin: 'crime', cash: 500 });
    assert.equal(uwTakeLoan(uw, 1000).ok, true);
    const t = (key, data) => (data ? `${key}(${data.currency}${data.debt})` : key);

    const turn1 = uwOnTurnCommitted(uw, { skin: 'crime', t, rng: () => 0.99 });
    assert.equal(uw.turnsInDebt, 1);
    assert.equal(uw.collectorNotices, 1);
    assert.deepEqual(turn1.map(e => e.kind), ['dm']);

    const turn2 = uwOnTurnCommitted(uw, { skin: 'crime', t, rng: () => 0.99 });
    assert.equal(uw.turnsInDebt, 2);
    assert.equal(uw.collectorNotices, 2);
    assert.deepEqual(turn2.map(e => e.kind), ['dm']);

    const turn3 = uwOnTurnCommitted(uw, { skin: 'crime', t, rng: () => 0.99 });
    assert.equal(uw.turnsInDebt, 3);
    assert.equal(uw.debt, 1150);
    assert.equal(uw.collectorNotices, 3);
    assert.deepEqual(turn3.map(e => e.kind), ['dm', 'voice']);
    assert.match(turn3[0].text, /\$1150/);
    assert.equal(turn3[1].text, 'uw.collectorVoice');
    assert.match(turn3[1].mediaPrompt, /\$1150/);

    assert.deepEqual(uwOnTurnCommitted(uw, { skin: 'crime', t, rng: () => 0.99 }), []);
    assert.deepEqual(uwOnTurnCommitted(uw, { skin: 'crime', t, rng: () => 0.99 }), []);

    const turn6 = uwOnTurnCommitted(uw, { skin: 'crime', t, rng: () => 0.99 });
    assert.equal(uw.turnsInDebt, 6);
    assert.equal(uw.debt, Math.ceil(1150 * 115 / 100));
    assert.deepEqual(turn6.map(e => e.kind), ['dm']);
});

test('UW_PRESET_VALUES, uwHandTotal, and inventory pawning/redeeming round-trip cleanly', () => {
    assert.ok(Object.isFrozen(UW_PRESET_VALUES));
    assert.equal(UW_PRESET_VALUES.apartment, 15000);
    assert.equal(UW_PRESET_VALUES.business, 8000);
    assert.equal(UW_PRESET_VALUES.car, 3500);
    assert.equal(UW_PRESET_VALUES.watch, 900);

    // Soft vs hard ace Blackjack hand totals + Double action
    assert.equal(uwHandTotal([]), 0);
    assert.equal(uwHandTotal([0, 8]), 20); // A♠ + 9♠ = 20
    assert.equal(uwHandTotal([0, 8, 9]), 20); // A♠ + 9♠ + 10♠ = 20 (soft ace drops to 1)
    assert.equal(uwCardLabel(0), 'A♠');

    const bjUw = uwCreateState({ cash: 500 });
    const started = uwStartBlackjack(bjUw, { bet: 100, rng: () => 0.5 });
    assert.equal(started.ok, true);
    if (started.status === 'playing') {
        assert.equal(uwHandTotal(started.session.player), started.playerTotal);
        const finished = uwBlackjackAction(bjUw, started.session, 'double');
        assert.equal(finished.ok, true);
        assert.equal(uwHandTotal(finished.session.dealer), finished.dealerTotal);
    }

    // Preset collateral + inventory pawning & redeeming
    const uw = uwCreateState({ skin: 'crime', cash: 3000 });
    const presetRes = uwPawnCollateral(uw, {
        kind: 'preset',
        presetKey: 'apartment',
        label: 'Квартира',
        pawnValue: UW_PRESET_VALUES.apartment,
    }, { skin: 'crime' });
    assert.equal(presetRes.ok, true);
    assert.equal(presetRes.collateral.pawnValue, 15000);
    assert.equal(presetRes.collateral.redeemCost, Math.ceil(15000 * 1.15));

    const userInventory = ['Silver Pocket Watch (Heirloom)', 'Brass Key'];
    const missing = uwPawnInventoryItem(uw, userInventory, 'Nonexistent Relic', 400);
    assert.equal(missing.ok, false);
    assert.equal(userInventory.length, 2);

    const blockedChar = uwPawnInventoryItem(uw, ['Father Matteo'], 'Father Matteo', 400, { charName: 'Father Matteo' });
    assert.equal(blockedChar.ok, false);
    assert.equal(blockedChar.reason, 'unsafe_label');

    const pawned = uwPawnInventoryItem(uw, userInventory, 'Silver Pocket Watch (Heirloom)', 600, { skin: 'crime' });
    assert.equal(pawned.ok, true);
    assert.equal(pawned.collateral.kind, 'inventory');
    assert.equal(pawned.collateral.inventoryLabel, 'Silver Pocket Watch (Heirloom)');
    assert.deepEqual(userInventory, ['Brass Key']);

    // Redeem with userInventory restores exact inventoryLabel
    const redeemed = uwRedeemCollateral(uw, pawned.collateral.id, userInventory);
    assert.equal(redeemed.ok, true);
    assert.deepEqual(userInventory, ['Brass Key', 'Silver Pocket Watch (Heirloom)']);

    // Backward compatibility when userInventory is omitted
    const redeemedPreset = uwRedeemCollateral(uw, presetRes.collateral.id);
    assert.equal(redeemedPreset.ok, true);
});
