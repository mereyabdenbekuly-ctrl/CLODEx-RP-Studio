import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
    advanceCompanionsDays,
    buildCompanionBabbleMessages,
    buildCompanionForgeConcept,
    buildCompanionPortraitPrompt,
    buildCompanionVideoPrompt,
    COMPANION_ARCHETYPES,
    COMPANION_STAGES,
    createCompanionFromArchetype,
    createCompanionFromOffspring,
    interactWithCompanion,
    normalizeCompanion,
} from '../src/core/companion.js';
import { buildForgePromptMessages } from '../src/core/forge.js';
import {
    advanceSimulationDays,
    applyMeterPresetPack,
    applyTurnExtraction,
    createChatState,
    deliverBabies,
    hatchReadyEggs,
    layEggs,
    normalizeChatState,
    restoreCheckpointBefore,
    triggerConception,
} from '../src/core/physiology.js';
import { buildSystemContext, buildTrackerExtractionMessages } from '../src/core/prompts.js';
import { extractSpokenDialogue } from '../src/core/voice.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function countWords(text) {
    return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

test('COMPANION_STAGES and COMPANION_ARCHETYPES export exact frozen contracts and compact ~300B state without Base64', () => {
    assert.deepEqual(COMPANION_STAGES, ['infant', 'child', 'teen', 'adult']);
    assert.deepEqual(COMPANION_ARCHETYPES, [
        'familiar_fox',
        'shadow_raven',
        'dragon_whelp',
        'homunculus',
        'celestial_wisp',
    ]);
    assert.ok(Object.isFrozen(COMPANION_STAGES));
    assert.ok(Object.isFrozen(COMPANION_ARCHETYPES));

    for (const arch of COMPANION_ARCHETYPES) {
        const ruComp = createCompanionFromArchetype(arch, { locale: 'ru' });
        const enComp = createCompanionFromArchetype(arch, { locale: 'en' });
        assert.equal(ruComp.stage, 'infant');
        assert.equal(ruComp.ageDays, 0);
        assert.equal(ruComp.fullness, 85);
        assert.equal(ruComp.mood, 85);
        assert.equal(ruComp.bond, 35);
        assert.equal(ruComp.energy, 90);
        assert.equal(ruComp.traits.length, 2);
        assert.equal(enComp.traits.length, 2);
        assert.notEqual(ruComp.name, enComp.name);
        assert.ok(ruComp.speciesKey.length > 0);

        const byteLen = Buffer.byteLength(JSON.stringify(enComp), 'utf8');
        assert.ok(byteLen >= 220 && byteLen <= 460, `Expected compact ~300B companion JSON, got ${byteLen} bytes`);
    }

    // Reject inline Base64 data URIs or bloated payloads so 25 checkpoints stay tiny
    const hugeB64 = `data:image/png;base64,${'A'.repeat(50_000)}`;
    const sanitized = normalizeCompanion({
        id: 'test_1',
        name: 'Kitsune',
        archetype: 'familiar_fox',
        portraitPath: hugeB64,
        videoPath: 'data:video/mp4;base64,BBBBBBBB',
        extraBase64Leak: hugeB64,
    });
    assert.equal(sanitized.portraitPath, '');
    assert.equal(sanitized.videoPath, '');
    assert.equal('extraBase64Leak' in sanitized, false);

    const validPaths = normalizeCompanion({
        id: 'test_2',
        portraitPath: 'files/chat/clodex-comp-test_2-a.png',
        videoPath: 'files/chat/clodex-comp-test_2-a.mp4',
    });
    assert.equal(validPaths.portraitPath, 'files/chat/clodex-comp-test_2-a.png');
    assert.equal(validPaths.videoPath, 'files/chat/clodex-comp-test_2-a.mp4');
});

test('Offspring-to-Companion genetics inherits customMeters & originMode traits without duplicating originChildId', () => {
    const state = createChatState('2026-10-01');
    state.world.enableAdultBiology = true;
    applyMeterPresetPack(state, 'dark_romance', 'ru');
    applyMeterPresetPack(state, 'fantasy_rpg', 'ru');

    // Push extreme meters: high obsession (85), low sanity (20), high trust (65)
    state.customMeters.find(m => m.id === 'obsession').value = 85;
    state.customMeters.find(m => m.id === 'sanity').value = 20;
    state.customMeters.find(m => m.id === 'trust').value = 65;

    // 1) Oviposition hatchling with warm_runic shell
    const char = state.entities.char;
    char.bio.mode = 'oviposition';
    triggerConception(char, state, { rng: () => 0.99, force: true }); // warm_runic shell
    layEggs(char, state, null);
    const hatched = hatchReadyEggs(char, state, { forceAll: true });
    assert.ok(hatched.length >= 1);

    const wyrmComp = createCompanionFromOffspring(hatched[0], state, { locale: 'ru' });
    assert.equal(state.companions.length, 1);
    assert.equal(wyrmComp.originChildId, hatched[0].id);
    assert.equal(wyrmComp.speciesKey, 'wyrm_hatchling');
    assert.ok(wyrmComp.traits.length >= 2 && wyrmComp.traits.length <= 3);
    assert.ok(wyrmComp.traits.some(t => /чешуя|рунич/i.test(t)), `Expected scale/rune trait in ${wyrmComp.traits}`);
    assert.ok(wyrmComp.traits.some(t => /преданность|бездн/i.test(t)), `Expected meter-inherited trait in ${wyrmComp.traits}`);

    // Calling createCompanionFromOffspring again for the same child is idempotent
    const duplicateTry = createCompanionFromOffspring(hatched[0], state, { locale: 'ru' });
    assert.equal(duplicateTry.id, wyrmComp.id);
    assert.equal(state.companions.length, 1);

    // 2) Omegaverse baby inherits pheromone bond trait
    const user = state.entities.user;
    user.bio.mode = 'omegaverse';
    user.bio.omegaRole = 'omega';
    triggerConception(user, state, { rng: () => 0.5, force: true });
    const omegaBabies = deliverBabies(user, state);
    const omegaComp = createCompanionFromOffspring(omegaBabies[0], state, { locale: 'en' });
    assert.equal(omegaComp.speciesKey, 'omega_heir');
    assert.ok(omegaComp.traits.some(t => /pheromone/i.test(t)));

    // 3) Normalize caps active companions at 6 max
    for (let i = 0; i < 10; i += 1) {
        state.companions.push(createCompanionFromArchetype('celestial_wisp', { customName: `Wisp ${i}` }));
    }
    const normalized = normalizeChatState(state);
    assert.equal(normalized.companions.length, 6);
});

test('Stage lifecycle (0..6 infant, 7..20 child, 21..44 teen, 45+ adult), needsStageArt, and Zero Punishment floor 20', () => {
    const fox = createCompanionFromArchetype('familiar_fox', { customName: 'Kitsu', locale: 'en' });
    fox.needsStageArt = false; // Simulate infant portrait already generated

    // Day 6 -> still infant, art still valid
    advanceCompanionsDays([fox], 6);
    assert.equal(fox.ageDays, 6);
    assert.equal(fox.stage, 'infant');
    assert.equal(fox.needsStageArt, false);

    // Day 7 -> transitions to child, triggers needsStageArt = true!
    advanceCompanionsDays([fox], 1);
    assert.equal(fox.ageDays, 7);
    assert.equal(fox.stage, 'child');
    assert.equal(fox.needsStageArt, true);

    fox.needsStageArt = false;
    // Day 21 -> transitions to teen
    advanceCompanionsDays([fox], 14);
    assert.equal(fox.ageDays, 21);
    assert.equal(fox.stage, 'teen');
    assert.equal(fox.needsStageArt, true);

    fox.needsStageArt = false;
    // Day 45 -> transitions to adult
    advanceCompanionsDays([fox], 24);
    assert.equal(fox.ageDays, 45);
    assert.equal(fox.stage, 'adult');
    assert.equal(fox.needsStageArt, true);

    // Massive 120-day offline/story timeskip: Zero Punishment keeps fullness, energy, mood >= 20 and bond intact!
    fox.bond = 78;
    advanceCompanionsDays([fox], 120);
    assert.equal(fox.ageDays, 165);
    assert.equal(fox.fullness, 20);
    assert.equal(fox.energy, 20);
    assert.equal(fox.mood, 20);
    assert.equal(fox.bond, 78);
});

test('Interactive care actions deterministically adjust stats (0..100), record rpDate, and emit English memoryHint', () => {
    const dragon = createCompanionFromArchetype('dragon_whelp', { customName: 'Ignis', locale: 'en' });
    dragon.fullness = 40;
    dragon.mood = 50;
    dragon.bond = 30;
    dragon.energy = 45;

    const fed = interactWithCompanion(dragon, 'feed', { rpDate: '2026-11-18' });
    assert.equal(fed.companion, dragon);
    assert.equal(dragon.fullness, 62);
    assert.equal(dragon.lastActionAt, '2026-11-18');
    assert.match(fed.memoryHint, /Ignis/);
    assert.match(fed.memoryHint, /fed/);

    for (const action of ['pet', 'train', 'play', 'rest']) {
        const res = interactWithCompanion(dragon, action, { rpDate: '2026-11-19' });
        assert.ok(dragon.fullness >= 0 && dragon.fullness <= 100);
        assert.ok(dragon.mood >= 0 && dragon.mood <= 100);
        assert.ok(dragon.bond >= 0 && dragon.bond <= 100);
        assert.ok(dragon.energy >= 0 && dragon.energy <= 100);
        assert.ok(res.memoryHint.length > 20);
    }
    assert.ok(dragon.bond > 30);
});

test('Multimodal prompts: Portrait (60-110w), Video I2V (30-60w), TTS Babble, and CCv2 Forge Dynasty Concept', () => {
    const raven = createCompanionFromArchetype('shadow_raven', { customName: 'Nocturne', locale: 'ru' });

    for (const stage of COMPANION_STAGES) {
        raven.stage = stage;
        const portraitPrompt = buildCompanionPortraitPrompt(raven, {
            charName: 'Father Matteo',
            charDescription: 'Tall exorcist with silver-streaked dark hair, amber eyes, sacred gothic neck tattoos, and black cassock.',
            userName: 'Beatrice',
            stylePreset: 'dark_gothic',
        });
        const pWords = countWords(portraitPrompt);
        assert.ok(pWords >= 60 && pWords <= 110, `Portrait prompt for ${stage} must be 60..110 words, got ${pWords}`);
        assert.match(portraitPrompt, /Nocturne/);

        const videoPrompt = buildCompanionVideoPrompt(raven);
        const vWords = countWords(videoPrompt);
        assert.ok(vWords >= 30 && vWords <= 60, `Video prompt for ${stage} must be 30..60 words, got ${vWords}`);
        assert.match(videoPrompt, new RegExp(stage));
    }

    // Infant vs Adult Babble messages + compatibility with voice.js extractSpokenDialogue
    raven.stage = 'infant';
    const infantMsgs = buildCompanionBabbleMessages(raven, { charName: 'Matteo', userName: 'Beatrice', locale: 'ru' });
    assert.equal(infantMsgs.length, 2);
    assert.match(infantMsgs[0].content, /INFANT/);
    assert.equal(extractSpokenDialogue('«Агу-у… карр, теп-ло!»', { dialogueOnly: true }), 'Агу-у… карр, теп-ло!');

    raven.stage = 'adult';
    raven.ageDays = 60;
    const adultMsgs = buildCompanionBabbleMessages(raven, { charName: 'Matteo', userName: 'Beatrice', locale: 'en' });
    assert.match(adultMsgs[0].content, /ADULT/);

    // Dynasty CCv2 Forge concept integrates cleanly with buildForgePromptMessages
    const conceptRu = buildCompanionForgeConcept(raven, { charName: 'Маттео', userName: 'Беатриче', locale: 'ru' });
    assert.match(conceptRu, /Nocturne/);
    assert.match(conceptRu, /Маттео/);
    const forgeMsgs = buildForgePromptMessages({ concept: conceptRu, language: 'ru', loreCount: 5 });
    assert.equal(forgeMsgs.length, 2);
    assert.match(forgeMsgs[1].content, /Nocturne/);
});

test('Simulation integration: advanceSimulationDays, applyTurnExtraction mood delta, buildSystemContext, and swipe rollback', () => {
    const state = createChatState('2026-11-01');
    const wisp = createCompanionFromArchetype('celestial_wisp', { customName: 'Lumen', locale: 'en' });
    state.companions.push(wisp);

    // Turn 1: peaceful scene + explicit positive mood delta
    applyTurnExtraction(state, {
        daysElapsed: 0,
        companionMoodDelta: 10,
    }, { checkpointKey: 'turn-1' });
    assert.equal(state.companions[0].mood, 95);

    // System context injects concise Active Companions summary (well within 35-50 tokens)
    const sysCtx = buildSystemContext(state, { userName: 'Dante', charName: 'Vergil' });
    const compLine = sysCtx.split('\n').find(l => l.includes('Active Companions:'));
    assert.ok(compLine, 'Expected Active Companions line in system context');
    assert.match(compLine, /Lumen \(infant, mood cheerful 95%, fullness 85%, energy 90%\)/);
    assert.ok(countWords(compLine) <= 35, `Companion context line too verbose: ${compLine}`);

    // Extraction schema includes companionMoodDelta and companionCare when companions are active
    const extMsgs = buildTrackerExtractionMessages(state, [{ role: 'assistant', content: 'The light flickers.' }]);
    assert.match(extMsgs[0].content, /"companionMoodDelta": 0/);
    assert.match(extMsgs[0].content, /"companionCare": \{ "target": "", "fullnessDelta": 0, "energyDelta": 0, "bondDelta": 0 \}/);

    // Turn 2: 8-day timeskip + combat bleeding trauma -> grows to child, needsStageArt, reacts to battle stress
    applyTurnExtraction(state, {
        daysElapsed: 8,
        entities: {
            char: { newWound: 'Demonic claw slash', woundBleeding: true, bloodLossDelta: 18 },
        },
    }, { checkpointKey: 'turn-2' });

    assert.equal(state.companions[0].ageDays, 8);
    assert.equal(state.companions[0].stage, 'child');
    assert.equal(state.companions[0].needsStageArt, true);
    // 95 - 8*3 (24) = 71 from days, then -10 from fresh combat trauma = 61
    assert.equal(state.companions[0].mood, 61);

    // Swipe / delete turn-2 -> cleanly restores infant stage, ageDays 0, and mood 95 from turn-1!
    assert.equal(restoreCheckpointBefore(state, 'turn-2'), true);
    assert.equal(state.companions[0].ageDays, 0);
    assert.equal(state.companions[0].stage, 'infant');
    assert.equal(state.companions[0].mood, 95);

    // Direct advanceSimulationDays also advances companions
    advanceSimulationDays(state, 22);
    assert.equal(state.companions[0].stage, 'teen');
});

test('Two-way narrative companion care: feeding, sleeping, multi-pet targeting, Zero-Punishment floor, and context cues', () => {
    const state = createChatState('2026-11-20');
    const fox = createCompanionFromArchetype('familiar_fox', { customName: 'Кицу', locale: 'ru' });
    fox.fullness = 30;
    fox.energy = 28;
    fox.mood = 60;
    fox.bond = 72;
    state.companions.push(fox);

    // Hungry + sleepy cues appear automatically in buildSystemContext when <= 35%
    const hungryCtx = buildSystemContext(state, { userName: 'Лидия', charName: 'Маттео' });
    assert.match(hungryCtx, /Кицу \(infant, mood calm 60%, fullness hungry 30%, energy sleepy 28%\)/);

    // Schema in buildTrackerExtractionMessages remains valid JSON with active companions
    const promptText = buildTrackerExtractionMessages(state, [
        { role: 'user', content: 'Даю лисёнку миску тёплого молока и укладываю спать на пледе.' },
    ])[0].content;
    const schemaStart = promptText.indexOf('JSON schema:\n') + 'JSON schema:\n'.length;
    const schemaEnd = promptText.lastIndexOf('\n}\n') + 2;
    const parsedSchema = JSON.parse(
        promptText.slice(schemaStart, schemaEnd)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '')
            .replace(/"[^"]*"\s*(?:\|\s*"[^"]*"\s*)+/g, '"morning"'),
    );
    assert.deepEqual(parsedSchema.companionCare, {
        target: '',
        fullnessDelta: 0,
        energyDelta: 0,
        bondDelta: 0,
    });

    // Solo pet matches even if user/model writes generic target ("лисёнок"); updates fullness, energy, bond, mood (+4), lastActionAt
    applyTurnExtraction(state, {
        companionCare: { target: 'лисёнок', fullnessDelta: 25, energyDelta: 32, bondDelta: 5 },
    }, { checkpointKey: 'care-1' });
    assert.equal(state.companions[0].fullness, 55);
    assert.equal(state.companions[0].energy, 60);
    assert.equal(state.companions[0].bond, 77);
    assert.equal(state.companions[0].mood, 64);
    assert.equal(state.companions[0].lastActionAt, '2026-11-20');

    // Deeply bonded cue (>= 75%) appears and hungry/sleepy disappear once fed & rested
    const caredCtx = buildSystemContext(state, { userName: 'Лидия', charName: 'Маттео' });
    assert.match(caredCtx, /Кицу \(infant, mood calm 64%, fullness 55%, energy 60%, deeply bonded\)/);

    // Multi-companion targeted care updates only the named pet + Zero-Punishment floor 20 holds on exertion
    const raven = createCompanionFromArchetype('shadow_raven', { customName: 'Nocturne', locale: 'en' });
    raven.fullness = 40;
    raven.energy = 24;
    state.companions.push(raven);

    applyTurnExtraction(state, {
        companionCare: [
            { target: 'Nocturne', fullnessDelta: 20, energyDelta: -15, bondDelta: -5 },
        ],
    }, { checkpointKey: 'care-2' });
    assert.equal(state.companions[0].fullness, 55, 'Кицу untouched when Nocturne was targeted');
    assert.equal(state.companions[1].fullness, 60);
    assert.equal(state.companions[1].energy, 20, 'Zero-Punishment floor 20 prevents energy dropping below 20');
    assert.equal(state.companions[1].bond, 35, 'bond never drops on negative bondDelta');

    // Swipe rollback restores previous stats cleanly
    assert.equal(restoreCheckpointBefore(state, 'care-2'), true);
    assert.equal(state.companions.length, 1);
    assert.equal(state.companions[0].fullness, 55);
});

test('Classic-IIFE bundler compatibility: core modules concatenate into strict VM script with zero identifier collisions', async () => {
    const coreFiles = [
        'src/core/api.js',
        'src/core/catalog.js',
        'src/core/date.js',
        'src/core/physiology.js',
        'src/core/gacha.js',
        'src/core/companion.js',
        'src/core/prompts.js',
        'src/core/codex.js',
        'src/core/voice.js',
        'src/core/pngCard.js',
        'src/core/forge.js',
    ];
    const parts = [];
    for (const rel of coreFiles) {
        const src = await readFile(resolve(root, rel), 'utf8');
        const stripped = src
            .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
            .replace(/^\s*export\s+(async\s+function|function|class|const|let)\s+/gm, '$1 ');
        assert.ok(!/^\s*(import|export)\s/m.test(stripped), `${rel} contains unsupported ESM syntax for classic IIFE bundler`);
        parts.push(stripped);
    }
    const iife = `(function () {\n'use strict';\n${parts.join('\n\n')}\nreturn { createChatState, createCompanionFromArchetype, buildSystemContext };\n})();`;
    const result = new vm.Script(iife, { filename: 'bundle-sim.js' }).runInNewContext({
        structuredClone,
        Math, Number, String, Boolean, Array, Object, Date, RegExp, JSON, Set, Map, Uint8Array, Promise,
    });
    const st = result.createChatState('2026-11-18');
    st.companions.push(result.createCompanionFromArchetype('familiar_fox'));
    assert.match(result.buildSystemContext(st), /Active Companions:/);
});
