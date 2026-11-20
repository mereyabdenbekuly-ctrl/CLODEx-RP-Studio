import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createRpStudioController } from '../src/core/hud.js';
import { EN_CATALOG, RU_CATALOG } from '../src/core/localesData.js';
import { packBuild } from '../src/core/pack.js';
import { phoneCreateStore, phoneIngestEvents } from '../src/core/phone.js';
import { createChatState, layEggs, triggerConception } from '../src/core/physiology.js';
import { TRACKER_MAX_TOKENS } from '../src/core/prompts.js';
import { wikiCreateStore, wikiManualEdit } from '../src/core/wiki.js';

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeFakeDom() {
    class FakeText {
        constructor(text) {
            this.nodeType = 3;
            this.textContent = String(text);
            this.parentNode = null;
        }
        remove() {
            if (!this.parentNode) return;
            const idx = this.parentNode.childNodes.indexOf(this);
            if (idx >= 0) this.parentNode.childNodes.splice(idx, 1);
            this.parentNode = null;
        }
    }

    class FakeEl {
        constructor(doc, tag) {
            this.ownerDocument = doc;
            this.nodeType = 1;
            this.tagName = String(tag).toUpperCase();
            this._style = {};
            this.dataset = {};
            this.attributes = {};
            this.childNodes = [];
            this.listeners = new Map();
            this.parentNode = null;
            this.className = '';
            this.hidden = false;
            this.disabled = false;
            this.checked = false;
            this.selected = false;
            this.value = '';
            this.type = '';
            this.id = '';
            this.title = '';
            this.src = '';
            this.href = '';
            this.target = '';
            this.rel = '';
            this.alt = '';
            this.rows = 0;
            this.min = '';
            this.max = '';
            this.step = '';
            this.maxLength = 0;
            this.placeholder = '';
            this.role = '';
            this.loading = '';
            this.controls = false;
            this.autoplay = false;
            this.loop = false;
            this.muted = false;
            this.playsInline = false;
        }
        get style() {
            return this._style;
        }
        set style(_v) {
            throw new TypeError('Strict WebView: cannot assign string directly to Element.style');
        }
        get textContent() {
            return this.childNodes.map(c => c.textContent ?? '').join('');
        }
        set textContent(v) {
            if (v === '' || v === null || v === undefined) {
                this.replaceChildren();
            } else {
                this.replaceChildren(this.ownerDocument.createTextNode(String(v)));
            }
        }
        set innerHTML(_v) {
            throw new Error('innerHTML is forbidden in views');
        }
        set outerHTML(_v) {
            throw new Error('outerHTML is forbidden in views');
        }
        setAttribute(k, v) {
            this.attributes[k] = String(v);
            if (k === 'class') this.className = String(v);
            else if (k === 'id') this.id = String(v);
        }
        getAttribute(k) {
            if (k === 'class') return this.className;
            return this.attributes[k] ?? null;
        }
        removeAttribute(k) {
            delete this.attributes[k];
        }
        addEventListener(type, fn) {
            const key = String(type).toLowerCase();
            const list = this.listeners.get(key) ?? [];
            list.push(fn);
            this.listeners.set(key, list);
        }
        dispatchEvent(ev) {
            const event = ev && typeof ev === 'object' ? ev : { type: String(ev) };
            event.target ??= this;
            event.currentTarget = this;
            for (const fn of this.listeners.get(String(event.type).toLowerCase()) ?? []) {
                fn(event);
            }
        }
        click() {
            this.dispatchEvent({ type: 'click', target: this });
        }
        focus() {
            this.ownerDocument.activeElement = this;
        }
        blur() {
            if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
        }
        contains(node) {
            let cur = node;
            while (cur) {
                if (cur === this) return true;
                cur = cur.parentNode;
            }
            return false;
        }
        _adopt(nodes) {
            const out = [];
            for (const n of nodes.flat()) {
                // Match the real DOM Living Standard: Element.append/replaceChildren convert
                // null/undefined/false into text nodes ("null"/"undefined"/"false") instead of skipping them.
                const node = n && typeof n === 'object' && typeof n.nodeType === 'number'
                    ? n
                    : this.ownerDocument.createTextNode(String(n));
                if (node.parentNode && node.parentNode !== this) {
                    const idx = node.parentNode.childNodes.indexOf(node);
                    if (idx >= 0) node.parentNode.childNodes.splice(idx, 1);
                }
                node.parentNode = this;
                out.push(node);
            }
            return out;
        }
        append(...nodes) {
            this.childNodes.push(...this._adopt(nodes));
        }
        prepend(...nodes) {
            this.childNodes.unshift(...this._adopt(nodes));
        }
        replaceChildren(...nodes) {
            for (const c of this.childNodes) c.parentNode = null;
            this.childNodes = [];
            this.append(...nodes);
        }
        remove() {
            if (!this.parentNode) return;
            const idx = this.parentNode.childNodes.indexOf(this);
            if (idx >= 0) this.parentNode.childNodes.splice(idx, 1);
            this.parentNode = null;
        }
        getBoundingClientRect() {
            return { left: 20, top: 20, width: 220, height: 34 };
        }
        walk(fn) {
            for (const child of this.childNodes) {
                if (child.nodeType !== 1) continue;
                fn(child);
                child.walk(fn);
            }
        }
        matchesSimple(sel) {
            const tokens = sel.trim().match(/(\.[a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z0-9_-]+)/g) || [];
            if (!tokens.length) return false;
            return tokens.every(tok => {
                if (tok.startsWith('.')) {
                    return String(this.className || '').split(/\s+/).includes(tok.slice(1));
                }
                const dataMatch = tok.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
                if (dataMatch) {
                    const camel = dataMatch[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
                    const val = this.dataset[camel];
                    return dataMatch[2] === undefined ? val !== undefined : String(val) === dataMatch[2];
                }
                return this.tagName === tok.toUpperCase();
            });
        }
        querySelectorAll(sel) {
            const parts = sel.split(',').map(p => p.trim()).filter(Boolean);
            const out = [];
            const matchPart = (node, part) => {
                const chain = part.split(/\s+/).filter(Boolean);
                if (!chain.length || !node.matchesSimple(chain[chain.length - 1])) return false;
                let anc = node.parentNode;
                for (let i = chain.length - 2; i >= 0; i -= 1) {
                    while (anc && !(anc.nodeType === 1 && anc.matchesSimple(chain[i]))) anc = anc.parentNode;
                    if (!anc) return false;
                    anc = anc.parentNode;
                }
                return true;
            };
            this.walk(node => {
                if (parts.some(p => matchPart(node, p))) out.push(node);
            });
            return out;
        }
        querySelector(sel) {
            return this.querySelectorAll(sel)[0] ?? null;
        }
    }

    const doc = {
        defaultView: { innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {} },
        createElement(t) { return new FakeEl(doc, t); },
        createTextNode(txt) { return new FakeText(txt); },
    };
    doc.body = new FakeEl(doc, 'body');
    doc.activeElement = doc.body;
    return doc;
}

function makeTestHarness({ locale = 'ru', bottomInput = 74, chatOverrides = {}, settingsOverrides = {}, rpPrefsOverrides = null, fetchHandler = null, confirm = async () => true } = {}) {
    const doc = makeFakeDom();
    let currentLocale = locale;
    let currentInsets = { topBar: 12, bottomInput };
    const localeListeners = new Set();
    const insetListeners = new Set();

    let state = createChatState('2026-11-19');
    Object.assign(state.world, chatOverrides.world || {});
    Object.assign(state.counters, chatOverrides.counters || {});
    if (chatOverrides.underworld) Object.assign(state.underworld, chatOverrides.underworld);
    if (chatOverrides.inventory) Object.assign(state.inventory, chatOverrides.inventory);
    if (Array.isArray(chatOverrides.companions)) state.companions = chatOverrides.companions;
    let savedRpPrefs = rpPrefsOverrides ? structuredClone(rpPrefsOverrides) : {};

    const settings = {
        apiKey: 'sk-views_test_123456',
        trackerModel: 'gemini-2.5-flash-lite',
        codexModel: 'gemini-2.5-flash-lite',
        imageModel: 'gemini-2.5-flash-image-nano-banana',
        videoModel: 'kling-v2',
        speechModel: 'eleven_multilingual_v2',
        defaultVoice: 'matteo_voice',
        confirmPaid: true,
        maxAutoSpendUsd: 0.25,
        autoTrack: true,
        slopMode: 'inject',
        slopDisabled: [],
        slopPhrases: [],
        directorPresets: [],
        meterPacks: [],
        codexPresets: [],
        wikiEnabled: true,
        wikiEvery: 8,
        phoneSkin: 'auto',
        showInnerThoughts: true,
        showSuggestedActions: true,
        thoughtsBlurred: true,
        ...settingsOverrides,
    };

    const stores = {
        clodex_rp_phone: chatOverrides.phoneStore ?? null,
        clodex_rp_wiki: chatOverrides.wikiStore ?? null,
    };
    let activeKeys = chatOverrides.activeKeys ?? ['1:0', '2:0'];
    let latestTurnKey = chatOverrides.latestTurnKey ?? '2:0';
    let rpContext = chatOverrides.rpContext ?? {
        chatId: 'chat-v13',
        userName: 'Данте',
        charName: 'Маттео',
        charDescription: 'Татуированный экзорцист средневековой инквизиции в старом монастыре Данте.',
        scenario: 'Ночной собор.',
        recentMessages: [
            { role: 'user', name: 'Данте', content: 'Что скрывает орден?' },
            { role: 'assistant', name: 'Маттео', content: '*Он усмехнулся, и дрожь пробежала по спине.* «Тише.»' },
            { role: 'assistant', name: 'Маттео', content: '*Усмехнулся снова, и дрожь пробежала по спине в соборе.*' },
            { role: 'assistant', name: 'Маттео', content: '*Дрожь пробежала по спине Маттео, когда свечи задрожали.*' },
        ],
    };

    const calls = { chat: [], image: [], speech: [], confirm: [], exported: [], savedMedia: [], copied: [] };
    let nextImportPack = null;

    const mockFetch = async (url, init = {}) => {
        const u = String(url);
        if (fetchHandler) {
            const custom = await fetchHandler(u, init, calls);
            if (custom) return custom;
        }
        if (u.endsWith('/v1/models')) {
            return new Response(JSON.stringify({
                data: [
                    { id: 'gemini-2.5-flash-lite' },
                    { id: 'gemini-2.5-flash-image-nano-banana' },
                    { id: 'eleven_multilingual_v2' },
                ],
            }), { status: 200 });
        }
        if (u.endsWith('/api/usage/token/')) {
            return new Response(JSON.stringify({ data: { total_available: 100, quota_per_unit: 100, wallet_balance_usd: 10 } }), { status: 200 });
        }
        if (u.endsWith('/api/pricing') || u.endsWith('/api/status')) {
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (u.endsWith('/v1/rp/relics/catalog')) {
            return new Response(JSON.stringify({ editions: [] }), { status: 200 });
        }
        if (u.endsWith('/v1/rp/relics/inventory')) {
            return new Response(JSON.stringify({ relics: [] }), { status: 200 });
        }
        if (u.endsWith('/v1/chat/completions')) {
            const body = JSON.parse(init.body);
            calls.chat.push(body);
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            timeOfDay: 'night',
                            innerThought: '<script>alert(1)</script>Он боится, что правда выйдет наружу.',
                            suggestedActions: ['Спросить про печать', 'Осмотреть алтарь', 'Отступить назад'],
                            phoneEvents: [{ kind: 'note', author: 'Маттео', text: '<b>Скрыть</b> следы до рассвета.' }],
                        }),
                    },
                }],
            }), { status: 200 });
        }
        if (u.endsWith('/v1/images/generations')) {
            calls.image.push(JSON.parse(init.body));
            return new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), { status: 200 });
        }
        if (u.endsWith('/v1/audio/speech')) {
            calls.speech.push(JSON.parse(init.body));
            return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x03]), {
                status: 200,
                headers: { 'content-type': 'audio/mpeg' },
            });
        }
        throw new Error(`Unhandled URL: ${u}`);
    };

    const missingKeys = [];
    const t = (k, p = {}) => {
        const dict = currentLocale === 'ru' ? RU_CATALOG : EN_CATALOG;
        const raw = dict[k];
        if (!raw) missingKeys.push(`${currentLocale}:${k}`);
        return String(raw ?? k).replace(/\{(\w+)\}/g, (m, x) => String(p[x] ?? m));
    };

    const controller = createRpStudioController({
        document: doc,
        fetchImpl: mockFetch,
        mountContainer: doc.body,
        getLocale: () => currentLocale,
        onLocaleChange: cb => { localeListeners.add(cb); return () => localeListeners.delete(cb); },
        getInsets: () => currentInsets,
        onInsetsChange: cb => { insetListeners.add(cb); return () => insetListeners.delete(cb); },
        t,
        confirm: async msg => { calls.confirm.push(msg); return confirm(msg); },
        getEffectiveKey: () => settings.apiKey,
        getSettings: () => settings,
        async updateSettings(patch) { Object.assign(settings, patch); },
        getChatState: () => state,
        async saveChatState(next) { state = next; },
        getActiveTurnKeys: async () => activeKeys,
        getLatestTurnKey: async () => latestTurnKey,
        loadStore: async name => (stores[name] ? structuredClone(stores[name]) : null),
        saveStore: async (name, value) => { stores[name] = structuredClone(value); },
        loadRpPrefs: async () => structuredClone(savedRpPrefs),
        saveRpPrefs: async value => { savedRpPrefs = structuredClone(value || {}); },
        resolveMediaSrc: path => (path && !/^(data:|https?:|resolved:)/.test(path) ? `resolved://${path}` : path),
        copyText: async txt => { calls.copied.push(String(txt)); },
        savePhoneMedia: async ({ entryId, kind }) => {
            const path = `files/chat/clodex-phone-${entryId}.${kind === 'voice' ? 'mp3' : 'png'}`;
            calls.savedMedia.push(path);
            return path;
        },
        exportPack: async pack => { calls.exported.push(pack); },
        importPack: async () => nextImportPack,
        getRpContext: async ({ limit = 6 } = {}) => ({
            ...rpContext,
            recentMessages: rpContext.recentMessages.slice(-limit),
        }),
        insertIntoComposer: async () => {},
        saveSpeechAudio: async () => 'files/chat/tts.mp3',
    });

    return {
        doc,
        controller,
        calls,
        stores,
        getState: () => state,
        getSettings: () => settings,
        getRpPrefs: () => savedRpPrefs,
        setActiveKeys: k => { activeKeys = k; },
        setLatestTurnKey: k => { latestTurnKey = k; },
        setImportPack: p => { nextImportPack = p; },
        setInsets: next => {
            currentInsets = next;
            for (const cb of insetListeners) cb();
        },
        setLocale: next => {
            currentLocale = next;
            for (const cb of localeListeners) cb();
        },
        getMissingKeys: () => missingKeys,
    };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 15));

test('paid ritual sends no model requests before confirmation or after cancellation', async () => {
    let answer;
    const h = makeTestHarness({ locale: 'en', confirm: () => new Promise(resolve => { answer = resolve; }) });
    h.controller.openTab('gacha');
    const button = h.doc.body.querySelector('[data-rp-action="paid-ritual"]');
    assert.ok(button);
    button.click();
    assert.equal(h.calls.confirm.length, 1);
    assert.match(h.calls.confirm[0], /Estimated cost/);
    assert.equal(h.calls.chat.length, 0);
    assert.equal(h.calls.image.length, 0);
    answer(false);
    await flush();
    assert.equal(h.calls.chat.length, 0);
    assert.equal(h.calls.image.length, 0);
});

test('All screens, header order, single-row 4 tabs, HUD <= 4 chips, and RU/EN localization parity', async () => {
    const h = makeTestHarness({
        locale: 'ru',
        chatOverrides: {
            world: {
                enableVitals: true,
                enableAdultBiology: true,
                pendingMemoryHint: 'Armed clue',
                director: { activeIds: ['suspense'], customNote: '' },
            },
            companions: [{ id: 'c1', name: 'Люкс', stage: 'infant', mood: 90, archetype: 'familiar_fox' }],
            phoneStore: phoneIngestEvents(phoneCreateStore(), [
                { kind: 'note', author: 'Маттео', text: 'Тайная запись' },
                { kind: 'feed', author: 'Слухи', text: 'Ночной звон в соборе' },
            ], '2:0'),
            wikiStore: wikiManualEdit(wikiCreateStore(), 'npcs', { name: 'Маттео', role: 'Экзорцист' }, '1:0'),
        },
    });
    await flush();

    // HUD pill never exceeds 4 chips even when all modules + phone + director + memory hint are active
    const pill = h.doc.body.querySelector('.clodex-rp-hud-pill');
    const chips = pill.querySelectorAll('.clodex-rp-chip');
    assert.equal(chips.length, 4);
    assert.match(chips[0].textContent, /📅/);
    assert.match(chips[1].textContent, /❤️|🩸/);
    assert.match(chips[2].textContent, /🐣/);
    assert.match(chips[3].textContent, /📱 \+2.*🎬/);

    // Check every screen & sub-tab in both RU and EN with zero missing / raw keys & zero nested .clodex-rp-tab-body
    for (const lang of ['ru', 'en']) {
        h.setLocale(lang);
        for (const tab of ['tracker', 'underworld', 'cradle', 'gacha', 'relics', 'codex', 'wiki', 'style', 'scene', 'forge', 'packs', 'account', 'phone']) {
            h.controller.openTab(tab);
            await flush();

            const drawer = h.doc.body.querySelector('.clodex-rp-drawer');
            assert.ok(drawer, `Drawer must exist for ${tab}`);

            // Never nest .clodex-rp-tab-body inside .clodex-rp-tab-body (prevents double 24px padding on 390px mobile)
            assert.equal(drawer.querySelectorAll('.clodex-rp-tab-body .clodex-rp-tab-body').length, 0,
                `Double .clodex-rp-tab-body nesting detected on ${lang}/${tab}`);

            // Primary navigation stays strictly 4 tabs in 1 row
            const tabBtns = drawer.querySelectorAll('.clodex-rp-tabs .clodex-rp-tab-btn');
            assert.equal(tabBtns.length, 4);

            // Header action order: 📱 · ⚒️ · 🔑 · ⌖ · ✕
            const headBtns = drawer.querySelectorAll('.clodex-rp-drawer-head .clodex-rp-head-actions button');
            assert.equal(headBtns.length, 5);
            assert.ok(headBtns[0].textContent.startsWith('📱'));
            assert.equal(headBtns[1].textContent, '⚒️');
            assert.equal(headBtns[2].textContent, '🔑');
            assert.equal(headBtns[3].textContent, '⌖');
            assert.equal(headBtns[4].textContent, '✕');

            // No raw unresolved keys leaked into visible text
            const text = drawer.textContent;
            assert.ok(!/\b(?:director|slop|turn|phone|wiki|pack|codex|tab|hud|account|uw|gacha|relic|cradle|bio|vitals|meters|inv|scene|voice|forge|tracker)\.[a-z][a-zA-Z0-9_]*\b/.test(text),
                `Raw key found in ${lang}/${tab}: ${text}`);
        }
    }

    assert.deepEqual(h.getMissingKeys(), []);
    h.controller.dispose();
});

test('Director strip starts collapsed, tracks bottomInput inset, enforces max 2, and clears only on committed reply', async () => {
    const h = makeTestHarness({ locale: 'ru', bottomInput: 82 });
    await flush();

    const host = h.doc.body.querySelector('.clodex-rp-director-host');
    assert.equal(host.style.bottom, '88px');

    // Collapsed by default: toggle exists, body/presets are hidden until clicked
    let bar = host.querySelector('.clodex-rp-director-bar');
    assert.ok(bar);
    assert.equal(host.querySelector('[data-rp-action="director-preset"]'), null);

    // Update insets dynamically
    h.setInsets({ topBar: 10, bottomInput: 0 });
    assert.equal(host.style.bottom, '6px');

    // Expand bar
    host.querySelector('[data-rp-action="director-toggle"]').click();
    const presetBtns = host.querySelectorAll('[data-rp-action="director-preset"]');
    assert.equal(presetBtns.length, 6);

    // Pick 3 presets -> max 2 remain active (oldest dropped)
    host.querySelector('[data-preset-id="suspense"]').click();
    await flush();
    host.querySelector('[data-preset-id="twist"]').click();
    await flush();
    host.querySelector('[data-preset-id="dialogue"]').click();
    await flush();
    assert.deepEqual(h.getState().world.director.activeIds, ['twist', 'dialogue']);

    // Custom note is trimmed to 140 chars
    const noteInput = host.querySelector('[data-rp-action="director-note"]');
    noteInput.value = 'x'.repeat(180);
    noteInput.dispatchEvent({ type: 'change', target: noteInput });
    await flush();
    assert.equal(h.getState().world.director.customNote.length, 140);

    // Clear on committed assistant reply
    await h.controller.onAssistantMessageCommitted({ checkpointKey: '2:0' });
    assert.deepEqual(h.getState().world.director, { activeIds: [], customNote: '' });

    // Verified syncTrackerFromChat used TRACKER_MAX_TOKENS
    assert.ok(h.calls.chat.length >= 1);
    assert.equal(h.calls.chat[0].max_tokens, TRACKER_MAX_TOKENS);

    h.controller.dispose();
});

test('Phone screen renders safely without paid calls until Click-to-Reveal, respects confirmPaid/maxAutoSpendUsd, and arms pendingMemoryHint', async () => {
    const store = phoneIngestEvents(phoneCreateStore(), [
        { kind: 'photo', author: 'Маттео', text: 'Свеча на столе <img src=x onerror=alert(1)>', mediaPrompt: 'Candle in cathedral' },
        { kind: 'voice', author: 'Маттео', text: 'Не приходи сюда ночью.' },
    ], '2:0');
    const h = makeTestHarness({
        locale: 'ru',
        chatOverrides: { phoneStore: store },
        settingsOverrides: { maxAutoSpendUsd: 0.05, confirmPaid: true },
    });
    await flush();

    // Open phone and browse every section — ZERO paid requests until user clicks Reveal
    h.controller.openTab('phone');
    await flush();
    const phoneEl = h.doc.body.querySelector('[data-rp-view="phone"]');
    assert.equal(phoneEl.dataset.skin, 'grimoire'); // auto-detected from cathedral/exorcist description

    h.doc.body.querySelector('[data-rp-action="phone-section"][data-section="media"]').click();
    await flush();
    assert.equal(h.calls.image.length, 0);
    assert.equal(h.calls.speech.length, 0);

    // Hidden photo & voice stubs exist; caption/img/audio must NOT be visible before click
    const revealBtns = h.doc.body.querySelectorAll('[data-rp-action="phone-reveal"]');
    assert.equal(revealBtns.length, 2);
    assert.equal(h.doc.body.querySelector('img'), null);
    assert.equal(h.doc.body.querySelector('audio'), null);

    // Click to reveal photo -> asks confirmPaid, generates 1 image, counts spend
    revealBtns[1].click(); // entries reversed (newest first): [1]=photo, [0]=voice
    await flush();
    await flush();
    assert.equal(h.calls.confirm.length, 1);
    assert.equal(h.calls.image.length, 1);
    assert.equal(h.calls.speech.length, 0);
    assert.ok(h.controller.getSessionAutoSpendUsd() > 0);
    assert.ok(h.doc.body.querySelector('.clodex-rp-phone-photo'));

    // Next reveal (voice, est $0.015; total 0.04+0.015 = 0.055 > 0.05 cap) is blocked by FinOps cap!
    const remainingReveal = h.doc.body.querySelector('[data-rp-action="phone-reveal"]');
    remainingReveal.click();
    await flush();
    assert.equal(h.calls.speech.length, 0);
    assert.ok(h.doc.body.querySelector('.clodex-rp-error'));

    // "Present next turn" arms world.pendingMemoryHint
    h.doc.body.querySelector('[data-rp-action="phone-present"]').click();
    await flush();
    assert.match(h.getState().world.pendingMemoryHint, /Matteo|Маттео|photo|voice/i);

    h.controller.dispose();
});

test('Anti-Slop radar, Wiki manual pin & stale-turn guard, and .clodex-pack preview/reject work cleanly', async () => {
    const h = makeTestHarness({
        locale: 'ru',
        chatOverrides: { counters: { turnsSinceLastPhone: 0, turnsSinceWiki: 8 } },
    });
    await flush();

    // Open Codex -> Style: local Anti-Slop finds repeated phrase without any API call
    const beforeChats = h.calls.chat.length;
    h.controller.openTab('style');
    await flush();
    assert.equal(h.calls.chat.length, beforeChats);
    assert.match(h.getState().world.slopRule, /дрож.*пробежал.*спин/i);

    // Open Codex -> Wiki: add pinned manual row
    h.controller.openTab('wiki');
    await flush();
    h.doc.body.querySelector('[data-rp-action="wiki-add"][data-table="npcs"]').click();
    const form = h.doc.body.querySelector('[data-rp-view="wiki-form-npcs"]');
    const nameField = form.querySelector('[data-rp-field="name"]');
    nameField.value = 'Отец Бернард';
    nameField.dispatchEvent({ type: 'input', target: nameField });
    form.querySelector('[data-rp-action="wiki-save"]').click();
    await flush();
    assert.match(h.doc.body.querySelector('[data-rp-view="wiki-npcs"]').textContent, /Отец Бернард/);

    // Stale wiki update: if turnKey is no longer in activeKeys while waiting, patch is discarded
    const staleH = makeTestHarness({
        locale: 'en',
        chatOverrides: { latestTurnKey: '9:0', activeKeys: ['1:0', '9:0'], counters: { turnsSinceLastPhone: 0, turnsSinceWiki: 8 } },
        fetchHandler: async (u, init) => {
            if (!u.endsWith('/v1/chat/completions')) return null;
            // Swipe happened mid-flight: 9:0 replaced by 9:1
            staleH.setActiveKeys(['1:0', '9:1']);
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            upsert: [{ table: 'places', name: 'Stale Crypt', description: 'Should be dropped' }],
                            remove: [],
                        }),
                    },
                }],
            }), { status: 200 });
        },
    });
    await flush();
    const ok = await staleH.controller.runWikiUpdate({ manual: true });
    assert.equal(ok, false);
    assert.equal(staleH.getState().counters.turnsSinceWiki, 8);
    assert.equal(staleH.stores.clodex_rp_wiki?.journal?.length ?? 0, 0);
    staleH.controller.dispose();

    // Packs tab: reject <script> pack, preview and confirm valid pack
    h.controller.openTab('packs');
    await flush();
    h.setImportPack({
        format: 'clodex-pack',
        version: 1,
        name: 'Bad',
        contents: { slopPhrases: ['<script>evil()</script>'] },
    });
    h.doc.body.querySelector('[data-rp-action="pack-import"]').click();
    await flush();
    assert.equal(h.doc.body.querySelector('[data-rp-action="pack-confirm"]'), null);
    assert.ok(h.doc.body.querySelector('.clodex-rp-pack-errors'));

    const goodPack = packBuild({
        directorPresets: [{ id: 'gothic', emoji: '🕯️', label: 'Gothic omen', directive: 'add gothic omen' }],
        slopPhrases: ['crimson orbs'],
        phoneSkin: 'grimoire',
    }, { name: 'Dante Pack', author: 'tester', locale: 'en' });
    h.setImportPack(goodPack);
    h.doc.body.querySelector('[data-rp-action="pack-import"]').click();
    await flush();
    h.doc.body.querySelector('[data-rp-action="pack-confirm"]').click();
    await flush();
    assert.equal(h.getSettings().directorPresets.length, 1);
    assert.equal(h.getSettings().phoneSkin, 'grimoire');

    h.controller.dispose();
});

test('syncTrackerFromChat gates phoneEvents via phoneShouldInclude, escapes LLM HTML, runs background wiki, and settings.html exposes phone/wiki', async () => {
    // 1. turnsSinceLastPhone < 3 => phoneEvents must NOT be requested or ingested
    const lowPhone = makeTestHarness({
        locale: 'ru',
        chatOverrides: { counters: { turnsSinceLastPhone: 1, turnsSinceWiki: 0 } },
    });
    await flush();
    await lowPhone.controller.syncTrackerFromChat({ checkpointKey: '2:0', silent: true });
    assert.equal(lowPhone.calls.chat.length, 1);
    assert.ok(!/phoneEvents/.test(JSON.stringify(lowPhone.calls.chat[0].messages)));
    assert.equal(lowPhone.stores.clodex_rp_phone?.journal?.length ?? 0, 0);
    lowPhone.controller.dispose();

    // 2. turnsSinceLastPhone >= 3 + turnsSinceWiki >= 7 (after +1 => 8) => requests phoneEvents & triggers wiki update
    let chatCallIdx = 0;
    const high = makeTestHarness({
        locale: 'ru',
        chatOverrides: { counters: { turnsSinceLastPhone: 3, turnsSinceWiki: 7 } },
        fetchHandler: async u => {
            if (!u.endsWith('/v1/chat/completions')) return null;
            chatCallIdx += 1;
            if (chatCallIdx === 1) {
                return new Response(JSON.stringify({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                timeOfDay: 'night',
                                phoneEvents: [{ kind: 'dm', author: '<script>evil</script>', text: '<img src=x onerror=alert(1)>Полночь' }],
                            }),
                        },
                    }],
                }), { status: 200 });
            }
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            upsert: [{ table: 'places', name: '<script>Собор</script>', description: 'Тёмный неф' }],
                            remove: [],
                        }),
                    },
                }],
            }), { status: 200 });
        },
    });
    await flush();
    await high.controller.syncTrackerFromChat({ checkpointKey: '2:0', silent: true });
    await flush();
    await flush();

    // Phone ingested and rendered as safe textContent (no script/img elements created!)
    high.controller.openTab('phone');
    await flush();
    const phoneViewEl = high.doc.body.querySelector('[data-rp-view="phone"]');
    assert.equal(phoneViewEl.querySelector('script'), null);
    assert.equal(phoneViewEl.querySelector('img'), null);
    assert.match(phoneViewEl.textContent, /Полночь/);

    // Background wiki update ran and reset turnsSinceWiki to 0 after success
    assert.equal(high.getState().counters.turnsSinceWiki, 0);
    assert.ok((high.stores.clodex_rp_wiki?.journal?.length ?? 0) >= 1);
    high.controller.openTab('wiki');
    await flush();
    assert.equal(high.doc.body.querySelector('[data-rp-view="wiki"]').querySelector('script'), null);

    // 3. settings.html contains phone & wiki openers with valid RU/EN locale keys
    const settingsHtml = await readFile(new URL('../settings.html', import.meta.url), 'utf8');
    assert.match(settingsHtml, /data-rp-open="phone"/);
    assert.match(settingsHtml, /data-rp-open="wiki"/);
    for (const m of settingsHtml.matchAll(/data-clodex-rp-i18n="([^"]+)"/g)) {
        assert.ok(EN_CATALOG[m[1]] && RU_CATALOG[m[1]], `Missing locale key in settings.html: ${m[1]}`);
    }

    high.controller.dispose();
});

test('Mobile Tavo hotfix: drawer mask starts hidden/non-blocking, X closes cleanly, and no "null" text renders', async () => {
    const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
    assert.match(css, /\.clodex-rp-drawer-mask\[hidden\][\s\S]*?display:\s*none\s*!important/);
    assert.match(css, /\.clodex-rp-drawer-mask\s*\{[\s\S]*?display:\s*none;/);
    assert.match(css, /\.clodex-rp-drawer-mask\.is-open:not\(\[hidden\]\)\s*\{[\s\S]*?display:\s*flex;/);

    const h = makeTestHarness({ locale: 'ru' });
    await flush();

    const mask = h.doc.body.querySelector('.clodex-rp-drawer-mask');
    const drawer = h.doc.body.querySelector('.clodex-rp-drawer');
    const videoBg = h.doc.body.querySelector('.clodex-rp-video-backdrop');

    // Initial state must never dim or block the chat in WebViews without a [hidden] CSS reset
    assert.equal(mask.hidden, true);
    assert.equal(mask.style.display, 'none');
    assert.equal(mask.style.pointerEvents, 'none');
    assert.ok(!mask.className.includes('is-open'));
    assert.equal(videoBg.hidden, true);
    assert.equal(videoBg.style.display, 'none');

    // Opening via openTab renders cleanly without stray "null" text nodes
    h.controller.openTab('codex');
    await flush();
    assert.equal(mask.hidden, false);
    assert.equal(mask.style.display, 'flex');
    assert.equal(mask.style.pointerEvents, 'auto');
    assert.ok(mask.className.includes('is-open'));
    assert.ok(!drawer.textContent.includes('null'), `Stray "null" rendered in drawer: ${drawer.textContent}`);

    // Clicking the ✕ button hides the mask, disables pointer events, and clears panel contents
    const closeBtn = drawer.querySelector('[data-rp-action="close-drawer"]');
    assert.ok(closeBtn);
    closeBtn.click();
    assert.equal(mask.hidden, true);
    assert.equal(mask.style.display, 'none');
    assert.equal(mask.style.pointerEvents, 'none');
    assert.ok(!mask.className.includes('is-open'));
    assert.equal(drawer.childNodes.length, 0);

    // Clicking the HUD pill opens the drawer, and tapping the mask outside closes it
    const pill = h.doc.body.querySelector('.clodex-rp-hud-pill');
    pill.click();
    assert.equal(mask.hidden, false);
    assert.equal(mask.style.display, 'flex');
    mask.click();
    assert.equal(mask.hidden, true);
    assert.equal(mask.style.display, 'none');

    h.controller.dispose();
});

test('HUD pill renders compact underworld secondary chip when heat >= 1 or turnsInDebt >= 1 while capping <= 4 chips', async () => {
    const h = makeTestHarness({
        locale: 'ru',
        chatOverrides: {
            world: { enableVitals: true, enableAdultBiology: true },
            underworld: { heat: 0, debt: 0, turnsInDebt: 0, currency: '$' },
        },
    });
    await flush();

    const pill = h.doc.body.querySelector('.clodex-rp-hud-pill');
    assert.equal(pill.querySelector('[data-rp-chip="underworld"]'), null);

    const st = h.getState();
    st.underworld.heat = 2.5;
    st.underworld.debt = 1500;
    st.underworld.turnsInDebt = 2;
    h.controller.renderAll();

    const uwChip = pill.querySelector('[data-rp-chip="underworld"]');
    assert.ok(uwChip);
    assert.equal(uwChip.textContent, '🚔 2.5★ · 💸 $1500');
    assert.ok(pill.querySelectorAll('.clodex-rp-chip').length <= 4);

    h.controller.dispose();
});

test('Underworld Casino UI: skin switching, visible Dice roll, 3-reel Slots, active Blackjack cards/totals + Double, and Story Wagers', async () => {
    const h = makeTestHarness({
        locale: 'ru',
        chatOverrides: {
            underworld: { cash: 1000, currency: '$', skin: 'crime' },
        },
    });
    await flush();

    h.controller.openTab('underworld');
    await flush();

    // Skin selector switches titles & presets dynamically
    const skinSelect = h.doc.body.querySelector('[data-rp-action="uw-skin"]');
    assert.ok(skinSelect);
    skinSelect.value = 'syndicate';
    skinSelect.dispatchEvent({ type: 'change', target: skinSelect });
    await flush();
    assert.equal(h.doc.body.querySelector('[data-rp-view="underworld"]').dataset.skin, 'syndicate');
    assert.match(h.doc.body.querySelector('[data-rp-view="uw-casino"]').textContent, /Неоновый клуб Синдиката/);

    skinSelect.value = 'crime';
    skinSelect.dispatchEvent({ type: 'change', target: skinSelect });
    await flush();

    // 1. Dice (2d6): localized buttons & visible roll outcome
    const diceOverBtn = h.doc.body.querySelector('[data-rp-action="uw-dice"][data-side="over"]');
    assert.match(diceOverBtn.textContent, /Больше 7 ×2/);
    assert.match(h.doc.body.querySelector('[data-rp-action="uw-dice"][data-side="seven"]').textContent, /Ровно 7 ×4\.5/);
    assert.match(h.doc.body.querySelector('[data-rp-action="uw-dice"][data-side="double"]').textContent, /Дубль ×5/);
    diceOverBtn.click();
    await flush();
    let outcome = h.doc.body.querySelector('[data-rp-view="casino-outcome"]');
    assert.ok(outcome);
    assert.equal(outcome.dataset.game, 'dice');
    assert.match(outcome.textContent, /🎲 \[\d\] \+ \[\d\] = \d+/);

    // 2. Slots: big 3-reel display + payout/net
    h.doc.body.querySelector('[data-rp-action="uw-slots"]').click();
    await flush();
    const reels = h.doc.body.querySelector('[data-rp-view="slots-reels"]');
    assert.ok(reels);
    assert.match(reels.textContent, /^\[ .+ \| .+ \| .+ \]$/);
    outcome = h.doc.body.querySelector('[data-rp-view="casino-outcome"]');
    assert.equal(outcome.dataset.game, 'slots');
    assert.match(outcome.textContent, /Выплата.*Итог/);

    // 3. Blackjack (21): active hand renders Player cards + total, Dealer upcard + [🂠], Hit/Stand/Double
    const st = h.getState();
    const remainingDeck = Array.from({ length: 52 }, (_, i) => i).filter(c => ![0, 8, 12, 4].includes(c));
    st.underworld.cash = 300;
    st.underworld.blackjack = {
        wager: 50,
        deck: remainingDeck, // pop() draws 51 = K♣ (10), making A♠(11)+9♠(9)+K♣(10) = 20!
        player: [0, 8],      // A♠ + 9♠ = 20
        dealer: [12, 4],     // K♠ + 5♠ = 15
        status: 'playing',
    };
    h.controller.renderAll();

    const bjBox = h.doc.body.querySelector('[data-rp-view="blackjack-active"]');
    assert.ok(bjBox);
    assert.equal(bjBox.querySelector('[data-rp-view="bj-player-hand"]').textContent, 'A♠ 9♠ (20)');
    assert.equal(bjBox.querySelector('[data-rp-view="bj-dealer-hand"]').textContent, 'K♠ [🂠]');
    assert.match(bjBox.querySelector('[data-rp-action="uw-bj-hit"]').textContent, /Ещё/);
    assert.match(bjBox.querySelector('[data-rp-action="uw-bj-stand"]').textContent, /Хватит/);
    const doubleBtn = bjBox.querySelector('[data-rp-action="uw-bj-double"]');
    assert.match(doubleBtn.textContent, /Удвоить/);
    assert.equal(doubleBtn.disabled, false);

    // Double disabled when cash < wager
    st.underworld.cash = 20;
    h.controller.renderAll();
    assert.equal(h.doc.body.querySelector('[data-rp-action="uw-bj-double"]').disabled, true);

    // Restore cash and click Double -> resolves hand and shows both full hands + totals + net
    st.underworld.cash = 300;
    h.controller.renderAll();
    h.doc.body.querySelector('[data-rp-action="uw-bj-double"]').click();
    await flush();
    assert.equal(st.underworld.blackjack, null);
    outcome = h.doc.body.querySelector('[data-rp-view="casino-outcome"]');
    assert.equal(outcome.dataset.game, 'blackjack');
    assert.match(outcome.textContent, /A♠ 9♠ K♣ \(20\)/);
    assert.match(outcome.textContent, /K♠ 5♠/);
    assert.match(outcome.textContent, /Итог:/);

    // 4. Story Wager with {{char}}: choose stake, check cooldown & armed pendingWorldEvent badge
    h.doc.body.querySelector('[data-rp-action="uw-wager-stake"][data-stake="secret"]').click();
    await flush();
    h.doc.body.querySelector('[data-rp-action="uw-wager"]').click();
    await flush();
    assert.equal(st.underworld.wagerCooldown, 3);
    assert.match(st.underworld.pendingWorldEvent, /reveal one guarded secret/);
    assert.ok(h.doc.body.querySelector('[data-rp-view="uw-world-event"]'));
    assert.ok(h.doc.body.querySelector('[data-rp-view="uw-wager-cooldown"]'));

    assert.deepEqual(h.getMissingKeys(), []);
    h.controller.dispose();
});

test('Underworld Pawn Shop: separate pawnValueDraft, preset apartment pawn, inventory pawn/redeem, and name safety guard', async () => {
    const h = makeTestHarness({
        locale: 'ru',
        chatOverrides: {
            underworld: { cash: 500, debt: 0, skin: 'crime', currency: '$' },
            inventory: { char: [], user: ['Серебряный перстень', 'Старинный ключ'] },
            companions: [{ id: 'c1', name: 'Люкс', stage: 'infant', mood: 90, archetype: 'familiar_fox' }],
        },
    });
    await flush();

    h.controller.openTab('underworld');
    await flush();

    // Changing casino bet input NEVER touches pawnValueDraft (defaults to 500)
    const betInput = h.doc.body.querySelector('[data-rp-action="uw-bet"]');
    const pawnValInput = h.doc.body.querySelector('[data-rp-action="uw-pawn-value"]');
    assert.equal(pawnValInput.value, '500');
    betInput.value = '15';
    betInput.dispatchEvent({ type: 'input', target: betInput });
    assert.equal(h.doc.body.querySelector('[data-rp-action="uw-pawn-value"]').value, '500');

    // 1-click preset Apartment pawn (+$15,000)
    const aptBtn = h.doc.body.querySelector('[data-rp-action="uw-pawn-preset"][data-preset="apartment"]');
    assert.ok(aptBtn);
    assert.match(aptBtn.textContent, /🏠 Квартира.*15/);
    aptBtn.click();
    await flush();
    assert.equal(h.getState().underworld.cash, 15500);
    assert.equal(h.getState().underworld.debt, 15000);
    const colList = h.doc.body.querySelector('[data-rp-view="uw-collateral-list"]');
    assert.match(colList.textContent, /Квартира.*Выкуп: \$17.*осталось 6 х\./);

    // Inventory pawning removes item from state.inventory.user; redeeming restores it
    const invPawnBtn = h.doc.body.querySelector('[data-rp-action="uw-pawn-inv"][data-index="0"]');
    assert.ok(invPawnBtn);
    assert.equal(invPawnBtn.dataset.item, 'Серебряный перстень');
    invPawnBtn.click();
    await flush();
    assert.deepEqual(h.getState().inventory.user, ['Старинный ключ']);
    const ringEntry = h.getState().underworld.collateral.find(c => c.kind === 'inventory');
    assert.ok(ringEntry);
    assert.equal(ringEntry.pawnValue, 500);

    // Add extra cash to cover 15% redeem fee and redeem the ring
    h.getState().underworld.cash += 500;
    h.controller.renderAll();
    h.doc.body.querySelector(`[data-rp-action="uw-redeem"][data-collateral-id="${ringEntry.id}"]`).click();
    await flush();
    assert.deepEqual(h.getState().inventory.user, ['Старинный ключ', 'Серебряный перстень']);

    // Custom collateral blocks character, user, and companion names
    for (const forbidden of ['Маттео', 'Данте', 'Люкс']) {
        const colInput = h.doc.body.querySelector('[data-rp-action="uw-collateral-label"]');
        colInput.value = forbidden;
        colInput.dispatchEvent({ type: 'input', target: colInput });
        h.doc.body.querySelector('[data-rp-action="uw-pawn-custom"]').click();
        await flush();
        assert.equal(h.getState().underworld.collateral.some(c => c.label.includes(forbidden)), false);
        assert.ok(h.doc.body.querySelector('.clodex-rp-error'));
    }

    assert.deepEqual(h.getMissingKeys(), []);
    h.controller.dispose();
});

test('Underworld Wanted, Wiki faction import, muscle world event, and npcDossier phone DM + cancel/error refund', async () => {
    let allowConfirm = false;
    let failDossierApi = false;
    const wiki = wikiManualEdit(
        wikiManualEdit(wikiCreateStore(), 'npcs', { name: 'Маттео', role: 'Экзорцист' }, '1:0'),
        'npcs',
        { name: 'Инквизитор Варгас', role: 'Судья' },
        '2:0',
    );
    const h = makeTestHarness({
        locale: 'ru',
        confirm: async () => allowConfirm,
        chatOverrides: {
            underworld: { cash: 1000, heat: 3.5, standing: -40, skin: 'crime' },
            wikiStore: wiki,
        },
        fetchHandler: async (u, init, calls) => {
            if (!u.endsWith('/v1/chat/completions')) return null;
            calls.chat.push(JSON.parse(init.body));
            if (failDossierApi) {
                return new Response(JSON.stringify({ error: { message: 'Upstream failure' } }), { status: 500 });
            }
            return new Response(JSON.stringify({
                choices: [{ message: { content: 'Варгас тайно выкупает долговые расписки монастыря через подставных ростовщиков.' } }],
            }), { status: 200 });
        },
    });
    await flush();

    h.controller.openTab('underworld');
    await flush();

    // Wanted stars & standing rendered
    const stars = h.doc.body.querySelector('[data-rp-view="uw-wanted-stars"]');
    assert.ok(stars);
    assert.equal(stars.dataset.heat, '3.5');

    // Import factions from Wiki uses wikiCache.npcs
    h.doc.body.querySelector('[data-rp-action="uw-import-factions"]').click();
    await flush();
    const factionNames = h.getState().underworld.factions.map(f => f.name);
    assert.deepEqual(factionNames, ['Маттео', 'Инквизитор Варгас']);
    assert.match(h.doc.body.querySelector('[data-rp-view="uw-factions"]').textContent, /Инквизитор Варгас/);

    // clearHeat lowers heat by 2★ (-180)
    h.doc.body.querySelector('[data-rp-action="uw-service"][data-service="clearHeat"]').click();
    await flush();
    assert.equal(h.getState().underworld.heat, 1.5);
    assert.equal(h.getState().underworld.cash, 820);

    // muscle deducts 320 and arms pendingWorldEvent (kind: 'service')
    const targetInput = h.doc.body.querySelector('[data-rp-action="uw-target"]');
    targetInput.value = 'Инквизитор Варгас';
    targetInput.dispatchEvent({ type: 'input', target: targetInput });
    h.doc.body.querySelector('[data-rp-action="uw-service"][data-service="muscle"]').click();
    await flush();
    assert.equal(h.getState().underworld.cash, 500);
    assert.equal(h.getState().underworld.eventKind, 'service');
    assert.match(h.getState().underworld.pendingWorldEvent, /Инквизитор Варгас/);
    assert.ok(h.doc.body.querySelector('[data-rp-view="uw-world-event"]'));

    // npcDossier cancelled -> 0 API calls and full 260 refund
    allowConfirm = false;
    h.doc.body.querySelector('[data-rp-action="uw-service"][data-service="npcDossier"]').click();
    await flush();
    assert.equal(h.calls.chat.length, 0);
    assert.equal(h.getState().underworld.cash, 500);

    // npcDossier API failure -> full 260 refund
    allowConfirm = true;
    failDossierApi = true;
    h.doc.body.querySelector('[data-rp-action="uw-service"][data-service="npcDossier"]').click();
    await flush();
    await flush();
    assert.equal(h.calls.chat.length, 1);
    assert.equal(h.getState().underworld.cash, 500);
    assert.ok(h.doc.body.querySelector('.clodex-rp-error'));

    // npcDossier success -> deducts 260 and ingests leaked dossier DM into clodex_rp_phone
    failDossierApi = false;
    const tIn = h.doc.body.querySelector('[data-rp-action="uw-target"]');
    tIn.value = 'Инквизитор Варгас';
    tIn.dispatchEvent({ type: 'input', target: tIn });
    h.doc.body.querySelector('[data-rp-action="uw-service"][data-service="npcDossier"]').click();
    await flush();
    await flush();
    assert.equal(h.getState().underworld.cash, 240);

    h.controller.openTab('phone');
    await flush();
    const phoneText = h.doc.body.querySelector('[data-rp-view="phone"]').textContent;
    assert.match(phoneText, /Варгас тайно выкупает долговые расписки/);

    assert.deepEqual(h.getMissingKeys(), []);
    h.controller.dispose();
});

test('Altar pending egg details & re-skinning, Companion & Oviposition Nest skin selectors, and Relics <a> link + copy', async () => {
    const h = makeTestHarness({
        locale: 'ru',
        rpPrefsOverrides: {
            unlockedEggSkins: ['obsidian_kintsugi', 'seraph_porcelain'],
            pendingEggs: [{
                id: 'egg-altar-1',
                rarity: 'mythic',
                eggSkin: 'obsidian_kintsugi',
                archetype: 'celestial_wisp',
                mutationTrait: 'пепельный резонанс',
                personality: 'тихий наблюдатель',
                prophecy: 'пробудится под колокольный звон',
                warmth: 60,
                hatched: false,
                name: 'Серафиэль',
                artPath: 'egg-seraph.png',
            }],
        },
        chatOverrides: {
            world: { enableAdultBiology: true },
            companions: [{
                id: 'comp-1',
                name: 'Люкс',
                stage: 'child',
                rarity: 'ssr',
                eggSkin: 'obsidian_kintsugi',
                mood: 92,
                archetype: 'familiar_fox',
                needsStageArt: false,
            }],
        },
        fetchHandler: async u => {
            if (u.endsWith('/v1/rp/relics/catalog')) {
                return new Response(JSON.stringify({
                    editions: [{
                        editionKey: 'ash_seraph_2026',
                        titleRu: 'Пепельный Серафим',
                        titleEn: 'Ash Seraph',
                        mintedCount: 7,
                        maxSupply: 100,
                    }],
                }), { status: 200 });
            }
            return null;
        },
    });
    await flush();

    // 1. Altar: displays artPath via resolveMediaSrc, mutationTrait, personality, prophecy, and equips unlocked skin
    h.controller.openTab('gacha');
    await flush();
    const eggArt = h.doc.body.querySelector('[data-rp-view="gacha-egg-art"]');
    assert.ok(eggArt);
    assert.equal(eggArt.src, 'resolved://egg-seraph.png');
    const altarText = h.doc.body.querySelector('[data-rp-view="gacha-pending"]').textContent;
    assert.match(altarText, /пепельный резонанс/);
    assert.match(altarText, /тихий наблюдатель/);
    assert.match(altarText, /пробудится под колокольный звон/);
    assert.match(altarText, /Мифический/);

    const eggSkinSelect = h.doc.body.querySelector('[data-rp-action="gacha-egg-skin"]');
    assert.ok(eggSkinSelect);
    eggSkinSelect.value = 'seraph_porcelain';
    eggSkinSelect.dispatchEvent({ type: 'change', target: eggSkinSelect });
    await flush();
    assert.equal(h.getRpPrefs().pendingEggs[0].eggSkin, 'seraph_porcelain');
    assert.match(h.doc.body.querySelector('[data-rp-view="gacha-pending"]').textContent, /Фарфор Серафима/);

    // 2. Cradle -> Companions: shows rarity/skin badge and equips unlocked skin on existing companion
    h.controller.openTab('cradle');
    await flush();
    const compSkinSelect = h.doc.body.querySelector('[data-rp-action="companion-egg-skin"]');
    assert.ok(compSkinSelect);
    compSkinSelect.value = 'seraph_porcelain';
    compSkinSelect.dispatchEvent({ type: 'change', target: compSkinSelect });
    await flush();
    assert.equal(h.getState().companions[0].eggSkin, 'seraph_porcelain');
    assert.equal(h.getState().companions[0].needsStageArt, true);

    // 3. Tracker -> Oviposition & Nest Pro: equips unlocked skin on nest egg
    const st = h.getState();
    st.entities.char.bio.mode = 'oviposition';
    triggerConception(st.entities.char, st, { force: true });
    layEggs(st.entities.char, st, 2);
    h.controller.openTab('tracker');
    await flush();
    const nestSelect = h.doc.body.querySelector('[data-rp-action="nest-egg-skin"][data-egg-index="0"]');
    assert.ok(nestSelect);
    nestSelect.value = 'seraph_porcelain';
    nestSelect.dispatchEvent({ type: 'change', target: nestSelect });
    await flush();
    assert.equal(st.entities.char.bio.nest.eggs[0].eggSkin, 'seraph_porcelain');

    // 4. Relics: renders WebView-safe <a target="_blank" rel="noopener noreferrer"> + copy-link button
    h.controller.openTab('relics');
    await flush();
    await flush();
    const mintAnchor = h.doc.body.querySelector('[data-rp-action="relic-mint-link"]');
    assert.ok(mintAnchor);
    assert.equal(mintAnchor.tagName, 'A');
    assert.equal(mintAnchor.getAttribute('href'), 'https://clodex.xyz/console/rp-relics?edition=ash_seraph_2026');
    assert.equal(mintAnchor.getAttribute('target'), '_blank');
    assert.equal(mintAnchor.getAttribute('rel'), 'noopener noreferrer');

    const copyBtn = h.doc.body.querySelector('[data-rp-action="relic-copy-link"]');
    assert.ok(copyBtn);
    copyBtn.click();
    await flush();
    assert.deepEqual(h.calls.copied, ['https://clodex.xyz/console/rp-relics?edition=ash_seraph_2026']);

    assert.deepEqual(h.getMissingKeys(), []);
    h.controller.dispose();
});
