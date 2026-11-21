import assert from 'node:assert/strict';
import test from 'node:test';

import { ClodexApi } from '../src/core/api.js';
import { createCompanionFromArchetype } from '../src/core/companion.js';
import { gaNormalizePrefs } from '../src/core/gacha.js';
import { giftPackage } from '../src/core/gift.js';
import { createRpStudioController } from '../src/core/hud.js';
import { EN_CATALOG, RU_CATALOG } from '../src/core/localesData.js';
import { createChatState } from '../src/core/physiology.js';
import {
    RLS_CLIENT_VERSION,
    rlsIsNewerVersion,
    rlsNormalizeBulletin,
    rlsSafeUrl,
    rlsSanitizeFeedback,
} from '../src/core/release.js';

function makeSimpleDom() {
    class TextNode {
        constructor(t) { this.nodeType = 3; this.textContent = String(t); this.parentNode = null; }
        remove() {
            if (!this.parentNode) return;
            const i = this.parentNode.childNodes.indexOf(this);
            if (i >= 0) this.parentNode.childNodes.splice(i, 1);
            this.parentNode = null;
        }
    }
    class ElNode {
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
            this.value = '';
        }
        get style() { return this._style; }
        get textContent() { return this.childNodes.map(c => c.textContent ?? '').join(''); }
        set textContent(v) {
            this.replaceChildren(...(v ? [this.ownerDocument.createTextNode(String(v))] : []));
        }
        setAttribute(k, v) {
            this.attributes[k] = String(v);
            if (k.startsWith('data-')) {
                const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
                this.dataset[camel] = String(v);
            }
        }
        removeAttribute(k) { delete this.attributes[k]; }
        getBoundingClientRect() { return { width: 120, height: 32, left: 0, top: 0 }; }
        focus() {}
        pause() {}
        append(...nodes) {
            for (const n of nodes) {
                if (n == null || n === false) continue;
                const child = typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n;
                if (child.parentNode) child.remove?.();
                child.parentNode = this;
                this.childNodes.push(child);
            }
        }
        appendChild(node) { this.append(node); return node; }
        prepend(...nodes) {
            const prepared = nodes.filter(n => n != null && n !== false)
                .map(n => (typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n));
            for (const c of prepared) c.parentNode = this;
            this.childNodes.unshift(...prepared);
        }
        replaceChildren(...nodes) {
            for (const c of this.childNodes) c.parentNode = null;
            this.childNodes = [];
            this.append(...nodes);
        }
        remove() {
            if (!this.parentNode) return;
            const i = this.parentNode.childNodes.indexOf(this);
            if (i >= 0) this.parentNode.childNodes.splice(i, 1);
            this.parentNode = null;
        }
        addEventListener(type, fn) {
            const arr = this.listeners.get(type) || [];
            arr.push(fn);
            this.listeners.set(type, arr);
        }
        click() {
            if (this.disabled) return;
            for (const fn of this.listeners.get('click') || []) fn({ stopPropagation() {}, preventDefault() {}, target: this });
        }
        input(val) {
            this.value = val;
            for (const fn of this.listeners.get('input') || []) fn({ target: this });
        }
        walk(cb) {
            cb(this);
            for (const c of this.childNodes) if (c.nodeType === 1) c.walk(cb);
        }
        matchesSimple(sel) {
            const tokens = sel.trim().match(/(\.[a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z0-9_-]+)/g) || [];
            return tokens.length > 0 && tokens.every(tok => {
                if (tok.startsWith('.')) return String(this.className || '').split(/\s+/).includes(tok.slice(1));
                const dm = tok.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
                if (dm) {
                    const camel = dm[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
                    return dm[2] === undefined ? this.dataset[camel] !== undefined : String(this.dataset[camel]) === dm[2];
                }
                return this.tagName === tok.toUpperCase();
            });
        }
        querySelectorAll(sel) {
            const out = [];
            this.walk(n => { if (n.matchesSimple(sel)) out.push(n); });
            return out;
        }
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    }
    const doc = {
        defaultView: { innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {} },
        createElement(t) { return new ElNode(doc, t); },
        createTextNode(t) { return new TextNode(t); },
    };
    doc.body = new ElNode(doc, 'body');
    return doc;
}

test('ClodexApi attaches X-Clodex-Client & X-Clodex-Host headers and release helpers block untrusted URLs/secrets', async () => {
    let seenHeaders = null;
    const api = new ClodexApi({
        getKey: () => 'sk-test_client_telemetry_12345',
        host: 'tavo',
        fetchImpl: async (_url, init) => {
            seenHeaders = init.headers;
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        },
    });
    await api.models();
    assert.equal(seenHeaders.get('X-Clodex-Client'), `rp-studio/${RLS_CLIENT_VERSION}`);
    assert.equal(seenHeaders.get('X-Clodex-Host'), 'tavo');

    assert.equal(rlsIsNewerVersion('1.6.0', '1.5.1'), true);
    assert.equal(rlsIsNewerVersion('1.5.1', '1.5.1'), false);
    assert.equal(rlsIsNewerVersion('1.4.9', '1.5.1'), false);
    assert.equal(rlsSafeUrl('https://evil.example/plugin.tpg'), '');
    assert.ok(rlsSafeUrl('https://clodex.xyz/releases/CLODEx-RP-Studio-1.6.0.tpg'));
    assert.equal(rlsNormalizeBulletin({
        latestVersion: '1.6.0',
        titleRu: 'Тест',
        titleEn: 'Test',
        tpgUrl: 'https://evil.example/bad.tpg',
        releaseUrl: 'https://clodex.xyz/r',
    }), null);

    const fb = rlsSanitizeFeedback({ category: 'bug', message: 'Нашла баг sk-mysecretkey99999 <script>x</script>', contact: '@lidiya' });
    assert.equal(fb.category, 'bug');
    assert.doesNotMatch(fb.message, /sk-mysecretkey|<script>/);
});

test('In-app update notice, 1-click SillyTavern updater, promo CLXPET1 drop, and 1-tap feedback work end-to-end', async () => {
    const doc = makeSimpleDom();
    const state = createChatState('2026-11-21');
    let rpPrefs = gaNormalizePrefs({});
    const promoFox = giftPackage(createCompanionFromArchetype('familiar_fox', { customName: 'Промо-Лис' }), 'companion', {
        fromAlias: 'CLODEx Labs',
        note: 'Подарок!',
    });
    let selfUpdated = 0;
    const postedFeedback = [];

    const controller = createRpStudioController({
        document: doc,
        mountContainer: doc.body,
        host: 'sillytavern',
        getLocale: () => 'ru',
        t: (key, params = {}) => String(RU_CATALOG[key] ?? EN_CATALOG[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? ''),
        getSettings: () => ({ apiKey: 'sk-release_test_123456', confirmPaid: true, maxAutoSpendUsd: 0.25 }),
        updateSettings: async () => {},
        getEffectiveKey: () => 'sk-release_test_123456',
        getChatScope: () => 'chat-rls',
        getChatState: () => state,
        saveChatState: async next => Object.assign(state, next),
        loadRpPrefs: async () => structuredClone(rpPrefs),
        saveRpPrefs: async val => { rpPrefs = structuredClone(val); },
        selfUpdateExtension: async () => { selfUpdated += 1; return true; },
        notify: () => {},
        fetchImpl: async (url, init = {}) => {
            const u = String(url);
            if (u.endsWith('/v1/rp/studio/release')) {
                return new Response(JSON.stringify({
                    success: true,
                    data: {
                        latestVersion: '1.6.0',
                        titleRu: 'Вышла версия 1.6.0!',
                        titleEn: 'Version 1.6.0 is out!',
                        highlightsRu: ['Новые фамильяры'],
                        highlightsEn: ['New familiars'],
                        tpgUrl: 'https://github.com/mereyabdenbekuly-ctrl/CLODEx-RP-Studio/releases/download/v1.6.0/CLODEx-RP-Studio-1.6.0.tpg',
                        releaseUrl: 'https://github.com/mereyabdenbekuly-ctrl/CLODEx-RP-Studio/releases/tag/v1.6.0',
                        announcementId: 'fox_drop_1',
                        announcementRu: 'Заберите редкого лисёнка!',
                        promoGiftCode: promoFox.code,
                    },
                }), { status: 200 });
            }
            if (u.endsWith('/v1/rp/studio/feedback')) {
                postedFeedback.push(JSON.parse(init.body));
                return new Response(JSON.stringify({ success: true, data: { id: 1 } }), { status: 200 });
            }
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        },
    });

    await new Promise(r => setTimeout(r, 25));
    // HUD pill shows update badge without exceeding 4 chips
    assert.ok(doc.body.querySelector('[data-rp-badge="update"]'));
    assert.ok(doc.body.querySelectorAll('.clodex-rp-hud-pill .clodex-rp-chip').length <= 4);

    controller.openTab('tracker');
    const banner = doc.body.querySelector('[data-rp-view="release-banner"]');
    assert.ok(banner);
    assert.match(banner.textContent, /1\.6\.0/);

    // 1-click ST update
    const stBtn = doc.body.querySelector('[data-rp-action="release-self-update"]');
    assert.ok(stBtn);
    stBtn.click();
    await new Promise(r => setTimeout(r, 15));
    assert.equal(selfUpdated, 1);

    // 1-tap promo pet claim
    doc.body.querySelector('[data-rp-action="claim-promo-pet"]').click();
    await new Promise(r => setTimeout(r, 25));
    assert.equal(state.companions[0]?.name, 'Промо-Лис');
    assert.equal(rpPrefs.dismissedAnnouncementId, 'fox_drop_1');

    // Dismiss update notice -> badge disappears and preference persists
    doc.body.querySelector('[data-rp-action="release-dismiss"]').click();
    await new Promise(r => setTimeout(r, 15));
    assert.equal(rpPrefs.dismissedReleaseVersion, '1.6.0');
    assert.equal(doc.body.querySelector('[data-rp-badge="update"]'), null);

    // 1-tap feedback submission
    doc.body.querySelector('[data-rp-action="toggle-feedback"]').click();
    const msgInput = doc.body.querySelector('[data-rp-input="feedback-message"]');
    const contactInput = doc.body.querySelector('[data-rp-input="feedback-contact"]');
    msgInput.input('Очень крутая общая колыбель, добавьте совёнка!');
    contactInput.input('@phantom_rp');
    doc.body.querySelector('[data-rp-action="feedback-submit"]').click();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(postedFeedback.length, 1);
    assert.equal(postedFeedback[0].host, 'sillytavern');
    assert.equal(postedFeedback[0].contact, '@phantom_rp');
    assert.match(postedFeedback[0].message, /совёнка/);

    controller.dispose();
});
