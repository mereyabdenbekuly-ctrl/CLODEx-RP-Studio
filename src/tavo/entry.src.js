/* global tavo */
import { ctxPack } from '../core/context.js';
import { dirBuildCue } from '../core/director.js';
import { phoneGc, phoneNormalizeStore } from '../core/phone.js';
import { createChatState, normalizeChatState, restoreCheckpointBefore, restoreCheckpointExact } from '../core/physiology.js';
import { buildSystemContext } from '../core/prompts.js';
import { wikiGc, wikiNormalizeStore, wikiSelectRelevant, wikiView } from '../core/wiki.js';
import {
    tavoFirstCheckpointKeyForMessage,
    tavoIsCharacterRole,
    tavoJournalKeysForMessage,
    tavoMessageTurnKey,
} from './turnkey.js';

const ENTRY_CHAT_VAR_KEY = 'clodex_rp_state';
const ENTRY_GLOBAL_PREFS_KEY = 'clodex_rp_prefs';
const ENTRY_PHONE_KEY = 'clodex_rp_phone';
const ENTRY_WIKI_KEY = 'clodex_rp_wiki';
const ENTRY_CTX_MAX_TOKENS = 250;
let entryLastAssistantSig = Object.create(null);
let entryCommittedTurnKeys = new Set();

function entryMessageVariantSig(msg) {
    if (!msg || typeof msg !== 'object') return null;
    if (msg.content === undefined && msg.swipeId === undefined && msg.alternativeIndex === undefined) {
        return null;
    }
    return `${msg.swipeId ?? msg.alternativeIndex ?? ''}:${msg.content ?? ''}`;
}

async function entryLoadState() {
    const raw = await tavo.variable.get(ENTRY_CHAT_VAR_KEY);
    if (raw && typeof raw === 'object') return normalizeChatState(raw);
    const fresh = createChatState();
    fresh.world.enableVitals = tavo.plugin.config.get('enableVitals') !== false;
    fresh.world.enableAdultBiology = Boolean(tavo.plugin.config.get('enableAdultBio'));
    return fresh;
}

async function entryFindMessages(range) {
    if (typeof tavo.message?.find !== 'function') return [];
    const list = await tavo.message.find(range, { hidden: false }).catch(() => []);
    return Array.isArray(list) ? list : [];
}

async function entryActiveTurnKeys() {
    const all = await entryFindMessages([0, -1]);
    return all.map(tavoMessageTurnKey).filter(Boolean);
}

function entryConfigFlag(prefs, key, fallback = true) {
    if (prefs && prefs[key] !== undefined) return Boolean(prefs[key]);
    const fromConfig = tavo.plugin.config.get(key);
    if (fromConfig === undefined || fromConfig === null) return fallback;
    return fromConfig !== false;
}

function entryCommitAssistantTurn(msg) {
    const id = String(msg?.id ?? '');
    if (!id) return;
    const turnKey = tavoMessageTurnKey(msg) || id;
    if (entryCommittedTurnKeys.has(turnKey)) return;
    entryCommittedTurnKeys.add(turnKey);
    tavo.plugin.emit('clodex-assistant-turn', { messageId: id, turnKey });
}

tavo.plugin.onInputAction('toggle-studio', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-tracker' });
});

tavo.plugin.onInputAction('ask-codex', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-codex' });
});

tavo.plugin.onSidebarAction('open-studio', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-tracker' });
});

tavo.plugin.onSidebarAction('open-cradle', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-cradle' });
});

tavo.plugin.onSidebarAction('open-underworld', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-underworld' });
});

tavo.plugin.onSidebarAction('open-phone', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-phone' });
});

tavo.plugin.onSidebarAction('open-forge', async () => {
    tavo.plugin.emit('clodex-command', { action: 'open-forge' });
});

tavo.plugin.onSidebarAction('sync-tracker', async () => {
    tavo.plugin.emit('clodex-command', { action: 'sync-tracker' });
});

tavo.plugin.onSidebarAction('generate-bg', async () => {
    tavo.plugin.emit('clodex-command', { action: 'generate-bg' });
});

tavo.plugin.onLastMessageAction('speak-last-turn', async ({ messageId }) => {
    const msg = messageId && tavo.message?.get
        ? await tavo.message.get(messageId).catch(() => null)
        : null;
    tavo.plugin.emit('clodex-command', {
        action: 'speak-reply',
        text: String(msg?.content ?? ''),
    });
});

tavo.plugin.onLastMessageAction('sync-last-turn', async ({ messageId }) => {
    const msg = messageId && tavo.message?.get
        ? await tavo.message.get(messageId).catch(() => null)
        : null;
    tavo.plugin.emit('clodex-command', {
        action: 'sync-tracker',
        messageId: String(messageId ?? ''),
        turnKey: msg ? tavoMessageTurnKey(msg) : '',
    });
});

// Context assembly: every module hands raw strings to ctxPack, which alone trims
// to the shared 250-token budget. `main` → after the main prompt, `depth0`
// (director + anti-slop) → the very end of the context.
tavo.plugin.on('generation:prepare', async event => {
    if (typeof event?.addContext !== 'function') return;
    const prefs = (await tavo.variable.get(ENTRY_GLOBAL_PREFS_KEY, 'global').catch(() => null)) ?? {};
    const injectAllowed = entryConfigFlag(prefs, 'injectContext', true);
    const wikiEnabled = entryConfigFlag(prefs, 'wikiEnabled', true);
    const slopMode = typeof prefs.slopMode === 'string' ? prefs.slopMode : 'inject';

    const [state, chat, wikiRaw] = await Promise.all([
        entryLoadState(),
        tavo.chat.current().catch(() => null),
        injectAllowed && wikiEnabled
            ? tavo.variable.get(ENTRY_WIKI_KEY).catch(() => null)
            : Promise.resolve(null),
    ]);
    const charName = chat?.characters?.[0]?.name || '{{char}}';
    const userName = chat?.persona?.name || '{{user}}';

    const director = dirBuildCue(
        state.world?.director,
        Array.isArray(prefs.directorPresets) ? prefs.directorPresets : [],
    );
    const scene = injectAllowed ? buildSystemContext(state, { userName, charName }) : '';

    let wiki = '';
    if (injectAllowed && wikiEnabled && wikiRaw && typeof wikiRaw === 'object') {
        const store = wikiNormalizeStore(wikiRaw);
        if (Array.isArray(store.journal) && store.journal.length) {
            const [activeKeys, recent] = await Promise.all([
                entryActiveTurnKeys(),
                entryFindMessages([-2, -1]),
            ]);
            const recentText = recent.map(m => String(m?.content ?? '')).join('\n');
            wiki = wikiSelectRelevant(wikiView(store, activeKeys), recentText, { maxTokens: 120 }) || '';
        }
    }
    const slop = slopMode === 'inject' ? String(state.world?.slopRule ?? '') : '';

    const packed = ctxPack({
        director,
        worldEvent: injectAllowed ? String(state.underworld?.pendingWorldEvent || '') : '',
        scene,
        wiki,
        slop,
        maxTokens: ENTRY_CTX_MAX_TOKENS,
    });
    if (packed.main) {
        event.addContext({
            text: packed.main,
            role: 'system',
            position: { type: 'afterMainPrompt' },
        });
    }
    if (packed.depth0) {
        event.addContext({
            text: packed.depth0,
            role: 'system',
            position: { type: 'atDepth', depth: 0 },
        });
    }
});

tavo.plugin.on('message:added', async event => {
    if (event.message?.role !== 'assistant') return;
    const id = String(event.message.id ?? '');
    const sig = entryMessageVariantSig(event.message);
    if (id && sig !== null) entryLastAssistantSig[id] = sig;
    entryCommitAssistantTurn(event.message);
});

// Swipe / regenerate / edit of a character message. Nothing is deleted from the
// journals here (10.1): the phone/wiki replay follows the active turn keys.
tavo.plugin.on('message:updated', async event => {
    const msg = event?.message;
    if (msg?.role && !tavoIsCharacterRole(msg.role)) return;
    const id = String(msg?.id ?? event?.messageId ?? '');
    if (!id) return;
    const nextSig = entryMessageVariantSig(msg);
    if (nextSig !== null && Object.prototype.hasOwnProperty.call(entryLastAssistantSig, id) && entryLastAssistantSig[id] === nextSig) {
        return;
    }
    if (nextSig !== null) entryLastAssistantSig[id] = nextSig;
    const turnKey = msg ? tavoMessageTurnKey({ ...msg, id }) : '';
    const state = await entryLoadState();
    let restored = false;
    if (turnKey && restoreCheckpointExact(state, turnKey)) {
        restored = true;
    } else {
        const firstKey = tavoFirstCheckpointKeyForMessage(state, id);
        restored = Boolean(firstKey) && restoreCheckpointBefore(state, firstKey);
    }
    if (restored) {
        await tavo.variable.set(ENTRY_CHAT_VAR_KEY, state);
        tavo.plugin.emit('clodex-state-updated', { messageId: id, turnKey });
    }
});

// Physical GC of the append-only journals only happens on deletion (10.1).
// phoneGc / wikiGc wrap jrGc and keep their store invariants (manual wiki rows,
// base snapshots, seen ids).
async function entryGcJournalsForMessage(id) {
    const activeTurnKeys = await entryActiveTurnKeys();
    const stores = [
        [ENTRY_PHONE_KEY, phoneNormalizeStore, phoneGc],
        [ENTRY_WIKI_KEY, wikiNormalizeStore, wikiGc],
    ];
    for (const [name, normalize, gc] of stores) {
        const raw = await tavo.variable.get(name).catch(() => null);
        if (!raw || typeof raw !== 'object') continue;
        const store = normalize(raw);
        const deletedTurnKeys = tavoJournalKeysForMessage(store, id);
        if (!deletedTurnKeys.length) continue;
        const next = gc(store, { deletedTurnKeys, activeTurnKeys }) || store;
        await tavo.variable.set(name, next);
    }
}

tavo.plugin.on('message:deleted', async event => {
    const id = String(event?.message?.id ?? event?.messageId ?? '');
    if (!id) return;
    delete entryLastAssistantSig[id];
    for (const key of [...entryCommittedTurnKeys]) {
        if (key === id || key.startsWith(`${id}:`)) entryCommittedTurnKeys.delete(key);
    }
    await entryGcJournalsForMessage(id).catch(() => {});
    const state = await entryLoadState();
    const firstKey = tavoFirstCheckpointKeyForMessage(state, id);
    if (firstKey && restoreCheckpointBefore(state, firstKey, { prune: true })) {
        await tavo.variable.set(ENTRY_CHAT_VAR_KEY, state);
    }
    tavo.plugin.emit('clodex-state-updated', { deletedMessageId: id });
});

tavo.plugin.on('chat:opened', async () => {
    entryLastAssistantSig = Object.create(null);
    entryCommittedTurnKeys = new Set();
    tavo.plugin.emit('clodex-state-updated', {});
});
