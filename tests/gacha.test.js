import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildCompanionPortraitPrompt,
    createCompanionFromArchetype,
    createCompanionFromOffspring,
    equipCompanionEggSkin,
} from '../src/core/companion.js';
import {
    EGG_SKINS,
    GA_PITY_SSR,
    gaApplyPity,
    gaCreateSummon,
    gaEquipSkinOnEgg,
    gaRollRarity,
} from '../src/core/gacha.js';
import {
    createChatState,
    equipNestEggSkin,
    hatchReadyEggs,
    layEggs,
    normalizeChatState,
    normalizeEntity,
    physDecodeSnapshot,
    physEncodeSnapshot,
    triggerConception,
} from '../src/core/physiology.js';

test('the 30th summon after no SSR resets the counter and guarantees SSR or Mythic', () => {
    const rng = () => 0.4;
    let prefs = {};
    for (let roll = 1; roll < GA_PITY_SSR; roll += 1) {
        const rarity = gaRollRarity(prefs, { rng });
        assert.ok(['common', 'rare', 'epic'].includes(rarity));
        if (roll % 10 === 0) assert.equal(rarity, 'epic');
        prefs = gaApplyPity(prefs, rarity);
    }
    assert.equal(prefs.ssrPity, 29);
    assert.equal(gaRollRarity(prefs, { rng }), 'ssr');
    assert.equal(gaRollRarity(prefs, { rng: () => 0.1 }), 'mythic');
    assert.equal(gaApplyPity(prefs, 'ssr').ssrPity, 0);
});

test('gaEquipSkinOnEgg equips unlocked skins on pending unhatched eggs and rejects locked or invalid skins', () => {
    const summoned = gaCreateSummon({ unlockedEggSkins: ['seraph_porcelain', 'lunar_jade'] }, {
        cash: 200,
        cost: 50,
        rng: () => 0.25,
    });
    assert.equal(summoned.ok, true);
    const eggId = summoned.egg.id;

    assert.equal(gaEquipSkinOnEgg(summoned.prefs, eggId, 'not_a_real_skin').ok, false);
    assert.equal(gaEquipSkinOnEgg(summoned.prefs, eggId, 'not_a_real_skin').reason, 'invalid_skin');
    assert.equal(gaEquipSkinOnEgg(summoned.prefs, eggId, 'astral_nebula').ok, false);
    assert.equal(gaEquipSkinOnEgg(summoned.prefs, eggId, 'astral_nebula').reason, 'skin_locked');
    assert.equal(gaEquipSkinOnEgg(summoned.prefs, 'missing-egg', 'seraph_porcelain').reason, 'egg_not_found');

    const equipped = gaEquipSkinOnEgg(summoned.prefs, eggId, 'seraph_porcelain');
    assert.equal(equipped.ok, true);
    assert.equal(equipped.egg.eggSkin, 'seraph_porcelain');
    assert.equal(equipped.prefs.pendingEggs[0].eggSkin, 'seraph_porcelain');
});

test('equipCompanionEggSkin updates companion skin, marks needsStageArt, and weaves skin motif into portrait prompt', () => {
    const comp = createCompanionFromArchetype('familiar_fox', { customName: 'Kitsune', locale: 'en' });
    comp.needsStageArt = false;

    assert.equal(equipCompanionEggSkin(comp, 'unknown_skin', ['obsidian_kintsugi']).ok, false);
    assert.equal(equipCompanionEggSkin(comp, 'solar_halo', ['obsidian_kintsugi']).reason, 'skin_locked');
    assert.equal(comp.needsStageArt, false);

    const res = equipCompanionEggSkin(comp, 'obsidian_kintsugi', ['obsidian_kintsugi']);
    assert.equal(res.ok, true);
    assert.equal(comp.eggSkin, 'obsidian_kintsugi');
    assert.equal(comp.needsStageArt, true);

    const skinObj = EGG_SKINS.find(s => s.id === 'obsidian_kintsugi');
    const prompt = buildCompanionPortraitPrompt(comp, {
        charName: 'Beatrice',
        charDescription: 'Tall golden-haired guide in crimson silk robes with radiant eyes.',
        userName: 'Dante',
    });
    const wordCount = prompt.trim().split(/\s+/).length;
    assert.ok(wordCount >= 60 && wordCount <= 110, `Expected 60..110 words, got ${wordCount}`);
    assert.ok(prompt.includes(skinObj.name));
    assert.match(prompt, /golden kintsugi seams/i);
});

test('equipNestEggSkin preserves eggSkin across normalizeEntity / snapshots and propagates to hatched offspring & companion', () => {
    const state = createChatState('2026-11-20');
    state.world.enableAdultBiology = true;
    const char = state.entities.char;
    char.bio.mode = 'oviposition';
    assert.equal(triggerConception(char, state, { rng: () => 0.4, force: true }), true);
    assert.ok(layEggs(char, state, null) >= 2);

    assert.equal(equipNestEggSkin(char.bio, 0, 'dragon_amber', ['lunar_jade']).reason, 'skin_locked');
    assert.equal(equipNestEggSkin(char.bio, 0, 'bad_skin', ['dragon_amber']).reason, 'invalid_skin');
    assert.equal(equipNestEggSkin(char.bio, 99, 'dragon_amber', ['dragon_amber']).reason, 'egg_not_found');

    const equipped = equipNestEggSkin(char.bio, 0, 'dragon_amber', ['dragon_amber']);
    assert.equal(equipped.ok, true);
    assert.equal(char.bio.nest.eggs[0].eggSkin, 'dragon_amber');

    // Preserved across normalizeEntity, normalizeChatState, and compact z:2 snapshots
    assert.equal(normalizeEntity(char, 'char').bio.nest.eggs[0].eggSkin, 'dragon_amber');
    assert.equal(normalizeChatState(state).entities.char.bio.nest.eggs[0].eggSkin, 'dragon_amber');
    const roundTrip = physDecodeSnapshot(physEncodeSnapshot(state));
    assert.equal(roundTrip.entities.char.bio.nest.eggs[0].eggSkin, 'dragon_amber');
    assert.equal(roundTrip.entities.char.bio.nest.eggs[1].eggSkin, undefined);

    // Hatching transfers eggSkin onto offspring and onto createCompanionFromOffspring
    const hatched = hatchReadyEggs(roundTrip.entities.char, roundTrip, { forceAll: true });
    assert.equal(hatched[0].eggSkin, 'dragon_amber');
    assert.equal(physDecodeSnapshot(physEncodeSnapshot(roundTrip)).offspring[0].eggSkin, 'dragon_amber');

    const heir = createCompanionFromOffspring(hatched[0], roundTrip, { locale: 'en' });
    assert.equal(heir.eggSkin, 'dragon_amber');
    assert.match(buildCompanionPortraitPrompt(heir, { charName: 'Ignia' }), /Dragon Amber/);
});
