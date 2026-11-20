import { base64ToBlob, blobToBase64, bytesToBase64, ClodexApi, redact, validateKey } from './api.js';
import { normalizeCatalog, pickRecommendedModels, priceView, videoBillingView, walletView } from './catalog.js';
import { buildCodexMessages, CODEX_PRESETS } from './codex.js';
import {
    COMPANION_ARCHETYPES, COMPANION_STAGES, buildCompanionBabbleMessages, buildCompanionForgeConcept,
    buildCompanionPortraitPrompt, buildCompanionVideoPrompt, createCompanionFromArchetype,
    createCompanionFromOffspring, equipCompanionEggSkin, interactWithCompanion, normalizeCompanion,
} from './companion.js';
import { formatShortDate, TIME_SLOTS } from './date.js';
import { buildForgePromptMessages, FORGE_CONCEPT_CHIPS, parseForgedCardV2 } from './forge.js';
import {
    advanceSimulationDays, applyMeterPresetPack, applyTurnExtraction, BIO_MODES, BOND_TYPES, saveCheckpoint,
    CONTRACEPTION_TYPES, deliverBabies, DISCLOSURE_MODES, equipNestEggSkin, getCyclePhase, getVisibleBiologySummary,
    hatchReadyEggs, layEggs, OMEGA_ROLES, SUPPRESSANT_LEVELS, triggerConception,
} from './physiology.js';
import { embedCharacterCardInPng, extractCharacterCardFromPng } from './pngCard.js';
import {
    buildSceneVisualPromptMessages, buildTrackerExtractionMessages, parseTrackerExtraction, TRACKER_MAX_TOKENS,
} from './prompts.js';
import { extractSpokenDialogue, isSafeVoiceId, normalizeVoices } from './voice.js';
import {
    DIRECTOR_MAX_ACTIVE, DIRECTOR_NOTE_MAX, DIRECTOR_PRESETS, dirClear, dirNormalizeCustomPresets, dirSetNote, dirToggle,
} from './director.js';
import { slopAnalyze, slopBuildRule } from './slop.js';
import { packApply, packBuild, packValidate } from './pack.js';
import {
    phoneBuildPhotoPrompt, phoneBuildPresentHint, phoneBuildVoiceText, phoneCreateStore, phoneIngestEvents,
    phoneGc, phoneMarkSeen, phoneNormalizeStore, phoneResolveSkin, phoneReveal, phoneShouldInclude, phoneView, phoneVoiceDuration,
} from './phone.js';
import {
    wikiApplyPatch, wikiBuildUpdateMessages, wikiCreateStore, wikiGc, wikiIsTargetActive, wikiManualEdit, wikiManualRemove,
    wikiNormalizeStore, wikiParsePatch, wikiShouldUpdate, wikiView,
} from './wiki.js';
import { vDirActiveCount, vDirRenderBar } from './views/director.js';
import { vWikiRender } from './views/codex-wiki.js';
import { vStyleRender } from './views/codex-style.js';
import { vPhoneRender } from './views/phone.js';
import { vPackRender } from './views/packs.js';
import { VUW_WAGER_STAKES, vUwRender } from './views/underworld.js';
import { vGaRarityLabel, vGaRenderAltar, vGaRenderRelics, vGaSkinName } from './views/cradle-gacha.js';
import {
    REP_SERVICES, repCoolHeat, repImportFactions, repRollWorldEvent, repUseService,
} from './reputation.js';
import {
    UW_MAX_CASH, UW_SKINS, uwBlackjackAction, uwConsumeWorldEvent, uwOnTurnCommitted,
    uwPawnCollateral, uwPawnInventoryItem, uwPayDebt, uwPlaySlots, uwRedeemCollateral,
    uwResolveSkin, uwRollDice, uwSetPendingWorldEvent, uwStartBlackjack, uwStoryWager, uwTakeLoan,
} from './underworld.js';
import {
    EGG_SKINS, GA_PITY_EPIC, GA_PITY_SSR, GA_RARITIES, gaBuildPaidPrompt, gaCanStartPaid,
    gaCreateSummon, gaEquipSkinOnEgg, gaHatchEgg, gaNormalizePrefs, gaQueueVerifiedRelicEgg, gaWarmEgg,
} from './gacha.js';
import {
    relAttachToCard, relClaimGift, relGiftUrl, relReconcileServerInventory, relPublicBadge, relSyncCatalog, relSyncInventory, relVerifyCard, relVerifyInventory,
} from './relic.js';

import { giftParse, giftRecallSent, giftRedeem, giftSend } from './gift.js';
import { nestConsumeHints, nestDetach, nestOperationKey, nestPassport, nestQueueCare, nestSanitizeLabel, nestSnapshot, nestStoryOps, nestTransport } from './coopNest.js';
import { vCrRenderGifts, vCrRenderJoin, vCrRenderNest, vCrRenderRelicClaim } from './views/cradle-social.js';

const EXORCIST_PRESET_PROMPT = 'Sharp-featured charismatic priest with sculpted jawline and intricate sacred gothic tattoos along neck and hands, wearing a tailored black cassock, holding an ornate silver crucifix aloft during a dramatic exorcism in a candlelit baroque cathedral, swirling incense smoke, golden chiaroscuro lighting, ultra-detailed masterpiece.';

function el(doc, tag, props = {}, ...children) {
    const node = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null) continue;
        if (k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'string') node.setAttribute('style', v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k in node) {
            node[k] = v;
        } else {
            node.setAttribute(k, String(v));
        }
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
    }
    return node;
}

export function createRpStudioController(bridge) {
    const doc = bridge.document ?? globalThis.document;
    const win = doc.defaultView ?? globalThis;
    const t = (key, params) => bridge.t(key, params);

    const ARCHETYPE_ICONS = {
        familiar_fox: '🦊',
        shadow_raven: '🪶',
        dragon_whelp: '🐉',
        homunculus: '🧪',
        celestial_wisp: '✨',
    };

    let drawerOpen = false;
    let activeTab = 'tracker';
    let activeEntityRole = 'char';
    let peekSpoilers = false;
    let busyState = '';
    let sceneStatusText = '';
    let cradleStatusText = '';
    let errorBanner = '';
    let codexDraft = '';
    let codexPreset = 'lore_keeper';
    let codexCustomPrompt = '';
    let sceneStyle = 'cinematic';
    let scenePromptDraft = '';
    let woundDraft = '';
    let woundBleedingDraft = true;
    let meterNameDraft = '';
    let meterIconDraft = '🖤';
    let invItemDraft = '';

    let activeCompanionId = '';
    let companionNameDraft = '';
    const companionAudioMap = new Map();
    const companionReactionMap = new Map();
    const companionObjectUrls = [];

    let voiceList = [];
    let activeAudioUrl = '';
    let currentCharName = '';
    let sessionAutoSpendUsd = 0;

    let forgeConcept = '';
    let forgeRelic = null;
    let forgeLang = bridge.getLocale() === 'ru' ? 'ru' : 'en';
    let forgeLoreCount = 5;
    let forgeStatusText = '';
    let forgedArtifact = null; // { card, pngBytes, base64Png, previewDataUrl, fileName }

    let catalog = [];
    let wallet = null;
    let videoBilling = null;
    let activeAbort = null;

    // v1.3 «Director & Living World» UI state (kept in memory; persisted data lives in chat stores)
    const PHONE_STORE_KEY = 'clodex_rp_phone';
    const WIKI_STORE_KEY = 'clodex_rp_wiki';
    const HUD_MAX_CHIPS = 4;
    let codexSub = 'questions'; // questions | wiki | style
    let forgeSub = 'forge'; // forge | packs
    let directorExpanded = false; // collapsed by default (spec §4)
    let phoneSection = 'notes';
    let phoneHighlightIds = new Set();
    let phoneBusyEntryId = '';
    let phoneStore = null;
    let wikiStore = null;
    let activeTurnKeys = null; // null = unknown → every journal op counts as active
    let phoneCache = { entries: [], unseen: 0 };
    let wikiCache = { npcs: [], quests: [], places: [], timeline: [] };
    let livingSignature = '';
    let livingLoadedAt = 0;
    let livingPromise = null;
    let wikiBusy = false;
    let wikiStatusText = '';
    let slopHits = [];
    let slopAnalyzedCount = 0;
    let packNameDraft = '';
    let packAuthorDraft = '';
    let packPreview = null; // { pack, errors }
    let packStatusText = '';
    let currentCharDescription = '';
    let currentUserName = '';
    let rpPrefs = gaNormalizePrefs({});
    let trackerSub = 'physiology'; // physiology | underworld
    let cradleSub = 'companions'; // companions | gacha | relics
    let underworldBetDraft = 25;
    let pawnValueDraft = 500;
    let underworldTargetDraft = '';
    let collateralDraft = '';
    let wagerStakeDraft = 'truth';
    let lastCasinoOutcome = null;
    let dossierBusy = false;
    let summonBusy = false;
    let giftTarget = null, giftAlias = '', giftNote = '', giftDraft = '', giftLatest = '', giftBusy = false;
    let nestCreateTarget = null, nestAliasDraft = null, nestInviteDraft = '', nestLastPull = 0, nestSyncing = null, nestBusy = false;
    let relicClaimDraft = '', relicClaimKey = '', relicClaimCode = '', relicClaiming = false;
    let relicCatalog = [];
    let relicSyncStatus = '';
    let relicChecking = false;
    let relicCardStatus = '';
    let relicCardVerified = false;
    let verifiedRelics = new Map();
    // A host may emit both MESSAGE_RECEIVED and its own assistant-turn event.
    // Keep turn consequences idempotent for the lifetime of this controller.
    const committedTurnKeys = new Set();

    const api = new ClodexApi({
        getKey: () => bridge.getEffectiveKey(),
        fetchImpl: bridge.fetchImpl ?? globalThis.fetch?.bind(globalThis),
    });

    const nestApi = new nestTransport(api);

    const hostRoot = el(doc, 'div', { className: 'clodex-rp-root' });
    const backdropEl = el(doc, 'div', { className: 'clodex-rp-video-backdrop', hidden: true });
    backdropEl.style.display = 'none';
    const backdropVideo = el(doc, 'video', {
        className: 'clodex-rp-video-el',
        autoplay: true,
        loop: true,
        muted: true,
        playsInline: true,
    });
    const backdropDimEl = el(doc, 'div', { className: 'clodex-rp-video-dim' });
    backdropEl.append(backdropVideo, backdropDimEl);

    const hudPill = el(doc, 'button', {
        type: 'button',
        className: 'clodex-rp-hud-pill',
    });
    const drawerBackdrop = el(doc, 'div', {
        className: 'clodex-rp-drawer-mask',
        hidden: true,
        onClick: e => {
            if (e.target === drawerBackdrop) toggleDrawer(false);
        },
    });
    drawerBackdrop.style.display = 'none';
    drawerBackdrop.style.pointerEvents = 'none';
    const drawerPanel = el(doc, 'section', { className: 'clodex-rp-drawer' });
    drawerBackdrop.append(drawerPanel);
    // M1 director strip: compact, collapsed by default, docked right above the chat composer
    const directorHost = el(doc, 'div', { className: 'clodex-rp-director-host' });
    hostRoot.append(backdropEl, hudPill, directorHost, drawerBackdrop);
    bridge.mountContainer.append(hostRoot);

    function syncCachedCharName() {
        bridge.getRpContext?.().then(rp => {
            let changed = false;
            if (rp?.charDescription !== undefined && String(rp.charDescription) !== currentCharDescription) {
                currentCharDescription = String(rp.charDescription || '');
                changed = true;
            }
            if (rp?.charName && rp.charName !== currentCharName) {
                currentCharName = rp.charName;
                changed = true;
            }
            if (rp?.userName && rp.userName !== currentUserName) {
                currentUserName = rp.userName;
                changed = true;
            }
            if (changed && drawerOpen && (activeTab === 'scene' || activeTab === 'phone' || (activeTab === 'tracker' && trackerSub === 'underworld'))) renderDrawer();
        }).catch(() => {});
    }

    function getActiveCompanion(state) {
        const list = Array.isArray(state?.companions) ? state.companions : [];
        if (!list.length) return null;
        const found = list.find(c => c.id === activeCompanionId);
        if (found) return found;
        activeCompanionId = list[0].id;
        return list[0];
    }

    async function saveCompanionAsset(companionId, kind, blob, base64) {
        if (typeof bridge.saveCompanionMedia === 'function') {
            const saved = await bridge.saveCompanionMedia({ companionId, kind, blob, base64 });
            if (saved) return saved;
        }
        if (typeof URL?.createObjectURL === 'function' && blob) {
            const objUrl = URL.createObjectURL(blob);
            companionObjectUrls.push(objUrl);
            return objUrl;
        }
        const mime = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png';
        return base64 ? `data:${mime};base64,${base64}` : '';
    }

    function estimateAutoCallCostUsd(modelId, kind) {
        const modelObj = catalog.find(m => m.id === modelId);
        const pv = priceView(modelObj?.price);
        if (pv && pv.unit === 'request' && typeof pv.input === 'number' && pv.input > 0) {
            return pv.input;
        }
        return kind === 'image' ? 0.04 : 0.015;
    }

    function checkAutoSpendAllowed(modelId, kind) {
        const settings = bridge.getSettings();
        const rawCap = settings.maxAutoSpendUsd ?? 0.25;
        const cap = Number.isFinite(Number(rawCap)) ? Math.max(0, Number(rawCap)) : 0.25;
        const est = estimateAutoCallCostUsd(modelId, kind);
        if (cap <= 0 || sessionAutoSpendUsd >= cap || sessionAutoSpendUsd + est > cap) {
            const msg = t('notice.autoSpendCapReached', {
                spent: formatUsd(sessionAutoSpendUsd),
                cap: formatUsd(cap),
            });
            errorBanner = msg;
            bridge.notify?.(msg);
            renderAll();
            return { allowed: false, est };
        }
        return { allowed: true, est };
    }

    async function recordAutoSpendAndRefresh(estCostUsd) {
        const prevUsd = wallet?.usd ?? null;
        await refreshAccount().catch(() => {});
        const actualDelta = prevUsd !== null && wallet?.usd !== null && prevUsd > wallet.usd
            ? prevUsd - wallet.usd
            : 0;
        const delta = actualDelta > 0 ? actualDelta : estCostUsd;
        sessionAutoSpendUsd = Math.round((sessionAutoSpendUsd + delta) * 10000) / 10000;
    }

    async function saveCharacterVoiceSelection(rawVoice) {
        const val = String(rawVoice ?? '').trim() || 'alloy';
        const rp = await bridge.getRpContext?.().catch(() => null);
        const charName = rp?.charName || currentCharName || '';
        if (charName) currentCharName = charName;
        const settings = bridge.getSettings();
        const nextVoiceMap = { ...(settings.voiceMap || {}) };
        if (charName) nextVoiceMap[charName] = val;
        await bridge.updateSettings({
            defaultVoice: val,
            voiceMap: nextVoiceMap,
        });
    }

    // Draggable HUD Pill with mouse & touch support + viewport inset clamping
    let dragState = null;
    function applyPillPosition(pos) {
        const insets = bridge.getInsets?.() ?? { topBar: 10, bottomInput: 64 };
        const vw = Math.max(320, win.innerWidth || 390);
        const vh = Math.max(400, win.innerHeight || 720);
        const rect = hudPill.getBoundingClientRect();
        const pw = Math.max(180, rect.width || 250);
        const ph = Math.max(34, rect.height || 38);
        const minTop = Math.max(6, (insets.topBar || 0) + 8);
        const maxTop = Math.max(minTop, vh - (insets.bottomInput || 56) - ph - 8);

        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
            hudPill.style.top = `${minTop}px`;
            hudPill.style.left = '50%';
            hudPill.style.transform = 'translateX(-50%)';
            return;
        }
        const clampedX = Math.min(Math.max(8, pos.x), Math.max(8, vw - pw - 8));
        const clampedY = Math.min(Math.max(minTop, pos.y), maxTop);
        hudPill.style.left = `${clampedX}px`;
        hudPill.style.top = `${clampedY}px`;
        hudPill.style.transform = 'none';
    }

    hudPill.addEventListener('pointerdown', event => {
        if (event.button && event.button !== 0) return;
        const rect = hudPill.getBoundingClientRect();
        dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origLeft: rect.left,
            origTop: rect.top,
            moved: false,
        };
        hudPill.setPointerCapture?.(event.pointerId);
    });

    hudPill.addEventListener('pointermove', event => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) < 7) return;
        dragState.moved = true;
        applyPillPosition({ x: dragState.origLeft + dx, y: dragState.origTop + dy });
    });

    let lastPointerHandledAt = 0;

    hudPill.addEventListener('pointerup', event => {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        const wasMoved = dragState.moved;
        const rect = hudPill.getBoundingClientRect();
        dragState = null;
        lastPointerHandledAt = Date.now();
        if (wasMoved) {
            bridge.saveHudPosition?.({ x: Math.round(rect.left), y: Math.round(rect.top) });
        } else {
            toggleDrawer(!drawerOpen);
        }
    });

    hudPill.addEventListener('click', () => {
        if (Date.now() - lastPointerHandledAt < 400) return;
        toggleDrawer(!drawerOpen);
    });

    hudPill.addEventListener('pointercancel', () => {
        dragState = null;
    });

    function toggleDrawer(open) {
        drawerOpen = Boolean(open);
        drawerBackdrop.hidden = !drawerOpen;
        drawerBackdrop.className = drawerOpen ? 'clodex-rp-drawer-mask is-open' : 'clodex-rp-drawer-mask';
        drawerBackdrop.style.display = drawerOpen ? 'flex' : 'none';
        drawerBackdrop.style.pointerEvents = drawerOpen ? 'auto' : 'none';
        if (drawerOpen) {
            if (activeTab === 'scene') syncCachedCharName();
            if (activeTab === 'cradle') void nestRefresh();
            renderDrawer();
        } else {
            drawerPanel.replaceChildren();
            phoneHighlightIds.clear();
        }
    }

    function formatUsd(val) {
        if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
        return new Intl.NumberFormat(bridge.getLocale() === 'ru' ? 'ru-RU' : 'en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: val < 1 ? 4 : 2,
        }).format(val);
    }

    function formatRub(val) {
        if (typeof val !== 'number' || !Number.isFinite(val)) return '';
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 1,
        }).format(val);
    }

    function formatModelPrice(model) {
        const pv = priceView(model?.price);
        if (!pv) return '';
        if (pv.unit === 'dynamic') return ' · dynamic';
        if (pv.unit === 'request') return ` · ${formatUsd(pv.input)}/req`;
        return ` · ${formatUsd(pv.input)}/1M`;
    }

    function syncVideoBackdrop() {
        const state = bridge.getChatState();
        const settings = bridge.getSettings();
        const dim = Math.min(85, Math.max(0, Number(settings.bgDim ?? 35))) / 100;
        backdropDimEl.style.background = `rgba(8, 10, 16, ${dim})`;

        const videoSrc = bridge.resolveMediaSrc?.(state.scene?.videoPath) || state.scene?.videoPath || '';
        if (videoSrc) {
            if (backdropVideo.getAttribute('src') !== videoSrc) {
                backdropVideo.setAttribute('src', videoSrc);
                backdropVideo.play?.().catch(() => {});
            }
            backdropEl.hidden = false;
            backdropEl.style.display = 'block';
        } else {
            backdropVideo.pause?.();
            backdropVideo.removeAttribute('src');
            backdropEl.hidden = true;
            backdropEl.style.display = 'none';
        }
    }

    function renderHudPill() {
        const state = bridge.getChatState();
        const hasKey = Boolean(bridge.getEffectiveKey());
        const locale = bridge.getLocale();
        hudPill.setAttribute('title', t('hud.openDrawer'));
        hudPill.setAttribute('aria-label', t('hud.openDrawer'));

        // Spec §4: at most 4 chips, priority 📅 date → 🩸/❤️ vitals → 🐣 cradle → 📱 +N / 🎬,
        // remaining slots are filled by secondary chips (biology, memory hint, meters, key/wallet).
        const primary = [];
        const secondary = [];
        const dateStr = formatShortDate(state.world.rpDate, locale);
        const timeStr = t(`time.${state.world.timeOfDay}`);
        primary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-date' }, `📅 ${dateStr} · ${timeStr}`));

        const primaryRole = state.world.targetMode === 'user' ? 'user' : 'char';
        const entity = state.entities[primaryRole];
        if (state.world.enableVitals && entity) {
            const bleeding = entity.vitals.wounds.some(w => w.bleeding);
            const vitText = bleeding
                ? `🩸 ${t('hud.bleeding')} (${entity.vitals.heartRate})`
                : `❤️ ${entity.vitals.heartRate} ${t('hud.bpm')} · 🫁 ${t(`vitals.resp.${entity.vitals.respiration}`)}`;
            primary.push(el(doc, 'span', {
                className: `clodex-rp-chip ${bleeding ? 'clodex-rp-chip-alert' : ''}`,
            }, vitText));
        }

        const activeComp = getActiveCompanion(state);
        if (activeComp) {
            const safeStage = COMPANION_STAGES.includes(activeComp.stage) ? activeComp.stage : 'infant';
            const stageLabel = t(`cradle.stage.${safeStage}`);
            const spark = activeComp.needsStageArt ? ' ✨' : '';
            primary.push(el(doc, 'span', {
                className: 'clodex-rp-chip clodex-rp-chip-cradle',
            }, `🐣 ${activeComp.name} · ${stageLabel} · 💛${Math.round(activeComp.mood ?? 85)}%${spark}`));
        }

        const unseenPhone = Number(phoneCache.unseen) || 0;
        const directorArmed = vDirActiveCount(state.world.director) > 0;
        if (unseenPhone > 0 || directorArmed) {
            const parts = [];
            if (unseenPhone > 0) parts.push(t('phone.hudChip', { count: unseenPhone }));
            if (directorArmed) parts.push(`🎬 ${t('director.hudChip')}`);
            primary.push(el(doc, 'span', {
                className: 'clodex-rp-chip clodex-rp-chip-living',
                dataset: { rpChip: unseenPhone > 0 ? 'phone' : 'director' },
            }, parts.join(' · ')));
        }

        const uwHud = state.underworld;
        if (uwHud && (Number(uwHud.heat) >= 1 || Number(uwHud.turnsInDebt) >= 1)) {
            const uwParts = [];
            if (Number(uwHud.heat) >= 1) {
                const heatVal = Math.round(Number(uwHud.heat) * 100) / 100;
                uwParts.push(`🚔 ${heatVal}★`);
            }
            if (Number(uwHud.turnsInDebt) >= 1) {
                uwParts.push(`💸 ${uwHud.currency || '$'}${Math.trunc(Number(uwHud.debt) || 0)}`);
            }
            secondary.push(el(doc, 'span', {
                className: 'clodex-rp-chip clodex-rp-chip-uw',
                dataset: { rpChip: 'underworld' },
            }, uwParts.join(' · ')));
        }

        if (state.world.enableAdultBiology && entity?.bio?.mode !== 'none') {
            const b = entity.bio;
            const vis = getVisibleBiologySummary(entity, state.world.disclosureMode);
            let bioLabel = '';
            if (b.mode === 'oviposition') {
                if (b.carryingClutch) {
                    bioLabel = `🥚 ${t('hud.clutch', { laid: b.clutchLaid, total: b.clutchTotal })}`;
                } else if (b.nest.active && b.nest.eggs.length) {
                    bioLabel = `🪺 ${t('hud.nest', { count: b.nest.eggs.length })}`;
                } else {
                    bioLabel = `🥚 ${t(`bio.phase.${getCyclePhase(b)}`)}`;
                }
            } else if (b.pregnant && vis.knownPregnant) {
                bioLabel = `🤰 ${t('hud.pregnantWeek', { week: vis.week })}`;
            } else {
                const phase = getCyclePhase(b);
                const icon = phase === 'heat' || phase === 'rut' ? '🔥' : '🌙';
                bioLabel = `${icon} D${b.cycleDay} · ${t(`bio.phase.${phase}`)}`;
            }
            secondary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-bio' }, bioLabel));
        }

        if (!hasKey) {
            secondary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-key' }, `🔑 ${t('hud.connectKey')}`));
        }

        if (state.world.pendingMemoryHint) {
            secondary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-codex' }, `🧠 ${t('hud.memoryArmed')}`));
        }

        if (Array.isArray(state.customMeters)) {
            for (const m of state.customMeters.filter(item => item.showInHud).slice(0, 2)) {
                secondary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-bio' }, `${m.icon} ${m.label}: ${m.value}`));
            }
        }

        if (hasKey && wallet) {
            const rubPart = wallet.rub !== null ? ` (${formatRub(wallet.rub)})` : '';
            secondary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-wallet' }, `💰 ${formatUsd(wallet.usd)}${rubPart}`));
        } else if (hasKey) {
            secondary.push(el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-wallet' }, '⚡ CLODEx'));
        }

        const chips = [...primary, ...secondary].slice(0, HUD_MAX_CHIPS);
        hudPill.replaceChildren(...chips);
        syncVideoBackdrop();
    }

    async function refreshAccount() {
        const key = bridge.getEffectiveKey();
        if (!key) return;
        validateKey(key);
        errorBanner = '';
        busyState = 'account';
        renderAll();
        try {
            const [modelsRes, quotaRes, pricingRes, statusRes] = await Promise.all([
                api.models(),
                api.quota().catch(() => null),
                api.pricing().catch(() => ({})),
                api.status().catch(() => null),
            ]);
            catalog = normalizeCatalog(modelsRes, pricingRes);
            if (quotaRes) {
                wallet = walletView(quotaRes, statusRes);
                videoBilling = videoBillingView(quotaRes);
            }
            const settings = bridge.getSettings();
            const picked = pickRecommendedModels(catalog, settings);
            await bridge.updateSettings(picked);
        } catch (err) {
            errorBanner = redact(err?.message ?? err, key);
        } finally {
            busyState = '';
            renderAll();
        }
    }

    // ---------------------------------------------------------------------------------------
    // v1.3 «Director & Living World» — store loading, journals, Anti-Slop, wiki, phone, packs
    // ---------------------------------------------------------------------------------------
    function ensureDirectorState(state) {
        if (!state.world.director || typeof state.world.director !== 'object') {
            state.world.director = { activeIds: [], customNote: '' };
        }
        if (!Array.isArray(state.world.director.activeIds)) state.world.director.activeIds = [];
        if (typeof state.world.director.customNote !== 'string') state.world.director.customNote = '';
        return state.world.director;
    }

    function asStore(result, fallback) {
        return result && typeof result === 'object' && Array.isArray(result.journal) ? result : fallback;
    }

    function recomputeLivingCaches() {
        if (phoneStore) {
            const view = phoneView(phoneStore, activeTurnKeys);
            phoneCache = {
                entries: Array.isArray(view?.entries) ? view.entries : [],
                unseen: Number(view?.unseen) || 0,
            };
        }
        if (wikiStore) {
            const view = wikiView(wikiStore, activeTurnKeys) || {};
            wikiCache = {
                npcs: Array.isArray(view.npcs) ? view.npcs : [],
                quests: Array.isArray(view.quests) ? view.quests : [],
                places: Array.isArray(view.places) ? view.places : [],
                timeline: Array.isArray(view.timeline) ? view.timeline : [],
            };
        }
    }

    function livingSignatureOf() {
        return JSON.stringify([phoneCache, wikiCache, activeTurnKeys]);
    }

    async function getActiveKeysSafe() {
        if (typeof bridge.getActiveTurnKeys !== 'function') return null;
        try {
            const keys = await bridge.getActiveTurnKeys();
            return Array.isArray(keys) ? keys.map(String) : null;
        } catch {
            return null;
        }
    }

    async function getLatestTurnKeySafe(fallback = '') {
        if (typeof bridge.getLatestTurnKey === 'function') {
            try {
                const key = await bridge.getLatestTurnKey();
                if (key) return String(key);
            } catch {
                // fall through to the caller-provided checkpoint key
            }
        }
        return String(fallback || '');
    }

    // Local U2/U3 consequences run after a reply is committed, regardless of
    // whether an API key/tracker model is configured.  The previous pending
    // event belongs to the reply just completed; consume it before scheduling
    // the next one so a newly-created event survives into the next prompt.
    async function applyLocalTurnConsequences(checkpointKey = '') {
        const key = String(checkpointKey || '');
        if (key && committedTurnKeys.has(key)) return false;
        if (key) {
            const activeKey = await getLatestTurnKeySafe(key);
            if (activeKey && activeKey !== key) return false;
        }
        const state = bridge.getChatState();
        if (!state || !state.underworld) return false;
        if (key) committedTurnKeys.add(key);

        const hadPending = Boolean(state.underworld.pendingWorldEvent);
        if (hadPending) uwConsumeWorldEvent(state.underworld);
        const skin = uwResolveSkin(state.underworld.skin, {
            text: `${state.world?.location || ''} ${state.world?.weather || ''}`,
            description: currentCharDescription,
        });
        const localPhoneEvents = uwOnTurnCommitted(state.underworld, {
            skin,
            t: (token, params) => bridge.t?.(token, params) || token,
        });
        repCoolHeat(state.underworld, { calmTurn: true, advanceTurn: false });
        const repEvent = repRollWorldEvent(state.underworld, { skin });
        if (repEvent?.event && !state.underworld.pendingWorldEvent) {
            uwSetPendingWorldEvent(state.underworld, repEvent.event, { kind: repEvent.kind });
        }
        if (localPhoneEvents.length && typeof bridge.saveStore === 'function') {
            await loadLivingWorld();
            if (!phoneStore) phoneStore = phoneNormalizeStore(phoneCreateStore());
            phoneStore = asStore(phoneIngestEvents(phoneStore, localPhoneEvents, key, { source: 'underworld' }), phoneStore);
            await savePhoneStore();
        }
        if (key) saveCheckpoint(state, key);
        await bridge.saveChatState(state);
        return true;
    }

    // Loads clodex_rp_phone / clodex_rp_wiki + active branch keys. Returns true when visible data changed.
    async function loadLivingWorld() {
        if (typeof bridge.loadStore !== 'function') return false;
        if (livingPromise) return livingPromise;
        livingPromise = (async () => {
            const [rawPhone, rawWiki, keys] = await Promise.all([
                bridge.loadStore(PHONE_STORE_KEY).catch(() => null),
                bridge.loadStore(WIKI_STORE_KEY).catch(() => null),
                getActiveKeysSafe(),
            ]);
            phoneStore = phoneNormalizeStore(rawPhone || phoneCreateStore());
            wikiStore = wikiNormalizeStore(rawWiki || wikiCreateStore());
            activeTurnKeys = keys;
            recomputeLivingCaches();
            livingLoadedAt = Date.now();
            const sig = livingSignatureOf();
            const changed = sig !== livingSignature;
            livingSignature = sig;
            return changed;
        })().catch(() => false).finally(() => {
            livingPromise = null;
        });
        return livingPromise;
    }

    async function loadRpEntitlements() {
        if (typeof bridge.loadRpPrefs !== 'function') return rpPrefs;
        try { rpPrefs = gaNormalizePrefs(await bridge.loadRpPrefs()); } catch { rpPrefs = gaNormalizePrefs({}); }
        verifiedRelics = await relVerifyInventory(rpPrefs.relics);
        return rpPrefs;
    }

    async function runPaidGachaRitual() {
        if (summonBusy) return null;
        const settings = bridge.getSettings();
        const key = bridge.getEffectiveKey();
        if (!key) { activeTab = 'account'; toggleDrawer(true); return null; }
        const textModel = settings.codexModel || settings.trackerModel;
        const imageModel = settings.imageModel;
        if (!textModel || !imageModel) { errorBanner = t('gacha.needModels'); renderAll(); return null; }
        summonBusy = true;
        errorBanner = '';
        renderAll();
        try {
            if (settings.confirmPaid !== false) {
                const textPrice = priceView(catalog.find(model => model.id === textModel)?.price);
                const imagePrice = priceView(catalog.find(model => model.id === imageModel)?.price);
                const textCost = textPrice?.unit === 'request' ? textPrice.input
                    : textPrice?.unit === 'per_1m_total_tokens' ? textPrice.input * 600 / 1e6
                    : textPrice?.unit === 'per_1m_tokens' && Number.isFinite(textPrice.output)
                        ? (textPrice.input + textPrice.output) * 300 / 1e6 : null;
                const imageCost = imagePrice?.unit === 'request' ? imagePrice.input : null;
                const cost = Number.isFinite(textCost) && Number.isFinite(imageCost)
                    ? formatUsd(textCost + imageCost) : t('gacha.estimateUnavailable');
                const confirmed = await bridge.confirm(t('gacha.confirmPaid', { model: `${textModel} + ${imageModel}`, cost }));
                if (!gaCanStartPaid({ confirmed })) return null;
            }
            const local = gaCreateSummon(rpPrefs, { cost: 0 });
            if (!local.ok) { errorBanner = t('relic.cradleFull'); return null; }
            const skin = EGG_SKINS.find(item => item.id === local.egg.eggSkin) || EGG_SKINS[0];
            const rp = await bridge.getRpContext?.() || {};
            const raw = await api.chat({ model: textModel, messages: [{ role: 'user', content: gaBuildPaidPrompt({ rarity: local.egg.rarity, skinId: local.egg.eggSkin, locale: bridge.getLocale(), charName: rp.charName || '{{char}}' }) }], maxTokens: 300, temperature: 0.5, jsonMode: true });
            let lore = {};
            try { lore = JSON.parse(raw); } catch { lore = { name: `${skin.name} companion`, mutationTrait: local.egg.mutationTrait, personality: '', prophecy: '' }; }
            const art = await api.image({ model: imageModel, prompt: `${skin.descriptor} Render a collectible companion egg, ${local.egg.rarity} rarity, no text.` });
            const blob = art.b64_json ? base64ToBlob(art.b64_json, 'image/png') : await api.downloadImage(art.url);
            const base64 = art.b64_json || await blobToBase64(blob);
            const egg = {
                ...local.egg,
                name: lore?.name || `${skin.name} companion`,
                mutationTrait: lore?.mutationTrait || local.egg.mutationTrait,
                personality: lore?.personality,
                prophecy: lore?.prophecy,
                artPath: await saveCompanionAsset(local.egg.id, 'image', blob, base64),
            };
            // gaCreateSummon already placed the egg in local.prefs. Persist that
            // state rather than appending to the stale global snapshot a second
            // time (paid rituals must be idempotent at the UI state boundary).
            local.prefs.pendingEggs = local.prefs.pendingEggs.map(item => item.id === egg.id ? egg : item);
            await saveRpEntitlements(local.prefs);
            bridge.notify?.(t('gacha.ritualDone'));
            return egg;
        } catch (err) { errorBanner = redact(err?.message ?? err, key); return null; }
        finally { summonBusy = false; renderAll(); }
    }

    async function hatchPendingEgg(eggId, state) {
        const linked = rpPrefs.pendingEggs.find(item => item.id === eggId && item.sharedNestUid);
        if (linked) return nestDoCare(eggId, { action: 'hatch' });
        const result = gaHatchEgg(rpPrefs, eggId);
        if (!result.ok) { errorBanner = t(`gacha.error.${result.reason}`); renderAll(); return null; }
        const egg = result.egg;
        if ((state.companions || []).length >= 6) { errorBanner = t('cradle.maxReached'); return null; }
        const claims = verifiedRelics.get(egg.relicUid)?.claims;
        if (egg.relicUid && !claims) { errorBanner = t('relic.unverified'); renderAll(); return null; }
        const base = createCompanionFromArchetype(claims?.archetype ?? egg.archetype, { locale: bridge.getLocale(), customName: egg.name });
        const companion = normalizeCompanion({
            ...base,
            rarity: claims?.rarity ?? egg.rarity, eggSkin: claims?.eggSkin ?? egg.eggSkin,
            mutationTrait: claims ? claims.genes.trait : egg.mutationTrait,
            portraitPath: egg.artPath || base.portraitPath, relicUid: egg.relicUid,
        });
        state.companions.push(companion);
        await bridge.saveChatState(state);
        await saveRpEntitlements(result.prefs);
        renderAll();
        return companion;
    }

    async function saveRpEntitlements(next) {
        rpPrefs = gaNormalizePrefs(next || rpPrefs);
        await bridge.saveRpPrefs?.(rpPrefs);
        return rpPrefs;
    }

    async function syncRpRelics() {
        const [catalogResult, inventoryResult] = await Promise.all([
            relSyncCatalog(api), relSyncInventory(api),
        ]);
        if (!inventoryResult.unavailable) {
            const state = bridge.getChatState();
            const ownedBefore = state.companions.filter(item => item.relicUid).length;
            const next = relReconcileServerInventory(rpPrefs, inventoryResult, state);
            if (state.companions.filter(item => item.relicUid).length !== ownedBefore) await bridge.saveChatState(state);
            await saveRpEntitlements(next);
            verifiedRelics = await relVerifyInventory(rpPrefs.relics);
        }
        return { editions: catalogResult.editions, catalogueUnavailable: catalogResult.unavailable, inventoryUnavailable: inventoryResult.unavailable };
    }

    function scheduleLivingRefresh() {
        if (typeof bridge.loadStore !== 'function' || livingPromise) return;
        if (Date.now() - livingLoadedAt < 2500) return;
        livingLoadedAt = Date.now();
        Promise.resolve().then(loadLivingWorld).then(changed => {
            if (changed) renderAll();
        }).catch(() => {});
    }

    async function reloadLivingWorld() {
        syncCachedCharName();
        await loadLivingWorld();
        renderAll();
    }

    async function savePhoneStore() {
        if (!phoneStore) return;
        // Physical GC only when the active branch is known (dead-branch eviction near 48 KB, spec 10.1).
        if (Array.isArray(activeTurnKeys)) phoneStore = asStore(phoneGc(phoneStore, { activeTurnKeys }), phoneStore);
        await bridge.saveStore?.(PHONE_STORE_KEY, phoneStore);
        recomputeLivingCaches();
        livingSignature = livingSignatureOf();
    }

    async function saveWikiStore() {
        if (!wikiStore) return;
        if (Array.isArray(activeTurnKeys)) wikiStore = asStore(wikiGc(wikiStore, { activeTurnKeys }), wikiStore);
        await bridge.saveStore?.(WIKI_STORE_KEY, wikiStore);
        recomputeLivingCaches();
        livingSignature = livingSignatureOf();
    }

    function slopModeOf(settings) {
        return ['off', 'highlight', 'inject'].includes(settings?.slopMode) ? settings.slopMode : 'inject';
    }

    // M2: fully local — recomputes radar hits and state.world.slopRule from the last 20 character replies.
    async function recomputeSlop({ state = null, save = true } = {}) {
        const settings = bridge.getSettings();
        const target = state || bridge.getChatState();
        const mode = slopModeOf(settings);
        let rule = '';
        if (mode === 'off') {
            slopHits = [];
            slopAnalyzedCount = 0;
        } else {
            const rp = await bridge.getRpContext?.({ limit: 40 }).catch(() => null);
            const replies = (rp?.recentMessages ?? [])
                .filter(m => m && m.role === 'assistant')
                .map(m => String(m.content ?? ''))
                .filter(Boolean)
                .slice(-20);
            slopAnalyzedCount = replies.length;
            const chatLocale = /[а-яё]/i.test(replies.join(' ').slice(0, 4000)) ? 'ru' : 'en';
            const excludeNames = [rp?.charName, rp?.userName, '{{char}}', '{{user}}'].filter(Boolean);
            const extraPhrases = Array.isArray(settings.slopPhrases) ? settings.slopPhrases : [];
            slopHits = replies.length ? (slopAnalyze(replies, { excludeNames, locale: chatLocale, extraPhrases }) || []) : [];
            if (mode === 'inject') {
                rule = slopBuildRule(slopHits, {
                    disabled: Array.isArray(settings.slopDisabled) ? settings.slopDisabled : [],
                    maxPhrases: 6,
                }) || '';
            }
        }
        if ((target.world.slopRule || '') !== rule) {
            target.world.slopRule = rule;
            if (save) await bridge.saveChatState(target);
        }
        return rule;
    }

    function wikiEveryOf(settings) {
        return Math.max(4, Math.min(20, Number(settings?.wikiEvery) || 8));
    }

    // M5: the release's only periodic request (~1 per N turns). Bound to targetTurnKey (spec 10.7).
    async function runWikiUpdate({ manual = false } = {}) {
        if (wikiBusy) return false;
        const key = bridge.getEffectiveKey();
        if (!key) {
            if (manual) {
                activeTab = 'account';
                toggleDrawer(true);
            }
            return false;
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.trackerModel || settings.codexModel;
        if (!model) {
            if (manual) {
                errorBanner = t('wiki.needModel');
                renderAll();
            }
            return false;
        }
        wikiBusy = true;
        wikiStatusText = t('wiki.refreshing');
        renderAll();
        try {
            const targetTurnKey = await getLatestTurnKeySafe();
            await loadLivingWorld();
            const every = wikiEveryOf(settings);
            const rp = await bridge.getRpContext({ limit: every + 2 });
            if (rp?.charName) currentCharName = rp.charName;
            const recent = (rp?.recentMessages ?? []).slice(-(every + 2));
            if (!recent.length) {
                wikiStatusText = t('wiki.nothingNew');
                return false;
            }
            const chatText = recent.map(m => String(m?.content ?? '')).join(' ').slice(0, 4000);
            const messages = wikiBuildUpdateMessages(wikiCache, recent, {
                locale: /[а-яё]/i.test(chatText) ? 'ru' : 'en',
                userName: rp?.userName || '',
                charName: rp?.charName || '',
            });
            const raw = await api.chat({ model, messages, temperature: 0.2, maxTokens: 900, jsonMode: true });
            const patch = wikiParsePatch(raw);

            // Race guard: drop the patch if its turn was swiped / deleted while we waited.
            const nowKeys = await getActiveKeysSafe();
            const stillActive = !targetTurnKey || !Array.isArray(nowKeys)
                || (typeof wikiIsTargetActive === 'function'
                    ? wikiIsTargetActive(targetTurnKey, nowKeys)
                    : nowKeys.includes(targetTurnKey));
            if (!stillActive) {
                wikiStatusText = t('wiki.discardedStale');
                return false;
            }
            await loadLivingWorld();
            wikiStore = asStore(wikiApplyPatch(wikiStore, patch, targetTurnKey, wikiCache), wikiStore);
            await saveWikiStore();
            // Reset wiki turn counter only after a successful wiki update.
            const st = bridge.getChatState();
            if (st?.counters && typeof st.counters === 'object') {
                st.counters.turnsSinceWiki = 0;
                await bridge.saveChatState(st);
            }
            wikiStatusText = t('wiki.updated', {
                upserts: Array.isArray(patch?.upsert) ? patch.upsert.length : 0,
                removes: Array.isArray(patch?.remove) ? patch.remove.length : 0,
            });
            if (manual) await refreshAccount().catch(() => {});
            return true;
        } catch (err) {
            wikiStatusText = '';
            if (manual) errorBanner = redact(err?.message ?? err, key);
            return false;
        } finally {
            wikiBusy = false;
            renderAll();
        }
    }

    async function saveWikiRow(table, row) {
        await loadLivingWorld();
        if (!wikiStore) wikiStore = wikiNormalizeStore(wikiCreateStore());
        const turnKey = await getLatestTurnKeySafe();
        wikiStore = asStore(wikiManualEdit(wikiStore, table, row, turnKey), wikiStore);
        await saveWikiStore();
        bridge.notify?.(t('wiki.savedNotice'));
        renderAll();
    }

    async function removeWikiRow(table, row) {
        if (typeof wikiManualRemove !== 'function' || !row?.id) return;
        await loadLivingWorld();
        const turnKey = await getLatestTurnKeySafe();
        wikiStore = asStore(wikiManualRemove(wikiStore, table, row.id, turnKey), wikiStore);
        await saveWikiStore();
        renderAll();
    }

    async function setPhoneSkin(skin) {
        const clean = ['auto', 'smartphone', 'grimoire'].includes(skin) ? skin : 'auto';
        await loadLivingWorld();
        if (!phoneStore) phoneStore = phoneNormalizeStore(phoneCreateStore());
        phoneStore.skin = clean;
        phoneStore = phoneNormalizeStore(phoneStore);
        await savePhoneStore();
        if (bridge.getSettings().phoneSkin !== clean) {
            await bridge.updateSettings({ phoneSkin: clean });
        }
        renderAll();
    }

    function resolvePhoneSkin(state) {
        const settings = bridge.getSettings();
        const storeSkin = phoneStore?.skin;
        if (storeSkin === 'smartphone' || storeSkin === 'grimoire') return storeSkin;
        if (settings.phoneSkin === 'smartphone' || settings.phoneSkin === 'grimoire') return settings.phoneSkin;
        try {
            const resolved = phoneResolveSkin(phoneStore || phoneCreateStore(), state, currentCharDescription);
            return resolved === 'grimoire' ? 'grimoire' : 'smartphone';
        } catch {
            return 'smartphone';
        }
    }

    async function markPhoneSeen() {
        if (!phoneStore || !phoneCache.unseen) return;
        const ids = phoneCache.entries.map(e => e.id).filter(Boolean);
        phoneStore = asStore(phoneMarkSeen(phoneStore, ids), phoneStore);
        await savePhoneStore();
        renderAll();
    }

    async function presentPhoneEntry(entry) {
        if (!entry) return;
        const state = bridge.getChatState();
        let hint = '';
        try {
            hint = phoneBuildPresentHint(entry) || '';
        } catch {
            hint = '';
        }
        if (!hint) hint = `[${String(entry.author || '').slice(0, 60)}] ${String(entry.text || '').slice(0, 600)}`;
        state.world.pendingMemoryHint = String(hint).slice(0, 1200);
        await bridge.saveChatState(state);
        bridge.notify?.(t('phone.presentedNotice'));
        renderAll();
    }

    async function savePhoneMediaAsset(entry, blob, base64) {
        if (typeof bridge.savePhoneMedia === 'function') {
            const saved = await bridge.savePhoneMedia({ entryId: entry.id, kind: entry.kind, blob, base64 });
            if (saved) return String(saved);
        }
        if (typeof URL?.createObjectURL === 'function' && blob) {
            const objUrl = URL.createObjectURL(blob);
            companionObjectUrls.push(objUrl);
            return objUrl;
        }
        return '';
    }

    // M4 Click-to-Reveal: the ONLY place where phone media costs money — explicit click, confirmPaid,
    // and the spend is counted against the session maxAutoSpendUsd cap.
    async function revealPhoneEntry(entry) {
        if (!entry?.id || phoneBusyEntryId) return '';
        const isPhoto = entry.kind === 'photo';
        if (!isPhoto && entry.kind !== 'voice') return '';
        if (entry.mediaPath) return entry.mediaPath;
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return '';
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = isPhoto ? settings.imageModel : settings.speechModel;
        if (!model) {
            errorBanner = t(isPhoto ? 'phone.needImageModel' : 'phone.needSpeechModel');
            renderAll();
            return '';
        }
        const guard = checkAutoSpendAllowed(model, isPhoto ? 'image' : 'tts');
        if (!guard.allowed) return '';
        if (settings.confirmPaid !== false) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: isPhoto ? 'Phone Photo' : 'Phone Voice', model }));
            if (!ok) return '';
        }

        phoneBusyEntryId = entry.id;
        errorBanner = '';
        renderAll();
        try {
            const rp = await bridge.getRpContext();
            if (rp?.charName) currentCharName = rp.charName;
            const state = bridge.getChatState();
            const vitals = state.entities?.char?.vitals ?? {};
            let blob;
            let base64;
            if (isPhoto) {
                const prompt = phoneBuildPhotoPrompt(entry, {
                    charName: rp?.charName || '',
                    charDescription: rp?.charDescription || '',
                    vitals,
                    skin: resolvePhoneSkin(state),
                });
                const res = await api.image({ model, prompt });
                blob = res.b64_json ? base64ToBlob(res.b64_json, 'image/png') : await api.downloadImage(res.url);
                base64 = res.b64_json || await blobToBase64(blob);
            } else {
                const input = phoneBuildVoiceText(entry, vitals);
                if (!input) throw new Error(t('voice.noDialogue'));
                const rawVoice = settings.voiceMap?.[rp?.charName] || settings.defaultVoice || 'alloy';
                const voice = isSafeVoiceId(rawVoice) ? rawVoice : 'alloy';
                blob = await api.speech({ model, input, voice });
                base64 = await blobToBase64(blob);
            }
            const path = await savePhoneMediaAsset(entry, blob, base64);
            if (!path) throw new Error(t('phone.saveFailed'));
            await loadLivingWorld();
            if (!phoneStore) phoneStore = phoneNormalizeStore(phoneCreateStore());
            phoneStore = asStore(phoneReveal(phoneStore, entry.id, path, entry.turnKey || ''), phoneStore);
            await savePhoneStore();
            await recordAutoSpendAndRefresh(guard.est);
            if (!isPhoto) bridge.playAudioPreview?.(path, blob);
            return path;
        } catch (err) {
            errorBanner = redact(err?.message ?? err, key);
            return '';
        } finally {
            phoneBusyEntryId = '';
            renderAll();
        }
    }

    function currentPackCounts() {
        const settings = bridge.getSettings();
        const len = v => (Array.isArray(v) ? v.length : 0);
        return {
            directorPresets: len(settings.directorPresets),
            slopPhrases: len(settings.slopPhrases),
            meterPacks: len(settings.meterPacks),
            codexPresets: len(settings.codexPresets),
        };
    }

    async function exportCurrentPack() {
        try {
            const settings = bridge.getSettings();
            const locale = bridge.getLocale() === 'ru' ? 'ru' : 'en';
            const pack = packBuild({ ...settings, phoneSkin: phoneStore?.skin || settings.phoneSkin || 'auto' }, {
                name: packNameDraft.trim() || t('pack.defaultName'),
                author: packAuthorDraft.trim(),
                locale,
            });
            const checked = packValidate(pack);
            if (!checked?.ok) throw new Error((checked?.errors || []).join('; ') || t('pack.invalid'));
            if (typeof bridge.exportPack !== 'function') throw new Error(t('pack.unsupported'));
            await bridge.exportPack(checked.pack);
            packStatusText = t('pack.exported');
        } catch (err) {
            packStatusText = '';
            errorBanner = redact(err?.message ?? err);
        }
        renderAll();
    }

    async function pickPackForImport() {
        try {
            if (typeof bridge.importPack !== 'function') throw new Error(t('pack.unsupported'));
            const raw = await bridge.importPack();
            if (!raw) return;
            const res = packValidate(raw);
            const localize = code => (/^pack\.error\.[a-zA-Z]+$/.test(String(code)) ? t(String(code)) : String(code));
            packPreview = {
                pack: res?.ok ? res.pack : null,
                errors: Array.isArray(res?.errors) ? res.errors.map(localize) : [],
                removed: Array.isArray(res?.removed) ? res.removed.map(String) : [],
            };
            if (!res?.ok && !packPreview.errors.length) packPreview.errors.push(t('pack.invalid'));
            packStatusText = '';
        } catch (err) {
            packPreview = { pack: null, errors: [redact(err?.message ?? err)] };
        }
        renderAll();
    }

    async function confirmPackImport() {
        if (!packPreview?.pack) return;
        try {
            const settings = bridge.getSettings();
            const { settings: next } = packApply({ ...settings }, packPreview.pack) || {};
            if (next && typeof next === 'object') {
                const patch = {};
                for (const k of ['directorPresets', 'slopPhrases', 'meterPacks', 'codexPresets', 'phoneSkin', 'slopDisabled']) {
                    if (k in next) patch[k] = next[k];
                }
                await bridge.updateSettings(patch);
                if (patch.phoneSkin && typeof bridge.saveStore === 'function') {
                    await loadLivingWorld();
                    if (!phoneStore) phoneStore = phoneNormalizeStore(phoneCreateStore());
                    phoneStore.skin = patch.phoneSkin;
                    await savePhoneStore();
                }
            }
            packStatusText = t('pack.imported', { name: String(packPreview.pack.name || '').slice(0, 80) });
            packPreview = null;
        } catch (err) {
            errorBanner = redact(err?.message ?? err);
        }
        renderAll();
    }

    async function syncTrackerFromChat({ checkpointKey = '', silent = false } = {}) {
        const key = bridge.getEffectiveKey();
        if (!key) {
            if (!silent) {
                activeTab = 'account';
                toggleDrawer(true);
            }
            return false;
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.trackerModel;
        if (!model) {
            if (!silent) errorBanner = 'Select a Tracker model in Key & Models.';
            renderAll();
            return false;
        }
        const rp = await bridge.getRpContext();
        if (rp?.charName) currentCharName = rp.charName;
        if (rp?.charDescription) currentCharDescription = String(rp.charDescription);
        if (!rp.recentMessages?.length) return false;

        busyState = 'tracker';
        errorBanner = '';
        renderAll();
        try {
            // 1. turnKey of the reply being analysed (variant-aware), 2. phone cadence gate (spec 10.6)
            const scope = bridge.getChatScope?.();
            const turnKey = await getLatestTurnKeySafe(checkpointKey);
            if (scope !== bridge.getChatScope?.()) return false;
            const state = bridge.getChatState();
            const includePhone = Boolean(phoneShouldInclude(state));
            const messages = buildTrackerExtractionMessages(state, rp.recentMessages, {
                userName: rp.userName,
                charName: rp.charName,
                includePhone,
            });
            // 3. one background request per turn, budget TRACKER_MAX_TOKENS (spec 10.4)
            const raw = await api.chat({ model, messages, temperature: 0.15, maxTokens: TRACKER_MAX_TOKENS, jsonMode: true });
            // Do not apply a late response to a swiped/deleted branch.
            const currentTurnKey = await getLatestTurnKeySafe(turnKey);
            if (scope !== bridge.getChatScope?.() || (turnKey && currentTurnKey && turnKey !== currentTurnKey)) return false;
            let delta = {};
            try {
                delta = parseTrackerExtraction(raw) || {};
            } catch (parseErr) {
                // Truncated / invalid JSON never breaks the turn: apply an empty delta.
                delta = {};
                if (!silent) errorBanner = redact(parseErr?.message ?? parseErr, key);
            }
            const phoneEvents = includePhone && Array.isArray(delta.phoneEvents) ? delta.phoneEvents.slice(0, 2) : [];
            if (!includePhone && 'phoneEvents' in delta) delete delta.phoneEvents;
            // 4. Compact state + checkpoint. The shared pet is intentionally
            // excluded from branch-local simulation and only gets typed deltas.
            const sharedCare = nestStoryOps(state.companions, delta);
            applyTurnExtraction(state, delta, { checkpointKey: turnKey || checkpointKey, saveCheckpoint: false });
            let queued = false;
            if (sharedCare.length) {
                const stableKey = (turnKey || checkpointKey) ? JSON.stringify([scope, turnKey || checkpointKey]) : '';
                const opKey = await nestOperationKey(stableKey);
                if (scope !== bridge.getChatScope?.()) return false;
                for (const { item, care } of sharedCare) {
                    try {
                        queued = nestQueueCare(rpPrefs, item, care, opKey) || queued;
                    } catch (err) {
                        if (!silent || err?.message === 'queue_full') nestUserError(err);
                    }
                }
            }
            if (queued) {
                await saveRpEntitlements(rpPrefs);
                if (!silent) void nestRefresh({ pull: false });
            }
            // 6. Anti-Slop rule is recomputed locally after every reply (0 requests)
            try {
                await recomputeSlop({ state, save: false });
            } catch {
                // radar failures must never block the tracker
            }
            // 5. phone journal (separate store, append-only, bound to turnKey)
            if (phoneEvents.length && typeof bridge.saveStore === 'function') {
                await loadLivingWorld();
                if (!phoneStore) phoneStore = phoneNormalizeStore(phoneCreateStore());
                phoneStore = asStore(phoneIngestEvents(phoneStore, phoneEvents, turnKey || checkpointKey, { source: 'tracker' }), phoneStore);
                await savePhoneStore();
            }
            // 7. periodic wiki refresh in the background, bound to targetTurnKey
            if (settings.wikiEnabled !== false && wikiShouldUpdate(state, wikiEveryOf(settings))) {
                runWikiUpdate({ manual: false }).catch(() => {});
            }
            if (!silent) bridge.notify?.(t('notice.trackerUpdated'));
            return true;
        } catch (err) {
            if (!silent) errorBanner = redact(err?.message ?? err, key);
            return false;
        } finally {
            busyState = '';
            renderAll();
        }
    }

    async function runCodexQuery(questionText) {
        const q = String(questionText ?? codexDraft).trim();
        if (!q) return;
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            renderAll();
            return;
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        let model = settings.codexModel;
        if (codexPreset === 'biblical_dante' && catalog.length) {
            const mistralCandidate = catalog.find(m => m.kinds.includes('text') && m.mistral);
            if (mistralCandidate && !model) model = mistralCandidate.id;
        }
        if (!model) model = settings.trackerModel;

        busyState = 'codex';
        errorBanner = '';
        renderAll();
        try {
            const state = bridge.getChatState();
            const rp = await bridge.getRpContext();
            if (rp?.charName) currentCharName = rp.charName;
            const customPackPreset = codexPreset.startsWith('pack:')
                ? (Array.isArray(settings.codexPresets) ? settings.codexPresets.find(p => `pack:${p?.id}` === codexPreset) : null)
                : null;
            const messages = buildCodexMessages({
                preset: customPackPreset ? 'custom' : codexPreset,
                customPrompt: customPackPreset ? customPackPreset.prompt : codexCustomPrompt,
                question: q,
                history: state.codexHistory,
                charName: rp.charName,
                charDescription: rp.charDescription,
                scenario: rp.scenario,
                recentChat: rp.recentMessages,
                locale: bridge.getLocale(),
            });
            const answer = await api.chat({ model, messages, temperature: 0.45, maxTokens: 900 });
            state.codexHistory.push(
                { role: 'user', content: q, preset: codexPreset, model, at: state.world.rpDate },
                { role: 'assistant', content: answer, preset: codexPreset, model, at: state.world.rpDate },
            );
            state.codexHistory = state.codexHistory.slice(-24);
            codexDraft = '';
            await bridge.saveChatState(state);
        } catch (err) {
            errorBanner = redact(err?.message ?? err, key);
        } finally {
            busyState = '';
            renderAll();
        }
    }

    async function buildOrUseScenePrompt() {
        if (scenePromptDraft.trim()) return scenePromptDraft.trim();
        const rp = await bridge.getRpContext();
        if (rp?.charName) currentCharName = rp.charName;
        const state = bridge.getChatState();
        const settings = bridge.getSettings();
        const promptModel = settings.trackerModel || settings.codexModel;
        if (promptModel) {
            const msgs = buildSceneVisualPromptMessages({
                charName: rp.charName,
                charDescription: rp.charDescription,
                scenario: rp.scenario,
                location: state.world.location,
                weather: state.world.weather,
                recentMessages: rp.recentMessages,
                stylePreset: sceneStyle,
            });
            const drafted = await api.chat({ model: promptModel, messages: msgs, temperature: 0.5, maxTokens: 240 });
            scenePromptDraft = drafted;
            return drafted;
        }
        return `${rp.charName || 'Character'} in ${state.world.location || 'atmospheric setting'}, ${rp.charDescription?.slice(0, 300) || 'cinematic lighting'}`;
    }

    async function generateSceneBackground({ auto = false } = {}) {
        const key = bridge.getEffectiveKey();
        if (!key) {
            if (!auto) {
                activeTab = 'account';
                toggleDrawer(true);
            }
            return;
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.imageModel;
        if (!model) {
            if (!auto) errorBanner = 'Select an Image model (e.g. Nano Banana) in Key & Models.';
            renderAll();
            return;
        }
        let autoEst = 0;
        if (auto) {
            const guard = checkAutoSpendAllowed(model, 'image');
            if (!guard.allowed) return;
            autoEst = guard.est;
        } else if (settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: 'Image', model }));
            if (!ok) return;
        }

        activeAbort?.abort();
        const abort = new AbortController();
        activeAbort = abort;
        busyState = 'scene_img';
        sceneStatusText = t('scene.statusGeneratingImg');
        errorBanner = '';
        renderAll();

        try {
            const prompt = await buildOrUseScenePrompt();
            const res = await api.image({ model, prompt }, abort.signal);
            const blob = res.b64_json
                ? base64ToBlob(res.b64_json, 'image/png')
                : await api.downloadImage(res.url, abort.signal);
            const base64 = res.b64_json || await blobToBase64(blob);
            const savedPath = await bridge.applyImageBackground({ blob, base64, prompt });
            const state = bridge.getChatState();
            state.scene.imagePath = savedPath;
            state.scene.imagePrompt = prompt;
            state.scene.turnsSinceAutoImage = 0;
            await bridge.saveChatState(state);
            sceneStatusText = t('scene.statusDone');
            if (auto) {
                await recordAutoSpendAndRefresh(autoEst);
            } else {
                await refreshAccount().catch(() => {});
            }
        } catch (err) {
            if (err?.name !== 'AbortError') errorBanner = redact(err?.message ?? err, key);
            sceneStatusText = '';
        } finally {
            if (activeAbort === abort) activeAbort = null;
            busyState = '';
            renderAll();
        }
    }

    async function generateOrResumeSceneVideo({ resume = false } = {}) {
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return;
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const state = bridge.getChatState();
        const model = settings.videoModel;
        if (!resume && !model) {
            errorBanner = 'Select a Video model in Key & Models.';
            renderAll();
            return;
        }
        if (!resume && settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: 'Video', model }));
            if (!ok) return;
        }

        activeAbort?.abort();
        const abort = new AbortController();
        activeAbort = abort;
        busyState = 'scene_vid';
        errorBanner = '';
        renderAll();

        try {
            let taskIdentifier = resume ? state.scene.videoTaskId : '';
            if (!taskIdentifier) {
                const prompt = await buildOrUseScenePrompt();
                const refDataUrl = await bridge.loadCurrentSceneImageDataUrl?.(state.scene.imagePath);
                sceneStatusText = t('scene.statusGeneratingVid', { status: 'submitting' });
                renderAll();
                const created = await api.createVideo({ model, prompt, image: refDataUrl || undefined }, abort.signal);
                taskIdentifier = created.id;
                state.scene.videoTaskId = taskIdentifier;
                state.scene.videoStatus = created.status;
                await bridge.saveChatState(state);
            }

            const videoBlob = await api.pollVideo(taskIdentifier, {
                onProgress: st => {
                    const pct = st.progress !== null ? `${Math.round(st.progress)}%` : st.status;
                    sceneStatusText = t('scene.statusGeneratingVid', { status: pct });
                    renderAll();
                },
            }, abort.signal);

            const base64 = await blobToBase64(videoBlob);
            const savedVideoPath = await bridge.applyVideoBackground({ blob: videoBlob, base64 });
            state.scene.videoPath = savedVideoPath;
            state.scene.videoStatus = 'completed';
            state.scene.videoTaskId = '';
            await bridge.saveChatState(state);
            sceneStatusText = t('scene.statusDone');
            await refreshAccount().catch(() => {});
        } catch (err) {
            if (err?.name !== 'AbortError') errorBanner = redact(err?.message ?? err, key);
        } finally {
            if (activeAbort === abort) activeAbort = null;
            busyState = '';
            renderAll();
        }
    }

    async function loadSpeechVoices() {
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return [];
        }
        if (!catalog.length) await refreshAccount();
        const model = bridge.getSettings().speechModel;
        if (!model) {
            errorBanner = 'Select a Voice (TTS) model in Key & Models.';
            renderAll();
            return [];
        }
        busyState = 'voices';
        errorBanner = '';
        renderAll();
        try {
            const payload = await api.voices(model);
            voiceList = normalizeVoices(payload);
            return voiceList;
        } catch (err) {
            errorBanner = redact(err?.message ?? err, key);
            return [];
        } finally {
            busyState = '';
            renderAll();
        }
    }

    async function speakLatestReply({ explicitText = '', auto = false } = {}) {
        const key = bridge.getEffectiveKey();
        if (!key) {
            if (!auto) {
                activeTab = 'account';
                toggleDrawer(true);
            }
            return '';
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.speechModel;
        if (!model) {
            if (!auto) errorBanner = 'Select a Voice (TTS) model in Key & Models.';
            renderAll();
            return '';
        }

        const rp = await bridge.getRpContext();
        if (rp?.charName) currentCharName = rp.charName;
        const rawSource = explicitText || rp.recentMessages?.filter(m => m.role === 'assistant').at(-1)?.content || '';
        const spoken = extractSpokenDialogue(rawSource, { dialogueOnly: settings.dialogueOnly !== false });
        if (!spoken) {
            if (!auto) errorBanner = t('voice.noDialogue');
            renderAll();
            return '';
        }

        const charVoice = settings.voiceMap?.[rp.charName] || settings.defaultVoice || 'alloy';
        const safeVoice = isSafeVoiceId(charVoice) ? charVoice : 'alloy';

        let autoEst = 0;
        if (auto) {
            const guard = checkAutoSpendAllowed(model, 'tts');
            if (!guard.allowed) return '';
            autoEst = guard.est;
        } else if (settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: 'TTS', model }));
            if (!ok) return '';
        }

        busyState = 'tts';
        errorBanner = '';
        renderAll();
        try {
            const audioBlob = await api.speech({ model, input: spoken, voice: safeVoice });
            const base64 = await blobToBase64(audioBlob);
            let savedPath = '';
            if (bridge.saveSpeechAudio) {
                savedPath = await bridge.saveSpeechAudio({ blob: audioBlob, base64 });
            } else if (typeof URL?.createObjectURL === 'function') {
                if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
                activeAudioUrl = URL.createObjectURL(audioBlob);
                savedPath = activeAudioUrl;
            }
            const state = bridge.getChatState();
            state.scene.lastAudioPath = savedPath;
            await bridge.saveChatState(state);
            bridge.playAudioPreview?.(savedPath, audioBlob);
            if (auto) {
                await recordAutoSpendAndRefresh(autoEst);
            } else {
                await refreshAccount().catch(() => {});
            }
            return savedPath;
        } catch (err) {
            if (!auto) errorBanner = redact(err?.message ?? err, key);
            return '';
        } finally {
            busyState = '';
            renderAll();
        }
    }

    async function generateCompanionPortrait(companion) {
        const comp = companion || getActiveCompanion(bridge.getChatState());
        if (!comp) return '';
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return '';
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.imageModel;
        if (!model) {
            errorBanner = 'Select an Image model (e.g. Nano Banana) in Key & Models.';
            renderAll();
            return '';
        }
        if (settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: 'Companion Portrait', model }));
            if (!ok) return '';
        }

        activeAbort?.abort();
        const abort = new AbortController();
        activeAbort = abort;
        busyState = 'comp_img';
        cradleStatusText = t('cradle.statusPainting');
        errorBanner = '';
        renderAll();

        try {
            const rp = await bridge.getRpContext();
            if (rp?.charName) currentCharName = rp.charName;
            const prompt = buildCompanionPortraitPrompt(comp, {
                charName: rp.charName,
                charDescription: rp.charDescription,
                userName: rp.userName,
                stylePreset: sceneStyle,
            });
            const res = await api.image({ model, prompt }, abort.signal);
            const blob = res.b64_json
                ? base64ToBlob(res.b64_json, 'image/png')
                : await api.downloadImage(res.url, abort.signal);
            const base64 = res.b64_json || await blobToBase64(blob);
            const savedPath = await saveCompanionAsset(comp.id, 'image', blob, base64);

            const latestState = bridge.getChatState();
            const target = (latestState.companions || []).find(c => c.id === comp.id);
            if (target) {
                target.portraitPath = savedPath;
                target.needsStageArt = false;
                await bridge.saveChatState(latestState);
            }
            cradleStatusText = t('cradle.statusDone');
            await refreshAccount().catch(() => {});
            return savedPath;
        } catch (err) {
            if (err?.name !== 'AbortError') errorBanner = redact(err?.message ?? err, key);
            cradleStatusText = '';
            return '';
        } finally {
            if (activeAbort === abort) activeAbort = null;
            busyState = '';
            renderAll();
        }
    }

    async function generateCompanionVideo(companion, { resume = false } = {}) {
        const comp = companion || getActiveCompanion(bridge.getChatState());
        if (!comp) return '';
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return '';
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.videoModel;
        if (!resume && !model) {
            errorBanner = 'Select a Video model in Key & Models.';
            renderAll();
            return '';
        }
        if (!resume && settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: 'Companion Video', model }));
            if (!ok) return '';
        }

        activeAbort?.abort();
        const abort = new AbortController();
        activeAbort = abort;
        busyState = 'comp_vid';
        errorBanner = '';
        renderAll();

        try {
            let taskIdentifier = resume ? comp.videoTaskId : '';
            if (!taskIdentifier) {
                const prompt = buildCompanionVideoPrompt(comp);
                let refDataUrl = '';
                if (comp.portraitPath) {
                    refDataUrl = /^data:image\//i.test(comp.portraitPath)
                        ? comp.portraitPath
                        : (await bridge.loadCurrentSceneImageDataUrl?.(comp.portraitPath).catch(() => '')) || '';
                }
                cradleStatusText = t('cradle.statusAnimating', { status: 'submitting' });
                renderAll();
                const created = await api.createVideo({ model, prompt, image: refDataUrl || undefined }, abort.signal);
                taskIdentifier = created.id;
                const midState = bridge.getChatState();
                const midTarget = (midState.companions || []).find(c => c.id === comp.id);
                if (midTarget) {
                    midTarget.videoTaskId = taskIdentifier;
                    await bridge.saveChatState(midState);
                }
            }

            const videoBlob = await api.pollVideo(taskIdentifier, {
                onProgress: st => {
                    const pct = st.progress !== null ? `${Math.round(st.progress)}%` : st.status;
                    cradleStatusText = t('cradle.statusAnimating', { status: pct });
                    renderAll();
                },
            }, abort.signal);

            const base64 = await blobToBase64(videoBlob);
            const savedVideoPath = await saveCompanionAsset(comp.id, 'video', videoBlob, base64);
            const latestState = bridge.getChatState();
            const target = (latestState.companions || []).find(c => c.id === comp.id);
            if (target) {
                target.videoPath = savedVideoPath;
                target.videoTaskId = '';
                await bridge.saveChatState(latestState);
            }
            cradleStatusText = t('cradle.statusDone');
            await refreshAccount().catch(() => {});
            return savedVideoPath;
        } catch (err) {
            if (err?.name !== 'AbortError') errorBanner = redact(err?.message ?? err, key);
            return '';
        } finally {
            if (activeAbort === abort) activeAbort = null;
            busyState = '';
            renderAll();
        }
    }

    async function speakCompanionReaction(companion) {
        const comp = companion || getActiveCompanion(bridge.getChatState());
        if (!comp) return '';
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return '';
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const textModel = settings.trackerModel || settings.codexModel;
        const speechModel = settings.speechModel;
        if (!textModel || !speechModel) {
            errorBanner = 'Select Text and Voice (TTS) models in Key & Models.';
            renderAll();
            return '';
        }
        if (settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', { kind: 'Companion Voice', model: speechModel }));
            if (!ok) return '';
        }

        busyState = 'comp_tts';
        cradleStatusText = t('cradle.statusSpeaking');
        errorBanner = '';
        renderAll();
        try {
            const rp = await bridge.getRpContext();
            if (rp?.charName) currentCharName = rp.charName;
            const messages = buildCompanionBabbleMessages(comp, {
                charName: rp.charName,
                userName: rp.userName,
                locale: bridge.getLocale(),
            });
            const rawLine = await api.chat({ model: textModel, messages, temperature: 0.7, maxTokens: 160 });
            companionReactionMap.set(comp.id, rawLine);

            const spoken = extractSpokenDialogue(rawLine, { dialogueOnly: true })
                || extractSpokenDialogue(rawLine, { dialogueOnly: false })
                || rawLine;
            const rawVoice = comp.voiceId || settings.defaultVoice || 'alloy';
            const safeVoice = isSafeVoiceId(rawVoice) ? rawVoice : 'alloy';

            const audioBlob = await api.speech({ model: speechModel, input: spoken, voice: safeVoice });
            const base64 = await blobToBase64(audioBlob);
            const savedAudioPath = await saveCompanionAsset(comp.id, 'audio', audioBlob, base64);
            companionAudioMap.set(comp.id, savedAudioPath);
            bridge.playAudioPreview?.(savedAudioPath, audioBlob);
            cradleStatusText = '';
            await refreshAccount().catch(() => {});
            return savedAudioPath;
        } catch (err) {
            errorBanner = redact(err?.message ?? err, key);
            cradleStatusText = '';
            return '';
        } finally {
            busyState = '';
            renderAll();
        }
    }

    async function graduateCompanionToForge(companion) {
        const comp = companion || getActiveCompanion(bridge.getChatState());
        if (!comp) return '';
        const rp = await bridge.getRpContext?.().catch(() => ({}));
        if (rp?.charName) currentCharName = rp.charName;
        const locale = bridge.getLocale() === 'ru' ? 'ru' : 'en';
        forgeRelic = verifiedRelics.get(comp.relicUid) || null;
        forgeConcept = buildCompanionForgeConcept(comp, {
            charName: rp?.charName || '',
            userName: rp?.userName || '',
            locale,
        });
        forgeLang = locale;
        activeTab = 'forge';
        toggleDrawer(true);
        return forgeConcept;
    }

    async function runCharacterForge() {
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return null;
        }
        if (!forgeConcept.trim()) return null;
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const textModel = settings.codexModel || settings.trackerModel;
        const imageModel = settings.imageModel;
        if (!textModel || !imageModel) {
            errorBanner = 'Select Text and Image (Nano Banana) models in Key & Models.';
            renderAll();
            return null;
        }
        if (settings.confirmPaid) {
            const ok = await bridge.confirm(t('confirm.paidMedia', {
                kind: 'Character + Avatar',
                model: `${textModel} + ${imageModel}`,
            }));
            if (!ok) return null;
        }

        busyState = 'forge';
        const relic = forgeRelic;
        forgeStatusText = t('forge.generatingCard');
        errorBanner = '';
        renderAll();
        try {
            const msgs = buildForgePromptMessages({
                concept: forgeConcept,
                language: forgeLang,
                loreCount: forgeLoreCount,
            });
            const cardJsonRaw = await api.chat({ model: textModel, messages: msgs, temperature: 0.7, maxTokens: 2800, jsonMode: true });
            const { card, avatarPrompt } = parseForgedCardV2(cardJsonRaw);
            if (relic) relAttachToCard(card, relic.payload, relic.sig);

            forgeStatusText = t('forge.generatingAvatar');
            renderAll();
            const imgRes = await api.image({ model: imageModel, prompt: avatarPrompt });
            const imgBlob = imgRes.b64_json
                ? base64ToBlob(imgRes.b64_json, 'image/png')
                : await api.downloadImage(imgRes.url);
            const rawPngBytes = new Uint8Array(await imgBlob.arrayBuffer());
            const embeddedPngBytes = embedCharacterCardInPng(rawPngBytes, card);
            const base64Png = bytesToBase64(embeddedPngBytes);
            const slug = card.data.name.toLowerCase().replace(/[^a-z0-9а-яё_-]+/giu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'character';

            forgedArtifact = {
                card,
                pngBytes: embeddedPngBytes,
                base64Png,
                previewDataUrl: `data:image/png;base64,${base64Png}`,
                fileName: `${slug}-clodex-card.png`,
            };
            forgeStatusText = t('forge.doneStatus', {
                name: card.data.name,
                count: card.data.character_book?.entries?.length ?? 0,
            });
            await refreshAccount().catch(() => {});
            return forgedArtifact;
        } catch (err) {
            errorBanner = redact(err?.message ?? err, key);
            forgeStatusText = '';
            return null;
        } finally {
            busyState = '';
            renderAll();
        }
    }

    function buildSelect(options, currentValue, onChange) {
        const select = el(doc, 'select', {
            className: 'clodex-rp-input',
            onChange: e => onChange(e.target.value),
        });
        for (const opt of options) {
            const o = el(doc, 'option', { value: opt.value, selected: opt.value === currentValue }, opt.label);
            select.append(o);
        }
        return select;
    }

    async function adoptChildIntoCradle(child, state) {
        if (!Array.isArray(state.companions)) state.companions = [];
        const existing = state.companions.find(c => c.originChildId === child.id);
        if (existing) {
            activeCompanionId = existing.id;
            activeTab = 'cradle';
            renderAll();
            return existing;
        }
        if (state.companions.length >= 6) {
            errorBanner = t('cradle.maxReached');
            renderAll();
            return null;
        }
        const created = createCompanionFromOffspring(child, state, { locale: bridge.getLocale() });
        if (created && !state.companions.some(c => c.id === created.id || (created.originChildId && c.originChildId === created.originChildId))) {
            state.companions.push(created);
        }
        if (created) activeCompanionId = created.id;
        errorBanner = '';
        await bridge.saveChatState(state);
        activeTab = 'cradle';
        renderAll();
        return created;
    }

    function renderTrackerTab(state) {
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });
        const subNav = el(doc, 'nav', { className: 'clodex-rp-seg clodex-rp-seg-2 clodex-rp-subtabs', dataset: { rpView: 'tracker-subtabs' } },
            ...[['physiology', `🩺 ${t('tracker.physiology')}`], ['underworld', `🎲 ${t('tracker.underworld')}`]].map(([id, label]) => el(doc, 'button', {
                type: 'button',
                className: `clodex-rp-seg-btn ${trackerSub === id ? 'active' : ''}`,
                dataset: { rpAction: 'tracker-sub', sub: id },
                onClick: () => {
                    trackerSub = id;
                    if (id === 'underworld') syncCachedCharName();
                    renderDrawer();
                },
            }, label)),
        );
        container.append(subNav);
        if (trackerSub === 'underworld') {
            container.append(renderUnderworldTab(state));
            return container;
        }

        // Action row
        container.append(el(doc, 'div', { className: 'clodex-rp-btn-row' },
            el(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                disabled: busyState === 'tracker',
                onClick: () => syncTrackerFromChat(),
            }, busyState === 'tracker' ? `⏳ ${t('world.syncing')}` : `🔄 ${t('world.syncAi')}`),
            el(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn',
                onClick: async () => {
                    advanceSimulationDays(state, 1);
                    await bridge.saveChatState(state);
                    renderAll();
                },
            }, t('world.plus1d')),
            el(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn',
                onClick: async () => {
                    advanceSimulationDays(state, 7);
                    await bridge.saveChatState(state);
                    renderAll();
                },
            }, t('world.plus7d')),
        ));

        // World card
        const worldGrid = el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'div', { className: 'clodex-rp-grid-2' },
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('world.date')),
                    el(doc, 'input', {
                        type: 'date',
                        className: 'clodex-rp-input',
                        value: state.world.rpDate,
                        onChange: async e => {
                            if (e.target.value) state.world.rpDate = e.target.value;
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('world.time')),
                    buildSelect(
                        TIME_SLOTS.map(slot => ({ value: slot, label: t(`time.${slot}`) })),
                        state.world.timeOfDay,
                        async val => {
                            state.world.timeOfDay = val;
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    ),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('world.location')),
                    el(doc, 'input', {
                        type: 'text',
                        className: 'clodex-rp-input',
                        placeholder: t('world.locationPlaceholder'),
                        value: state.world.location,
                        onChange: async e => {
                            state.world.location = e.target.value.slice(0, 140);
                            await bridge.saveChatState(state);
                            renderHudPill();
                        },
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('world.target')),
                    buildSelect(
                        ['both', 'char', 'user'].map(v => ({ value: v, label: t(`world.target.${v}`) })),
                        state.world.targetMode,
                        async val => {
                            state.world.targetMode = val;
                            if (val !== 'both') activeEntityRole = val;
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    ),
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-toggles' },
                el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: state.world.enableVitals,
                        onChange: async e => {
                            state.world.enableVitals = e.target.checked;
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    }),
                    el(doc, 'span', {}, t('world.enableVitals')),
                ),
                el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: state.world.enableAdultBiology,
                        onChange: async e => {
                            state.world.enableAdultBiology = e.target.checked;
                            if (e.target.checked && state.entities[activeEntityRole].bio.mode === 'none') {
                                state.entities[activeEntityRole].bio.mode = 'cycle';
                            }
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    }),
                    el(doc, 'span', {}, `🔞 ${t('world.enableAdult')}`),
                ),
            ),
        );

        if (state.world.enableAdultBiology) {
            worldGrid.append(el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                el(doc, 'span', {}, t('world.disclosure')),
                buildSelect(
                    DISCLOSURE_MODES.map(m => ({ value: m, label: t(`world.disclosure.${m}`) })),
                    state.world.disclosureMode,
                    async val => {
                        state.world.disclosureMode = val;
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                ),
            ));
        }
        container.append(worldGrid);

        // Entity switcher
        container.append(el(doc, 'div', { className: 'clodex-rp-seg' },
            ...['char', 'user'].map(role => el(doc, 'button', {
                type: 'button',
                className: `clodex-rp-seg-btn ${activeEntityRole === role ? 'active' : ''}`,
                onClick: () => {
                    activeEntityRole = role;
                    renderDrawer();
                },
            }, t(`entity.${role}`))),
        ));

        const entity = state.entities[activeEntityRole];

        // Vitals card
        if (state.world.enableVitals) {
            const v = entity.vitals;
            const woundsList = v.wounds.length === 0
                ? el(doc, 'div', { className: 'clodex-rp-muted' }, t('vitals.noWounds'))
                : el(doc, 'div', { className: 'clodex-rp-list' }, ...v.wounds.map(w =>
                    el(doc, 'div', { className: 'clodex-rp-list-item' },
                        el(doc, 'span', {}, `${w.bleeding ? '🩸 ' : '🩹 '}${w.label}`),
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn-mini',
                            onClick: async () => {
                                v.wounds = v.wounds.filter(item => item.id !== w.id);
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, t('vitals.removeWound')),
                    )));

            container.append(el(doc, 'div', { className: 'clodex-rp-card' },
                el(doc, 'h4', { className: 'clodex-rp-card-title' }, `❤️ ${t('vitals.title')}`),
                el(doc, 'div', { className: 'clodex-rp-grid-2' },
                    el(doc, 'label', { className: 'clodex-rp-field' },
                        el(doc, 'span', {}, t('vitals.heartRate')),
                        el(doc, 'input', {
                            type: 'number',
                            min: 40,
                            max: 210,
                            className: 'clodex-rp-input',
                            value: v.heartRate,
                            onChange: async e => {
                                v.heartRate = Math.max(40, Math.min(210, Number(e.target.value) || 72));
                                await bridge.saveChatState(state);
                                renderHudPill();
                            },
                        }),
                    ),
                    el(doc, 'label', { className: 'clodex-rp-field' },
                        el(doc, 'span', {}, t('vitals.breathRate')),
                        el(doc, 'input', {
                            type: 'number',
                            min: 8,
                            max: 48,
                            className: 'clodex-rp-input',
                            value: v.breathRate,
                            onChange: async e => {
                                v.breathRate = Math.max(8, Math.min(48, Number(e.target.value) || 14));
                                await bridge.saveChatState(state);
                                renderHudPill();
                            },
                        }),
                    ),
                    el(doc, 'label', { className: 'clodex-rp-field' },
                        el(doc, 'span', {}, t('vitals.respiration')),
                        buildSelect(
                            ['steady', 'deep', 'rapid', 'breathless', 'shallow'].map(r => ({ value: r, label: t(`vitals.resp.${r}`) })),
                            v.respiration,
                            async val => {
                                v.respiration = val;
                                await bridge.saveChatState(state);
                                renderHudPill();
                            },
                        ),
                    ),
                    el(doc, 'label', { className: 'clodex-rp-field' },
                        el(doc, 'span', {}, t('vitals.circulation')),
                        buildSelect(
                            ['normal', 'flushed', 'adrenaline', 'pallor', 'hypovolemia'].map(c => ({ value: c, label: t(`vitals.circ.${c}`) })),
                            v.circulation,
                            async val => {
                                v.circulation = val;
                                await bridge.saveChatState(state);
                                renderHudPill();
                            },
                        ),
                    ),
                    el(doc, 'label', { className: 'clodex-rp-field' },
                        el(doc, 'span', {}, `${t('vitals.bloodLoss')}: ${v.bloodLossPct}%`),
                        el(doc, 'input', {
                            type: 'range',
                            min: 0,
                            max: 45,
                            value: v.bloodLossPct,
                            onChange: async e => {
                                v.bloodLossPct = Number(e.target.value) || 0;
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }),
                    ),
                    el(doc, 'label', { className: 'clodex-rp-field' },
                        el(doc, 'span', {}, `${t('vitals.stamina')}: ${v.stamina}% · ${t('vitals.stress')}: ${v.stress}%`),
                        el(doc, 'input', {
                            type: 'range',
                            min: 0,
                            max: 100,
                            value: v.stamina,
                            onChange: async e => {
                                v.stamina = Number(e.target.value) || 0;
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }),
                    ),
                ),
                el(doc, 'div', { className: 'clodex-rp-subbox' },
                    el(doc, 'strong', {}, t('vitals.wounds')),
                    woundsList,
                    el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                        el(doc, 'input', {
                            type: 'text',
                            className: 'clodex-rp-input',
                            placeholder: t('vitals.woundPlaceholder'),
                            value: woundDraft,
                            onInput: e => { woundDraft = e.target.value; },
                        }),
                        el(doc, 'label', { className: 'clodex-rp-check' },
                            el(doc, 'input', {
                                type: 'checkbox',
                                checked: woundBleedingDraft,
                                onChange: e => { woundBleedingDraft = e.target.checked; },
                            }),
                            el(doc, 'span', {}, t('vitals.bleedingCheck')),
                        ),
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn',
                            onClick: async () => {
                                if (!woundDraft.trim()) return;
                                v.wounds.push({
                                    id: `w-${Date.now()}`,
                                    label: woundDraft.trim().slice(0, 90),
                                    bleeding: woundBleedingDraft,
                                    severity: woundBleedingDraft ? 2 : 1,
                                    daysOld: 0,
                                });
                                woundDraft = '';
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, t('vitals.addWound')),
                        v.wounds.some(w => w.bleeding) ? el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn',
                            onClick: async () => {
                                v.wounds = v.wounds.map(w => ({ ...w, bleeding: false }));
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, t('vitals.bandageAll')) : null,
                    ),
                ),
            ));
        }

        // 18+ Biology card
        if (state.world.enableAdultBiology) {
            const b = entity.bio;
            const phase = getCyclePhase(b);
            const bioCard = el(doc, 'div', { className: 'clodex-rp-card' },
                el(doc, 'h4', { className: 'clodex-rp-card-title' }, `🧬 ${t('bio.title')}`),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('bio.mode')),
                    buildSelect(
                        BIO_MODES.map(m => ({ value: m, label: t(`bio.mode.${m}`) })),
                        b.mode,
                        async val => {
                            b.mode = val;
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    ),
                ),
            );

            if (b.mode !== 'none') {
                bioCard.append(el(doc, 'div', { className: 'clodex-rp-badge-line clodex-rp-mt' },
                    `${t('bio.phase')}: `,
                    el(doc, 'strong', {}, t(`bio.phase.${phase}`)),
                ));

                if (b.mode === 'cycle' || b.mode === 'omegaverse') {
                    bioCard.append(el(doc, 'div', { className: 'clodex-rp-grid-2 clodex-rp-mt' },
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.cycleDay')),
                            el(doc, 'input', {
                                type: 'number',
                                min: 1,
                                max: b.cycleLength,
                                className: 'clodex-rp-input',
                                value: b.cycleDay,
                                onChange: async e => {
                                    b.cycleDay = Math.max(1, Math.min(b.cycleLength, Number(e.target.value) || 1));
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.cycleLength')),
                            el(doc, 'input', {
                                type: 'number',
                                min: 21,
                                max: 35,
                                className: 'clodex-rp-input',
                                value: b.cycleLength,
                                onChange: async e => {
                                    b.cycleLength = Math.max(21, Math.min(35, Number(e.target.value) || 28));
                                    b.cycleDay = Math.min(b.cycleDay, b.cycleLength);
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.contraception')),
                            buildSelect(
                                CONTRACEPTION_TYPES.map(c => ({ value: c, label: t(`bio.contra.${c}`) })),
                                b.contraception,
                                async val => {
                                    b.contraception = val;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            ),
                        ),
                    ));
                }

                if (b.mode === 'omegaverse') {
                    bioCard.append(el(doc, 'div', { className: 'clodex-rp-grid-2 clodex-rp-mt' },
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.omegaRole')),
                            buildSelect(
                                OMEGA_ROLES.map(r => ({ value: r, label: t(`bio.omega.${r}`) })),
                                b.omegaRole,
                                async val => {
                                    b.omegaRole = val;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            ),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.suppressants')),
                            buildSelect(
                                SUPPRESSANT_LEVELS.map(s => ({ value: s, label: t(`bio.supp.${s}`) })),
                                b.suppressants,
                                async val => {
                                    b.suppressants = val;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            ),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.scent')),
                            el(doc, 'input', {
                                type: 'text',
                                className: 'clodex-rp-input',
                                placeholder: t('bio.scentPlaceholder'),
                                value: b.pheromoneScent,
                                onChange: async e => {
                                    b.pheromoneScent = e.target.value.slice(0, 80);
                                    await bridge.saveChatState(state);
                                },
                            }),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, `${t('bio.pheromoneIntensity')}: ${b.pheromoneIntensity}%`),
                            el(doc, 'input', {
                                type: 'range',
                                min: 0,
                                max: 100,
                                value: b.pheromoneIntensity,
                                onChange: async e => {
                                    b.pheromoneIntensity = Number(e.target.value) || 0;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.bondType')),
                            buildSelect(
                                BOND_TYPES.map(bt => ({ value: bt, label: t(`bio.bond.${bt}`) })),
                                b.bondType,
                                async val => {
                                    b.bondType = val;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            ),
                        ),
                        el(doc, 'label', { className: 'clodex-rp-field' },
                            el(doc, 'span', {}, t('bio.bondPartner')),
                            el(doc, 'input', {
                                type: 'text',
                                className: 'clodex-rp-input',
                                value: b.bondPartner,
                                onChange: async e => {
                                    b.bondPartner = e.target.value.slice(0, 80);
                                    await bridge.saveChatState(state);
                                },
                            }),
                        ),
                    ));
                    bioCard.append(el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn',
                            onClick: async () => {
                                b.inHeatOrRut = !b.inHeatOrRut;
                                b.heatDaysLeft = b.inHeatOrRut ? 4 : 0;
                                b.pheromoneIntensity = b.inHeatOrRut ? 90 : 25;
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, `🔥 ${t('bio.toggleHeat')}`),
                    ));
                }

                // Conception / Pregnancy / Oviposition controls
                if (b.mode === 'oviposition') {
                    const clutchBox = el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                        el(doc, 'strong', {}, `🥚 ${t('bio.clutchBox')}`),
                    );
                    if (b.carryingClutch) {
                        clutchBox.append(
                            el(doc, 'p', {}, t('bio.clutchProgress', {
                                remaining: b.clutchTotal - b.clutchLaid,
                                days: b.clutchDays,
                                target: b.clutchTargetDays,
                            })),
                            el(doc, 'div', { className: 'clodex-rp-btn-row' },
                                el(doc, 'button', {
                                    type: 'button',
                                    className: 'clodex-rp-btn clodex-rp-btn-primary',
                                    onClick: async () => {
                                        layEggs(entity, state, 1);
                                        await bridge.saveChatState(state);
                                        renderAll();
                                    },
                                }, t('bio.layOne')),
                                el(doc, 'button', {
                                    type: 'button',
                                    className: 'clodex-rp-btn',
                                    onClick: async () => {
                                        layEggs(entity, state, null);
                                        await bridge.saveChatState(state);
                                        renderAll();
                                    },
                                }, t('bio.layAll')),
                            ),
                        );
                    } else {
                        clutchBox.append(el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn',
                                onClick: async () => {
                                    triggerConception(entity, state, { force: false });
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, `🎲 ${t('bio.rollConception')}`),
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn',
                                onClick: async () => {
                                    triggerConception(entity, state, { force: true });
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, `🥚 ${t('bio.forceConception')}`),
                        ));
                    }

                    if (b.nest.active && b.nest.eggs.length > 0) {
                        clutchBox.append(
                            el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                                el(doc, 'span', {}, t('bio.nestWarmth')),
                                buildSelect(
                                    ['optimal', 'cool', 'overheated'].map(w => ({ value: w, label: t(`bio.warmth.${w}`) })),
                                    b.nest.warmth,
                                    async val => {
                                        b.nest.warmth = val;
                                        await bridge.saveChatState(state);
                                        renderAll();
                                    },
                                ),
                            ),
                            el(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt' },
                                ...b.nest.eggs.map((egg, i) => {
                                    const unlockedSkins = Array.isArray(rpPrefs.unlockedEggSkins) ? rpPrefs.unlockedEggSkins : [];
                                    const skinSelectOptions = [
                                        el(doc, 'option', { value: '', selected: !egg.eggSkin }, t('gacha.skinDefault')),
                                        ...(egg.eggSkin && !unlockedSkins.includes(egg.eggSkin)
                                            ? [el(doc, 'option', { value: egg.eggSkin, selected: true, disabled: true }, vGaSkinName(t, egg.eggSkin))]
                                            : []),
                                        ...unlockedSkins.map(skinId => el(doc, 'option', {
                                            value: skinId,
                                            selected: egg.eggSkin === skinId,
                                        }, vGaSkinName(t, skinId))),
                                    ];
                                    return el(doc, 'div', {
                                        className: 'clodex-rp-list-item clodex-rp-nest-item',
                                        dataset: { rpView: 'nest-egg', eggIndex: String(i) },
                                    },
                                    el(doc, 'span', {},
                                        t('bio.nestEggItem', {
                                            idx: i + 1,
                                            shell: egg.shell,
                                            days: Math.floor(egg.daysIncubated),
                                            target: egg.targetDays,
                                            cracked: egg.cracked ? t('bio.crackedBadge') : '',
                                        }),
                                        egg.eggSkin ? ` · 🥚 ${vGaSkinName(t, egg.eggSkin)}` : ''),
                                    unlockedSkins.length > 0 ? el(doc, 'select', {
                                        className: 'clodex-rp-input clodex-rp-nest-skin-select',
                                        'aria-label': t('gacha.equipSkinLabel'),
                                        dataset: { rpAction: 'nest-egg-skin', eggIndex: String(i) },
                                        onChange: async e => {
                                            const chosen = String(e.target.value || '');
                                            if (!chosen) return;
                                            const eq = equipNestEggSkin(b, i, chosen, unlockedSkins);
                                            if (!eq.ok) {
                                                errorBanner = t(`gacha.error.${eq.reason || 'invalid_skin'}`);
                                                renderAll();
                                                return;
                                            }
                                            errorBanner = '';
                                            await bridge.saveChatState(state);
                                            renderAll();
                                        },
                                    }, ...skinSelectOptions) : null);
                                }),
                            ),
                            el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                                el(doc, 'button', {
                                    type: 'button',
                                    className: 'clodex-rp-btn clodex-rp-btn-primary',
                                    onClick: async () => {
                                        hatchReadyEggs(entity, state, { forceAll: false });
                                        await bridge.saveChatState(state);
                                        renderAll();
                                    },
                                }, `🐣 ${t('bio.hatchReady')}`),
                                el(doc, 'button', {
                                    type: 'button',
                                    className: 'clodex-rp-btn',
                                    onClick: async () => {
                                        hatchReadyEggs(entity, state, { forceAll: true });
                                        await bridge.saveChatState(state);
                                        renderAll();
                                    },
                                }, t('bio.hatchAll')),
                            ),
                        );
                    }
                    bioCard.append(clutchBox);
                } else if (b.pregnant) {
                    const vis = getVisibleBiologySummary(entity, state.world.disclosureMode);
                    const showFull = peekSpoilers || (vis.revealCount && vis.revealGender);
                    const gendersStr = b.fetusGenders.map(g => t(`bio.gender.${g}`)).join(', ');
                    bioCard.append(el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                        el(doc, 'strong', {}, `🤰 ${t('bio.pregnancyBox')}`),
                        !vis.knownPregnant ? el(doc, 'div', { className: 'clodex-rp-muted' }, `🌫️ ${t('bio.hiddenFromAi')}`) : null,
                        el(doc, 'p', {}, showFull
                            ? t('bio.fetusInfo', { days: b.gestationDays, target: b.gestationTarget, week: vis.week, count: b.fetusCount, genders: gendersStr })
                            : t('bio.fetusMasked', { week: vis.week })),
                        el(doc, 'div', { className: 'clodex-rp-btn-row' },
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn',
                                onClick: () => {
                                    peekSpoilers = !peekSpoilers;
                                    renderDrawer();
                                },
                            }, peekSpoilers ? t('bio.hideSpoilers') : t('bio.peekSpoilers')),
                            state.world.disclosureMode === 'modern' ? el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn',
                                onClick: async () => {
                                    b.testTaken = true;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, t('bio.takeTest')) : null,
                            state.world.disclosureMode === 'modern' ? el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn',
                                onClick: async () => {
                                    b.ultrasoundWeek = Math.floor(b.gestationDays / 7) + 1;
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, t('bio.doUltrasound')) : null,
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn clodex-rp-btn-primary',
                                onClick: async () => {
                                    deliverBabies(entity, state, { method: 'natural' });
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, t('bio.deliverNatural')),
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn',
                                onClick: async () => {
                                    deliverBabies(entity, state, { method: 'c_section' });
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, t('bio.deliverCSection')),
                        ),
                    ));
                } else {
                    bioCard.append(el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn',
                            onClick: async () => {
                                triggerConception(entity, state, { force: false });
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, `🎲 ${t('bio.rollConception')}`),
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn',
                            onClick: async () => {
                                triggerConception(entity, state, { force: true });
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, `✨ ${t('bio.forceConception')}`),
                    ));
                }
            }

            // Family tree with 1-click Cradle transfer
            bioCard.append(el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, `🌳 ${t('bio.familyTitle')}`),
                state.offspring.length === 0
                    ? el(doc, 'div', { className: 'clodex-rp-muted' }, t('bio.noOffspring'))
                    : el(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt' }, ...state.offspring.map(child => {
                        const inCradle = (state.companions || []).some(c => c.originChildId === child.id);
                        return el(doc, 'div', { className: 'clodex-rp-list-item' },
                            el(doc, 'input', {
                                type: 'text',
                                className: 'clodex-rp-input',
                                style: 'flex:1;min-width:90px',
                                placeholder: t('bio.childNamePlaceholder'),
                                value: child.name,
                                onChange: async e => {
                                    child.name = e.target.value.slice(0, 80);
                                    await bridge.saveChatState(state);
                                },
                            }),
                            el(doc, 'span', { className: 'clodex-rp-muted' }, `${t(`bio.gender.${child.gender}`)} · ${child.bornDate}`),
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn-mini',
                                onClick: () => adoptChildIntoCradle(child, state),
                            }, inCradle ? `✅ ${t('cradle.adoptedBadge')}` : `🐣 ${t('cradle.adoptBtn')}`),
                        );
                    })),
            ));

            container.append(bioCard);
        }

        // Custom Story Meters & Inventory Card
        const importedMeterPacks = Array.isArray(bridge.getSettings().meterPacks) ? bridge.getSettings().meterPacks : [];
        const metersCard = el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `📊 ${t('meters.title')}`),
            el(doc, 'div', { className: 'clodex-rp-chips' },
                ...[
                    ['dark_romance', t('meters.packDark')],
                    ['fantasy_rpg', t('meters.packRpg')],
                    ['detective', t('meters.packDetective')],
                ].map(([packId, label]) => el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-chip-btn',
                    onClick: async () => {
                        applyMeterPresetPack(state, packId, bridge.getLocale());
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                }, label)),
                ...importedMeterPacks.filter(p => p && Array.isArray(p.meters)).map(pack => el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-chip-btn',
                    onClick: async () => {
                        for (const tpl of pack.meters) {
                            if (state.customMeters.length >= 8) break;
                            if (tpl?.id && !state.customMeters.some(m => m.id === tpl.id)) {
                                state.customMeters.push({ ...tpl });
                            }
                        }
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                }, `+ ${String(pack.name || pack.id).slice(0, 32)}`)),
            ),
            state.customMeters.length === 0
                ? el(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, t('meters.empty'))
                : el(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt' },
                    ...state.customMeters.map(meter => el(doc, 'div', { className: 'clodex-rp-subbox' },
                        el(doc, 'div', { className: 'clodex-rp-list-item' },
                            el(doc, 'strong', {}, `${meter.icon} ${meter.label}: ${meter.value} / ${meter.max}`),
                            el(doc, 'div', { className: 'clodex-rp-head-actions' },
                                el(doc, 'label', { className: 'clodex-rp-check' },
                                    el(doc, 'input', {
                                        type: 'checkbox',
                                        checked: meter.showInHud,
                                        onChange: async e => {
                                            meter.showInHud = e.target.checked;
                                            await bridge.saveChatState(state);
                                            renderHudPill();
                                        },
                                    }),
                                    el(doc, 'span', {}, t('meters.pinHud')),
                                ),
                                el(doc, 'button', {
                                    type: 'button',
                                    className: 'clodex-rp-btn-mini',
                                    onClick: async () => {
                                        state.customMeters = state.customMeters.filter(m => m.id !== meter.id);
                                        await bridge.saveChatState(state);
                                        renderAll();
                                    },
                                }, '✕'),
                            ),
                        ),
                        el(doc, 'input', {
                            type: 'range',
                            min: meter.min,
                            max: meter.max,
                            value: meter.value,
                            onChange: async e => {
                                meter.value = Number(e.target.value) || 0;
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }),
                    ))),
            state.customMeters.length < 8 ? el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                el(doc, 'input', {
                    type: 'text',
                    className: 'clodex-rp-input',
                    style: 'max-width:64px',
                    placeholder: t('meters.iconPlaceholder'),
                    value: meterIconDraft,
                    onInput: e => { meterIconDraft = e.target.value; },
                }),
                el(doc, 'input', {
                    type: 'text',
                    className: 'clodex-rp-input',
                    style: 'flex:1',
                    placeholder: t('meters.namePlaceholder'),
                    value: meterNameDraft,
                    onInput: e => { meterNameDraft = e.target.value; },
                }),
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    onClick: async () => {
                        const cleanLabel = meterNameDraft.trim().slice(0, 50);
                        if (!cleanLabel) return;
                        const id = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `m_${Date.now()}`;
                        state.customMeters.push({
                            id: `${id}_${state.customMeters.length + 1}`,
                            label: cleanLabel,
                            icon: meterIconDraft.trim().slice(0, 6) || '📊',
                            min: 0,
                            max: 100,
                            value: 50,
                            showInHud: state.customMeters.length === 0,
                        });
                        meterNameDraft = '';
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                }, t('meters.addBtn')),
            ) : null,
            el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, `🎒 ${t('inv.title')} (${t(`entity.${activeEntityRole}`)})`),
                (state.inventory?.[activeEntityRole]?.length ?? 0) === 0
                    ? el(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, t('inv.empty'))
                    : el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                        ...state.inventory[activeEntityRole].map(item => el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-chip-btn',
                            onClick: async () => {
                                state.inventory[activeEntityRole] = state.inventory[activeEntityRole].filter(x => x !== item);
                                await bridge.saveChatState(state);
                                renderDrawer();
                            },
                        }, `${item} ✕`))),
                el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    el(doc, 'input', {
                        type: 'text',
                        className: 'clodex-rp-input',
                        style: 'flex:1',
                        placeholder: t('inv.itemPlaceholder'),
                        value: invItemDraft,
                        onInput: e => { invItemDraft = e.target.value; },
                    }),
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        onClick: async () => {
                            const val = invItemDraft.trim().slice(0, 80);
                            if (!val) return;
                            state.inventory[activeEntityRole].push(val);
                            invItemDraft = '';
                            await bridge.saveChatState(state);
                            renderDrawer();
                        },
                    }, t('inv.addBtn')),
                ),
            ),
        );
        container.append(metersCard);

        return container;
    }

    function copyCradleCode(value) {
        if (bridge.copyText) return bridge.copyText(value);
        if (win.navigator?.clipboard?.writeText) return win.navigator.clipboard.writeText(value);
        return Promise.reject(new Error('clipboard'));
    }

    function displayCradleError(group, err, known) {
        const code = err?.code || err?.message;
        errorBanner = t(group + '.error.' + (known.includes(code) ? code : 'invalid'));
        renderAll();
    }

    async function runGift(action, change) {
        if (giftBusy) return;
        giftBusy = true;
        try {
            const scope = bridge.getChatScope?.();
            const state = bridge.getChatState();
            const sentBefore = rpPrefs.sentGifts;
            const prefs = structuredClone(rpPrefs);
            const updated = structuredClone(state);
            const result = change(updated, prefs);
            const name = result.name ?? result.entity?.name ?? '';
            const summary = t(`gift.activity.${action}`, { name });
            updated.activityLog = [...(updated.activityLog || []), { atDate: updated.world.rpDate, summary }].slice(-40);
            // Persist the backup first on send; no pet may be removed without
            // a saved capsule to recover it. Keep a selectable copy in the UI.
            if (action === 'sent') {
                await saveRpEntitlements(prefs);
                if (scope !== bridge.getChatScope?.() && result.kind === 'companion') {
                    // The source chat is no longer writable. Don't leave an
                    // exportable backup for a pet that was never removed.
                    await saveRpEntitlements({ ...rpPrefs, sentGifts: sentBefore });
                    return;
                }
            }
            if (scope === bridge.getChatScope?.()) await bridge.saveChatState(updated);
            if (action !== 'sent') await saveRpEntitlements(prefs);
            giftLatest = result.code || '';
            giftDraft = '';
            giftTarget = null;
            errorBanner = '';
            bridge.notify?.(summary);
            if (result.code) await copyCradleCode(result.code).catch(() => {});
        } catch (err) {
            displayCradleError('gift', err, ['invalid', 'tooLarge', 'relic', 'shared', 'full', 'sentHere', 'alreadyRedeemed', 'clipboard']);
        } finally {
            giftBusy = false;
            renderAll();
        }
    }

    function renderGiftPanel() {
        const confirm = async () => {
            if (!giftTarget) return;
            const scope = bridge.getChatScope?.();
            const { id, kind } = giftTarget;
            if (!await bridge.confirm?.(t('gift.confirm')) || scope !== bridge.getChatScope?.()) return;
            return runGift('sent', (state, prefs) => giftSend(state, prefs, kind, id, { fromAlias: giftAlias, note: giftNote }));
        };
        return vCrRenderGifts(doc, t, {
            target: giftTarget, alias: giftAlias, note: giftNote, draft: giftDraft, latest: giftLatest, sent: rpPrefs.sentGifts, busy: giftBusy,
        }, {
            onAlias: value => { giftAlias = value; },
            onNote: value => { giftNote = value; },
            onDraft: value => { giftDraft = value; },
            onCancel: () => { giftTarget = null; renderAll(); },
            onConfirm: confirm,
            onRedeem: () => runGift('received', (state, prefs) => giftRedeem(state, prefs, giftDraft)),
            onRecall: async id => {
                if (!await bridge.confirm?.(t('gift.confirmRecall'))) return;
                return runGift('recalled', (state, prefs) => giftRecallSent(state, prefs, id));
            },
            onCopy: code => {
                giftLatest = code;
                renderAll();
                copyCradleCode(code).catch(err => displayCradleError('gift', err, ['clipboard']));
            },
            onExport: async code => {
                try {
                    const capsule = giftParse(code);
                    await bridge.exportPet(capsule.giftId + '.clodex-pet', JSON.stringify(capsule));
                } catch (err) { displayCradleError('gift', err, ['tooLarge']); }
            },
            onImport: async () => {
                try {
                    const raw = await bridge.importPet?.();
                    if (raw) await runGift('received', (state, prefs) => giftRedeem(state, prefs, raw));
                } catch (err) { displayCradleError('gift', err, ['tooLarge']); }
            },
        });
    }

    function cradleGiftButton(item, kind) {
        const inNest = Boolean(item.sharedNestUid);
        const relic = Boolean(item.relicUid);
        return el(doc, relic && !inNest ? 'a' : 'button', {
            className: 'clodex-rp-btn-mini',
            ...(relic && !inNest ? { href: relGiftUrl(item.relicUid), target: '_blank', rel: 'noopener noreferrer' } : { type: 'button' }),
            onClick: relic && !inNest ? undefined : () => {
                if (inNest) return displayCradleError('gift', new Error('shared'), ['shared']);
                giftTarget = { id: item.id, kind, name: item.name };
                giftLatest = '';
                renderAll();
                drawerPanel.querySelector?.('[data-rp-view="pet-gifts"]')?.scrollIntoView?.({ block: 'nearest' });
            },
        }, '🎁 ' + t(relic && !inNest ? 'relic.giftOnWeb' : 'gift.send'));
    }

    function nestItems(state) {
        return [...state.companions, ...rpPrefs.pendingEggs];
    }

    function nestApplyView(raw, state, current, insert = false) {
        const known = current || nestItems(state).find(item => item.sharedNestUid === raw.nestUid);
        if (!known && !insert) return false;
        const snapshot = nestSnapshot(raw, known);
        if (!snapshot) return false;
        const { kind, fields } = snapshot;
        const isEgg = kind === 'egg';
        const wasEgg = known && rpPrefs.pendingEggs.includes(known);
        if (known && isEgg === wasEgg) {
            const stageChanged = !isEgg && known.stage !== fields.stage;
            Object.assign(known, fields, { needsStageArt: stageChanged || Boolean(known.needsStageArt) });
            delete known.nestCreateKey;
            if (!fields.relicUid) delete known.relicUid;
            if (fields.eggSkin && !rpPrefs.unlockedEggSkins.includes(fields.eggSkin)) rpPrefs.unlockedEggSkins.push(fields.eggSkin);
            return true;
        }
        const dest = isEgg ? rpPrefs.pendingEggs : state.companions;
        if (dest.length >= (isEgg ? 24 : 6)) throw new Error('full');
        const local = { ...fields, id: known?.id || raw.nestUid.slice(0, 40), needsStageArt: true, cradleCarry: true };
        if (known && wasEgg) {
            rpPrefs.pendingEggs = rpPrefs.pendingEggs.filter(egg => egg !== known);
            if (fields.relicUid && !rpPrefs.hatchedRelicUids.includes(fields.relicUid)) rpPrefs.hatchedRelicUids.push(fields.relicUid);
        } else if (known) {
            state.companions = state.companions.filter(item => item !== known);
            if (isEgg && known.relicUid) rpPrefs.hatchedRelicUids = rpPrefs.hatchedRelicUids.filter(uid => uid !== known.relicUid);
        }
        if (fields.eggSkin && !rpPrefs.unlockedEggSkins.includes(fields.eggSkin)) rpPrefs.unlockedEggSkins.push(fields.eggSkin);
        dest.push(isEgg ? gaNormalizeEgg(local) : normalizeCompanion(local));
        return true;
    }

    async function nestPersist(state) {
        await Promise.all([saveRpEntitlements(rpPrefs), bridge.saveChatState(state)]);
    }

    function nestUserError(err) {
        if (err?.code === 'nest_local_capacity') err = new Error('full');
        displayCradleError('nest', err, ['full', 'queue_full', 'hatch_pending', 'nest_full', 'nest_forbidden', 'nest_state_changed',
            'nest_not_found', 'nest_limit_reached', 'rate_limited', 'network_error', 'no_key']);
    }

    async function nestRun(kind, itemId = '') {
        if (nestBusy || nestSyncing) return;
        const scope = bridge.getChatScope?.();
        const start = bridge.getChatState();
        let item = itemId && nestItems(start).find(entry => entry.id === itemId);
        if (itemId && !item) return;
        const isEgg = item && rpPrefs.pendingEggs.includes(item);
        const alias = nestSanitizeLabel(nestAliasDraft ?? rpPrefs.guardianAlias);
        nestBusy = true;
        renderAll();
        try {
            if (!bridge.getEffectiveKey()) throw new Error('no_key');
            let view;
            if (kind === 'create') {
                if (!alias || !item || item.sharedNestUid) throw new Error('invalid_input');
                if (!item.nestCreateKey) {
                    const key = await nestOperationKey();
                    if (scope !== bridge.getChatScope?.()) return;
                    item = nestItems(bridge.getChatState()).find(entry => entry.id === itemId);
                    if (!item || item.sharedNestUid) return;
                    item.nestCreateKey = key;
                    if (!isEgg) item.cradleCarry = true;
                    if (isEgg) await saveRpEntitlements(rpPrefs);
                    else await bridge.saveChatState(bridge.getChatState());
                    // Hosts may replace their state with a normalized copy on save.
                    if (scope !== bridge.getChatScope?.()) return;
                    item = nestItems(bridge.getChatState()).find(entry => entry.id === itemId);
                    if (!item?.nestCreateKey) return;
                }
                view = await nestApi.create(alias, nestPassport(item, isEgg ? 'egg' : 'companion'), item.nestCreateKey);
            } else if (kind === 'join') {
                if (!alias || !nestInviteDraft) throw new Error('invalid_input');
                const eggRoom = rpPrefs.pendingEggs.length < 24;
                const companionRoom = start.companions.length < 6;
                if (!eggRoom && !companionRoom) throw new Error('full');
                const acceptKind = eggRoom === companionRoom ? undefined : eggRoom ? 'egg' : 'companion';
                view = await nestApi.join(alias, nestInviteDraft, acceptKind);
            } else if (kind === 'rotate') {
                view = await nestApi.rotate(item.sharedNestUid);
            } else if (kind === 'leave') {
                if (!await bridge.confirm?.(t('nest.leaveConfirm')) || scope !== bridge.getChatScope?.()) return;
                await nestApi.leave(item.sharedNestUid).catch(err => { if (err.status !== 404) throw err; });
                rpPrefs.pendingNestOps = rpPrefs.pendingNestOps.filter(op => op.uid !== item.sharedNestUid);
                await saveRpEntitlements(rpPrefs);
            }
            // Never bind a late create/join response to another chat. A repeat in
            // the original chat uses the saved create key or existing membership.
            if (scope !== bridge.getChatScope?.()) return;
            const state = bridge.getChatState();
            const current = itemId && nestItems(state).find(entry => entry.id === itemId);
            if (kind === 'leave') {
                if (current) nestDetach(current);
            } else {
                if (itemId && !current) return;
                nestApplyView(view, state, current, true);
                if (kind === 'join') nestInviteDraft = '';
                rpPrefs.guardianAlias = alias || rpPrefs.guardianAlias;
            }
            nestCreateTarget = null;
            errorBanner = '';
            await nestPersist(state);
        } catch (err) {
            if (scope !== bridge.getChatScope?.()) return;
            if (kind === 'create' && err?.code === 'nest_state_changed') {
                const state = bridge.getChatState();
                const current = nestItems(state).find(entry => entry.id === itemId);
                if (current) {
                    delete current.nestCreateKey;
                    await nestPersist(state).catch(() => {});
                }
            }
            nestUserError(err);
        } finally { nestBusy = false; renderAll(); }
    }

    async function nestFlush() {
        if (!bridge.getEffectiveKey()) return;
        while (rpPrefs.pendingNestOps.length) {
            const op = rpPrefs.pendingNestOps[0];
            let view;
            let failure;
            try { view = await nestApi.care(op); }
            catch (err) {
                if (![400, 403, 404, 409].includes(err.status)) break;
                failure = err;
            }
            rpPrefs.pendingNestOps = rpPrefs.pendingNestOps.filter(item => item.uid !== op.uid || item.key !== op.key);
            const state = bridge.getChatState();
            if (view && !rpPrefs.pendingNestOps.some(item => item.uid === op.uid)) {
                try { nestApplyView(view, state); }
                catch (err) { failure = err; } // e.g. the result hatched, but the local roster filled up
            }
            if (failure?.status === 404) {
                const item = nestItems(state).find(entry => entry.sharedNestUid === op.uid);
                if (item) nestDetach(item);
            }
            await nestPersist(state);
            if (failure && drawerOpen && activeTab === 'cradle') nestUserError(failure);
        }
    }

    function nestRefresh({ manual = false, pull = true } = {}) {
        if (!bridge.getEffectiveKey() || nestBusy) return Promise.resolve();
        if (nestSyncing) return nestSyncing;
        const now = Date.now();
        if (pull && !manual && now - nestLastPull < 30000) pull = false;
        if (pull) nestLastPull = now;
        nestSyncing = (async () => {
            await nestFlush();
            if (!pull) return;
            const scope = bridge.getChatScope?.();
            const views = await nestApi.list();
            if (!Array.isArray(views) || scope !== bridge.getChatScope?.()) return;
            const state = bridge.getChatState();
            let changed = false;
            const wanted = new Set(nestItems(state).map(item => item.sharedNestUid).filter(Boolean));
            for (const item of nestItems(state)) {
                if (!item.sharedNestUid || rpPrefs.pendingNestOps.some(op => op.uid === item.sharedNestUid)) continue;
                if (!views.some(view => view.nestUid === item.sharedNestUid)) { nestDetach(item); changed = true; }
            }
            for (const view of views) {
                if (rpPrefs.pendingNestOps.some(op => op.uid === view.nestUid)) continue;
                if (!wanted.has(view.nestUid)) continue;
                try { changed = nestApplyView(view, state) || changed; }
                catch (err) { if (manual) nestUserError(err); }
            }
            if (changed) await nestPersist(state);
            if (manual) bridge.notify?.(t('nest.synced'));
        })().catch(err => { if (manual) nestUserError(err); }).finally(() => {
            nestSyncing = null;
            if (drawerOpen && activeTab === 'cradle') renderAll();
        });
        return nestSyncing;
    }

    async function nestDoCare(itemId, care, { memoryHint = '', noticeName = '' } = {}) {
        try {
            const scope = bridge.getChatScope?.();
            const key = await nestOperationKey();
            if (scope !== bridge.getChatScope?.()) return;
            const state = bridge.getChatState();
            const item = nestItems(state).find(entry => entry.id === itemId);
            if (!item?.sharedNestUid) return;
            if (care.hatch && state.companions.length >= 6) throw new Error('full');
            if (care.hatch && item.warmth < 100) throw new Error('nest_state_changed');
            if (!nestQueueCare(rpPrefs, item, care, key)) return;
            if (memoryHint && state?.world) state.world.pendingMemoryHint = memoryHint;
            // Keep the egg visible while an irreversible hatch is queued.
            // Only the server's accepted companion snapshot can replace it.
            await nestPersist(state);
            if (noticeName) bridge.notify?.(t('cradle.careNotice', { name: noticeName }));
            renderAll();
            void nestRefresh({ pull: false });
        } catch (err) { nestUserError(err); }
    }

    function renderNestJoin() {
        return vCrRenderJoin(doc, t, {
            alias: nestAliasDraft ?? rpPrefs.guardianAlias, code: nestInviteDraft, busy: nestBusy, target: nestCreateTarget,
        }, {
            onAlias: alias => { nestAliasDraft = alias; },
            onCode: code => { nestInviteDraft = code.trim().toUpperCase(); },
            onJoin: () => nestRun('join'),
            onCreate: () => nestRun('create', nestCreateTarget?.id),
            onCancel: () => { nestCreateTarget = null; renderAll(); },
            onRefresh: () => nestRefresh({ manual: true }),
        });
    }

    function renderNestItem(item) {
        return vCrRenderNest(doc, t, item, {
            waiting: rpPrefs.pendingNestOps.some(op => op.uid === item.sharedNestUid),
            busy: nestBusy,
        }, {
            onCreate: () => {
                nestCreateTarget = { id: item.id, name: item.name };
                renderAll();
                drawerPanel.querySelector?.('[data-rp-view="nest-join"]')?.scrollIntoView?.({ block: 'nearest' });
            },
            onRotate: () => nestRun('rotate', item.id),
            onLeave: () => nestRun('leave', item.id),
            onRefresh: () => nestRefresh({ manual: true }),
            onCopy: code => copyCradleCode(code).catch(err => displayCradleError('gift', err, ['clipboard'])),
        });
    }

    async function claimGiftRelic(rawCode) {
        if (relicClaiming) return;
        relicClaiming = true;
        try {
            const code = rawCode.trim().toUpperCase();
            if (relicClaimCode !== code) {
                relicClaimKey = await nestOperationKey();
                relicClaimCode = code;
            }
            const entry = await relClaimGift(api, code, relicClaimKey);
            verifiedRelics.set(entry.claims.relicUid, entry);
            const relics = [...rpPrefs.relics.filter(item => item.payload !== entry.payload), { payload: entry.payload, sig: entry.sig }];
            const unlockedEggSkins = [...rpPrefs.unlockedEggSkins, entry.claims.eggSkin];
            await saveRpEntitlements({ ...rpPrefs, relics, unlockedEggSkins });
            relicClaimCode = '';
            relicClaimDraft = '';
            errorBanner = '';
            bridge.notify?.(t('relic.giftClaimed'));
        } catch (err) {
            displayCradleError('relic', err, ['invalid_input', 'transfer_expired', 'transfer_not_found', 'cannot_claim_own_relic',
                'rate_limited', 'network_error', 'unverified']);
        } finally { relicClaiming = false; renderAll(); }
    }

    function renderCradleTab(state) {
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });
        const subNav = el(doc, 'nav', { className: 'clodex-rp-seg clodex-rp-seg-3 clodex-rp-subtabs', dataset: { rpView: 'cradle-subtabs' } },
            ...[['companions', `🐾 ${t('cradle.companions')}`], ['gacha', `🥚 ${t('cradle.gacha')}`], ['relics', `💎 ${t('cradle.relics')}`]].map(([id, label]) => el(doc, 'button', {
                type: 'button',
                className: `clodex-rp-seg-btn ${cradleSub === id ? 'active' : ''}`,
                dataset: { rpAction: 'cradle-sub', sub: id },
                onClick: () => {
                    cradleSub = id;
                    if (id === 'relics' && !relicCatalog.length) loadRelicCatalog();
                    else renderDrawer();
                },
            }, label)),
        );
        container.append(subNav);
        if (cradleSub === 'gacha') {
            container.append(renderNestJoin(), renderGachaSub(state), renderGiftPanel());
            return container;
        }
        if (cradleSub === 'relics') {
            container.append(renderRelicsSub());
            return container;
        }
        if (!Array.isArray(state.companions)) state.companions = [];
        container.append(renderNestJoin(), renderGiftPanel());

        if (state.world.pendingMemoryHint) {
            container.append(el(doc, 'div', { className: 'clodex-rp-banner' },
                el(doc, 'span', {}, `🧠 ${t('codex.memoryBanner', { hint: state.world.pendingMemoryHint.slice(0, 120) })}`),
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini',
                    onClick: async () => {
                        state.world.pendingMemoryHint = '';
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                }, t('codex.clearMemory')),
            ));
        }

        const archetypeIds = Array.isArray(COMPANION_ARCHETYPES)
            ? COMPANION_ARCHETYPES.map(item => (typeof item === 'string' ? item : item?.id)).filter(Boolean)
            : Object.keys(ARCHETYPE_ICONS);

        const activeComp = getActiveCompanion(state);

        // Summon & Offspring Adoption Card
        const summonCard = el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `🐣 ${t('cradle.title')}`),
            el(doc, 'p', { className: 'clodex-rp-muted' }, t('cradle.subtitle')),
            state.companions.length > 0 ? el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                ...state.companions.map(comp => {
                    const stKey = COMPANION_STAGES.includes(comp.stage) ? comp.stage : 'infant';
                    return el(doc, 'button', {
                        type: 'button',
                        className: `clodex-rp-chip-btn ${activeComp?.id === comp.id ? 'active' : ''}`,
                        onClick: () => {
                            activeCompanionId = comp.id;
                            renderDrawer();
                        },
                    }, `${ARCHETYPE_ICONS[comp.archetype] || '🐣'} ${comp.name} · ${t(`cradle.stage.${stKey}`)}${comp.needsStageArt ? ' ✨' : ''}`);
                }),
            ) : null,
            el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, `✨ ${t('cradle.summonTitle')}`),
                el(doc, 'input', {
                    type: 'text',
                    className: 'clodex-rp-input clodex-rp-mt',
                    placeholder: t('cradle.namePlaceholder'),
                    value: companionNameDraft,
                    onInput: e => { companionNameDraft = e.target.value; },
                }),
                el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                    ...archetypeIds.map(archId => el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-chip-btn',
                        onClick: async () => {
                            if (state.companions.length >= 6) {
                                errorBanner = t('cradle.maxReached');
                                renderDrawer();
                                return;
                            }
                            const created = createCompanionFromArchetype(archId, {
                                customName: companionNameDraft.trim(),
                                locale: bridge.getLocale(),
                            });
                            state.companions.push(created);
                            activeCompanionId = created.id;
                            companionNameDraft = '';
                            errorBanner = '';
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    }, `${ARCHETYPE_ICONS[archId] || '🐾'} ${archId in ARCHETYPE_ICONS ? t(`cradle.archetype.${archId}`) : archId}`)),
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, `🌳 ${t('cradle.offspringTitle')}`),
                !state.offspring?.length
                    ? el(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, t('cradle.offspringEmpty'))
                    : el(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt' },
                        ...state.offspring.map(child => {
                            const linked = state.companions.find(c => c.originChildId === child.id);
                            return el(doc, 'div', { className: 'clodex-rp-list-item' },
                                el(doc, 'span', {}, `${child.name || '—'} (${t(`bio.gender.${child.gender}`)} · ${child.bornDate})`),
                                el(doc, 'button', {
                                    type: 'button',
                                    className: linked ? 'clodex-rp-btn-mini' : 'clodex-rp-btn-mini active',
                                    onClick: () => adoptChildIntoCradle(child, state),
                                }, linked ? `✅ ${t('cradle.adoptedBadge')}` : `🐣 ${t('cradle.adoptBtn')}`),
                            );
                        }),
                    ),
            ),
        );
        container.append(summonCard);

        if (!activeComp) {
            container.append(el(doc, 'div', { className: 'clodex-rp-card clodex-rp-muted' }, t('cradle.emptyState')));
            return container;
        }

        // Active Companion Card (Next-Gen Multimodal Tamagotchi)
        const vidSrc = bridge.resolveMediaSrc?.(activeComp.videoPath) || activeComp.videoPath || '';
        const imgSrc = bridge.resolveMediaSrc?.(activeComp.portraitPath) || activeComp.portraitPath || '';
        const mediaNode = vidSrc
            ? el(doc, 'video', {
                className: 'clodex-rp-comp-media',
                src: vidSrc,
                poster: imgSrc || undefined,
                autoplay: true,
                loop: true,
                muted: true,
                playsInline: true,
                controls: true,
            })
            : imgSrc
                ? el(doc, 'img', {
                    className: 'clodex-rp-comp-media',
                    src: imgSrc,
                    alt: activeComp.name,
                })
                : el(doc, 'div', { className: 'clodex-rp-comp-placeholder' }, ARCHETYPE_ICONS[activeComp.archetype] || '🐣');

        const safeStage = COMPANION_STAGES.includes(activeComp.stage) ? activeComp.stage : 'infant';
        const genderIcon = activeComp.gender === 'female' ? '♀' : activeComp.gender === 'male' ? '♂' : '✦';
        const traits = Array.isArray(activeComp.traits) ? activeComp.traits.filter(Boolean) : [];

        const voiceOpts = [
            { value: '', label: t('cradle.voiceDefault') },
            ...voiceList.map(v => ({ value: v.id, label: v.name })),
        ];
        if (activeComp.voiceId && !voiceOpts.some(o => o.value === activeComp.voiceId)) {
            voiceOpts.push({ value: activeComp.voiceId, label: activeComp.voiceId });
        }

        const statDefs = [
            ['fullness', '🍼', activeComp.fullness ?? 85],
            ['mood', '💛', activeComp.mood ?? 85],
            ['bond', '🔗', activeComp.bond ?? 35],
            ['energy', '⚡', activeComp.energy ?? 90],
        ];

        const careActions = [
            ['feed', '🍼'],
            ['pet', '🤚'],
            ['train', '⚔️'],
            ['play', '🎲'],
            ['rest', '🌙'],
        ];

        const reactionLine = companionReactionMap.get(activeComp.id) || '';
        const rawCompAudio = companionAudioMap.get(activeComp.id) || '';
        const compAudioSrc = bridge.resolveMediaSrc?.(rawCompAudio) || rawCompAudio;

        const verifiedCompanion = activeComp.relicUid ? verifiedRelics.get(activeComp.relicUid) : null;
        const compRarity = GA_RARITIES.includes(activeComp.rarity) ? activeComp.rarity : 'common';
        const unlockedCompSkins = Array.isArray(rpPrefs.unlockedEggSkins) ? rpPrefs.unlockedEggSkins : [];
        const compSkinOptions = [
            el(doc, 'option', { value: '', selected: !activeComp.eggSkin }, t('gacha.skinDefault')),
            ...(activeComp.eggSkin && !unlockedCompSkins.includes(activeComp.eggSkin)
                ? [el(doc, 'option', { value: activeComp.eggSkin, selected: true, disabled: true }, vGaSkinName(t, activeComp.eggSkin))]
                : []),
            ...unlockedCompSkins.map(skinId => el(doc, 'option', {
                value: skinId,
                selected: activeComp.eggSkin === skinId,
            }, vGaSkinName(t, skinId))),
        ];
        container.append(el(doc, 'div', { className: `clodex-rp-card${verifiedCompanion ? ' clodex-rp-relic-certified' : ''}` },
            el(doc, 'div', { className: 'clodex-rp-comp-hero' },
                mediaNode,
                el(doc, 'div', { style: 'flex:1;min-width:0' },
                    el(doc, 'div', { className: 'clodex-rp-list-item' },
                        el(doc, 'strong', {}, `${genderIcon} ${activeComp.name}`),
                        el(doc, 'div', { className: 'clodex-rp-head-actions' },
                            el(doc, 'span', { className: 'clodex-rp-muted' }, t('cradle.ageDays', { days: activeComp.ageDays ?? 0 })),
                            el(doc, 'button', {
                                type: 'button',
                                className: 'clodex-rp-btn-mini',
                                title: t('cradle.removeBtn'),
                                disabled: Boolean(activeComp.sharedNestUid),
                                onClick: async () => {
                                    state.companions = state.companions.filter(c => c.id !== activeComp.id);
                                    if (activeComp.cradleCarry) state.cradleRemoved = [...state.cradleRemoved, activeComp.id].slice(-100);
                                    activeCompanionId = state.companions[0]?.id || '';
                                    await bridge.saveChatState(state);
                                    renderAll();
                                },
                            }, '✕'),
                        ),
                    ),
                    el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                        el(doc, 'span', { className: `clodex-rp-rarity is-${compRarity}` }, vGaRarityLabel(t, compRarity)),
                        activeComp.eggSkin ? el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-cradle' }, `🥚 ${vGaSkinName(t, activeComp.eggSkin)}`) : null,
                    ),
                    activeComp.relicUid ? el(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt', dataset: { rpView: 'companion-relic-badge' } },
                        verifiedCompanion ? relPublicBadge(verifiedCompanion.payload, true) : t('relic.unverified'),
                    ) : null,
                    el(doc, 'div', { className: 'clodex-rp-stage-steps' },
                        ...COMPANION_STAGES.map(st => el(doc, 'span', {
                            className: `clodex-rp-stage-pill ${safeStage === st ? 'active' : ''}`,
                        }, t(`cradle.stage.${st}`))),
                    ),
                    activeComp.needsStageArt
                        ? el(doc, 'div', { className: 'clodex-rp-badge-line clodex-rp-mt' }, `✨ ${t('cradle.stageArtBadge')}`)
                        : null,
                    el(doc, 'div', { className: 'clodex-rp-mt' },
                        el(doc, 'div', { className: 'clodex-rp-muted' }, t('cradle.traitsLabel')),
                        traits.length === 0
                            ? el(doc, 'span', { className: 'clodex-rp-muted' }, t('cradle.noTraits'))
                            : el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                                ...traits.map(tr => el(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-bio' }, String(tr)))),
                    ),
                    !activeComp.sharedNestUid && unlockedCompSkins.length > 0 ? el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                        el(doc, 'span', {}, t('gacha.equipSkinLabel')),
                        el(doc, 'select', {
                            className: 'clodex-rp-input',
                            dataset: { rpAction: 'companion-egg-skin', companionId: String(activeComp.id) },
                            onChange: async e => {
                                const chosen = String(e.target.value || '');
                                if (!chosen) return;
                                const eq = equipCompanionEggSkin(activeComp, chosen, unlockedCompSkins);
                                if (!eq.ok) {
                                    errorBanner = t(`gacha.error.${eq.reason || 'invalid_skin'}`);
                                    renderAll();
                                    return;
                                }
                                const idx = state.companions.findIndex(c => c.id === activeComp.id);
                                if (idx >= 0) state.companions[idx] = eq.companion;
                                errorBanner = '';
                                await bridge.saveChatState(state);
                                renderAll();
                            },
                        }, ...compSkinOptions),
                    ) : null,
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-grid-2 clodex-rp-mt' },
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('cradle.nameLabel')),
                    el(doc, 'input', {
                        type: 'text',
                        className: 'clodex-rp-input',
                        value: activeComp.name,
                        onChange: async e => {
                            const nextName = e.target.value.trim().slice(0, 60);
                            if (nextName) {
                                activeComp.name = nextName;
                                if (!activeComp.sharedNestUid) delete activeComp.cradleRemoteLabel;
                            }
                            await bridge.saveChatState(state);
                            renderAll();
                        },
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('cradle.voiceLabel')),
                    el(doc, 'div', { className: 'clodex-rp-btn-row', style: 'flex-wrap:nowrap' },
                        voiceList.length > 0
                            ? buildSelect(voiceOpts, activeComp.voiceId || '', async val => {
                                activeComp.voiceId = val;
                                await bridge.saveChatState(state);
                                renderDrawer();
                            })
                            : el(doc, 'input', {
                                type: 'text',
                                className: 'clodex-rp-input',
                                placeholder: t('voice.voicePlaceholder'),
                                value: activeComp.voiceId || '',
                                onChange: async e => {
                                    activeComp.voiceId = e.target.value.trim().slice(0, 120);
                                    await bridge.saveChatState(state);
                                },
                            }),
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn-mini',
                            disabled: busyState === 'voices',
                            title: t('voice.loadVoices'),
                            onClick: () => loadSpeechVoices(),
                        }, '🎙'),
                    ),
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-stats-grid' },
                ...statDefs.map(([statKey, icon, rawVal]) => {
                    const pct = Math.max(0, Math.min(100, Math.round(Number(rawVal) || 0)));
                    return el(doc, 'div', { className: 'clodex-rp-stat-item' },
                        el(doc, 'div', { className: 'clodex-rp-stat-head' },
                            el(doc, 'span', {}, `${icon} ${t(`cradle.stat.${statKey}`)}`),
                            el(doc, 'strong', {}, `${pct}%`),
                        ),
                        el(doc, 'div', { className: 'clodex-rp-stat-bar' },
                            el(doc, 'div', {
                                className: `clodex-rp-stat-fill is-${statKey}`,
                                style: `width:${pct}%`,
                            }),
                        ),
                    );
                }),
            ),
            el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                cradleGiftButton(activeComp, 'companion'), renderNestItem(activeComp)),
            el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, `💞 ${t('cradle.careTitle')}`),
                el(doc, 'div', { className: 'clodex-rp-muted' }, t('cradle.careHint')),
                el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    ...careActions.map(([act, icon]) => el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        onClick: async () => {
                            if (activeComp.sharedNestUid) {
                                const preview = interactWithCompanion({ ...activeComp }, act, { rpDate: state.world.rpDate });
                                return nestDoCare(activeComp.id, { action: act, ...preview.care }, {
                                    memoryHint: preview?.memoryHint || '',
                                    noticeName: activeComp.name,
                                });
                            }
                            const res = interactWithCompanion(activeComp, act, { rpDate: state.world.rpDate });
                            const updated = res?.companion ?? activeComp;
                            const idx = state.companions.findIndex(c => c.id === activeComp.id);
                            if (idx >= 0) state.companions[idx] = updated;
                            if (res?.memoryHint) {
                                state.world.pendingMemoryHint = res.memoryHint;
                            }
                            await bridge.saveChatState(state);
                            bridge.notify?.(t('cradle.careNotice', { name: updated.name }));
                            renderAll();
                        },
                    }, `${icon} ${t(`cradle.action.${act}`)}`)),
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, `✨ ${t('cradle.mediaTitle')}`),
                cradleStatusText ? el(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, cradleStatusText) : null,
                el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn clodex-rp-btn-primary',
                        disabled: busyState.startsWith('comp_'),
                        onClick: () => generateCompanionPortrait(activeComp),
                    }, `🍌 ${t('cradle.genPortrait')}`),
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        disabled: busyState.startsWith('comp_'),
                        onClick: () => generateCompanionVideo(activeComp, { resume: false }),
                    }, `🎬 ${t('cradle.genVideo')}`),
                    activeComp.videoTaskId ? el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        disabled: busyState.startsWith('comp_'),
                        onClick: () => generateCompanionVideo(activeComp, { resume: true }),
                    }, t('scene.resumeVideo')) : null,
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        disabled: busyState.startsWith('comp_'),
                        onClick: () => speakCompanionReaction(activeComp),
                    }, `🔊 ${t('cradle.speakBtn')}`),
                ),
                reactionLine ? el(doc, 'div', { className: 'clodex-rp-speech-bubble' }, reactionLine) : null,
                compAudioSrc ? el(doc, 'audio', {
                    className: 'clodex-rp-audio',
                    controls: true,
                    autoplay: true,
                    src: compAudioSrc,
                }) : null,
                el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn clodex-rp-btn-dynasty',
                        onClick: () => graduateCompanionToForge(activeComp),
                    }, `🎓 ${t('cradle.graduateBtn')}`),
                ),
            ),
        ));

        return container;
    }

    function renderCodexTab(state) {
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });

        if (state.world.pendingMemoryHint) {
            container.append(el(doc, 'div', { className: 'clodex-rp-banner' },
                el(doc, 'span', {}, `🧠 ${t('codex.memoryBanner', { hint: state.world.pendingMemoryHint.slice(0, 120) })}`),
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini',
                    onClick: async () => {
                        state.world.pendingMemoryHint = '';
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                }, t('codex.clearMemory')),
            ));
        }

        const importedCodexPresets = Array.isArray(bridge.getSettings().codexPresets) ? bridge.getSettings().codexPresets : [];
        const codexOptions = [
            ...Object.keys(CODEX_PRESETS).map(k => ({ value: k, label: t(`codex.preset.${k}`) })),
            ...importedCodexPresets.filter(p => p?.id && p?.prompt).map(p => ({
                value: `pack:${p.id}`,
                label: String(p.name || p.id).slice(0, 60),
            })),
        ];
        const headerCard = el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `📜 ${t('codex.title')}`),
            el(doc, 'label', { className: 'clodex-rp-field' },
                el(doc, 'span', {}, t('codex.preset')),
                buildSelect(
                    codexOptions,
                    codexPreset,
                    async val => {
                        codexPreset = val;
                        if (val === 'biblical_dante' && catalog.length) {
                            const mistral = catalog.find(m => m.kinds.includes('text') && m.mistral);
                            if (mistral) await bridge.updateSettings({ codexModel: mistral.id });
                        }
                        renderDrawer();
                    },
                ),
            ),
            codexPreset === 'custom' ? el(doc, 'textarea', {
                className: 'clodex-rp-input clodex-rp-mt',
                rows: 2,
                placeholder: t('codex.customPlaceholder'),
                value: codexCustomPrompt,
                onInput: e => { codexCustomPrompt = e.target.value; },
            }) : null,
            el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                ...[
                    ['biblical_dante', t('codex.chip.dante')],
                    ['biblical_dante', t('codex.chip.latin')],
                    ['lore_keeper', t('codex.chip.cardSummary')],
                    ['medical_realism', t('codex.chip.wounds')],
                ].map(([presetId, label]) => el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-chip-btn',
                    onClick: () => {
                        codexPreset = presetId;
                        codexDraft = label;
                        runCodexQuery(label);
                    },
                }, label)),
            ),
        );
        container.append(headerCard);

        const feed = el(doc, 'div', { className: 'clodex-rp-codex-feed' });
        if (state.codexHistory.length === 0) {
            feed.append(el(doc, 'div', { className: 'clodex-rp-muted' }, t('codex.empty')));
        } else {
            for (const msg of state.codexHistory) {
                const bubble = el(doc, 'div', {
                    className: `clodex-rp-codex-msg ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`,
                },
                el(doc, 'div', { className: 'clodex-rp-codex-text' }, msg.content));

                if (msg.role === 'assistant') {
                    bubble.append(el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn-mini',
                            onClick: async () => {
                                await bridge.insertIntoComposer(msg.content);
                                bridge.notify?.(t('notice.inserted'));
                            },
                        }, `✍️ ${t('codex.insertReply')}`),
                        el(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn-mini',
                            onClick: async () => {
                                state.world.pendingMemoryHint = msg.content.slice(0, 1200);
                                await bridge.saveChatState(state);
                                bridge.notify?.(t('notice.memoryArmed'));
                                renderAll();
                            },
                        }, `🧠 ${t('codex.armMemory')}`),
                    ));
                }
                feed.append(bubble);
            }
        }
        container.append(feed);

        container.append(el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'textarea', {
                className: 'clodex-rp-input',
                rows: 2,
                placeholder: t('codex.inputPlaceholder'),
                value: codexDraft,
                onInput: e => { codexDraft = e.target.value; },
            }),
            el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn clodex-rp-btn-primary',
                    disabled: busyState === 'codex',
                    onClick: () => runCodexQuery(codexDraft),
                }, busyState === 'codex' ? `⏳ ${t('codex.asking')}` : `📜 ${t('codex.askBtn')}`),
                state.codexHistory.length > 0 ? el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    onClick: async () => {
                        state.codexHistory = [];
                        await bridge.saveChatState(state);
                        renderDrawer();
                    },
                }, t('codex.clearBtn')) : null,
            ),
        ));
        return container;
    }

    function renderSceneTab(state) {
        const settings = bridge.getSettings();
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });

        const previewBox = el(doc, 'div', { className: 'clodex-rp-scene-preview' });
        const vidSrc = bridge.resolveMediaSrc?.(state.scene.videoPath) || state.scene.videoPath;
        const imgSrc = bridge.resolveMediaSrc?.(state.scene.imagePath) || state.scene.imagePath;
        if (vidSrc) {
            previewBox.append(el(doc, 'video', {
                src: vidSrc,
                autoplay: true,
                loop: true,
                muted: true,
                playsInline: true,
                controls: true,
                className: 'clodex-rp-preview-media',
            }));
        } else if (imgSrc) {
            previewBox.append(el(doc, 'img', {
                src: imgSrc,
                alt: 'Scene preview',
                className: 'clodex-rp-preview-media',
            }));
        }

        container.append(el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `🍌 ${t('scene.title')}`),
            previewBox.childNodes.length ? previewBox : null,
            el(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, sceneStatusText || t('scene.statusIdle')),
            el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                el(doc, 'span', {}, t('scene.style')),
                buildSelect(
                    ['cinematic', 'dark_gothic', 'anime_illustration'].map(s => ({ value: s, label: t(`scene.style.${s}`) })),
                    sceneStyle,
                    val => {
                        sceneStyle = val;
                        renderDrawer();
                    },
                ),
            ),
            el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                el(doc, 'span', {}, t('scene.promptLabel')),
                el(doc, 'textarea', {
                    className: 'clodex-rp-input',
                    rows: 3,
                    placeholder: t('scene.promptPlaceholder'),
                    value: scenePromptDraft || state.scene.imagePrompt || '',
                    onInput: e => { scenePromptDraft = e.target.value; },
                }),
            ),
            el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-chip-btn',
                    onClick: () => {
                        sceneStyle = 'dark_gothic';
                        scenePromptDraft = EXORCIST_PRESET_PROMPT;
                        renderDrawer();
                    },
                }, `✝️ ${t('scene.presetExorcist')}`),
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-chip-btn',
                    onClick: async () => {
                        scenePromptDraft = '';
                        await buildOrUseScenePrompt().catch(err => { errorBanner = redact(err?.message ?? err); });
                        renderDrawer();
                    },
                }, `✨ ${t('scene.presetCurrent')}`),
            ),
            el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn clodex-rp-btn-primary',
                    disabled: busyState.startsWith('scene_'),
                    onClick: () => generateSceneBackground({ auto: false }),
                }, `🍌 ${t('scene.genImage')}`),
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    disabled: busyState.startsWith('scene_'),
                    onClick: () => generateOrResumeSceneVideo({ resume: false }),
                }, `🎬 ${t('scene.genVideo')}`),
                state.scene.videoTaskId ? el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    disabled: busyState.startsWith('scene_'),
                    onClick: () => generateOrResumeSceneVideo({ resume: true }),
                }, t('scene.resumeVideo')) : null,
                (state.scene.imagePath || state.scene.videoPath) ? el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    onClick: async () => {
                        await bridge.clearSceneBackground?.();
                        state.scene.imagePath = '';
                        state.scene.videoPath = '';
                        state.scene.videoTaskId = '';
                        await bridge.saveChatState(state);
                        renderAll();
                    },
                }, t('scene.clearBg')) : null,
            ),
            el(doc, 'div', { className: 'clodex-rp-grid-2 clodex-rp-mt' },
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('scene.autoEvery')),
                    el(doc, 'input', {
                        type: 'number',
                        min: 0,
                        max: 30,
                        className: 'clodex-rp-input',
                        value: Number(settings.autoImageEvery || 0),
                        onChange: async e => {
                            await bridge.updateSettings({ autoImageEvery: Math.max(0, Math.min(30, Number(e.target.value) || 0)) });
                            renderDrawer();
                        },
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, `${t('scene.backdropDim')}: ${settings.bgDim ?? 35}%`),
                    el(doc, 'input', {
                        type: 'range',
                        min: 0,
                        max: 80,
                        value: settings.bgDim ?? 35,
                        onChange: async e => {
                            await bridge.updateSettings({ bgDim: Number(e.target.value) || 0 });
                            syncVideoBackdrop();
                            renderDrawer();
                        },
                    }),
                ),
            ),
        ));

        // Character Voice (CLODEx TTS) Card — binds to both defaultVoice and voiceMap[rp.charName]
        const audioSrc = bridge.resolveMediaSrc?.(state.scene.lastAudioPath) || state.scene.lastAudioPath || '';
        const currentVoice = (currentCharName && settings.voiceMap?.[currentCharName]) || settings.defaultVoice || 'alloy';
        const sceneVoiceOptions = voiceList.map(v => ({ value: v.id, label: v.name }));
        if (currentVoice && !sceneVoiceOptions.some(o => o.value === currentVoice)) {
            sceneVoiceOptions.unshift({ value: currentVoice, label: currentVoice });
        }

        container.append(el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `🔊 ${t('voice.title')}`),
            el(doc, 'div', { className: 'clodex-rp-grid-2' },
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('voice.voiceSelect')),
                    voiceList.length > 0
                        ? buildSelect(
                            sceneVoiceOptions,
                            currentVoice,
                            async val => {
                                await saveCharacterVoiceSelection(val);
                                renderDrawer();
                            },
                        )
                        : el(doc, 'input', {
                            type: 'text',
                            className: 'clodex-rp-input',
                            placeholder: t('voice.voicePlaceholder'),
                            value: currentVoice,
                            onChange: async e => {
                                await saveCharacterVoiceSelection(e.target.value);
                                renderDrawer();
                            },
                        }),
                ),
                el(doc, 'div', { className: 'clodex-rp-btn-row', style: 'align-self:flex-end' },
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        disabled: busyState === 'voices',
                        onClick: () => loadSpeechVoices(),
                    }, `🎙 ${t('voice.loadVoices')}`),
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn clodex-rp-btn-primary',
                        disabled: busyState === 'tts',
                        onClick: () => speakLatestReply({ auto: false }),
                    }, busyState === 'tts' ? `⏳ ${t('voice.speaking')}` : `🔊 ${t('voice.speakLastBtn')}`),
                ),
            ),
            el(doc, 'label', { className: 'clodex-rp-check clodex-rp-mt' },
                el(doc, 'input', {
                    type: 'checkbox',
                    checked: settings.dialogueOnly !== false,
                    onChange: async e => {
                        await bridge.updateSettings({ dialogueOnly: e.target.checked });
                    },
                }),
                el(doc, 'span', {}, t('voice.dialogueOnly')),
            ),
            audioSrc ? el(doc, 'audio', {
                className: 'clodex-rp-audio',
                controls: true,
                autoplay: true,
                src: audioSrc,
            }) : null,
        ));

        return container;
    }

    function renderForgeTab() {
        const locale = bridge.getLocale();
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });

        container.append(el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `⚒️ ${t('forge.title')}`),
            el(doc, 'p', { className: 'clodex-rp-muted' }, t('forge.subtitle')),
            el(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                ...[
                    [FORGE_CONCEPT_CHIPS[0], t('forge.chipDante')],
                    [FORGE_CONCEPT_CHIPS[1], t('forge.chipDuke')],
                    [FORGE_CONCEPT_CHIPS[2], t('forge.chipMedic')],
                ].map(([chip, label]) => el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-chip-btn',
                    onClick: () => {
                        forgeRelic = null;
                        forgeConcept = locale === 'ru' ? chip.ru : chip.en;
                        forgeLang = locale;
                        renderDrawer();
                    },
                }, label)),
            ),
            el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                el(doc, 'span', {}, t('forge.conceptLabel')),
                el(doc, 'textarea', {
                    className: 'clodex-rp-input',
                    rows: 4,
                    placeholder: t('forge.conceptPlaceholder'),
                    value: forgeConcept,
                    onInput: e => { forgeConcept = e.target.value; },
                }),
            ),
            el(doc, 'div', { className: 'clodex-rp-grid-2 clodex-rp-mt' },
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('forge.langLabel')),
                    buildSelect(
                        [{ value: 'ru', label: 'Русский (RU)' }, { value: 'en', label: 'English (EN)' }],
                        forgeLang,
                        val => { forgeLang = val; },
                    ),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, `${t('forge.loreCountLabel')}: ${forgeLoreCount}`),
                    el(doc, 'input', {
                        type: 'range',
                        min: 2,
                        max: 8,
                        value: forgeLoreCount,
                        onChange: e => {
                            forgeLoreCount = Number(e.target.value) || 5;
                            renderDrawer();
                        },
                    }),
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn clodex-rp-btn-primary',
                    disabled: busyState === 'forge',
                    onClick: () => runCharacterForge(),
                }, busyState === 'forge' ? `⏳ ${forgeStatusText}` : `🔥 ${t('forge.generateBtn')}`),
            ),
            forgeStatusText && busyState !== 'forge'
                ? el(doc, 'div', { className: 'clodex-rp-badge-line clodex-rp-mt' }, `✨ ${forgeStatusText}`)
                : null,
        ));

        if (forgedArtifact) {
            const d = forgedArtifact.card.data;
            container.append(el(doc, 'div', { className: 'clodex-rp-card' },
                el(doc, 'div', { className: 'clodex-rp-forge-card' },
                    el(doc, 'img', {
                        className: 'clodex-rp-forge-avatar',
                        src: forgedArtifact.previewDataUrl,
                        alt: d.name,
                    }),
                    el(doc, 'div', { style: 'flex:1;min-width:0' },
                        el(doc, 'strong', {}, d.name),
                        el(doc, 'p', { className: 'clodex-rp-muted' }, `${d.personality.slice(0, 140)}…`),
                        el(doc, 'div', { className: 'clodex-rp-muted' },
                            `📚 ${d.character_book?.name || 'Lorebook'} (${d.character_book?.entries?.length ?? 0})`),
                    ),
                ),
                el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    bridge.importForgedCharacter ? el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn clodex-rp-btn-primary',
                        onClick: async () => {
                            try {
                                await bridge.importForgedCharacter(forgedArtifact);
                                bridge.notify?.(t('forge.importedNotice'));
                            } catch (err) {
                                errorBanner = redact(err?.message ?? err);
                                renderDrawer();
                            }
                        },
                    }, `📥 ${t('forge.importBtn')}`) : null,
                    bridge.exportForgedCharacter ? el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn',
                        onClick: async () => {
                            await bridge.exportForgedCharacter(forgedArtifact);
                        },
                    }, `💾 ${t('forge.downloadPngBtn')}`) : null,
                ),
            ));
        }

        return container;
    }

    function renderAccountTab() {
        const settings = bridge.getSettings();
        const inherited = bridge.isKeyInherited?.() ?? false;
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });

        let keyDraft = settings.apiKey || '';
        const textModels = catalog.filter(m => m.kinds.includes('text') || !m.kinds.length);
        const imageModels = catalog.filter(m => m.kinds.includes('image'));
        const videoModels = catalog.filter(m => m.kinds.includes('video'));
        const speechModels = catalog.filter(m => m.kinds.includes('speech'));

        const modelOptions = (list, current) => {
            const opts = list.map(m => ({
                value: m.id,
                label: `${m.nanoBanana ? '🍌 ' : ''}${m.name}${formatModelPrice(m)}`,
            }));
            if (current && !opts.some(o => o.value === current)) {
                opts.unshift({ value: current, label: current });
            }
            if (!opts.length) opts.push({ value: '', label: '—' });
            return opts;
        };

        const autoCap = Number.isFinite(Number(settings.maxAutoSpendUsd ?? 0.25))
            ? Math.max(0, Number(settings.maxAutoSpendUsd ?? 0.25))
            : 0.25;

        container.append(el(doc, 'div', { className: 'clodex-rp-card' },
            el(doc, 'h4', { className: 'clodex-rp-card-title' }, `🔑 ${t('account.title')}`),
            inherited ? el(doc, 'div', { className: 'clodex-rp-badge-line' }, `✅ ${t('account.inheritedBadge')}`) : null,
            bridge.allowInlineKeyEdit !== false ? el(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                el(doc, 'span', {}, t('account.keyLabel')),
                el(doc, 'input', {
                    type: 'password',
                    className: 'clodex-rp-input',
                    placeholder: 'sk-...',
                    value: keyDraft,
                    onInput: e => { keyDraft = e.target.value; },
                }),
            ) : null,
            el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                el(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn clodex-rp-btn-primary',
                    disabled: busyState === 'account',
                    onClick: async () => {
                        if (bridge.allowInlineKeyEdit !== false && keyDraft.trim()) {
                            await bridge.updateSettings({ apiKey: keyDraft.trim() });
                        }
                        await refreshAccount();
                    },
                }, `⚡ ${t('account.connectBtn')}`),
            ),
            el(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
                el(doc, 'strong', {}, t('account.walletLabel')),
                el(doc, 'div', {}, wallet
                    ? `${formatUsd(wallet.usd)}${wallet.rub !== null ? ` · ${formatRub(wallet.rub)}` : ''}`
                    : t('account.walletUnavailable')),
                videoBilling?.paidUSD !== null && videoBilling?.paidUSD !== undefined
                    ? el(doc, 'div', { className: 'clodex-rp-muted' }, t('account.videoPaidNote', { usd: formatUsd(videoBilling.paidUSD) }))
                    : null,
                el(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    el(doc, 'span', { className: 'clodex-rp-muted' }, `🛡️ ${t('account.sessionAutoSpend', {
                        spent: formatUsd(sessionAutoSpendUsd),
                        cap: formatUsd(autoCap),
                    })}`),
                    sessionAutoSpendUsd > 0 ? el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn-mini',
                        onClick: () => {
                            sessionAutoSpendUsd = 0;
                            errorBanner = '';
                            renderDrawer();
                        },
                    }, t('account.resetAutoSpend')) : null,
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-grid-2 clodex-rp-mt' },
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('account.trackerModel')),
                    buildSelect(modelOptions(textModels, settings.trackerModel), settings.trackerModel, async v => {
                        await bridge.updateSettings({ trackerModel: v });
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('account.codexModel')),
                    buildSelect(modelOptions(textModels, settings.codexModel), settings.codexModel, async v => {
                        await bridge.updateSettings({ codexModel: v });
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('account.imageModel')),
                    buildSelect(modelOptions(imageModels.length ? imageModels : catalog, settings.imageModel), settings.imageModel, async v => {
                        await bridge.updateSettings({ imageModel: v });
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('account.videoModel')),
                    buildSelect(modelOptions(videoModels.length ? videoModels : catalog, settings.videoModel), settings.videoModel, async v => {
                        await bridge.updateSettings({ videoModel: v });
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, t('account.speechModel')),
                    buildSelect(modelOptions(speechModels.length ? speechModels : catalog, settings.speechModel), settings.speechModel, async v => {
                        await bridge.updateSettings({ speechModel: v });
                    }),
                ),
                el(doc, 'label', { className: 'clodex-rp-field' },
                    el(doc, 'span', {}, `🛡️ ${t('account.maxAutoSpend')}`),
                    el(doc, 'input', {
                        type: 'number',
                        min: 0,
                        max: 50,
                        step: 0.05,
                        className: 'clodex-rp-input',
                        value: autoCap,
                        onChange: async e => {
                            const raw = Number(e.target.value);
                            const clean = Number.isFinite(raw) ? Math.max(0, Math.min(50, raw)) : 0.25;
                            await bridge.updateSettings({ maxAutoSpendUsd: clean });
                            renderDrawer();
                        },
                    }),
                ),
            ),
            el(doc, 'div', { className: 'clodex-rp-toggles clodex-rp-mt' },
                el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: settings.autoTrack !== false,
                        onChange: async e => { await bridge.updateSettings({ autoTrack: e.target.checked }); },
                    }),
                    el(doc, 'span', {}, t('account.autoTrack')),
                ),
                el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: Boolean(settings.autoSpeak),
                        onChange: async e => { await bridge.updateSettings({ autoSpeak: e.target.checked }); },
                    }),
                    el(doc, 'span', {}, t('account.autoSpeak')),
                ),
                el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: settings.injectContext !== false,
                        onChange: async e => { await bridge.updateSettings({ injectContext: e.target.checked }); },
                    }),
                    el(doc, 'span', {}, t('account.injectPrompt')),
                ),
                el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: settings.confirmPaid !== false,
                        onChange: async e => { await bridge.updateSettings({ confirmPaid: e.target.checked }); },
                    }),
                    el(doc, 'span', {}, t('account.confirmPaid')),
                ),
                ...[
                    ['showInnerThoughts', 'turn.settingThoughts'],
                    ['showSuggestedActions', 'turn.settingActions'],
                    ['thoughtsBlurred', 'turn.settingBlurred'],
                ].map(([settingKey, labelKey]) => el(doc, 'label', { className: 'clodex-rp-check' },
                    el(doc, 'input', {
                        type: 'checkbox',
                        checked: settings[settingKey] !== false,
                        onChange: async e => { await bridge.updateSettings({ [settingKey]: e.target.checked }); },
                    }),
                    el(doc, 'span', {}, t(labelKey)),
                )),
            ),
            el(doc, 'p', { className: 'clodex-rp-muted clodex-rp-mt' }, t('account.getKeyLink')),
        ));

        return container;
    }

    function applyDirectorPosition() {
        const insets = bridge.getInsets?.() ?? { topBar: 10, bottomInput: 64 };
        const rawBottom = insets?.bottomInput;
        const bottom = Math.max(0, Number.isFinite(Number(rawBottom)) ? Number(rawBottom) : 64) + 6;
        directorHost.style.bottom = `${bottom}px`;
    }

    function renderDirectorBar() {
        // Never wipe a note the player is typing right now (background renders happen during tracker runs).
        const focused = doc.activeElement;
        if (focused && focused !== doc.body && directorHost.contains?.(focused)
            && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;
        const state = bridge.getChatState();
        const director = ensureDirectorState(state);
        const settings = bridge.getSettings();
        directorHost.replaceChildren(vDirRenderBar(doc, t, {
            presets: DIRECTOR_PRESETS,
            customPresets: dirNormalizeCustomPresets(settings.directorPresets),
            director,
            expanded: directorExpanded,
            maxActive: DIRECTOR_MAX_ACTIVE,
            noteMax: DIRECTOR_NOTE_MAX,
        }, {
            onToggleExpand: () => {
                directorExpanded = !directorExpanded;
                renderDirectorBar();
            },
            onToggle: async id => {
                const st = bridge.getChatState();
                ensureDirectorState(st);
                dirToggle(st, id);
                await bridge.saveChatState(st);
                renderAll();
            },
            onNote: async text => {
                const st = bridge.getChatState();
                ensureDirectorState(st);
                dirSetNote(st, text);
                await bridge.saveChatState(st);
                if (doc.activeElement?.dataset?.rpAction === 'director-note') {
                    doc.activeElement.blur?.();
                }
                renderAll();
            },
            onClear: async () => {
                const st = bridge.getChatState();
                dirClear(st);
                await bridge.saveChatState(st);
                renderAll();
            },
        }));
        applyDirectorPosition();
    }

    function renderCodexSubNav() {
        const subs = [
            ['questions', `❓ ${t('codex.sub.questions')}`],
            ['wiki', `📚 ${t('codex.sub.wiki')}`],
            ['style', `🎯 ${t('codex.sub.style')}`],
        ];
        return el(doc, 'nav', { className: 'clodex-rp-seg clodex-rp-seg-3 clodex-rp-subtabs', dataset: { rpView: 'codex-subtabs' } },
            ...subs.map(([id, label]) => el(doc, 'button', {
                type: 'button',
                className: `clodex-rp-seg-btn ${codexSub === id ? 'active' : ''}`,
                dataset: { rpAction: 'codex-sub', sub: id },
                onClick: () => {
                    codexSub = id;
                    if (id === 'wiki') loadLivingWorld().then(changed => { if (changed) renderAll(); });
                    if (id === 'style' && !slopAnalyzedCount) recomputeSlop().then(() => renderAll()).catch(() => {});
                    renderDrawer();
                },
            }, label)),
        );
    }

    function renderWikiSub() {
        const settings = bridge.getSettings();
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' }, renderCodexSubNav());
        container.append(vWikiRender(doc, t, {
            view: wikiCache,
            enabled: settings.wikiEnabled !== false,
            every: wikiEveryOf(settings),
            busy: wikiBusy,
            status: wikiStatusText,
        }, {
            onRefresh: () => runWikiUpdate({ manual: true }),
            onSave: (table, row) => saveWikiRow(table, row),
            onRemove: (table, row) => removeWikiRow(table, row),
            onToggleEnabled: async enabled => {
                await bridge.updateSettings({ wikiEnabled: Boolean(enabled) });
                renderDrawer();
            },
            onEvery: async every => {
                await bridge.updateSettings({ wikiEvery: Math.max(4, Math.min(20, Number(every) || 8)) });
                renderDrawer();
            },
        }));
        return container;
    }

    function renderStyleSub(state) {
        const settings = bridge.getSettings();
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' }, renderCodexSubNav());
        container.append(vStyleRender(doc, t, {
            mode: slopModeOf(settings),
            hits: slopHits,
            disabled: Array.isArray(settings.slopDisabled) ? settings.slopDisabled : [],
            rule: state.world.slopRule || '',
            analyzed: slopAnalyzedCount,
        }, {
            onMode: async mode => {
                await bridge.updateSettings({ slopMode: mode });
                await recomputeSlop().catch(() => {});
                renderAll();
            },
            onToggle: async (phrase, enabled) => {
                const current = new Set(Array.isArray(bridge.getSettings().slopDisabled) ? bridge.getSettings().slopDisabled : []);
                if (enabled) current.delete(phrase);
                else current.add(phrase);
                await bridge.updateSettings({ slopDisabled: [...current].slice(-200) });
                await recomputeSlop().catch(() => {});
                renderAll();
            },
            onRecompute: async () => {
                await recomputeSlop().catch(err => { errorBanner = redact(err?.message ?? err); });
                renderAll();
            },
        }));
        return container;
    }

    function renderPhoneScreen(state) {
        const container = el(doc, 'div', { className: 'clodex-rp-tab-body' });
        const settings = bridge.getSettings();
        const seen = new Set(Array.isArray(phoneStore?.seenIds) ? phoneStore.seenIds : []);
        for (const entry of phoneCache.entries) {
            if (entry?.id && !seen.has(entry.id)) phoneHighlightIds.add(entry.id);
        }
        const selectedSkin = phoneStore?.skin && phoneStore.skin !== 'auto'
            ? phoneStore.skin
            : (settings.phoneSkin || 'auto');
        container.append(vPhoneRender(doc, t, {
            entries: phoneCache.entries,
            unseen: phoneCache.unseen,
            unseenIds: phoneHighlightIds,
            section: phoneSection,
            skin: selectedSkin,
            resolvedSkin: resolvePhoneSkin(state),
            busyEntryId: phoneBusyEntryId,
            charName: currentCharName,
            pendingHint: Boolean(state.world.pendingMemoryHint),
            resolveSrc: path => bridge.resolveMediaSrc?.(path) || path,
            voiceDuration: entry => {
                try {
                    return phoneVoiceDuration(entry);
                } catch {
                    return '';
                }
            },
        }, {
            onSection: id => {
                phoneSection = id;
                renderDrawer();
            },
            onSkin: skin => setPhoneSkin(skin),
            onReveal: entry => revealPhoneEntry(entry),
            onPresent: entry => presentPhoneEntry(entry),
        }));
        if (phoneCache.unseen > 0) Promise.resolve().then(markPhoneSeen).catch(() => {});
        return container;
    }

    function resolveUnderworldSkin(state) {
        return uwResolveSkin(state?.underworld?.skin, {
            text: `${state?.world?.location || ''} ${state?.world?.weather || ''}`,
            description: currentCharDescription,
        });
    }

    async function ensureIdentityCached() {
        if (currentCharName && currentUserName) return;
        const rp = await bridge.getRpContext?.().catch(() => null);
        if (rp?.charName) currentCharName = rp.charName;
        if (rp?.userName) currentUserName = rp.userName;
        if (rp?.charDescription !== undefined && !currentCharDescription) {
            currentCharDescription = String(rp.charDescription || '');
        }
    }

    async function saveUnderworld(state) {
        await bridge.saveChatState(state);
        renderAll();
    }

    async function runNpcDossierService(state) {
        if (dossierBusy) return false;
        const uw = state.underworld;
        const resolvedSkin = resolveUnderworldSkin(state);
        const key = bridge.getEffectiveKey();
        if (!key) {
            activeTab = 'account';
            toggleDrawer(true);
            return false;
        }
        if (!catalog.length) await refreshAccount();
        const settings = bridge.getSettings();
        const model = settings.codexModel || settings.trackerModel;
        if (!model) {
            errorBanner = t('wiki.needModel');
            renderAll();
            return false;
        }
        const rp = await bridge.getRpContext?.().catch(() => ({})) || {};
        if (rp?.charName) currentCharName = rp.charName;
        if (rp?.userName) currentUserName = rp.userName;
        const target = underworldTargetDraft.trim() || rp.charName || currentCharName || '{{char}}';
        const charge = repUseService(uw, 'npcDossier', { target, skin: resolvedSkin });
        if (!charge.ok) {
            errorBanner = t(`uw.error.${charge.reason || 'insufficient_cash'}`);
            renderAll();
            return false;
        }
        const refund = () => {
            uw.cash = Math.min(UW_MAX_CASH, Math.max(0, Math.trunc(Number(uw.cash) || 0) + charge.cost));
        };
        if (settings.confirmPaid !== false) {
            const ok = await bridge.confirm(t('uw.dossierConfirm', {
                target,
                model,
                cost: `${uw.currency || '$'}${charge.cost}`,
            }));
            if (!ok) {
                refund();
                renderAll();
                return false;
            }
        }
        dossierBusy = true;
        errorBanner = '';
        renderAll();
        try {
            const recentText = (rp.recentMessages ?? []).map(m => String(m?.content ?? '')).join(' ');
            const chatLocale = recentText
                ? (/[а-яё]/i.test(recentText) ? 'ru' : 'en')
                : (bridge.getLocale() === 'ru' ? 'ru' : 'en');
            const langLabel = chatLocale === 'ru' ? 'Russian' : 'English';
            const promptMessages = [
                {
                    role: 'system',
                    content: `You are an underground information broker in a ${resolvedSkin} roleplay setting. Write a compact 2-3 sentence leaked dossier or guarded secret about "${target}" in ${langLabel}. Plain text only, no HTML, no markdown headers.`,
                },
                {
                    role: 'user',
                    content: [
                        `Target: ${target}`,
                        rp.charDescription ? `Character context: ${String(rp.charDescription).slice(0, 500)}` : '',
                        rp.scenario ? `Scenario: ${String(rp.scenario).slice(0, 300)}` : '',
                        recentText ? `Recent scene: ${recentText.slice(-800)}` : '',
                    ].filter(Boolean).join('\n'),
                },
            ];
            const raw = await api.chat({ model, messages: promptMessages, temperature: 0.55, maxTokens: 240 });
            const dossierText = String(raw ?? '').trim();
            if (!dossierText) throw new Error('Empty dossier response.');
            await loadLivingWorld();
            if (!phoneStore) phoneStore = phoneNormalizeStore(phoneCreateStore());
            const turnKey = await getLatestTurnKeySafe();
            phoneStore = asStore(phoneIngestEvents(phoneStore, [{
                kind: 'dm',
                author: t(`uw.dossierAuthor.${resolvedSkin}`),
                text: dossierText,
            }], turnKey, { source: 'underworld' }), phoneStore);
            await savePhoneStore();
            underworldTargetDraft = '';
            await bridge.saveChatState(state);
            bridge.notify?.(t('uw.dossierDone', { target }));
            return true;
        } catch (err) {
            refund();
            await bridge.saveChatState(state).catch(() => {});
            errorBanner = redact(err?.message ?? err, key);
            return false;
        } finally {
            dossierBusy = false;
            renderAll();
        }
    }

    function renderUnderworldTab(state) {
        const uw = state.underworld;
        const resolvedSkin = resolveUnderworldSkin(state);
        if (!state.inventory || typeof state.inventory !== 'object') {
            state.inventory = { char: [], user: [] };
        }
        if (!Array.isArray(state.inventory.user)) state.inventory.user = [];

        const handleResult = res => {
            if (!res?.ok) {
                errorBanner = t(`uw.error.${res?.reason || 'invalid_amount'}`);
                return false;
            }
            errorBanner = '';
            return true;
        };

        return vUwRender(doc, t, {
            uw,
            resolvedSkin,
            betDraft: underworldBetDraft,
            pawnValueDraft,
            collateralDraft,
            targetDraft: underworldTargetDraft,
            wagerStake: wagerStakeDraft,
            lastOutcome: lastCasinoOutcome,
            userInventory: state.inventory.user,
            charName: currentCharName || '{{char}}',
            dossierBusy,
        }, {
            onSkin: async nextSkin => {
                const clean = UW_SKINS.includes(nextSkin) ? nextSkin : 'auto';
                uw.skin = clean;
                const nextResolved = resolveUnderworldSkin(state);
                if (nextResolved === 'tavern' && uw.currency === '$') uw.currency = '🪙';
                else if (nextResolved !== 'tavern' && uw.currency === '🪙') uw.currency = '$';
                await saveUnderworld(state);
            },
            onBetInput: val => { underworldBetDraft = Math.max(1, Math.trunc(Number(val) || 1)); },
            onDice: async side => {
                const res = uwRollDice(uw, { bet: underworldBetDraft, side });
                if (handleResult(res)) {
                    lastCasinoOutcome = {
                        game: 'dice',
                        dice: res.dice,
                        total: res.total,
                        side: res.side,
                        win: res.win,
                        payout: res.payout,
                        net: res.net,
                    };
                }
                await saveUnderworld(state);
            },
            onSlots: async () => {
                const res = uwPlaySlots(uw, { bet: underworldBetDraft });
                if (handleResult(res)) {
                    lastCasinoOutcome = {
                        game: 'slots',
                        reels: res.reels,
                        payout: res.payout,
                        net: res.net,
                        win: res.win,
                    };
                }
                await saveUnderworld(state);
            },
            onBjDeal: async () => {
                const res = uwStartBlackjack(uw, { bet: underworldBetDraft });
                if (handleResult(res)) {
                    if (res.status !== 'playing' && res.session) {
                        lastCasinoOutcome = {
                            game: 'blackjack',
                            status: res.status,
                            player: [...res.session.player],
                            dealer: [...res.session.dealer],
                            playerTotal: res.playerTotal,
                            dealerTotal: res.dealerTotal,
                            payout: res.payout,
                            net: res.net,
                        };
                    } else {
                        lastCasinoOutcome = null;
                    }
                }
                await saveUnderworld(state);
            },
            onBjAction: async action => {
                const res = uwBlackjackAction(uw, uw.blackjack, action);
                if (handleResult(res) && res.status !== 'playing' && res.session) {
                    lastCasinoOutcome = {
                        game: 'blackjack',
                        status: res.status,
                        player: [...res.session.player],
                        dealer: [...res.session.dealer],
                        playerTotal: res.playerTotal,
                        dealerTotal: res.dealerTotal,
                        payout: res.payout,
                        net: res.net,
                    };
                }
                await saveUnderworld(state);
            },
            onWagerStake: stake => {
                if (VUW_WAGER_STAKES.includes(stake)) {
                    wagerStakeDraft = stake;
                    renderDrawer();
                }
            },
            onStoryWager: async () => {
                const res = uwStoryWager(uw, wagerStakeDraft);
                if (handleResult(res)) {
                    lastCasinoOutcome = { game: 'wager', stake: wagerStakeDraft, win: res.win };
                }
                await saveUnderworld(state);
            },
            onPawnValueInput: val => {
                pawnValueDraft = Math.max(1, Math.min(50000, Math.trunc(Number(val) || 500)));
            },
            onTakeLoan: async () => {
                handleResult(uwTakeLoan(uw, Math.min(5000, Math.max(1, pawnValueDraft))));
                await saveUnderworld(state);
            },
            onPayDebt: async () => {
                handleResult(uwPayDebt(uw));
                await saveUnderworld(state);
            },
            onPawnPreset: async (presetKey, label, val) => {
                await ensureIdentityCached();
                const res = uwPawnCollateral(uw, {
                    kind: 'preset',
                    presetKey,
                    label,
                    pawnValue: val,
                }, {
                    skin: resolvedSkin,
                    charName: currentCharName,
                    userName: currentUserName,
                    companions: state.companions || [],
                });
                handleResult(res);
                await saveUnderworld(state);
            },
            onCollateralInput: val => { collateralDraft = String(val ?? ''); },
            onPawnCustom: async () => {
                await ensureIdentityCached();
                const res = uwPawnCollateral(uw, {
                    kind: 'custom',
                    label: collateralDraft,
                    pawnValue: pawnValueDraft,
                }, {
                    skin: resolvedSkin,
                    charName: currentCharName,
                    userName: currentUserName,
                    companions: state.companions || [],
                });
                if (handleResult(res)) collateralDraft = '';
                await saveUnderworld(state);
            },
            onPawnInventory: async itemLabel => {
                await ensureIdentityCached();
                const res = uwPawnInventoryItem(uw, state.inventory.user, itemLabel, pawnValueDraft, {
                    skin: resolvedSkin,
                    charName: currentCharName,
                    userName: currentUserName,
                    companions: state.companions || [],
                });
                handleResult(res);
                await saveUnderworld(state);
            },
            onRedeem: async collateralId => {
                handleResult(uwRedeemCollateral(uw, collateralId, state.inventory.user));
                await saveUnderworld(state);
            },
            onImportFactions: async () => {
                await loadLivingWorld();
                repImportFactions(uw, wikiCache.npcs, { skin: resolvedSkin });
                errorBanner = '';
                await saveUnderworld(state);
            },
            onTargetInput: val => { underworldTargetDraft = String(val ?? ''); },
            onService: async serviceId => {
                if (serviceId === 'npcDossier') {
                    await runNpcDossierService(state);
                    return;
                }
                if (serviceId === 'muscle') {
                    if (uw.pendingWorldEvent) {
                        errorBanner = t('uw.error.busy_event');
                        renderAll();
                        return;
                    }
                    await ensureIdentityCached();
                    const target = underworldTargetDraft.trim() || currentCharName || 'the current target';
                    const res = repUseService(uw, 'muscle', { target, skin: resolvedSkin });
                    if (handleResult(res)) {
                        uwSetPendingWorldEvent(uw, res.event, { kind: 'service' });
                        underworldTargetDraft = '';
                        bridge.notify?.(t('uw.muscleArmed'));
                    }
                    await saveUnderworld(state);
                    return;
                }
                handleResult(repUseService(uw, 'clearHeat', { skin: resolvedSkin }));
                await saveUnderworld(state);
            },
        });
    }

    function renderGachaSub(state) {
        return vGaRenderAltar(doc, t, {
            prefs: rpPrefs,
            currency: state.underworld?.currency || '$',
            cash: state.underworld?.cash ?? 0,
            summonBusy,
            resolveSrc: path => bridge.resolveMediaSrc?.(path) || path,
        }, {
            onSummon: async () => {
                const result = gaCreateSummon(rpPrefs, { cash: state.underworld.cash, cost: 50 });
                if (!result.ok) {
                    errorBanner = t(result.reason === 'cradle_full' ? 'relic.cradleFull' : 'uw.error.insufficient_cash');
                    renderAll();
                    return;
                }
                errorBanner = '';
                state.underworld.cash = result.cash;
                await saveRpEntitlements(result.prefs);
                await bridge.saveChatState(state);
                bridge.notify?.(`${t('gacha.summoned')} ${vGaRarityLabel(t, result.egg.rarity)}`);
                renderAll();
            },
            onPaidRitual: () => runPaidGachaRitual(),
            renderSocial: egg => [cradleGiftButton(egg, 'egg'), renderNestItem(egg)],
            onWarm: async eggId => {
                if (rpPrefs.pendingEggs.some(egg => egg.id === eggId && egg.sharedNestUid)) return nestDoCare(eggId, { action: 'pet', warmthDelta: 20 });
                const warmed = gaWarmEgg(rpPrefs, eggId, 20);
                if (!warmed.ok) {
                    errorBanner = t(`gacha.error.${warmed.reason || 'egg_not_found'}`);
                    renderAll();
                    return;
                }
                errorBanner = '';
                await saveRpEntitlements(warmed.prefs);
                renderAll();
            },
            onHatch: eggId => hatchPendingEgg(eggId, state),
            onEquipEggSkin: async (eggId, skinId) => {
                const egg = rpPrefs.pendingEggs.find(egg => egg.id === eggId);
                if (egg?.relicUid) return;
                if (egg?.sharedNestUid) return nestDoCare(eggId, { action: 'skin', eggSkin: skinId });
                const eq = gaEquipSkinOnEgg(rpPrefs, eggId, skinId);
                if (!eq.ok) {
                    errorBanner = t(`gacha.error.${eq.reason || 'invalid_skin'}`);
                    renderAll();
                    return;
                }
                errorBanner = '';
                await saveRpEntitlements(eq.prefs);
                renderAll();
            },
        });
    }

    async function loadRelicCatalog() {
        if (relicChecking) return;
        relicChecking = true;
        renderAll();
        try {
            const synced = await syncRpRelics();
            relicCatalog = synced.editions;
            relicSyncStatus = synced.catalogueUnavailable ? t('relic.unavailable')
                : synced.inventoryUnavailable ? t('relic.inventoryUnavailable') : t('relic.synced');
        } catch {
            relicSyncStatus = t('relic.inventoryUnavailable');
        } finally {
            relicChecking = false;
            renderAll();
        }
    }

    async function verifyRelicPng(file) {
        if (!file) return;
        relicCardVerified = false;
        relicCardStatus = t('relic.unverified');
        try {
            if (file.size > 16 * 1024 * 1024) throw new Error('PNG too large.');
            const card = extractCharacterCardFromPng(await file.arrayBuffer());
            const result = await relVerifyCard(card);
            if (result.verified) {
                relicCardVerified = true;
                relicCardStatus = relPublicBadge(result.relic.payload, true);
            }
        } catch { /* Invalid, oversized or unsigned images do not get a badge. */ }
        renderAll();
    }

    async function copyRelicMintLink(url) {
        const cleanUrl = String(url || '');
        if (!cleanUrl) return;
        try {
            if (typeof bridge.copyText === 'function') {
                await bridge.copyText(cleanUrl);
            } else if (win.navigator?.clipboard?.writeText) {
                await win.navigator.clipboard.writeText(cleanUrl);
            } else if (globalThis.navigator?.clipboard?.writeText) {
                await globalThis.navigator.clipboard.writeText(cleanUrl);
            }
            bridge.notify?.(t('relic.linkCopied'));
        } catch {
            // Clipboard permission may be restricted in sandboxed WebViews; anchor link remains directly tappable.
        }
    }

    function renderRelicsSub() {
        const view = vGaRenderRelics(doc, t, {
            catalog: relicCatalog,
            relics: rpPrefs.relics,
            verifiedRelics,
            hatchedRelicUids: rpPrefs.hatchedRelicUids,
            pendingEggs: rpPrefs.pendingEggs,
            syncStatus: relicSyncStatus,
            checking: relicChecking,
            cardStatus: relicCardStatus,
            cardVerified: relicCardVerified,
            summonBusy,
            locale: bridge.getLocale(),
        }, {
            onSync: () => loadRelicCatalog(),
            onVerifyPng: file => verifyRelicPng(file),
            onCopyLink: url => copyRelicMintLink(url),
            onQueueEgg: async claims => {
                const queued = gaQueueVerifiedRelicEgg(rpPrefs, claims);
                if (!queued.ok) {
                    errorBanner = t(queued.reason === 'cradle_full' ? 'relic.cradleFull' : 'relic.added');
                    renderAll();
                    return;
                }
                errorBanner = '';
                await saveRpEntitlements(queued.prefs);
                cradleSub = 'gacha';
                renderAll();
            },
        });
        view.prepend(vCrRenderRelicClaim(doc, t, { code: relicClaimDraft, busy: relicClaiming }, {
            onInput: code => { relicClaimDraft = code; },
            onClaim: () => claimGiftRelic(relicClaimDraft),
        }));
        return view;
    }

    function renderPacksSub() {
        return vPackRender(doc, t, {
            name: packNameDraft,
            author: packAuthorDraft,
            preview: packPreview,
            status: packStatusText,
            counts: currentPackCounts(),
        }, {
            onName: v => { packNameDraft = v; },
            onAuthor: v => { packAuthorDraft = v; },
            onExport: () => exportCurrentPack(),
            onPickImport: () => pickPackForImport(),
            onConfirmImport: () => confirmPackImport(),
            onCancelImport: () => {
                packPreview = null;
                renderDrawer();
            },
        });
    }

    function renderForgeScreen() {
        const subNav = el(doc, 'nav', { className: 'clodex-rp-seg clodex-rp-subtabs', dataset: { rpView: 'forge-subtabs' } },
            ...[
                ['forge', `⚒️ ${t('tab.forge')}`],
                ['packs', `📦 ${t('pack.tab')}`],
            ].map(([id, label]) => el(doc, 'button', {
                type: 'button',
                className: `clodex-rp-seg-btn ${forgeSub === id ? 'active' : ''}`,
                dataset: { rpAction: 'forge-sub', sub: id },
                onClick: () => {
                    forgeSub = id;
                    renderDrawer();
                },
            }, label)),
        );
        if (forgeSub === 'packs') {
            return el(doc, 'div', { className: 'clodex-rp-tab-body' }, subNav, renderPacksSub());
        }
        const body = renderForgeTab();
        body.prepend ? body.prepend(subNav) : body.append(subNav);
        return body;
    }

    function renderDrawer() {
        if (!drawerOpen) return;
        const state = bridge.getChatState();

        // Mobile discipline: strictly 4 primary tabs in 1 row even on 390px screens
        const tabs = [
            ['tracker', `🧬 ${t('tab.tracker')}`],
            ['cradle', `🐣 ${t('tab.cradle')}`],
            ['codex', `📜 ${t('tab.codex')}`],
            ['scene', `🍌 ${t('tab.scene')}`],
        ];

        let body;
        if (activeTab === 'cradle') body = renderCradleTab(state);
        else if (activeTab === 'codex') {
            body = codexSub === 'wiki' ? renderWikiSub()
                : codexSub === 'style' ? renderStyleSub(state)
                    : renderCodexTab(state);
            if (codexSub !== 'wiki' && codexSub !== 'style') {
                body.prepend ? body.prepend(renderCodexSubNav()) : body.append(renderCodexSubNav());
            }
        } else if (activeTab === 'scene') body = renderSceneTab(state);
        else if (activeTab === 'forge') body = renderForgeScreen();
        else if (activeTab === 'account') body = renderAccountTab();
        else if (activeTab === 'phone') body = renderPhoneScreen(state);
        else body = renderTrackerTab(state);

        const unseen = Number(phoneCache.unseen) || 0;
        const drawerChildren = [
            el(doc, 'header', { className: 'clodex-rp-drawer-head' },
                el(doc, 'strong', { className: 'clodex-rp-brand' }, t('plugin.name')),
                el(doc, 'div', { className: 'clodex-rp-head-actions' },
                    el(doc, 'button', {
                        type: 'button',
                        className: `clodex-rp-btn-mini clodex-rp-phone-btn ${activeTab === 'phone' ? 'active' : ''}`,
                        title: t('phone.open'),
                        'aria-label': t('phone.open'),
                        dataset: { rpAction: 'open-phone' },
                        onClick: () => {
                            activeTab = 'phone';
                            loadLivingWorld().then(changed => { if (changed) renderAll(); });
                            renderDrawer();
                        },
                    }, '📱', unseen > 0 ? el(doc, 'span', { className: 'clodex-rp-head-badge' }, String(Math.min(unseen, 99))) : null),
                    el(doc, 'button', {
                        type: 'button',
                        className: `clodex-rp-btn-mini ${activeTab === 'forge' ? 'active' : ''}`,
                        title: t('tab.forge'),
                        'aria-label': t('tab.forge'),
                        onClick: () => {
                            activeTab = 'forge';
                            renderDrawer();
                        },
                    }, '⚒️'),
                    el(doc, 'button', {
                        type: 'button',
                        className: `clodex-rp-btn-mini ${activeTab === 'account' ? 'active' : ''}`,
                        title: t('tab.account'),
                        'aria-label': t('tab.account'),
                        onClick: () => {
                            activeTab = 'account';
                            renderDrawer();
                        },
                    }, '🔑'),
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn-mini',
                        title: t('drawer.resetPos'),
                        'aria-label': t('drawer.resetPos'),
                        onClick: () => {
                            bridge.saveHudPosition?.(null);
                            applyPillPosition(null);
                        },
                    }, '⌖'),
                    el(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn-mini',
                        title: t('drawer.close'),
                        'aria-label': t('drawer.close'),
                        dataset: { rpAction: 'close-drawer' },
                        onClick: e => {
                            e?.stopPropagation?.();
                            toggleDrawer(false);
                        },
                    }, '✕'),
                ),
            ),
            el(doc, 'nav', { className: 'clodex-rp-tabs' },
                ...tabs.map(([id, label]) => el(doc, 'button', {
                    type: 'button',
                    className: `clodex-rp-tab-btn ${activeTab === id ? 'active' : ''}`,
                    onClick: () => {
                        activeTab = id;
                        if (id === 'cradle') void nestRefresh();
                        if (id === 'scene') syncCachedCharName();
                        renderDrawer();
                    },
                }, label)),
            ),
        ];
        if (errorBanner) {
            drawerChildren.push(el(doc, 'div', { className: 'clodex-rp-error' }, errorBanner));
        }
        if (body) drawerChildren.push(body);
        drawerPanel.replaceChildren(...drawerChildren);
    }

    function renderAll() {
        renderHudPill();
        renderDirectorBar();
        if (drawerOpen) renderDrawer();
        scheduleLivingRefresh();
    }

    async function onAssistantMessageCommitted({ checkpointKey = '' } = {}) {
        const settings = bridge.getSettings();
        const state = bridge.getChatState();
        if (checkpointKey && committedTurnKeys.has(String(checkpointKey))) return;

        // One-turn data is consumed only after a successfully committed reply (429 / Stop keep it).
        let consumed = nestConsumeHints(state.companions);
        if (state.world.pendingMemoryHint) {
            state.world.pendingMemoryHint = '';
            consumed = true;
        }
        if (vDirActiveCount(state.world.director) > 0) {
            dirClear(state);
            consumed = true;
        }
        if (consumed) await bridge.saveChatState(state);

        let tracked = false;
        if (settings.autoTrack !== false && bridge.getEffectiveKey()) {
            tracked = await syncTrackerFromChat({ checkpointKey, silent: true });
        }
        // Apply deterministic underworld/reputation ticks even in offline
        // mode. This also writes the checkpoint only after tracker extraction
        // and local consequences have both completed.
        await applyLocalTurnConsequences(checkpointKey);
        if (bridge.getChatState().companions.some(item => item.sharedNestUid)) void nestRefresh();
        if (!tracked) {
            // Anti-Slop is local: keep the radar fresh even without a key / with auto-track disabled.
            await recomputeSlop().catch(() => {});
        }
        if (settings.autoSpeak === true && bridge.getEffectiveKey()) {
            await speakLatestReply({ auto: true });
        }
        const autoEvery = Number(settings.autoImageEvery || 0);
        if (autoEvery > 0 && bridge.getEffectiveKey()) {
            const latestState = bridge.getChatState();
            latestState.scene.turnsSinceAutoImage = (latestState.scene.turnsSinceAutoImage || 0) + 1;
            if (latestState.scene.turnsSinceAutoImage >= autoEvery) {
                latestState.scene.turnsSinceAutoImage = 0;
                await bridge.saveChatState(latestState);
                await generateSceneBackground({ auto: true });
            } else {
                await bridge.saveChatState(latestState);
            }
        }
        await loadLivingWorld();
        renderAll();
    }

    const unsubLocale = bridge.onLocaleChange?.(() => renderAll());
    const unsubInsets = bridge.onInsetsChange?.(() => {
        applyPillPosition(bridge.loadHudPosition?.());
        applyDirectorPosition();
    });
    const onResize = () => {
        applyPillPosition(bridge.loadHudPosition?.());
        applyDirectorPosition();
    };
    const onKeyDown = e => {
        if (e?.key === 'Escape' && drawerOpen) toggleDrawer(false);
    };
    win.addEventListener?.('resize', onResize);
    win.addEventListener?.('keydown', onKeyDown);

    // Initial render & background catalog load if key already present
    renderAll();
    applyPillPosition(bridge.loadHudPosition?.());
    syncCachedCharName();
    loadLivingWorld().then(changed => { if (changed) renderAll(); }).catch(() => {});
    loadRpEntitlements().then(renderAll).catch(() => {});
    if (bridge.getEffectiveKey()) {
        refreshAccount().catch(() => {});
    }

    function openTab(tabId = 'tracker') {
        const requested = String(tabId || 'tracker');
        const id = requested === 'underworld' || requested === 'casino' ? 'tracker'
            : requested === 'gacha' || requested === 'relics' ? 'cradle' : requested;
        if (requested === 'tracker') trackerSub = 'physiology';
        else if (requested === 'underworld' || requested === 'casino') {
            trackerSub = 'underworld';
            syncCachedCharName();
        }
        if (requested === 'cradle') cradleSub = 'companions';
        else if (requested === 'gacha') cradleSub = 'gacha';
        else if (requested === 'relics') {
            cradleSub = 'relics';
            if (!relicCatalog.length) loadRelicCatalog();
        }
        if (id === 'wiki' || id === 'style' || id === 'questions') {
            activeTab = 'codex';
            codexSub = id;
        } else if (id === 'packs') {
            activeTab = 'forge';
            forgeSub = 'packs';
        } else if (id === 'director') {
            directorExpanded = true;
            renderDirectorBar();
            return;
        } else {
            activeTab = id;
            if (id !== 'phone') phoneHighlightIds.clear();
            if (id === 'codex') codexSub = 'questions';
            if (id === 'forge') forgeSub = 'forge';
        }
        if (activeTab === 'phone' || activeTab === 'codex') {
            if (activeTab === 'phone') syncCachedCharName();
            loadLivingWorld().then(changed => { if (changed) renderAll(); }).catch(() => {});
        }
        if (activeTab === 'codex' && codexSub === 'style') {
            recomputeSlop().then(() => renderAll()).catch(() => {});
        }
        toggleDrawer(true);
    }

    return {
        renderAll,
        openTab,
        openPhone: () => openTab('phone'),
        toggleDirector(force) {
            directorExpanded = typeof force === 'boolean' ? force : !directorExpanded;
            renderDirectorBar();
        },
        toggleDrawer,
        syncTrackerFromChat,
        generateSceneBackground,
        speakLatestReply,
        generateCompanionPortrait,
        generateCompanionVideo,
        speakCompanionReaction,
        graduateCompanionToForge,
        runCharacterForge,
        onAssistantMessageCommitted,
        refreshAccount,
        reloadLivingWorld,
        loadRpEntitlements,
        saveRpEntitlements,
        syncRpRelics,
        runWikiUpdate,
        recomputeSlop,
        revealPhoneEntry,
        presentPhoneEntry,
        getPhoneUnseen: () => Number(phoneCache.unseen) || 0,
        getSessionAutoSpendUsd: () => sessionAutoSpendUsd,
        dispose() {
            activeAbort?.abort();
            if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
            for (const u of companionObjectUrls) {
                try { URL.revokeObjectURL(u); } catch {}
            }
            companionObjectUrls.length = 0;
            unsubLocale?.();
            unsubInsets?.();
            win.removeEventListener?.('resize', onResize);
            win.removeEventListener?.('keydown', onKeyDown);
            hostRoot.remove();
        },
    };
}
