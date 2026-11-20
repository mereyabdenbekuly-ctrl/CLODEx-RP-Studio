/* global tavo */
import { blobToBase64, validateKey } from '../core/api.js';
import { createRpStudioController } from '../core/hud.js';
import { PACK_MAX_BYTES } from '../core/pack.js';
import { GIFT_MAX_BYTES } from '../core/gift.js';
import { createChatState, normalizeChatState } from '../core/physiology.js';
import { tavoIsCharacterRole, tavoMessageTurnKey } from './turnkey.js';

(async function bootstrapTavoHud() {
    const CHAT_VAR_KEY = 'clodex_rp_state';
    const GLOBAL_PREFS_KEY = 'clodex_rp_prefs';
    const STORE_NAMES = new Set(['clodex_rp_phone', 'clodex_rp_wiki']);

    function configFlag(key, fallback = true) {
        const val = tavo.plugin.config.get(key);
        if (val === undefined || val === null) return fallback;
        return val !== false;
    }

    function configNumber(key, fallback, min, max) {
        const num = Number(tavo.plugin.config.get(key));
        if (!Number.isFinite(num)) return fallback;
        return Math.max(min, Math.min(max, Math.round(num)));
    }

    async function findMessages(range) {
        if (typeof tavo.message?.find !== 'function') return [];
        const list = await tavo.message.find(range, { hidden: false }).catch(() => []);
        return Array.isArray(list) ? list : [];
    }

    function turnExtrasSig(state) {
        try {
            return JSON.stringify(state?.turnExtras ?? null);
        } catch {
            return '';
        }
    }

    function pickJsonFileText({ accept = '.clodex-pack,.json,application/json', maxBytes = PACK_MAX_BYTES } = {}) {
        return new Promise((resolvePick, rejectPick) => {
            if (typeof document.createElement !== 'function') {
                resolvePick(null);
                return;
            }
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
                if (!file) {
                    finish(resolvePick, null);
                    return;
                }
                if (Number(file.size) > maxBytes) {
                    finish(rejectPick, new Error(`Pack file is larger than ${maxBytes} bytes.`));
                    return;
                }
                try {
                    finish(resolvePick, await file.text());
                } catch (err) {
                    finish(rejectPick, err);
                }
            });
            (document.body || mountContainer).append?.(input);
            input.click?.();
        });
    }

    function normalizeMaxAutoSpend(val) {
        if (val === undefined || val === null || val === '') return 0.25;
        const num = Number(val);
        return Number.isFinite(num) && num >= 0 ? num : 0.25;
    }

    const mountContainer = document.getElementById('clodex-rp-tavo-mount') || document.body;
    const i18n = tavo.plugin.i18n;
    const lastCompanionMediaSlot = Object.create(null);

    let cachedState = createChatState();
    let cachedPrefs = {
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
        autoTrack: tavo.plugin.config.get('autoTrack') !== false,
        injectContext: tavo.plugin.config.get('injectContext') !== false,
        confirmPaid: tavo.plugin.config.get('confirmPaid') !== false,
        maxAutoSpendUsd: 0.25,
        rpPrefs: {},
        autoImageEvery: 0,
        bgDim: Number(tavo.plugin.config.get('bgDim') ?? 35),
        hudPos: null,
        slopMode: 'inject',
        slopDisabled: [],
        slopPhrases: [],
        directorPresets: [],
        meterPacks: [],
        codexPresets: [],
        directorExpanded: false,
        wikiEnabled: configFlag('wikiEnabled', true),
        wikiEvery: configNumber('wikiEvery', 8, 4, 20),
        phoneSkin: 'auto',
        showInnerThoughts: configFlag('showInnerThoughts', true),
        showSuggestedActions: configFlag('showSuggestedActions', true),
        thoughtsBlurred: configFlag('thoughtsBlurred', true),
    };
    let lastTurnExtrasSig = '';

    let tavoChatScope = '';

    async function reloadFromTavo() {
        const [rawState, rawPrefs, chat] = await Promise.all([
            tavo.variable.get(CHAT_VAR_KEY).catch(() => null),
            tavo.variable.get(GLOBAL_PREFS_KEY, 'global').catch(() => null),
            tavo.chat.current().catch(() => null),
        ]);
        tavoChatScope = String(chat?.id ?? '');
        if (rawState && typeof rawState === 'object') {
            cachedState = normalizeChatState(rawState);
        } else {
            cachedState = createChatState();
            cachedState.world.enableVitals = tavo.plugin.config.get('enableVitals') !== false;
            cachedState.world.enableAdultBiology = Boolean(tavo.plugin.config.get('enableAdultBio'));
        }
        lastTurnExtrasSig = turnExtrasSig(cachedState);
        if (rawPrefs && typeof rawPrefs === 'object') {
            cachedPrefs = {
                ...cachedPrefs,
                ...rawPrefs,
                maxAutoSpendUsd: normalizeMaxAutoSpend(rawPrefs.maxAutoSpendUsd ?? cachedPrefs.maxAutoSpendUsd),
            };
        }
    }

    await reloadFromTavo();

    const bridge = {
        document,
        mountContainer,
        getLocale: () => (String(i18n.locale || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en'),
        t: (key, params) => i18n.t(key, params),
        onLocaleChange: cb => i18n.onChange(() => cb()),
        confirm: async msg => globalThis.confirm(msg),
        notify: msg => tavo.utils?.toast?.(msg),
        getEffectiveKey() {
            const candidate = cachedPrefs.apiKey || tavo.plugin.config.get('apiKey') || '';
            try {
                return candidate ? validateKey(candidate) : '';
            } catch {
                return '';
            }
        },
        getSettings: () => cachedPrefs,
        async updateSettings(patch) {
            let turnPrefChanged = false;
            for (const [k, v] of Object.entries(patch)) {
                if (k === 'apiKey') {
                    cachedPrefs.apiKey = v ? validateKey(v) : '';
                } else if (k === 'maxAutoSpendUsd') {
                    cachedPrefs.maxAutoSpendUsd = normalizeMaxAutoSpend(v);
                } else {
                    cachedPrefs[k] = v;
                    if (k === 'showInnerThoughts' || k === 'showSuggestedActions' || k === 'thoughtsBlurred') {
                        turnPrefChanged = true;
                    }
                }
            }
            await tavo.variable.set(GLOBAL_PREFS_KEY, cachedPrefs, 'global');
            if (turnPrefChanged) {
                tavo.plugin.emit?.('clodex-turn-extras', { reason: 'prefs' });
            }
        },
        getChatScope: () => tavoChatScope,
        getChatState: () => cachedState,
        async saveChatState(nextState) {
            cachedState = normalizeChatState(nextState);
            await tavo.variable.set(CHAT_VAR_KEY, cachedState);
            const sig = turnExtrasSig(cachedState);
            if (sig !== lastTurnExtrasSig) {
                lastTurnExtrasSig = sig;
                // Wakes the per-message ui/turn.html fragment (M3).
                tavo.plugin.emit?.('clodex-turn-extras', { turnKey: String(cachedState.turnExtras?.turnKey ?? '') });
            }
        },
        async getActiveTurnKeys() {
            const all = await findMessages([0, -1]);
            return all.map(tavoMessageTurnKey).filter(Boolean);
        },
        async getLatestTurnKey() {
            const recent = await findMessages([-6, -1]);
            for (let i = recent.length - 1; i >= 0; i -= 1) {
                if (tavoIsCharacterRole(recent[i]?.role)) return tavoMessageTurnKey(recent[i]);
            }
            return '';
        },
        async loadStore(name) {
            if (!STORE_NAMES.has(name)) throw new Error(`Unknown store: ${name}`);
            const raw = await tavo.variable.get(name).catch(() => null);
            return raw && typeof raw === 'object' ? raw : null;
        },
        async loadRpPrefs() {
            return cachedPrefs.rpPrefs && typeof cachedPrefs.rpPrefs === 'object'
                ? structuredClone(cachedPrefs.rpPrefs) : null;
        },
        async saveRpPrefs(value) {
            cachedPrefs.rpPrefs = value && typeof value === 'object' ? structuredClone(value) : {};
            await tavo.variable.set(GLOBAL_PREFS_KEY, cachedPrefs, 'global');
        },
        async saveStore(name, value) {
            if (!STORE_NAMES.has(name)) throw new Error(`Unknown store: ${name}`);
            await tavo.variable.set(name, value);
        },
        async savePhoneMedia({ entryId, kind = 'photo', blob, base64 } = {}) {
            const safeId = String(entryId || 'entry').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'entry';
            const ext = kind === 'voice' || kind === 'audio' ? 'mp3' : 'png';
            let rawB64 = typeof base64 === 'string' && base64.trim()
                ? base64.replace(/^data:[^;]+;base64,/, '').trim()
                : '';
            if (!rawB64 && blob) rawB64 = await blobToBase64(blob);
            if (!rawB64) throw new Error('Phone media payload is empty.');
            return await tavo.file.save(`clodex-phone-${safeId}.${ext}`, rawB64, { encoding: 'base64', scope: 'chat' });
        },
        async exportPack(pack) {
            const json = JSON.stringify(pack, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            if (blob.size > PACK_MAX_BYTES) throw new Error(`Pack is larger than ${PACK_MAX_BYTES} bytes.`);
            const base = String(pack?.name || 'clodex').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'clodex';
            await tavo.file.export(`${base}.clodex-pack`, await blobToBase64(blob), { encoding: 'base64' });
        },
        async exportPet(filename, json) {
            const blob = new Blob([json], { type: 'application/json' });
            if (blob.size > GIFT_MAX_BYTES) throw new Error('tooLarge');
            await tavo.file.export(filename, await blobToBase64(blob), { encoding: 'base64' });
        },
        async importPet() {
            return pickJsonFileText({ accept: '.clodex-pet,application/json', maxBytes: GIFT_MAX_BYTES });
        },
        async importPack() {
            const text = await pickJsonFileText();
            if (text === null || text === undefined) return null;
            const rawText = String(text);
            const byteLen = typeof Blob === 'function' ? new Blob([rawText]).size : rawText.length;
            if (byteLen > PACK_MAX_BYTES) {
                throw new Error(`Pack file is larger than ${PACK_MAX_BYTES} bytes.`);
            }
            return JSON.parse(rawText.replace(/^\uFEFF/, ''));
        },
        async getRpContext({ limit = 6 } = {}) {
            const take = Math.max(1, Math.min(80, Math.trunc(Number(limit) || 6)));
            const [chat, recent] = await Promise.all([
                tavo.chat.current().catch(() => null),
                findMessages([-take, -1]),
            ]);
            const charSummary = chat?.characters?.[0];
            let charDetail = null;
            if (charSummary?.id && tavo.character?.get) {
                charDetail = await tavo.character.get(charSummary.id).catch(() => null);
            }
            return {
                chatId: String(chat?.id ?? 'default'),
                userName: chat?.persona?.name || 'User',
                charName: charDetail?.name || charSummary?.name || 'Character',
                charDescription: String(charDetail?.description ?? ''),
                scenario: String(charDetail?.scenario ?? ''),
                recentMessages: (Array.isArray(recent) ? recent : []).map(m => ({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    name: m.role === 'user' ? (chat?.persona?.name || 'User') : (charSummary?.name || 'Character'),
                    content: String(m.content ?? ''),
                })),
            };
        },
        async insertIntoComposer(text) {
            await tavo.input.append(text);
        },
        resolveMediaSrc(virtualPath) {
            if (!virtualPath) return '';
            if (typeof tavo.file?.url === 'function' && !/^(https?:|data:|blob:)/i.test(virtualPath)) {
                try {
                    return tavo.file.url(virtualPath, { scope: 'chat' }) || virtualPath;
                } catch {
                    return virtualPath;
                }
            }
            return virtualPath;
        },
        async applyImageBackground({ base64 }) {
            const prev = cachedState.scene?.imagePath;
            const nextName = prev?.endsWith('bg-a.png') ? 'clodex-rp-bg-b.png' : 'clodex-rp-bg-a.png';
            const oldName = nextName === 'clodex-rp-bg-a.png' ? 'clodex-rp-bg-b.png' : 'clodex-rp-bg-a.png';
            const savedPath = await tavo.file.save(nextName, base64, { encoding: 'base64', scope: 'chat' });
            await tavo.file.delete(oldName, { scope: 'chat' }).catch(() => {});
            const opacity = Math.max(0.2, Math.min(1, 1 - Number(cachedPrefs.bgDim ?? 35) / 140));
            await tavo.chat.update({ background: { image: savedPath, opacity } });
            return savedPath;
        },
        async applyVideoBackground({ base64 }) {
            const prev = cachedState.scene?.videoPath;
            const nextName = prev?.endsWith('bg-a.mp4') ? 'clodex-rp-bg-b.mp4' : 'clodex-rp-bg-a.mp4';
            const oldName = nextName === 'clodex-rp-bg-a.mp4' ? 'clodex-rp-bg-b.mp4' : 'clodex-rp-bg-a.mp4';
            const savedPath = await tavo.file.save(nextName, base64, { encoding: 'base64', scope: 'chat' });
            await tavo.file.delete(oldName, { scope: 'chat' }).catch(() => {});
            return savedPath;
        },
        async clearSceneBackground() {
            await tavo.chat.update({ background: null }).catch(() => {});
            for (const f of ['clodex-rp-bg-a.png', 'clodex-rp-bg-b.png', 'clodex-rp-bg-a.mp4', 'clodex-rp-bg-b.mp4']) {
                await tavo.file.delete(f, { scope: 'chat' }).catch(() => {});
            }
        },
        async loadCurrentSceneImageDataUrl(currentPath) {
            const target = currentPath !== undefined ? String(currentPath ?? '') : String(cachedState.scene?.imagePath ?? '');
            if (!target) return '';
            if (/^data:image\//i.test(target)) return target;
            if (!await tavo.file.exists(target, { scope: 'chat' }).catch(() => false)) return '';
            const b64 = await tavo.file.load(target, { encoding: 'base64', scope: 'chat' }).catch(() => null);
            return b64 ? `data:image/png;base64,${b64}` : '';
        },
        async saveSpeechAudio({ base64 }) {
            const prev = cachedState.scene?.lastAudioPath;
            const nextName = prev?.endsWith('tts-a.mp3') ? 'clodex-rp-tts-b.mp3' : 'clodex-rp-tts-a.mp3';
            const oldName = nextName === 'clodex-rp-tts-a.mp3' ? 'clodex-rp-tts-b.mp3' : 'clodex-rp-tts-a.mp3';
            const savedPath = await tavo.file.save(nextName, base64, { encoding: 'base64', scope: 'chat' });
            await tavo.file.delete(oldName, { scope: 'chat' }).catch(() => {});
            return savedPath;
        },
        async saveCompanionMedia({ companionId, kind = 'image', blob, base64 } = {}) {
            const safeId = String(companionId || 'main').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'main';
            const ext = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png';
            let rawB64 = typeof base64 === 'string' && base64.trim()
                ? base64.replace(/^data:[^;]+;base64,/, '').trim()
                : '';
            if (!rawB64 && blob) {
                rawB64 = await blobToBase64(blob);
            }
            if (!rawB64) throw new Error('Companion media payload is empty.');

            const comp = Array.isArray(cachedState.companions)
                ? cachedState.companions.find(item => item && String(item.id) === String(companionId))
                : null;
            const statePrev = kind === 'video'
                ? comp?.videoPath
                : kind === 'image'
                    ? comp?.portraitPath
                    : '';
            const slotKey = `${safeId}:${ext}`;
            const prev = String(statePrev || lastCompanionMediaSlot[slotKey] || '');
            const nameA = `clodex-comp-${safeId}-a.${ext}`;
            const nameB = `clodex-comp-${safeId}-b.${ext}`;
            const nextName = prev.endsWith(`-a.${ext}`) ? nameB : nameA;
            const oldName = nextName === nameA ? nameB : nameA;

            const savedPath = await tavo.file.save(nextName, rawB64, { encoding: 'base64', scope: 'chat' });
            lastCompanionMediaSlot[slotKey] = nextName;
            await tavo.file.delete(oldName, { scope: 'chat' }).catch(() => {});
            return savedPath;
        },
        playAudioPreview(path) {
            if (!path || typeof Audio !== 'function') return;
            const resolved = bridge.resolveMediaSrc(path);
            const audio = new Audio(resolved);
            audio.play().catch(() => {});
        },
        async importForgedCharacter({ base64Png, fileName, card }) {
            const safeName = String(fileName || 'clodex-forged-card.png').replace(/[^a-zA-Z0-9._-]/g, '_');
            if (tavo.file?.save && tavo.character?.import) {
                const savedPath = await tavo.file.save(safeName, base64Png, { encoding: 'base64', scope: 'chat' });
                return await tavo.character.import(savedPath);
            }
            if (tavo.character?.import) {
                return await tavo.character.import(card);
            }
            throw new Error('tavo.character.import is unavailable in this Tavo version.');
        },
        async exportForgedCharacter({ base64Png, fileName }) {
            const safeName = String(fileName || 'clodex-forged-card.png').replace(/[^a-zA-Z0-9._-]/g, '_');
            await tavo.file.export(safeName, base64Png, { encoding: 'base64' });
        },
        loadHudPosition: () => cachedPrefs.hudPos,
        saveHudPosition(pos) {
            cachedPrefs.hudPos = pos;
            tavo.variable.set(GLOBAL_PREFS_KEY, cachedPrefs, 'global').catch(() => {});
        },
        getInsets() {
            if (tavo.ui && typeof tavo.ui.getInsets === 'function') {
                return tavo.ui.getInsets();
            }
            return { topBar: 48, bottomInput: 68 };
        },
        onInsetsChange(cb) {
            if (tavo.ui && typeof tavo.ui.onInsetsChanged === 'function') {
                return tavo.ui.onInsetsChanged(() => cb());
            }
            return () => {};
        },
    };

    const controller = createRpStudioController(bridge);

    tavo.plugin.on('clodex-command', async payload => {
        const action = payload?.action;
        if (action === 'open-tracker') controller.openTab('tracker');
        else if (action === 'open-cradle') controller.openTab('cradle');
        else if (action === 'open-underworld') controller.openTab('underworld');
        else if (action === 'open-codex') controller.openTab('codex');
        else if (action === 'open-forge') controller.openTab('forge');
        else if (action === 'open-phone') controller.openTab('phone');
        else if (action === 'open-wiki') controller.openTab('wiki');
        else if (action === 'open-director') controller.openTab('director');
        else if (action === 'sync-tracker') {
            await controller.syncTrackerFromChat({ checkpointKey: payload?.turnKey || payload?.messageId || '' });
        } else if (action === 'generate-bg') {
            await controller.generateSceneBackground({ auto: false });
        } else if (action === 'speak-reply') {
            await controller.speakLatestReply({ explicitText: payload?.text || '', auto: false });
        }
    });

    tavo.plugin.on('clodex-assistant-turn', async payload => {
        await controller.onAssistantMessageCommitted({ checkpointKey: payload?.turnKey || payload?.messageId || '' });
    });

    tavo.plugin.on('clodex-state-updated', async () => {
        await reloadFromTavo();
        await controller.reloadLivingWorld?.();
        controller.renderAll();
    });
})();
