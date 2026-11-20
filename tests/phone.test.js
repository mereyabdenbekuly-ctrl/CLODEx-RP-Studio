import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { jrTurnKey } from '../src/core/journal.js';
import {
    PHONE_MAX_ENTRIES, phoneBuildPhotoPrompt, phoneBuildPresentHint, phoneBuildVoiceText, phoneCreateStore,
    phoneDetectSkin, phoneGc, phoneIngestEvents, phoneMarkSeen, phoneNormalizeStore, phoneResolveSkin,
    phoneReveal, phoneShouldInclude, phoneView, phoneVoiceDuration,
} from '../src/core/phone.js';

const T1 = jrTurnKey(1, 0);
const A = jrTurnKey(2, 0);
const B = jrTurnKey(2, 1);

test('phoneShouldInclude follows counters.turnsSinceLastPhone >= 3 (10.6)', () => {
    assert.equal(phoneShouldInclude({ counters: { turnsSinceLastPhone: 0 } }), false);
    assert.equal(phoneShouldInclude({ counters: { turnsSinceLastPhone: 2 } }), false);
    assert.equal(phoneShouldInclude({ counters: { turnsSinceLastPhone: 3 } }), true);
    assert.equal(phoneShouldInclude({ counters: { turnsSinceLastPhone: 9 } }), true);
    assert.equal(phoneShouldInclude({}), false);
    assert.equal(phoneShouldInclude(null), false);
});

test('phoneIngestEvents: max 2 events, sanitization, idempotent per turnKey', () => {
    const store = phoneCreateStore();
    assert.deepEqual(store, { version: 1, journal: [], skin: 'auto', seenIds: [] });
    phoneIngestEvents(store, [
        { kind: 'hack', author: 'x', text: 'invalid kind' },
        { kind: 'note', author: '<b>Лира</b>', text: `<script>alert(1)</script>Тайная заметка ${'а'.repeat(900)}` },
        { kind: 'dm', author: 'Лира', text: '   ' },
        { kind: 'feed', author: '@crowd', text: 'Все обсуждают новенького.' },
        { kind: 'photo', author: 'Лира', text: 'селфи', mediaPrompt: 'mirror selfie' },
    ], T1);
    const view = phoneView(store, [T1]);
    assert.equal(view.entries.length, 2);
    const [note, feed] = view.entries;
    assert.equal(note.kind, 'note');
    assert.equal(note.author, 'Лира');
    assert.ok(!note.text.includes('<'));
    assert.ok(note.text.length <= 420);
    assert.equal(note.turnKey, T1);
    assert.equal(note.mediaPrompt, '');
    assert.equal(feed.kind, 'feed');
    assert.equal(view.unseen, 2);
    const before = store.journal.length;
    phoneIngestEvents(store, [{ kind: 'note', text: 'repeat sync' }], T1);
    assert.equal(store.journal.length, before, 'same turn is not ingested twice');
    phoneIngestEvents(store, 'not-an-array', A);
    phoneIngestEvents(store, [{ kind: 'note', text: 'no key' }], '');
    assert.equal(store.journal.length, before);
});

test('phone replay by activeTurnKeys: A → B → A, swipe deletes nothing', () => {
    const store = phoneCreateStore();
    phoneIngestEvents(store, [{ kind: 'note', author: 'Лира', text: 'Ход 1' }], T1);
    phoneIngestEvents(store, [{ kind: 'dm', author: 'Лира', text: 'Вариант A' }], A);
    const viewA = phoneView(store, [T1, A]);
    assert.deepEqual(viewA.entries.map((e) => e.text), ['Ход 1', 'Вариант A']);

    // Swipe to B: the tracker produces a new event for B.
    phoneIngestEvents(store, [{ kind: 'feed', author: '@city', text: 'Вариант B' }], B);
    const viewB = phoneView(store, [T1, B]);
    assert.deepEqual(viewB.entries.map((e) => e.text), ['Ход 1', 'Вариант B']);
    const journalLen = store.journal.length;

    // Swipe back to A: nothing was deleted, replay restores A exactly.
    const viewA2 = phoneView(store, [T1, A]);
    assert.deepEqual(viewA2, viewA);
    assert.equal(store.journal.length, journalLen);
    assert.equal(store.journal.length, 3);
});

test('phoneIngestEvents deduplicates per source, allowing tracker + local underworld events on one turn', () => {
    const store = phoneCreateStore();
    phoneIngestEvents(store, [{ kind: 'note', text: 'tracker event' }], A, { source: 'tracker' });
    phoneIngestEvents(store, [{ kind: 'dm', text: 'collector event' }], A, { source: 'underworld' });
    phoneIngestEvents(store, [{ kind: 'feed', text: 'duplicate tracker' }], A, { source: 'tracker' });
    const entries = phoneView(store, [A]).entries;
    assert.deepEqual(entries.map(entry => entry.text), ['tracker event', 'collector event']);
    assert.equal(store.journal.filter(op => op.kind === 'phone.add').at(-1).source, 'underworld');
});

test('phoneGc removes deleted turns (and their seenIds), keeps the rest', () => {
    const store = phoneCreateStore();
    phoneIngestEvents(store, [{ kind: 'note', text: 'Ход 1' }], T1);
    phoneIngestEvents(store, [{ kind: 'dm', text: 'A' }], A);
    phoneIngestEvents(store, [{ kind: 'dm', text: 'B' }], B);
    phoneMarkSeen(store, phoneView(store, [T1, A]).entries.map((e) => e.id));
    phoneGc(store, { deletedTurnKeys: [A, B], activeTurnKeys: [T1] });
    assert.equal(store.journal.length, 1);
    assert.deepEqual(phoneView(store, [T1, A, B]).entries.map((e) => e.text), ['Ход 1']);
    assert.equal(store.seenIds.length, 1);
});

test('phone keeps at most 120 entries (view and GC)', () => {
    const store = phoneCreateStore();
    const keys = [];
    for (let i = 0; i < 70; i += 1) {
        const key = jrTurnKey(i + 1, 0);
        keys.push(key);
        phoneIngestEvents(store, [{ kind: 'note', text: `n${i}a` }, { kind: 'feed', text: `n${i}b` }], key);
    }
    const view = phoneView(store, keys);
    assert.equal(view.entries.length, PHONE_MAX_ENTRIES);
    assert.equal(view.entries.at(-1).text, 'n69b');
    phoneGc(store, { activeTurnKeys: keys });
    assert.equal(store.journal.length, PHONE_MAX_ENTRIES);
    assert.equal(phoneView(store, keys).entries[0].text, 'n10a');
});

test('Click-to-Reveal: placeholder until reveal, reveal bound to the entry turn, no network', () => {
    const originalFetch = globalThis.fetch;
    let networkCalls = 0;
    globalThis.fetch = async () => { networkCalls += 1; throw new Error('network is forbidden'); };
    try {
        const store = phoneCreateStore();
        phoneIngestEvents(store, [
            { kind: 'photo', author: 'Лира', text: 'Скрытое фото', mediaPrompt: 'mirror selfie in a dim bathroom' },
            { kind: 'voice', author: 'Лира', text: 'Я не могу перестать думать о тебе.' },
        ], A);
        let view = phoneView(store, [T1, A]);
        const [photo, voice] = view.entries;
        assert.equal(photo.mediaPath, '');
        assert.equal(voice.mediaPath, '');
        assert.match(phoneVoiceDuration(voice), /^\d+:\d\d$/);
        const prompt = phoneBuildPhotoPrompt(photo, { charName: 'Лира', charDescription: 'red hair, green eyes', vitals: { heartRate: 120, circulation: 'flushed' } });
        assert.match(prompt, /selfie/);
        assert.match(prompt, /flushed/);
        assert.match(prompt, /red hair/);

        // The UI generated the photo after confirmPaid and saved it; the reveal is recorded.
        phoneReveal(store, photo.id, 'clodex-phone-x.png', B);
        view = phoneView(store, [T1, A]);
        assert.equal(view.entries[0].mediaPath, 'clodex-phone-x.png');
        assert.equal(store.journal.at(-1).turnKey, A, 'reveal lives with its entry turn');
        // Unsafe paths and non-media entries are ignored.
        phoneReveal(store, voice.id, 'javascript:alert(1)', A);
        assert.equal(phoneView(store, [A]).entries[1].mediaPath, '');
        phoneIngestEvents(store, [{ kind: 'note', text: 'just a note' }], B);
        const note = phoneView(store, [B]).entries[0];
        const len = store.journal.length;
        phoneReveal(store, note.id, 'x.png', B);
        assert.equal(store.journal.length, len);
        assert.equal(networkCalls, 0);
    } finally {
        globalThis.fetch = originalFetch;
    }
    const source = readFileSync(new URL('../src/core/phone.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|\bapi\.(image|speech|chat)|\.generate\w*\(/);
});

test('phoneMarkSeen updates unseen counter', () => {
    const store = phoneCreateStore();
    phoneIngestEvents(store, [{ kind: 'note', text: 'one' }, { kind: 'dm', text: 'two' }], A);
    const v = phoneView(store, [A]);
    assert.equal(v.unseen, 2);
    phoneMarkSeen(store, [v.entries[0].id]);
    assert.equal(phoneView(store, [A]).unseen, 1);
    phoneMarkSeen(store, v.entries.map((e) => e.id));
    assert.equal(phoneView(store, [A]).unseen, 0);
});

test('phoneDetectSkin chooses smartphone vs grimoire; manual skin wins', () => {
    assert.equal(phoneDetectSkin({ world: { location: 'Неоновый мегаполис' } }, 'Хакер из киберпанк-корпорации'), 'smartphone');
    assert.equal(phoneDetectSkin({ world: { location: 'Замок' } }, 'Рыцарь-маг из средневекового королевства драконов'), 'grimoire');
    assert.equal(phoneDetectSkin({ world: {} }, 'A knight of the Inquisition, Dante inferno'), 'grimoire');
    assert.equal(phoneDetectSkin({ world: { disclosureMode: 'medieval' } }, ''), 'grimoire');
    assert.equal(phoneDetectSkin({}, ''), 'smartphone');
    const store = phoneCreateStore();
    store.skin = 'grimoire';
    assert.equal(phoneResolveSkin(store, { world: { location: 'office' } }, 'modern city'), 'grimoire');
    store.skin = 'auto';
    assert.equal(phoneResolveSkin(store, { world: { location: 'office' } }, 'modern city'), 'smartphone');
});

test('phoneBuildVoiceText adds an emotional mark from pulse/breathing', () => {
    const entry = { kind: 'voice', text: 'Приходи скорее.' };
    assert.equal(phoneBuildVoiceText(entry, { heartRate: 130, respiration: 'breathless' }), '(задыхаясь, взволнованно) Приходи скорее.');
    assert.equal(phoneBuildVoiceText(entry, { heartRate: 70, breathRate: 14, stress: 10 }), '(спокойно, вполголоса) Приходи скорее.');
    assert.match(phoneBuildVoiceText({ text: 'Come quickly.' }, { vitals: { heartRate: 125 } }), /^\(excited, hurried\) Come quickly\.$/);
    assert.equal(phoneBuildVoiceText({ text: '' }, {}), '');
    assert.match(phoneBuildPresentHint({ kind: 'dm', author: 'Лира', text: 'Встретимся в полночь' }), /private message by Лира: "Встретимся в полночь"/);
});

test('phoneNormalizeStore drops garbage and keeps valid ops', () => {
    const store = phoneCreateStore();
    phoneIngestEvents(store, [{ kind: 'note', text: 'ok' }], A);
    const raw = JSON.parse(JSON.stringify(store));
    raw.journal.push({ kind: 'phone.add', turnKey: A, payload: { kind: 'evil', text: 'x', id: 'z' } });
    raw.journal.push({ kind: 'phone.add', turnKey: '', payload: { kind: 'note', text: 'x', id: 'y' } });
    raw.journal.push('garbage', null);
    raw.skin = 'hacked';
    raw.seenIds = ['a<b>', 7, null];
    const n = phoneNormalizeStore(raw);
    assert.equal(n.journal.length, 1);
    assert.equal(n.skin, 'auto');
    assert.deepEqual(phoneView(n, [A]).entries.map((e) => e.text), ['ok']);
    assert.deepEqual(phoneNormalizeStore(null), phoneCreateStore());
});
