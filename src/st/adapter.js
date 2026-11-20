import { base64ToBlob, blobToBase64, validateKey } from '../core/api.js';
import { ctxPack } from '../core/context.js';
import { dirBuildCue } from '../core/director.js';
import { createRpStudioController } from '../core/hud.js';
import { jrTurnKey } from '../core/journal.js';
import { PACK_MAX_BYTES } from '../core/pack.js';
import { GIFT_MAX_BYTES } from '../core/gift.js';
import { phoneGc, phoneNormalizeStore } from '../core/phone.js';
import { createChatState, normalizeChatState, restoreCheckpointBefore, restoreCheckpointExact } from '../core/physiology.js';
import { buildSystemContext } from '../core/prompts.js';
import { wikiGc, wikiNormalizeStore, wikiSelectRelevant, wikiView } from '../core/wiki.js';

export const ST_SETTINGS_KEY = 'clodex_rp_studio';
export const ST_PROMPT_KEY = 'clodex_rp_studio_context';
export const ST_DEPTH0_PROMPT_KEY = 'clodex_rp_studio_depth0';
export const ST_STORE_NAMES = Object.freeze(['clodex_rp_phone', 'clodex_rp_wiki']);
export const ST_CTX_MAX_TOKENS = 250;
const ST_TURN_CONTAINER_ID = 'clodex-rp-st-turn';
// setExtensionPrompt(key, value, position, depth): position 1 = IN_CHAT.
const ST_PROMPT_IN_CHAT = 1;

function stHashString(text) {
    // FNV-1a 32-bit, base36 — guards turn keys against index shifts.
    let h = 0x811c9dc5;
    const str = String(text ?? '');
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
}

// Unified ST turn key (spec 10.1): `${index}:${swipe_id}#${hash(send_date)}`.
export function stTurnKey(index, msg) {
    return jrTurnKey(index, Number(msg?.swipe_id ?? 0) || 0, stHashString(msg?.send_date ?? ''));
}

export function stParseTurnKey(turnKey) {
    const [bare, salt = ''] = String(turnKey ?? '').split('#');
    const cut = bare.lastIndexOf(':');
    const index = Number(cut >= 0 ? bare.slice(0, cut) : bare);
    const swipe = cut >= 0 ? Number(bare.slice(cut + 1)) : 0;
    return {
        index: Number.isInteger(index) ? index : -1,
        swipe: Number.isFinite(swipe) ? swipe : 0,
        salt,
    };
}

// A journal key is dead when its message is gone, or when the message at that
// index provably is a different one (send_date hash mismatch). Unknown swipe
// metadata keeps the key (conservative: never drop a possibly-live variant).
export function stTurnKeyIsDead(chat, turnKey) {
    const { index, swipe, salt } = stParseTurnKey(turnKey);
    if (index < 0) return false;
    const list = Array.isArray(chat) ? chat : [];
    if (index >= list.length) return true;
    const msg = list[index];
    if (!msg) return true;
    if (!salt) return false;
    const isCurrent = swipe === (Number(msg.swipe_id ?? 0) || 0);
    const sendDate = isCurrent ? msg.send_date : msg.swipe_info?.[swipe]?.send_date;
    if (sendDate === undefined || sendDate === null) return false;
    return stHashString(sendDate) !== salt;
}

export function stActiveTurnKeys(chat) {
    const out = [];
    (Array.isArray(chat) ? chat : []).forEach((msg, i) => {
        if (msg && !msg.is_system) out.push(stTurnKey(i, msg));
    });
    return out;
}

function stCleanStringList(value, maxItems, maxLen) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string') continue;
        const clean = item.replace(/\s+/g, ' ').trim().slice(0, maxLen);
        if (clean && !out.includes(clean)) out.push(clean);
        if (out.length >= maxItems) break;
    }
    return out;
}

function stCleanObjectList(value, maxItems) {
    if (!Array.isArray(value)) return [];
    try {
        return JSON.parse(JSON.stringify(value.filter(v => v && typeof v === 'object' && !Array.isArray(v)).slice(0, maxItems)));
    } catch {
        return [];
    }
}

// v1.3 settings (director, anti-slop, wiki, phone, hidden thoughts, packs).
export function stCleanV13Settings(raw = {}) {
    const every = raw.wikiEvery === undefined || raw.wikiEvery === null || raw.wikiEvery === ''
        ? NaN
        : Math.round(Number(raw.wikiEvery));
    return {
        slopMode: ['off', 'highlight', 'inject'].includes(raw.slopMode) ? raw.slopMode : 'inject',
        slopDisabled: stCleanStringList(raw.slopDisabled, 200, 120),
        slopPhrases: stCleanStringList(raw.slopPhrases, 200, 120),
        directorPresets: stCleanObjectList(raw.directorPresets, 8),
        meterPacks: stCleanObjectList(raw.meterPacks, 20),
        codexPresets: stCleanObjectList(raw.codexPresets, 20),
        directorExpanded: raw.directorExpanded === true,
        wikiEnabled: raw.wikiEnabled !== false,
        wikiEvery: Number.isFinite(every) ? Math.max(4, Math.min(20, every)) : 8,
        phoneSkin: ['auto', 'smartphone', 'grimoire'].includes(raw.phoneSkin) ? raw.phoneSkin : 'auto',
        showInnerThoughts: raw.showInnerThoughts !== false,
        showSuggestedActions: raw.showSuggestedActions !== false,
        thoughtsBlurred: raw.thoughtsBlurred !== false,
    };
}

function normalizeMaxAutoSpend(val) {
    if (val === undefined || val === null || val === '') return 0.25;
    const num = Number(val);
    return Number.isFinite(num) && num >= 0 ? num : 0.25;
}

export const DEFAULT_ST_SETTINGS = Object.freeze({
    apiKey: '',
    trackerModel: '',
    codexModel: '',
    imageModel: '',
    videoModel: '',
    speechModel: '',
    defaultVoice: 'alloy',
    dialogueOnly: true,
    autoSpeak: false,
    voiceMap: {},
    autoTrack: true,
    injectContext: true,
    confirmPaid: true,
    maxAutoSpendUsd: 0.25,
    rpPrefs: {},
    autoImageEvery: 0,
    bgDim: 35,
    hudPos: null,
    ...stCleanV13Settings({}),
});

export function loadStSettings(context) {
    const raw = context.extensionSettings?.[ST_SETTINGS_KEY] ?? {};
    const clean = {
        apiKey: '',
        trackerModel: typeof raw.trackerModel === 'string' ? raw.trackerModel : '',
        codexModel: typeof raw.codexModel === 'string' ? raw.codexModel : '',
        imageModel: typeof raw.imageModel === 'string' ? raw.imageModel : '',
        videoModel: typeof raw.videoModel === 'string' ? raw.videoModel : '',
        speechModel: typeof raw.speechModel === 'string' ? raw.speechModel : '',
        defaultVoice: typeof raw.defaultVoice === 'string' && raw.defaultVoice ? raw.defaultVoice : 'alloy',
        dialogueOnly: raw.dialogueOnly !== false,
        autoSpeak: Boolean(raw.autoSpeak),
        voiceMap: raw.voiceMap && typeof raw.voiceMap === 'object' ? { ...raw.voiceMap } : {},
        autoTrack: raw.autoTrack !== false,
        injectContext: raw.injectContext !== false,
        confirmPaid: raw.confirmPaid !== false,
        maxAutoSpendUsd: normalizeMaxAutoSpend(raw.maxAutoSpendUsd),
        rpPrefs: raw.rpPrefs && typeof raw.rpPrefs === 'object' ? structuredClone(raw.rpPrefs) : {},
        autoImageEvery: Math.max(0, Math.min(30, Number(raw.autoImageEvery) || 0)),
        bgDim: Math.max(0, Math.min(80, Number(raw.bgDim ?? 35))),
        hudPos: raw.hudPos && Number.isFinite(raw.hudPos.x) && Number.isFinite(raw.hudPos.y)
            ? { x: raw.hudPos.x, y: raw.hudPos.y } : null,
        ...stCleanV13Settings(raw),
    };
    try {
        clean.apiKey = raw.apiKey ? validateKey(raw.apiKey) : '';
    } catch {
        clean.apiKey = '';
    }
    if (context.extensionSettings) context.extensionSettings[ST_SETTINGS_KEY] = clean;
    return clean;
}

async function uploadMediaToSt(context, fetchImpl, blob, ext, prefix = 'clodex-rp') {
    const base64 = await blobToBase64(blob);
    const name = `${prefix}-${Date.now()}.${ext}`;
    try {
        const headers = new Headers(context.getRequestHeaders?.() ?? {});
        headers.set('Content-Type', 'application/json');
        const res = await fetchImpl('/api/files/upload', {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({ name, data: base64 }),
        });
        if (res.ok) {
            const payload = await res.json();
            if (payload?.path) return String(payload.path);
        }
    } catch {
        // Fallback to object URL for standalone/test harnesses
    }
    return URL.createObjectURL(blob);
}

export async function initializeSillyTavern({
    getContext = () => globalThis.SillyTavern?.getContext(),
    fetchImpl = globalThis.fetch?.bind(globalThis),
    document = globalThis.document,
    confirm = msg => globalThis.confirm(msg),
} = {}) {
    if (document.querySelector('#clodex-rp-studio-settings')) return null;
    const context = getContext();
    if (!context) throw new Error('SillyTavern context unavailable.');

    const base = new URL('../../', import.meta.url);
    const [settingsHtml, enJson, ruJson] = await Promise.all([
        fetchImpl(new URL('settings.html', base)).then(r => r.text()),
        fetchImpl(new URL('i18n/en-us.json', base)).then(r => r.json()),
        fetchImpl(new URL('i18n/ru-ru.json', base)).then(r => r.json()),
    ]);

    const settings = loadStSettings(context);
    const V13_DEFAULTS = stCleanV13Settings({});
    let currentChatId = '';
    let chatState = createChatState();

    const getLocale = () => {
        const raw = context.getCurrentLocale?.() ?? globalThis.navigator?.language ?? 'en';
        return String(raw).toLowerCase().startsWith('ru') ? 'ru' : 'en';
    };

    const t = (key, params = {}) => {
        const dict = getLocale() === 'ru' ? ruJson : enJson;
        const raw = dict[`clodex_rp.${key}`] ?? enJson[`clodex_rp.${key}`] ?? key;
        return String(raw).replace(/\{(\w+)\}/g, (m, k) => String(params[k] ?? m));
    };

    // Mount settings card in SillyTavern Extensions tab
    const tpl = document.createElement('template');
    tpl.innerHTML = settingsHtml;
    const settingsCard = tpl.content.firstElementChild;
    for (const node of settingsCard.querySelectorAll('[data-clodex-rp-i18n]')) {
        node.textContent = t(node.dataset.clodexRpI18n);
    }
    document.querySelector('#extensions_settings')?.append(settingsCard);

    let customImageBgEl = document.querySelector('#clodex-rp-st-image-bg');
    if (!customImageBgEl) {
        customImageBgEl = document.createElement('div');
        customImageBgEl.id = 'clodex-rp-st-image-bg';
        customImageBgEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;transition:opacity .35s ease;opacity:0;';
        document.body.prepend(customImageBgEl);
    }

    function applyStImageOverlay(path) {
        if (path) {
            customImageBgEl.style.backgroundImage = `url("${CSS.escape ? path.replace(/"/g, '\\"') : path}")`;
            customImageBgEl.style.opacity = '0.45';
        } else {
            customImageBgEl.style.backgroundImage = 'none';
            customImageBgEl.style.opacity = '0';
        }
    }

    function loadStateForCurrentChat() {
        const ctx = getContext();
        const cid = String(ctx.getCurrentChatId?.() ?? ctx.chatId ?? 'default');
        currentChatId = cid;
        const raw = ctx.chatMetadata?.[ST_SETTINGS_KEY];
        chatState = raw ? normalizeChatState(raw) : createChatState();
        applyStImageOverlay(chatState.scene.imagePath);
        pushExtensionPrompt();
        return chatState;
    }

    function readStore(name) {
        const raw = getContext().chatMetadata?.[name];
        return raw && typeof raw === 'object' ? raw : null;
    }

    // Single context assembly through ctxPack (spec 10.3): `main` keeps the
    // existing in-chat slot, `depth0` (director + anti-slop) goes to depth 0.
    function pushExtensionPrompt() {
        const ctx = getContext();
        if (typeof ctx.setExtensionPrompt !== 'function') return;
        const charObj = ctx.characters?.[ctx.characterId];
        let packed = { main: '', depth0: '' };
        try {
            const director = dirBuildCue(chatState.world?.director, settings.directorPresets);
            const scene = settings.injectContext
                ? buildSystemContext(chatState, {
                    userName: ctx.name1 || '{{user}}',
                    charName: ctx.name2 || charObj?.name || '{{char}}',
                })
                : '';
            let wiki = '';
            const wikiRaw = settings.injectContext && settings.wikiEnabled ? readStore('clodex_rp_wiki') : null;
            if (wikiRaw) {
                const store = wikiNormalizeStore(wikiRaw);
                if (Array.isArray(store.journal) && store.journal.length) {
                    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
                    const recentText = chat.filter(m => m && !m.is_system).slice(-2).map(m => String(m.mes ?? '')).join('\n');
                    wiki = wikiSelectRelevant(wikiView(store, stActiveTurnKeys(chat)), recentText, { maxTokens: 120 }) || '';
                }
            }
            const slop = settings.slopMode === 'inject' ? String(chatState.world?.slopRule ?? '') : '';
            packed = ctxPack({
                director,
                worldEvent: settings.injectContext ? String(chatState.underworld?.pendingWorldEvent || '') : '',
                scene,
                wiki,
                slop,
                maxTokens: ST_CTX_MAX_TOKENS,
            });
        } catch (err) {
            globalThis.console?.warn?.('[CLODEx RP Studio] context assembly failed', err);
        }
        ctx.setExtensionPrompt(ST_PROMPT_KEY, packed.main || '', ST_PROMPT_IN_CHAT, 1);
        ctx.setExtensionPrompt(ST_DEPTH0_PROMPT_KEY, packed.depth0 || '', ST_PROMPT_IN_CHAT, 0);
    }

    // M3: hidden thoughts + action buttons under the latest character `.mes`.
    function removeTurnExtras() {
        document.getElementById?.(ST_TURN_CONTAINER_ID)?.remove?.();
    }

    function renderTurnExtras() {
        removeTurnExtras();
        if (typeof document.querySelectorAll !== 'function') return;
        const extras = chatState.turnExtras;
        if (!extras || !extras.turnKey) return;
        const nodes = document.querySelectorAll('#chat .mes');
        const mesEl = nodes?.length ? nodes[nodes.length - 1] : null;
        if (!mesEl) return;
        const ctx = getContext();
        const index = Number(mesEl.getAttribute?.('mesid'));
        const msg = Number.isInteger(index) ? ctx.chat?.[index] : null;
        if (!msg || msg.is_user || msg.is_system) return;
        if (stTurnKey(index, msg) !== String(extras.turnKey)) return;

        const thought = settings.showInnerThoughts
            ? String(extras.innerThought ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
            : '';
        const actions = settings.showSuggestedActions && Array.isArray(extras.suggestedActions)
            ? extras.suggestedActions.map(a => String(a ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)).filter(Boolean).slice(0, 3)
            : [];
        if (!thought && !actions.length) return;

        const make = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text) node.textContent = text;
            return node;
        };
        const box = make('div', 'clodex-rp-turn');
        box.id = ST_TURN_CONTAINER_ID;
        if (thought) {
            const details = make('details', 'clodex-rp-turn-thoughts');
            const charName = String(ctx.name2 || msg.name || '{{char}}').trim().slice(0, 48);
            const summary = make('summary', '', t('turn.thoughtsTitle', { char: charName }));
            summary.setAttribute?.('title', t('turn.reveal'));
            details.append(summary, make('p', 'clodex-rp-turn-thought', thought));
            details.open = !settings.thoughtsBlurred;
            box.append(details);
        }
        if (actions.length) {
            const row = make('div', 'clodex-rp-turn-actions');
            row.append(make('span', 'clodex-rp-turn-actions-title', t('turn.actionsTitle')));
            for (const action of actions) {
                const btn = make('button', 'clodex-rp-turn-btn menu_button', action);
                btn.type = 'button';
                btn.setAttribute?.('title', t('turn.insertHint'));
                btn.addEventListener('click', () => {
                    bridge.insertIntoComposer(action).catch?.(() => {});
                });
                row.append(btn);
            }
            box.append(row);
        }
        const textEl = mesEl.querySelector?.('.mes_text');
        if (textEl?.after) textEl.after(box);
        else mesEl.append?.(box);
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.append(a);
        a.click?.();
        a.remove?.();
        setTimeout(() => URL.revokeObjectURL(url), 5_000);
    }

    function pickTextFile(accept, maxBytes) {
        return new Promise((resolvePick, rejectPick) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.style.display = 'none';
            let settled = false;
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                input.remove?.();
                fn(value);
            };
            input.addEventListener('cancel', () => finish(resolvePick, null));
            input.addEventListener('change', async () => {
                const file = input.files?.[0];
                if (!file) return finish(resolvePick, null);
                if (Number(file.size) > maxBytes) {
                    return finish(rejectPick, new Error(`Pack file is larger than ${maxBytes} bytes.`));
                }
                try {
                    finish(resolvePick, await file.text());
                } catch (err) {
                    finish(rejectPick, err);
                }
                return undefined;
            });
            document.body.append(input);
            input.click?.();
        });
    }

    loadStateForCurrentChat();

    const bridge = {
        document,
        fetchImpl,
        mountContainer: document.body,
        getLocale,
        t,
        confirm,
        notify: msg => globalThis.toastr?.info?.(msg),
        getEffectiveKey() {
            if (settings.apiKey) return settings.apiKey;
            const inherited = getContext()?.extensionSettings?.clodex?.savedKey ?? '';
            try {
                return inherited ? validateKey(inherited) : '';
            } catch {
                return '';
            }
        },
        isKeyInherited() {
            return !settings.apiKey && Boolean(getContext()?.extensionSettings?.clodex?.savedKey);
        },
        getSettings: () => settings,
        async updateSettings(patch) {
            for (const [k, v] of Object.entries(patch)) {
                if (k === 'apiKey') {
                    settings.apiKey = v ? validateKey(v) : '';
                } else if (k === 'maxAutoSpendUsd') {
                    settings.maxAutoSpendUsd = normalizeMaxAutoSpend(v);
                } else if (k in V13_DEFAULTS) {
                    settings[k] = stCleanV13Settings({ ...settings, [k]: v })[k];
                } else if (k in settings) {
                    settings[k] = v;
                }
            }
            getContext().saveSettingsDebounced?.();
            pushExtensionPrompt();
            renderTurnExtras();
        },
        getChatScope: () => String(getContext().getCurrentChatId?.() ?? getContext().chatId ?? 'default'),
        getChatState() {
            const cid = String(getContext().getCurrentChatId?.() ?? getContext().chatId ?? 'default');
            if (cid !== currentChatId) loadStateForCurrentChat();
            return chatState;
        },
        async saveChatState(nextState) {
            chatState = normalizeChatState(nextState);
            const ctx = getContext();
            if (ctx.chatMetadata) {
                ctx.chatMetadata[ST_SETTINGS_KEY] = chatState;
                ctx.saveMetadataDebounced?.();
            }
            pushExtensionPrompt();
            renderTurnExtras();
        },
        async getActiveTurnKeys() {
            return stActiveTurnKeys(getContext().chat);
        },
        async getLatestTurnKey() {
            const chat = getContext().chat ?? [];
            for (let i = chat.length - 1; i >= 0; i -= 1) {
                const msg = chat[i];
                if (msg && !msg.is_user && !msg.is_system) return stTurnKey(i, msg);
            }
            return '';
        },
        async loadStore(name) {
            if (!ST_STORE_NAMES.includes(name)) throw new Error(`Unknown store: ${name}`);
            const raw = readStore(name);
            return raw ? structuredClone(raw) : null;
        },
        async loadRpPrefs() {
            const raw = getContext().extensionSettings?.[ST_SETTINGS_KEY]?.rpPrefs;
            return raw && typeof raw === 'object' ? structuredClone(raw) : null;
        },
        async saveRpPrefs(value) {
            settings.rpPrefs = value && typeof value === 'object' ? structuredClone(value) : {};
            getContext().saveSettingsDebounced?.();
        },
        async saveStore(name, value) {
            if (!ST_STORE_NAMES.includes(name)) throw new Error(`Unknown store: ${name}`);
            const ctx = getContext();
            if (!ctx.chatMetadata) return;
            ctx.chatMetadata[name] = structuredClone(value);
            ctx.saveMetadataDebounced?.();
            if (name === 'clodex_rp_wiki') pushExtensionPrompt();
        },
        async savePhoneMedia({ entryId, kind = 'photo', blob, base64 } = {}) {
            const safeId = String(entryId || 'entry').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'entry';
            const isAudio = kind === 'voice' || kind === 'audio';
            const mediaBlob = blob || (base64 ? base64ToBlob(base64, isAudio ? 'audio/mpeg' : 'image/png') : null);
            if (!mediaBlob) throw new Error('Phone media payload is empty.');
            return await uploadMediaToSt(getContext(), fetchImpl, mediaBlob, isAudio ? 'mp3' : 'png', `clodex-phone-${safeId}`);
        },
        async exportPack(pack) {
            const json = JSON.stringify(pack, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            if (blob.size > PACK_MAX_BYTES) throw new Error(`Pack is larger than ${PACK_MAX_BYTES} bytes.`);
            const base = String(pack?.name || 'clodex').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'clodex';
            downloadBlob(blob, `${base}.clodex-pack`);
        },
        async exportPet(filename, json) {
            const blob = new Blob([json], { type: 'application/json' });
            if (blob.size > GIFT_MAX_BYTES) throw new Error('tooLarge');
            downloadBlob(blob, filename);
        },
        async importPet() {
            return pickTextFile('.clodex-pet,application/json', GIFT_MAX_BYTES);
        },
        async importPack() {
            const text = await pickTextFile('.clodex-pack,.json,application/json', PACK_MAX_BYTES);
            if (text === null || text === undefined) return null;
            return JSON.parse(String(text).replace(/^\uFEFF/, ''));
        },
        async getRpContext({ limit = 6 } = {}) {
            const take = Math.max(1, Math.min(80, Math.trunc(Number(limit) || 6)));
            const ctx = getContext();
            const charObj = ctx.characters?.[ctx.characterId];
            const card = charObj?.data ?? charObj ?? {};
            const recentMessages = (ctx.chat ?? [])
                .filter(m => !m.is_system)
                .slice(-take)
                .map(m => ({
                    role: m.is_user ? 'user' : 'assistant',
                    name: m.name,
                    content: String(m.mes ?? ''),
                }));
            return {
                chatId: String(ctx.getCurrentChatId?.() ?? ctx.chatId ?? 'default'),
                userName: ctx.name1 || 'User',
                charName: ctx.name2 || card.name || 'Character',
                charDescription: String(card.description ?? ''),
                scenario: String(card.scenario ?? ''),
                recentMessages,
            };
        },
        async insertIntoComposer(text) {
            const area = document.querySelector('#send_textarea');
            if (!area) return;
            area.value = area.value ? `${area.value}\n${text}` : text;
            area.dispatchEvent(new Event('input', { bubbles: true }));
        },
        async applyImageBackground({ blob }) {
            const url = await uploadMediaToSt(getContext(), fetchImpl, blob, 'png');
            applyStImageOverlay(url);
            return url;
        },
        async applyVideoBackground({ blob }) {
            return await uploadMediaToSt(getContext(), fetchImpl, blob, 'mp4');
        },
        async clearSceneBackground() {
            applyStImageOverlay('');
        },
        async loadCurrentSceneImageDataUrl(path) {
            if (!path) return '';
            if (/^data:image\//i.test(path)) return path;
            const res = await fetchImpl(path, { credentials: 'same-origin' });
            if (!res.ok) return '';
            const blob = await res.blob();
            return `data:${blob.type || 'image/png'};base64,${await blobToBase64(blob)}`;
        },
        async saveSpeechAudio({ blob, base64 }) {
            const mediaBlob = blob || (base64 ? base64ToBlob(base64, 'audio/mpeg') : null);
            if (!mediaBlob) throw new Error('Speech audio payload is empty.');
            return await uploadMediaToSt(getContext(), fetchImpl, mediaBlob, 'mp3');
        },
        async saveCompanionMedia({ companionId, kind = 'image', blob, base64 } = {}) {
            const safeId = String(companionId || 'main').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'main';
            const ext = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png';
            const mime = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png';
            const mediaBlob = blob || (base64 ? base64ToBlob(base64, mime) : null);
            if (!mediaBlob) throw new Error('Companion media payload is empty.');
            return await uploadMediaToSt(getContext(), fetchImpl, mediaBlob, ext, `clodex-comp-${safeId}`);
        },
        playAudioPreview(path) {
            if (!path || typeof Audio !== 'function') return;
            const audio = new Audio(path);
            audio.play().catch(() => {});
        },
        async importForgedCharacter({ pngBytes, fileName }) {
            const ctx = getContext();
            const blob = new Blob([pngBytes], { type: 'image/png' });
            if (typeof FormData === 'function') {
                const form = new FormData();
                form.append('avatar', blob, fileName || 'clodex-card.png');
                form.append('file_type', 'png');
                const headers = new Headers(ctx.getRequestHeaders?.() ?? {});
                headers.delete('Content-Type');
                const res = await fetchImpl('/api/characters/import', {
                    method: 'POST',
                    headers,
                    credentials: 'same-origin',
                    body: form,
                }).catch(() => null);
                if (res?.ok) {
                    await ctx.getCharacters?.();
                    return true;
                }
            }
            // Fallback: trigger PNG download so user can drag & drop into ST
            await this.exportForgedCharacter({ pngBytes, fileName });
            return true;
        },
        async exportForgedCharacter({ pngBytes, fileName }) {
            downloadBlob(new Blob([pngBytes], { type: 'image/png' }), fileName || 'clodex-card.png');
        },
        loadHudPosition: () => settings.hudPos,
        saveHudPosition(pos) {
            settings.hudPos = pos;
            getContext().saveSettingsDebounced?.();
        },
        getInsets: () => ({ topBar: 44, bottomInput: 78 }),
    };

    const controller = createRpStudioController(bridge);

    for (const btn of settingsCard.querySelectorAll('[data-rp-open]')) {
        btn.addEventListener('click', () => controller.openTab(btn.dataset.rpOpen));
    }

    // Hook into SillyTavern chat lifecycle events
    const ev = context.eventSource;
    const types = context.event_types ?? {};
    const cleanups = [];
    const listen = (eventName, fn) => {
        if (!ev || !eventName) return;
        ev.on(eventName, fn);
        cleanups.push(() => ev.removeListener?.(eventName, fn));
    };

    const refreshLivingWorld = () => {
        Promise.resolve(controller.reloadLivingWorld?.()).catch(() => {});
    };

    listen(types.CHAT_CHANGED, () => {
        loadStateForCurrentChat();
        controller.renderAll();
        refreshLivingWorld();
        renderTurnExtras();
    });

    listen(types.MESSAGE_RECEIVED, index => {
        const ctx = getContext();
        const idx = Number.isInteger(index) ? index : Math.max(0, (ctx.chat?.length ?? 1) - 1);
        const msg = ctx.chat?.[idx];
        if (msg?.is_user || msg?.is_system) return;
        controller.onAssistantMessageCommitted({ checkpointKey: stTurnKey(idx, msg) }).catch(() => {});
    });

    // Re-read the latest user line for wiki relevance right before generation.
    listen(types.MESSAGE_SENT, () => pushExtensionPrompt());
    listen(types.GENERATION_STARTED, () => pushExtensionPrompt());

    listen(types.CHARACTER_MESSAGE_RENDERED, () => renderTurnExtras());
    listen(types.USER_MESSAGE_RENDERED, () => renderTurnExtras());

    // Swipe: exact snapshot of an existing variant, else roll back before the
    // turn. Journals are never touched here — replay follows active keys (10.1).
    listen(types.MESSAGE_SWIPED, index => {
        const ctx = getContext();
        const msg = ctx.chat?.[index];
        if (!msg) return;
        const key = stTurnKey(index, msg);
        let restored = restoreCheckpointExact(chatState, key);
        if (!restored) {
            const first = chatState.checkpoints.find(cp => stParseTurnKey(cp.key).index === Number(index));
            restored = Boolean(first) && restoreCheckpointBefore(chatState, first.key);
        }
        if (restored) bridge.saveChatState(chatState);
        else renderTurnExtras();
        pushExtensionPrompt();
        controller.renderAll();
        refreshLivingWorld();
    });

    // Deletion (ST passes the new chat length): GC journal ops of deleted /
    // shifted messages, then roll the compact state back before them.
    listen(types.MESSAGE_DELETED, newLength => {
        const ctx = getContext();
        const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
        const length = Number.isInteger(newLength) ? newLength : chat.length;
        const activeTurnKeys = stActiveTurnKeys(chat);
        const gcStores = [
            ['clodex_rp_phone', phoneNormalizeStore, phoneGc],
            ['clodex_rp_wiki', wikiNormalizeStore, wikiGc],
        ];
        for (const [name, normalize, gc] of gcStores) {
            const raw = readStore(name);
            if (!raw) continue;
            try {
                const store = normalize(raw);
                const keys = new Set();
                for (const op of store.journal ?? []) {
                    if (op?.turnKey && stTurnKeyIsDead(chat, op.turnKey)) keys.add(op.turnKey);
                }
                if (!keys.size) continue;
                ctx.chatMetadata[name] = gc(store, { deletedTurnKeys: [...keys], activeTurnKeys }) || store;
                ctx.saveMetadataDebounced?.();
            } catch (err) {
                globalThis.console?.warn?.('[CLODEx RP Studio] journal GC failed', err);
            }
        }
        const firstGone = chatState.checkpoints.find(cp => stTurnKeyIsDead(chat, cp.key) || stParseTurnKey(cp.key).index >= length);
        if (firstGone && restoreCheckpointBefore(chatState, firstGone.key, { prune: true })) {
            bridge.saveChatState(chatState);
        } else {
            pushExtensionPrompt();
            renderTurnExtras();
        }
        controller.renderAll();
        refreshLivingWorld();
    });

    // Register convenient slash commands if supported
    if (typeof context.registerSlashCommand === 'function') {
        context.registerSlashCommand('clodex-rp', () => controller.openTab('tracker'), [], 'Open CLODEx RP Studio Tracker', true, true);
        context.registerSlashCommand('clodex-cradle', () => controller.openTab('cradle'), [], 'Open CLODEx Cradle & Familiar', true, true);
        context.registerSlashCommand('clodex-codex', () => controller.openTab('codex'), [], 'Open CLODEx Lore Codex', true, true);
        context.registerSlashCommand('clodex-scene', () => controller.openTab('scene'), [], 'Open CLODEx Scene & Voice', true, true);
        context.registerSlashCommand('clodex-forge', () => controller.openTab('forge'), [], 'Open CLODEx Character & Lorebook Forge', true, true);
        context.registerSlashCommand('clodex-speak', () => controller.speakLatestReply({ auto: false }), [], 'Speak latest character reply via CLODEx TTS', true, true);
        context.registerSlashCommand('clodex-phone', () => controller.openTab('phone'), [], 'Open CLODEx character phone / diary & world feed', true, true);
        context.registerSlashCommand('clodex-casino', () => controller.openTab('underworld'), [], 'Open CLODEx Underworld casino & debt ledger', true, true);
        context.registerSlashCommand('clodex-underworld', () => controller.openTab('underworld'), [], 'Open CLODEx Underworld tracker', true, true);
        context.registerSlashCommand('clodex-gacha', () => controller.openTab('cradle'), [], 'Open CLODEx Altar & Relics', true, true);
        context.registerSlashCommand('clodex-wiki', () => controller.openTab('wiki'), [], 'Open CLODEx living session wiki', true, true);
        context.registerSlashCommand('clodex-director', () => controller.openTab('director'), [], 'Open CLODEx director panel (next reply modifiers)', true, true);
    }

    renderTurnExtras();

    return {
        controller,
        dispose() {
            for (const fn of cleanups) fn();
            getContext()?.setExtensionPrompt?.(ST_PROMPT_KEY, '', ST_PROMPT_IN_CHAT, 1);
            getContext()?.setExtensionPrompt?.(ST_DEPTH0_PROMPT_KEY, '', ST_PROMPT_IN_CHAT, 0);
            removeTurnExtras();
            controller.dispose();
            customImageBgEl?.remove();
            settingsCard?.remove();
        },
    };
}
