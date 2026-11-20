import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPANION_ARCHETYPES, createCompanionFromArchetype } from '../src/core/companion.js';
import { jrAppend, jrGc, jrReplay, jrTurnKey } from '../src/core/journal.js';
import { repImportFactions } from '../src/core/reputation.js';
import { uwPawnCollateral } from '../src/core/underworld.js';
import {
    applyMeterPresetPack, applyTurnExtraction, checkpointSnapshotBytes, createChatState, normalizeChatState,
    PHYS_CHECKPOINT_LIMIT, physDecodeSnapshot, physEncodeSnapshot, restoreCheckpointBefore, restoreCheckpointExact,
    saveCheckpoint,
} from '../src/core/physiology.js';
import {
    buildSystemContext, buildTrackerExtractionMessages, parseTrackerExtraction, parseTrackerExtractionSafe,
    TRACKER_MAX_TOKENS,
} from '../src/core/prompts.js';

const collect = (acc, op) => [...acc, op.payload];
const k = (i, v = 0) => jrTurnKey(i, v);
const comparable = state => {
    const c = structuredClone(state);
    delete c.checkpoints;
    delete c.checkpointHead;
    delete c.activityLog;
    return c;
};

function richState() {
    const state = createChatState('2026-11-18');
    for (let i = 0; i < 6; i += 1) {
        state.companions.push(createCompanionFromArchetype(COMPANION_ARCHETYPES[i % COMPANION_ARCHETYPES.length], {
            locale: 'ru', customName: `Спутник ${i + 1}`,
        }));
    }
    for (const pack of ['dark_romance', 'fantasy_rpg', 'detective']) applyMeterPresetPack(state, pack, 'ru');
    return state;
}

test('Snapshots fit the RP budget with 6 companions, 8 meters, 6 pawns and 4 factions', () => {
    const state = richState();
    for (let i = 0; i < 6; i += 1) {
        assert.equal(uwPawnCollateral(state.underworld, { label: `Серебряный амулет ${i + 1}`, pawnValue: 50 }).ok, true);
    }
    repImportFactions(state.underworld, ['Орден', 'Гильдия', 'Вороны', 'Стража'].map(name => ({ name })));
    assert.equal(state.underworld.collateral.length, 6);
    assert.equal(state.underworld.factions.length, 4);
    for (let i = 1; i <= PHYS_CHECKPOINT_LIMIT; i += 1) {
        state.underworld.cash -= 1;
        saveCheckpoint(state, k(i));
        const bytes = checkpointSnapshotBytes(state);
        assert.ok(bytes <= 2_764, `snapshot ${i} is ${bytes} bytes (> 2.7 KiB)`);
    }
    assert.equal(state.checkpoints.length, 25);
    assert.ok(Buffer.byteLength(JSON.stringify(state)) <= 65_536, '25 checkpoints and live state must fit 64 KiB');
});

test('Compact state with 6 companions and 8 meters fits 2.5 KB per snapshot; 25 snapshots fit 64 KB', () => {
    const state = richState();
    assert.equal(state.companions.length, 6);
    assert.equal(state.customMeters.length, 8);
    applyTurnExtraction(state, {
        daysElapsed: 2,
        location: 'Заброшенная часовня на окраине города',
        weather: 'Холодный дождь и туман',
        customMeters: { obsession: 55, sanity: 40, suspicion: 70, gold: 1200 },
        inventoryAdd: { char: ['Серебряный крест', 'Старый револьвер'], user: ['Фонарь'] },
        entities: { char: { heartRate: 110, stressDelta: 20, newWound: 'Порез на предплечье', woundBleeding: true } },
        innerThought: 'Она не должна узнать, что я видел её у часовни прошлой ночью. Ещё рано.',
        suggestedActions: ['Спросить, что он скрывает', 'Осмотреть рану на его руке', 'Молча уйти к алтарю'],
    }, { checkpointKey: k(1) });
    const bytes = checkpointSnapshotBytes(state);
    assert.ok(bytes <= 2560, `snapshot ${bytes} B > 2.5 KB`);
    assert.equal(bytes, Buffer.byteLength(JSON.stringify(state.checkpoints.at(-1).snapshot)));

    // round-trip is lossless for everything the snapshot owns
    const decoded = physDecodeSnapshot(physEncodeSnapshot(state));
    const live = normalizeChatState(state);
    assert.deepEqual(decoded.companions, live.companions);
    assert.deepEqual(decoded.customMeters, live.customMeters);
    assert.deepEqual(decoded.entities, live.entities);
    assert.deepEqual(decoded.turnExtras, live.turnExtras);
    assert.deepEqual(decoded.counters, live.counters);
    assert.deepEqual(decoded.inventory, live.inventory);

    for (let i = 2; i <= 40; i += 1) {
        applyTurnExtraction(state, {
            customMeters: { obsession: i },
            entities: { user: { heartRate: 60 + i } },
            innerThought: `Мысль номер ${i}: довольно длинная фраза о том, что персонаж подумал на самом деле, но не сказал.`,
            suggestedActions: ['Первое действие игрока подлиннее', 'Второе действие', 'Третье действие'],
        }, { checkpointKey: jrTurnKey(i, 0, `h${i.toString(36)}`) });
    }
    assert.equal(state.checkpoints.length, PHYS_CHECKPOINT_LIMIT);
    const total = Buffer.byteLength(JSON.stringify(state));
    assert.ok(total <= 65_536, `clodex_rp_state ${total} B > 64 KB`);

    // A heavy live state (long Codex hint + history) shrinks the snapshot budget instead of overflowing 64 KB
    state.world.pendingMemoryHint = 'Канон '.repeat(330);
    for (let i = 0; i < 6; i += 1) {
        state.codexHistory.push({ role: 'assistant', content: 'Ответ кодекса '.repeat(70), preset: 'lore_keeper', model: '', at: '' });
    }
    applyTurnExtraction(state, { customMeters: { obsession: 99 } }, { checkpointKey: k(41) });
    const heavy = Buffer.byteLength(JSON.stringify(state));
    assert.ok(heavy <= 65_536, `heavy clodex_rp_state ${heavy} B > 64 KB`);
    assert.ok(state.checkpoints.length < PHYS_CHECKPOINT_LIMIT && state.checkpoints.at(-1).key === k(41));
});

test('Legacy full snapshots (v1.2) are migrated to compact form and still restore', () => {
    const state = createChatState('2026-09-01');
    applyTurnExtraction(state, { entities: { char: { heartRate: 80 } } }, { checkpointKey: 'msg-1' });
    const legacy = structuredClone(state);
    const fullSnap = structuredClone(state);
    delete fullSnap.checkpoints;
    delete fullSnap.codexHistory;
    legacy.checkpoints = [{ key: 'msg-1', snapshot: fullSnap }];
    applyTurnExtraction(legacy, { entities: { char: { heartRate: 150 } } });
    legacy.checkpoints.push({ key: 'msg-2', snapshot: structuredClone(fullSnap) });

    const migrated = normalizeChatState(legacy);
    assert.ok(migrated.checkpoints.every(cp => cp.snapshot.z === 2));
    assert.equal(restoreCheckpointBefore(migrated, 'msg-2'), true);
    assert.equal(migrated.entities.char.vitals.heartRate, 80);
});

test('Branches A -> B -> A: compact state, turnExtras and journals match variant A exactly', () => {
    const state = richState();
    const phone = [];
    const wiki = [];
    const view = (keys) => ({ phone: jrReplay(phone, keys, collect, []), wiki: jrReplay(wiki, keys, collect, []) });

    // Turn 1
    applyTurnExtraction(state, {
        location: 'Собор', customMeters: { obsession: 30 },
        innerThought: 'Он слишком спокоен.', suggestedActions: ['Подойти ближе', 'Спросить о кресте', 'Уйти'],
    }, { checkpointKey: k(1) });
    jrAppend(phone, { kind: 'add', turnKey: k(1), payload: 'note-1' });

    // Turn 2, variant A
    applyTurnExtraction(state, {
        location: 'Крипта', customMeters: { obsession: 60 }, inventoryAdd: { char: ['Ключ от крипты'] },
        entities: { char: { heartRate: 130, newWound: 'Укус', woundBleeding: true } },
        innerThought: 'Только бы она не заметила кровь.', suggestedActions: ['Перевязать рану', 'Сделать вид', 'Бежать'],
        phoneEvents: [{ kind: 'dm', author: 'Маттео', text: 'Встречаемся в полночь' }],
    }, { checkpointKey: k(2, 0) });
    jrAppend(phone, { kind: 'add', turnKey: k(2, 0), payload: 'A-dm' });
    jrAppend(wiki, { kind: 'patch', turnKey: k(2, 0), payload: 'A-wiki' });
    const stateA = comparable(state);
    const viewA = view([k(1), k(2, 0)]);
    assert.equal(state.turnExtras.turnKey, k(2, 0));
    assert.equal(state.counters.turnsSinceLastPhone, 0, 'phoneEvents reset the phone counter');

    // Swipe to new variant B: no snapshot yet -> roll back to turn 1, nothing is deleted
    state.world.director = { activeIds: ['twist'], customNote: 'Пусть в крипте кто-то есть' };
    state.world.pendingMemoryHint = 'Канон: крипта закрыта с 1666 года';
    state.codexHistory.push({ role: 'user', content: 'Что за крипта?', preset: 'lore_keeper', model: '', at: '' });
    assert.equal(restoreCheckpointExact(state, k(2, 1)), false);
    assert.equal(restoreCheckpointBefore(state, k(2, 1)), true);
    assert.equal(state.world.location, 'Собор');
    assert.equal(state.customMeters.find(m => m.id === 'obsession').value, 30);
    assert.equal(state.turnExtras.turnKey, k(1));
    assert.deepEqual(state.world.director, { activeIds: ['twist'], customNote: 'Пусть в крипте кто-то есть' }, 'director survives restore');
    assert.equal(state.world.pendingMemoryHint, 'Канон: крипта закрыта с 1666 года');
    assert.equal(state.codexHistory.length, 1);
    assert.ok(state.checkpoints.some(cp => cp.key === k(2, 0)), 'variant A snapshot is kept on swipe');

    applyTurnExtraction(state, {
        location: 'Колокольня', customMeters: { obsession: 10 },
        innerThought: 'Колокол скрывает тайну.', suggestedActions: ['Подняться', 'Позвонить', 'Спуститься'],
    }, { checkpointKey: k(2, 1) });
    jrAppend(phone, { kind: 'add', turnKey: k(2, 1), payload: 'B-feed' });
    assert.deepEqual(view([k(1), k(2, 1)]), { phone: ['note-1', 'B-feed'], wiki: [] });

    // Swipe back to existing variant A: exact snapshot, journals replay A
    state.world.director = { activeIds: ['slow'], customNote: '' };
    assert.equal(restoreCheckpointExact(state, k(2, 0)), true);
    const back = comparable(state);
    assert.deepEqual(back.world.director, { activeIds: ['slow'], customNote: '' });
    back.world.director = stateA.world.director;
    back.world.pendingMemoryHint = stateA.world.pendingMemoryHint;
    back.codexHistory = stateA.codexHistory;
    assert.deepEqual(back, stateA);
    assert.equal(state.turnExtras.innerThought, 'Только бы она не заметила кровь.');
    assert.deepEqual(view([k(1), k(2, 0)]), viewA);
    assert.equal(phone.length, 3, 'swipes never delete journal ops');

    // Continue on branch A: "before turn 3" must be variant A, not B (parent links, not array order)
    applyTurnExtraction(state, { location: 'Алтарь' }, { checkpointKey: k(3, 0) });
    assert.equal(restoreCheckpointBefore(state, k(3, 1)), true);
    assert.equal(state.world.location, 'Крипта');
    assert.deepEqual(state.inventory.char, ['Ключ от крипты']);
});

test('Deleting the last 3 messages returns compact state and journals to the state before them', () => {
    const state = richState();
    const phone = [];
    const keys = [];
    for (let i = 1; i <= 6; i += 1) {
        const key = jrTurnKey(i * 2 - 1, 0, `s${i}`);
        keys.push(key);
        applyTurnExtraction(state, { customMeters: { obsession: i * 10 }, location: `Комната ${i}` }, { checkpointKey: key });
        jrAppend(phone, { kind: 'add', turnKey: key, payload: `entry-${i}` });
    }
    // The visible chat keeps turns 1..3; turns 4..6 are deleted (deletion starts at turn 4)
    assert.equal(restoreCheckpointBefore(state, keys[3], { prune: true }), true);
    assert.equal(state.world.location, 'Комната 3');
    assert.equal(state.customMeters.find(m => m.id === 'obsession').value, 30);
    assert.deepEqual(state.checkpoints.map(cp => cp.key), keys.slice(0, 3));
    jrGc(phone, { deletedTurnKeys: keys.slice(3), activeTurnKeys: keys.slice(0, 3) });
    assert.deepEqual(jrReplay(phone, keys.slice(0, 3), collect, []), ['entry-1', 'entry-2', 'entry-3']);
    assert.equal(phone.length, 3);

    // First turn of the chat has nothing before it
    assert.equal(restoreCheckpointBefore(state, keys[0]), false);
    assert.equal(restoreCheckpointBefore(state, 'missing:0'), false);
});

test('saveCheckpoint never parents a variant to its sibling; re-saving a key keeps its parent', () => {
    const state = createChatState();
    saveCheckpoint(state, k(1));
    saveCheckpoint(state, k(2, 0));
    // platform saved B without restoring first: head is sibling A
    saveCheckpoint(state, k(2, 1));
    const b = state.checkpoints.find(cp => cp.key === k(2, 1));
    assert.equal(b.parent, k(1));
    saveCheckpoint(state, k(2, 1));
    assert.equal(state.checkpoints.find(cp => cp.key === k(2, 1)).parent, k(1));
    assert.equal(state.checkpoints.find(cp => cp.key === k(1)).parent, '');
});

test('turnExtras and counters: written only when present, never sent to the roleplay model', () => {
    const state = createChatState();
    assert.deepEqual(state.turnExtras, { turnKey: '', innerThought: '', suggestedActions: [] });
    assert.deepEqual(state.counters, { turnsSinceLastPhone: 3, turnsSinceWiki: 0 });
    applyTurnExtraction(state, {
        innerThought: `  Секрет\nперсонажа ${'x'.repeat(300)}`,
        suggestedActions: ['  Шаг 1 ', '', 42, 'Шаг 2', 'Шаг 3', 'Шаг 4'],
    }, { checkpointKey: k(5) });
    assert.equal(state.turnExtras.turnKey, k(5));
    assert.ok(state.turnExtras.innerThought.startsWith('Секрет персонажа'));
    assert.equal(state.turnExtras.innerThought.length, 160);
    assert.deepEqual(state.turnExtras.suggestedActions, ['Шаг 1', 'Шаг 2', 'Шаг 3']);
    assert.deepEqual(state.counters, { turnsSinceLastPhone: 4, turnsSinceWiki: 1 });

    applyTurnExtraction(state, { location: 'Сад' }, { checkpointKey: k(6) });
    assert.equal(state.turnExtras.turnKey, k(5), 'absent fields leave turnExtras untouched (UI matches turnKey)');
    assert.deepEqual(state.counters, { turnsSinceLastPhone: 5, turnsSinceWiki: 2 });

    const ctx = buildSystemContext(state, { userName: 'Игрок', charName: 'Маттео' });
    assert.ok(!ctx.includes('Секрет'), 'inner thoughts must never reach the RP context');
    assert.ok(!ctx.includes('Шаг 1'));

    const norm = normalizeChatState({
        world: { director: { activeIds: ['a', 'a', 'b<script>', 'c'], customNote: 'n'.repeat(500) }, slopRule: 'x' },
        turnExtras: { messageKey: '9:0', innerThought: 'mысль', suggestedActions: 'bad' },
        counters: { turnsSinceLastPhone: -4, turnsSinceWiki: 'x' },
    });
    assert.deepEqual(norm.world.director.activeIds, ['a', 'bscript']);
    assert.equal(norm.world.director.customNote.length, 140);
    assert.equal(norm.turnExtras.turnKey, '9:0');
    assert.deepEqual(norm.turnExtras.suggestedActions, []);
    assert.deepEqual(norm.counters, { turnsSinceLastPhone: 0, turnsSinceWiki: 0 });
});

test('Tracker extraction: 1100-token budget, field order, phoneEvents only with includePhone', () => {
    assert.equal(TRACKER_MAX_TOKENS, 1100);
    const state = createChatState();
    const recent = [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Здравствуй' }];
    const without = buildTrackerExtractionMessages(state, recent, { userName: 'Игрок', charName: 'Маттео' })[0].content;
    assert.ok(!without.includes('phoneEvents'));
    const iEntities = without.indexOf('"entities"');
    const iThought = without.indexOf('"innerThought"');
    const iActions = without.indexOf('"suggestedActions"');
    assert.ok(iEntities > 0 && iThought > iEntities && iActions > iThought, 'tracker core first, then thoughts, then actions');

    const withPhone = buildTrackerExtractionMessages(state, recent, { includePhone: true })[0].content;
    const iPhone = withPhone.indexOf('"phoneEvents"');
    assert.ok(iPhone > withPhone.indexOf('"suggestedActions"'), 'phoneEvents is last');
    assert.match(withPhone, /"note" \| "dm" \| "feed" \| "photo" \| "voice"/);

    // Schema JSON comma validity for BOTH includePhone: false and includePhone: true
    const extractSchemaJson = promptText => {
        const schemaStart = promptText.indexOf('JSON schema:\n') + 'JSON schema:\n'.length;
        const schemaEnd = promptText.lastIndexOf('\n}\n') + 2;
        const rawSchema = promptText.slice(schemaStart, schemaEnd)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '')
            .replace(/"[^"]*"\s*(?:\|\s*"[^"]*"\s*)+/g, '"morning"');
        return JSON.parse(rawSchema);
    };
    const parsedWithoutPhone = extractSchemaJson(without);
    assert.deepEqual(parsedWithoutPhone.suggestedActions, ['', '', '']);
    assert.deepEqual(parsedWithoutPhone.worldDelta, {
        cashDelta: 0,
        heatDelta: 0,
        standingDelta: 0,
        faction: { name: '', delta: 0 },
    });
    assert.equal('phoneEvents' in parsedWithoutPhone, false);

    const parsedWithPhone = extractSchemaJson(withPhone);
    assert.deepEqual(parsedWithPhone.suggestedActions, ['', '', '']);
    assert.ok(Array.isArray(parsedWithPhone.phoneEvents));
});

test('Truncated tracker JSON salvages complete tracker fields; garbage yields an empty delta', () => {
    const full = JSON.stringify({
        daysElapsed: 1, timeOfDay: 'night', location: 'Крипта', entities: { char: { heartRate: 120 } },
        innerThought: 'Мысль', suggestedActions: ['a', 'b', 'c'], phoneEvents: [{ kind: 'dm', author: 'X', text: 'долгий текст' }],
    });
    const truncated = full.slice(0, full.indexOf('долгий') + 3);
    const delta = parseTrackerExtraction(truncated);
    assert.equal(delta.location, 'Крипта');
    assert.equal(delta.entities.char.heartRate, 120);
    assert.deepEqual(delta.suggestedActions, ['a', 'b', 'c']);
    assert.equal(delta.phoneEvents, undefined);
    assert.equal(parseTrackerExtraction(`\`\`\`json\n${truncated}`).location, 'Крипта');
    assert.deepEqual(parseTrackerExtraction(full).phoneEvents.length, 1);

    assert.deepEqual(parseTrackerExtractionSafe('no json here'), { delta: {}, error: 'Tracker response did not contain JSON.' });
    assert.deepEqual(parseTrackerExtractionSafe('{"daysElapsed": ').delta, {});
    assert.ok(parseTrackerExtractionSafe('{"daysElapsed": ').error);
    assert.throws(() => parseTrackerExtraction(''), /Empty/);
});
