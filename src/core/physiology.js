import { advanceCompanionsDays, COMPANION_ARCHETYPES, createCompanionFromArchetype, normalizeCompanion } from './companion.js';
import { addDaysToIso, diffDaysForward, parseIsoDate, TIME_SLOTS } from './date.js';
import { EGG_SKINS } from './gacha.js';
import { UW_MAX_CASH, uwCreateState, uwNormalizeState } from './underworld.js';
import { repApplyWorldDelta, repNormalizeState } from './reputation.js';

// The Tavo classic-bundle compatibility test intentionally strips imports from
// a small legacy core set. Keep a tiny, dependency-free fallback so that the
// physiology module remains executable in that reduced bundle while ESM and Tavo
// bundles use the real direct exports above (no `import ... as` aliases!).
function physUwMaxCash() {
    return typeof UW_MAX_CASH === 'number' ? UW_MAX_CASH : 999_999_999;
}

function physIsValidEggSkin(skinId) {
    const clean = String(skinId ?? '').trim();
    if (!clean) return false;
    if (typeof EGG_SKINS !== 'undefined' && Array.isArray(EGG_SKINS)) {
        return EGG_SKINS.some(skin => skin.id === clean);
    }
    return false;
}

function physUwCreateState(...args) {
    if (typeof uwCreateState === 'function') return uwCreateState(...args);
    const options = args[0] && typeof args[0] === 'object' ? args[0] : {};
    return {
        skin: 'auto', currency: String(options.currency || '$').slice(0, 8),
        cash: Math.max(0, Math.trunc(Number(options.cash ?? 500) || 500)),
        debt: 0, turnsInDebt: 0, collateral: [], houseNet: 0, heat: 0,
        standing: 0, factions: [], turnsSinceEvent: 4, pendingWorldEvent: '',
        eventKind: '', calmTurns: 0, wagerCooldown: 0, collectorNotices: 0,
        allyTurns: 0, blackjack: null,
    };
}

function physUwNormalizeState(raw) {
    if (typeof uwNormalizeState === 'function') return uwNormalizeState(raw);
    const base = physUwCreateState();
    if (!raw || typeof raw !== 'object') return base;
    return { ...base, ...raw, collateral: Array.isArray(raw.collateral) ? raw.collateral.slice(0, 6) : [], factions: Array.isArray(raw.factions) ? raw.factions.slice(0, 4) : [] };
}

function physRepNormalizeState(state) {
    if (typeof repNormalizeState === 'function') return repNormalizeState(state);
    return state;
}

function physRepApplyWorldDelta(state, delta) {
    if (typeof repApplyWorldDelta === 'function') return repApplyWorldDelta(state, delta);
    return state;
}

export const BIO_MODES = Object.freeze(['none', 'cycle', 'omegaverse', 'oviposition']);
export const DISCLOSURE_MODES = Object.freeze(['modern', 'medieval', 'omniscient']);
export const CONTRACEPTION_TYPES = Object.freeze(['none', 'barrier', 'oral', 'iud', 'infertile']);
export const OMEGA_ROLES = Object.freeze(['omega', 'alpha', 'beta', 'enigma']);
export const SUPPRESSANT_LEVELS = Object.freeze(['none', 'standard', 'heavy']);
export const BOND_TYPES = Object.freeze(['none', 'temporary', 'permanent']);
export const SHELL_TRAITS = Object.freeze(['healthy', 'pearl_smooth', 'calcified', 'thin_fragile', 'warm_runic']);
export const COMPLICATION_POOL = Object.freeze([
    'none', 'morning_sickness', 'mild_anemia', 'fatigue_flare', 'blood_pressure_spike', 'back_strain',
]);

export const METER_PRESET_PACKS = Object.freeze({
    dark_romance: {
        ru: [
            { id: 'obsession', label: 'Одержимость', icon: '🖤', min: 0, max: 100, value: 25, showInHud: true },
            { id: 'sin', label: 'Уровень греха', icon: '🕯', min: 0, max: 100, value: 10, showInHud: false },
            { id: 'trust', label: 'Доверие', icon: '🤝', min: -100, max: 100, value: 0, showInHud: false },
        ],
        en: [
            { id: 'obsession', label: 'Obsession', icon: '🖤', min: 0, max: 100, value: 25, showInHud: true },
            { id: 'sin', label: 'Sin / Corruption', icon: '🕯', min: 0, max: 100, value: 10, showInHud: false },
            { id: 'trust', label: 'Trust', icon: '🤝', min: -100, max: 100, value: 0, showInHud: false },
        ],
    },
    fantasy_rpg: {
        ru: [
            { id: 'sanity', label: 'Рассудок', icon: '🧠', min: 0, max: 100, value: 90, showInHud: true },
            { id: 'mana', label: 'Мана / Вера', icon: '✨', min: 0, max: 100, value: 80, showInHud: false },
            { id: 'gold', label: 'Золото', icon: '🪙', min: 0, max: 9999, value: 50, showInHud: false },
        ],
        en: [
            { id: 'sanity', label: 'Sanity', icon: '🧠', min: 0, max: 100, value: 90, showInHud: true },
            { id: 'mana', label: 'Mana / Faith', icon: '✨', min: 0, max: 100, value: 80, showInHud: false },
            { id: 'gold', label: 'Gold', icon: '🪙', min: 0, max: 9999, value: 50, showInHud: false },
        ],
    },
    detective: {
        ru: [
            { id: 'suspicion', label: 'Подозрение', icon: '👁', min: 0, max: 100, value: 15, showInHud: true },
            { id: 'clues', label: 'Улики', icon: '📂', min: 0, max: 20, value: 0, showInHud: false },
        ],
        en: [
            { id: 'suspicion', label: 'Suspicion', icon: '👁', min: 0, max: 100, value: 15, showInHud: true },
            { id: 'clues', label: 'Clues Found', icon: '📂', min: 0, max: 20, value: 0, showInHud: false },
        ],
    },
});

export function applyMeterPresetPack(state, packId, locale = 'ru') {
    const pack = METER_PRESET_PACKS[packId];
    if (!pack) return state;
    const lang = String(locale).toLowerCase().startsWith('ru') ? 'ru' : 'en';
    for (const tpl of pack[lang]) {
        if (state.customMeters.length >= 8) break;
        if (!state.customMeters.some(m => m.id === tpl.id)) {
            state.customMeters.push({ ...tpl });
        }
    }
    return state;
}

const clamp = (val, min, max) => Math.min(max, Math.max(min, Number.isFinite(val) ? val : min));

export const PHYS_PHONE_EVERY = 3;
export const PHYS_CHECKPOINT_LIMIT = 25;
export const PHYS_STATE_MAX_BYTES = 65536;     // clodex_rp_state target incl. all snapshots (spec §1)
const PHYS_CHECKPOINT_MIN_BUDGET = 16000;
const PHYS_CHECKPOINT_MAX_BUDGET = 60000;
const PHYS_SNAPSHOT_LOG_TAIL = 6;
const PHYS_DIRECTOR_MAX_ACTIVE = 2;
const PHYS_DIRECTOR_NOTE_MAX = 140;
const PHYS_THOUGHT_MAX = 160;
const PHYS_ACTION_MAX = 90;
const PHYS_KEY_MAX = 200;

function physCleanLine(value, max) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function physCounter(value, fallback) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.min(9999, Math.max(0, n)) : fallback;
}

export function normalizeDirectorState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const ids = [];
    for (const item of Array.isArray(src.activeIds) ? src.activeIds : []) {
        const id = String(item ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        if (id && !ids.includes(id)) ids.push(id);
        if (ids.length >= PHYS_DIRECTOR_MAX_ACTIVE) break;
    }
    return { activeIds: ids, customNote: physCleanLine(src.customNote, PHYS_DIRECTOR_NOTE_MAX) };
}

export function normalizeTurnExtras(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const actions = Array.isArray(src.suggestedActions)
        ? src.suggestedActions.map(a => physCleanLine(a, PHYS_ACTION_MAX)).filter(Boolean).slice(0, 3)
        : [];
    return {
        turnKey: String(src.turnKey ?? src.messageKey ?? '').slice(0, PHYS_KEY_MAX),
        innerThought: physCleanLine(src.innerThought, PHYS_THOUGHT_MAX),
        suggestedActions: actions,
    };
}

export function defaultRng() {
    if (globalThis.crypto?.getRandomValues) {
        const arr = new Uint32Array(1);
        globalThis.crypto.getRandomValues(arr);
        return arr[0] / 0x1_0000_0000;
    }
    return Math.random();
}

export function createEntityState(role = 'char') {
    return {
        role,
        enabled: true,
        // SFW Vitals: Respiration, Circulation, Heart Rate, Wounds, Stamina, Stress
        vitals: {
            heartRate: 72,
            breathRate: 14,
            respiration: 'steady', // steady | deep | rapid | breathless | shallow
            circulation: 'normal', // normal | flushed | adrenaline | pallor | hypovolemia
            bloodLossPct: 0,       // 0..45
            stamina: 90,           // 0..100
            stress: 15,            // 0..100
            wounds: [],            // [{ id, label, bleeding: boolean, severity: 1..3, daysOld: 0 }]
        },
        // 18+ Biology (active only when world.enableAdultBiology && bio.mode !== 'none')
        bio: {
            mode: 'none',          // none | cycle | omegaverse | oviposition
            cycleDay: 1,
            cycleLength: 28,
            contraception: 'none', // none | barrier | oral | iud | infertile
            // Pregnancy (cycle: 280d / 40w, omegaverse: 252d / 36w)
            pregnant: false,
            gestationDays: 0,
            gestationTarget: 280,
            fetusCount: 0,
            fetusGenders: [],      // ['female', 'male']
            complication: 'none',
            testTaken: false,
            ultrasoundWeek: 0,
            postpartumDaysLeft: 0,
            cSectionScarDays: 0,
            // Omegaverse Pro
            omegaRole: role === 'char' ? 'alpha' : 'omega',
            pheromoneScent: '',
            pheromoneIntensity: 20, // 0..100
            suppressants: 'none',   // none | standard | heavy
            inHeatOrRut: false,
            heatDaysLeft: 0,
            bondType: 'none',       // none | temporary | permanent
            bondPartner: '',
            // Oviposition / Clutch & Nest Pro
            carryingClutch: false,
            clutchDays: 0,
            clutchTargetDays: 42,
            clutchTotal: 0,
            clutchLaid: 0,
            clutchShells: [],
            clutchGenders: [],
            nest: {
                active: false,
                warmth: 'optimal', // optimal | cool | overheated
                eggs: [],          // [{ id, shell, gender, daysIncubated, targetDays, cracked }]
            },
        },
    };
}

export function createChatState(initialDate = '2026-09-01') {
    return {
        version: 1,
        world: {
            rpDate: parseIsoDate(initialDate) !== null ? initialDate : '2026-09-01',
            dayCount: 1,
            timeOfDay: 'evening',
            location: '',
            weather: '',
            enableVitals: true,
            enableAdultBiology: false,
            disclosureMode: 'modern', // modern | medieval | omniscient
            targetMode: 'both',       // char | user | both
            pendingMemoryHint: '',
            director: { activeIds: [], customNote: '' }, // M1: one-turn director modifiers (survive swipes/restores)
            slopRule: '',             // M2: recomputed after every answer (derived cache, not snapshotted)
        },
        turnExtras: { turnKey: '', innerThought: '', suggestedActions: [] }, // M3: latest turn only, never sent to RP model
        counters: { turnsSinceLastPhone: PHYS_PHONE_EVERY, turnsSinceWiki: 0 },
        checkpointHead: '', // key of the checkpoint the live state currently derives from (parent of the next one)
        entities: {
            user: createEntityState('user'),
            char: createEntityState('char'),
        },
        offspring: [],    // [{ id, name, parentRole, originMode, gender, bornDate, notes }]
        cradleRemoved: [],
        companions: [],   // up to 6 active companions/heirs normalized via normalizeCompanion
        customMeters: [], // [{ id, label, icon, min, max, value, showInHud }]
        inventory: {
            char: [],     // ['Silver Crucifix', ...]
            user: [],
        },
        scene: {
            imagePath: '',
            imagePrompt: '',
            videoPath: '',
            videoTaskId: '',
            videoStatus: 'idle',
            turnsSinceAutoImage: 0,
            lastAudioPath: '',
        },
        // U1-U3: chat-scoped wallet, debt, wanted heat, standing and factions.
        // Global gacha/relic entitlements are deliberately kept outside this object.
        underworld: physUwCreateState(),
        codexHistory: [], // [{ role: 'user'|'assistant', content, preset, model, at }]
        activityLog: [],  // [{ atDate, summary }]
        checkpoints: [],  // [{ key, snapshot }]
    };
}

export function normalizeEntity(src, role = 'char') {
    const cleanRole = role === 'user' ? 'user' : 'char';
    const dst = createEntityState(cleanRole);
    if (!src || typeof src !== 'object') return dst;
    dst.enabled = src.enabled !== false;
    if (src.vitals && typeof src.vitals === 'object') {
        dst.vitals.heartRate = Math.round(clamp(Number(src.vitals.heartRate), 40, 210));
        dst.vitals.breathRate = Math.round(clamp(Number(src.vitals.breathRate), 8, 50));
        dst.vitals.respiration = ['steady', 'deep', 'rapid', 'breathless', 'shallow'].includes(src.vitals.respiration)
            ? src.vitals.respiration : 'steady';
        dst.vitals.circulation = ['normal', 'flushed', 'adrenaline', 'pallor', 'hypovolemia'].includes(src.vitals.circulation)
            ? src.vitals.circulation : 'normal';
        dst.vitals.bloodLossPct = Math.round(clamp(Number(src.vitals.bloodLossPct), 0, 45));
        dst.vitals.stamina = Math.round(clamp(Number(src.vitals.stamina), 0, 100));
        dst.vitals.stress = Math.round(clamp(Number(src.vitals.stress), 0, 100));
        dst.vitals.wounds = Array.isArray(src.vitals.wounds) ? src.vitals.wounds.slice(0, 8).map(w => ({
            id: String(w.id || Math.random().toString(36).slice(2, 8)),
            label: String(w.label ?? '').slice(0, 100),
            bleeding: Boolean(w.bleeding),
            severity: Math.round(clamp(Number(w.severity) || 1, 1, 3)),
            daysOld: Math.max(0, Math.trunc(Number(w.daysOld) || 0)),
        })).filter(w => w.label) : [];
    }
    if (src.bio && typeof src.bio === 'object') {
        const b = src.bio;
        dst.bio.mode = BIO_MODES.includes(b.mode) ? b.mode : 'none';
        dst.bio.cycleLength = Math.round(clamp(Number(b.cycleLength) || 28, 21, 35));
        dst.bio.cycleDay = Math.round(clamp(Number(b.cycleDay) || 1, 1, dst.bio.cycleLength));
        dst.bio.contraception = CONTRACEPTION_TYPES.includes(b.contraception) ? b.contraception : 'none';
        dst.bio.pregnant = Boolean(b.pregnant);
        dst.bio.gestationDays = Math.max(0, Math.trunc(Number(b.gestationDays) || 0));
        dst.bio.gestationTarget = Math.round(clamp(Number(b.gestationTarget) || 280, 120, 310));
        dst.bio.fetusCount = Math.round(clamp(Number(b.fetusCount) || 0, 0, 4));
        dst.bio.fetusGenders = Array.isArray(b.fetusGenders)
            ? b.fetusGenders.slice(0, 4).map(g => (g === 'male' ? 'male' : 'female')) : [];
        dst.bio.complication = COMPLICATION_POOL.includes(b.complication) ? b.complication : 'none';
        dst.bio.testTaken = Boolean(b.testTaken);
        dst.bio.ultrasoundWeek = Math.max(0, Math.trunc(Number(b.ultrasoundWeek) || 0));
        dst.bio.postpartumDaysLeft = Math.max(0, Math.trunc(Number(b.postpartumDaysLeft) || 0));
        dst.bio.cSectionScarDays = Math.max(0, Math.trunc(Number(b.cSectionScarDays) || 0));
        dst.bio.omegaRole = OMEGA_ROLES.includes(b.omegaRole) ? b.omegaRole : dst.bio.omegaRole;
        dst.bio.pheromoneScent = String(b.pheromoneScent ?? '').slice(0, 80);
        dst.bio.pheromoneIntensity = Math.round(clamp(Number(b.pheromoneIntensity) || 20, 0, 100));
        dst.bio.suppressants = SUPPRESSANT_LEVELS.includes(b.suppressants) ? b.suppressants : 'none';
        dst.bio.inHeatOrRut = Boolean(b.inHeatOrRut);
        dst.bio.heatDaysLeft = Math.max(0, Math.trunc(Number(b.heatDaysLeft) || 0));
        dst.bio.bondType = BOND_TYPES.includes(b.bondType) ? b.bondType : 'none';
        dst.bio.bondPartner = String(b.bondPartner ?? '').slice(0, 80);
        dst.bio.carryingClutch = Boolean(b.carryingClutch);
        dst.bio.clutchDays = Math.max(0, Math.trunc(Number(b.clutchDays) || 0));
        dst.bio.clutchTargetDays = Math.round(clamp(Number(b.clutchTargetDays) || 42, 14, 90));
        dst.bio.clutchTotal = Math.round(clamp(Number(b.clutchTotal) || 0, 0, 8));
        dst.bio.clutchLaid = Math.round(clamp(Number(b.clutchLaid) || 0, 0, dst.bio.clutchTotal));
        dst.bio.clutchShells = Array.isArray(b.clutchShells) ? b.clutchShells.slice(0, 8).map(String) : [];
        dst.bio.clutchGenders = Array.isArray(b.clutchGenders) ? b.clutchGenders.slice(0, 8).map(String) : [];
        if (b.nest && typeof b.nest === 'object') {
            dst.bio.nest.active = Boolean(b.nest.active);
            dst.bio.nest.warmth = ['optimal', 'cool', 'overheated'].includes(b.nest.warmth) ? b.nest.warmth : 'optimal';
            dst.bio.nest.eggs = Array.isArray(b.nest.eggs) ? b.nest.eggs.slice(0, 12).map((egg, idx) => ({
                id: String(egg?.id || `egg-${idx + 1}`),
                shell: SHELL_TRAITS.includes(egg?.shell) ? egg.shell : 'healthy',
                gender: egg?.gender === 'male' ? 'male' : 'female',
                daysIncubated: Math.max(0, Number(egg?.daysIncubated) || 0),
                targetDays: Math.round(clamp(Number(egg?.targetDays) || 60, 14, 120)),
                cracked: Boolean(egg?.cracked),
                ...(physIsValidEggSkin(egg?.eggSkin) ? { eggSkin: egg.eggSkin } : {}),
            })) : [];
        }
    }
    return dst;
}

export function normalizeChatState(raw) {
    const base = createChatState();
    if (!raw || typeof raw !== 'object') return base;
    const out = structuredClone(base);
    if (raw.world && typeof raw.world === 'object') {
        out.world.rpDate = parseIsoDate(raw.world.rpDate) !== null ? raw.world.rpDate : base.world.rpDate;
        out.world.dayCount = Math.max(1, Math.trunc(Number(raw.world.dayCount) || 1));
        out.world.timeOfDay = TIME_SLOTS.includes(raw.world.timeOfDay) ? raw.world.timeOfDay : 'evening';
        out.world.location = String(raw.world.location ?? '').slice(0, 160);
        out.world.weather = String(raw.world.weather ?? '').slice(0, 120);
        out.world.enableVitals = raw.world.enableVitals !== false;
        out.world.enableAdultBiology = Boolean(raw.world.enableAdultBiology);
        out.world.disclosureMode = DISCLOSURE_MODES.includes(raw.world.disclosureMode) ? raw.world.disclosureMode : 'modern';
        out.world.targetMode = ['char', 'user', 'both'].includes(raw.world.targetMode) ? raw.world.targetMode : 'both';
        out.world.pendingMemoryHint = String(raw.world.pendingMemoryHint ?? '').slice(0, 2000);
        out.world.director = normalizeDirectorState(raw.world.director);
        out.world.slopRule = String(raw.world.slopRule ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    }
    out.turnExtras = normalizeTurnExtras(raw.turnExtras);
    out.underworld = physUwNormalizeState(raw.underworld);
    physRepNormalizeState(out.underworld);
    if (raw.counters && typeof raw.counters === 'object') {
        out.counters.turnsSinceLastPhone = physCounter(raw.counters.turnsSinceLastPhone, PHYS_PHONE_EVERY);
        out.counters.turnsSinceWiki = physCounter(raw.counters.turnsSinceWiki, 0);
    }
    out.checkpointHead = String(raw.checkpointHead ?? '').slice(0, PHYS_KEY_MAX);
    for (const key of ['user', 'char']) {
        const src = raw.entities?.[key];
        if (!src || typeof src !== 'object') continue;
        out.entities[key] = normalizeEntity(src, key);
    }
    if (Array.isArray(raw.offspring)) {
        out.offspring = raw.offspring.slice(0, 40).map((child, idx) => ({
            id: String(child.id || `child-${idx + 1}`),
            name: String(child.name ?? '').slice(0, 80),
            parentRole: child.parentRole === 'user' ? 'user' : 'char',
            originMode: String(child.originMode || 'cycle'),
            gender: child.gender === 'male' ? 'male' : 'female',
            bornDate: String(child.bornDate || out.world.rpDate),
            notes: String(child.notes ?? '').slice(0, 140),
            ...(physIsValidEggSkin(child?.eggSkin) ? { eggSkin: child.eggSkin } : {}),
        }));
    }
    out.cradleRemoved = [...new Set((Array.isArray(raw.cradleRemoved) ? raw.cradleRemoved : [])
        .filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(id)))].slice(-100);
    if (Array.isArray(raw.companions)) {
        const seenIds = new Set();
        const seenChildIds = new Set();
        out.companions = [];
        for (const item of raw.companions) {
            if (!item || typeof item !== 'object') continue;
            const comp = normalizeCompanion(item, out.companions.length);
            if (seenIds.has(comp.id)) continue;
            if (comp.originChildId && seenChildIds.has(comp.originChildId)) continue;
            seenIds.add(comp.id);
            if (comp.originChildId) seenChildIds.add(comp.originChildId);
            out.companions.push(comp);
            if (out.companions.length >= 6) break;
        }
    }
    if (raw.scene && typeof raw.scene === 'object') {
        out.scene.imagePath = String(raw.scene.imagePath ?? '').slice(0, 500);
        out.scene.imagePrompt = String(raw.scene.imagePrompt ?? '').slice(0, 2000);
        out.scene.videoPath = String(raw.scene.videoPath ?? '').slice(0, 500);
        out.scene.videoTaskId = String(raw.scene.videoTaskId ?? '').slice(0, 200);
        out.scene.videoStatus = String(raw.scene.videoStatus || 'idle').slice(0, 40);
        out.scene.turnsSinceAutoImage = Math.max(0, Math.trunc(Number(raw.scene.turnsSinceAutoImage) || 0));
        out.scene.lastAudioPath = String(raw.scene.lastAudioPath ?? '').slice(0, 500);
    }
    if (Array.isArray(raw.customMeters)) {
        out.customMeters = raw.customMeters.slice(0, 8).map((m, idx) => {
            const min = Number.isFinite(Number(m.min)) ? Math.trunc(Number(m.min)) : 0;
            const max = Number.isFinite(Number(m.max)) && Number(m.max) > min ? Math.trunc(Number(m.max)) : min + 100;
            return {
                id: String(m.id || `meter_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `meter_${idx + 1}`,
                label: String(m.label ?? '').trim().slice(0, 60) || `Meter ${idx + 1}`,
                icon: String(m.icon ?? '📊').trim().slice(0, 8) || '📊',
                min,
                max,
                value: Math.round(clamp(Number(m.value) || 0, min, max)),
                showInHud: Boolean(m.showInHud),
            };
        });
    }
    if (raw.inventory && typeof raw.inventory === 'object') {
        for (const role of ['char', 'user']) {
            if (Array.isArray(raw.inventory[role])) {
                out.inventory[role] = raw.inventory[role]
                    .map(item => String(item ?? '').trim().slice(0, 80))
                    .filter(Boolean)
                    .slice(0, 20);
            }
        }
    }
    if (Array.isArray(raw.codexHistory)) {
        out.codexHistory = raw.codexHistory.slice(-24).map(item => ({
            role: item.role === 'user' ? 'user' : 'assistant',
            content: String(item.content ?? '').slice(0, 6000),
            preset: String(item.preset ?? 'lore_keeper'),
            model: String(item.model ?? ''),
            at: String(item.at ?? ''),
        })).filter(item => item.content);
    }
    if (Array.isArray(raw.activityLog)) {
        out.activityLog = raw.activityLog.slice(-40).map(entry => ({
            atDate: String(entry.atDate ?? ''),
            summary: String(entry.summary ?? '').slice(0, 240),
        })).filter(e => e.summary);
    }
    if (Array.isArray(raw.checkpoints)) {
        out.checkpoints = [];
        for (const cp of raw.checkpoints.slice(-PHYS_CHECKPOINT_LIMIT)) {
            if (!cp || typeof cp.key !== 'string' || !cp.key || !cp.snapshot || typeof cp.snapshot !== 'object') continue;
            const entry = {
                key: cp.key.slice(0, PHYS_KEY_MAX),
                // Legacy full snapshots (v1.0–v1.2) are migrated to the compact v1.3 encoding once.
                snapshot: cp.snapshot.z === 2 ? cp.snapshot : physEncodeSnapshot(normalizeChatState(cp.snapshot)),
            };
            if (typeof cp.parent === 'string') entry.parent = cp.parent.slice(0, PHYS_KEY_MAX);
            out.checkpoints.push(entry);
        }
    }
    if (out.checkpointHead && !out.checkpoints.some(cp => cp.key === out.checkpointHead)) out.checkpointHead = '';
    return out;
}

export function getCyclePhase(bio) {
    if (bio.postpartumDaysLeft > 0) return 'postpartum';
    if (bio.pregnant) {
        const week = Math.floor(bio.gestationDays / 7) + 1;
        return week <= 13 ? 'trimester_1' : week <= 27 ? 'trimester_2' : 'trimester_3';
    }
    if (bio.mode === 'omegaverse') {
        if (bio.inHeatOrRut) return bio.omegaRole === 'alpha' || bio.omegaRole === 'enigma' ? 'rut' : 'heat';
        if (bio.omegaRole === 'beta') return 'stable_beta';
        const preWindow = bio.cycleLength - 2;
        if (bio.cycleDay >= preWindow) return 'pre_heat';
        return 'baseline';
    }
    if (bio.mode === 'oviposition') {
        if (bio.carryingClutch) return bio.clutchDays >= bio.clutchTargetDays - 5 ? 'ready_to_lay' : 'gravid';
        if (bio.nest.active && bio.nest.eggs.length > 0) return 'nesting';
        return 'fertile_cycle';
    }
    // Realistic cycle (scaled proportionally to cycleLength around ovulation at length - 14)
    const ovulationCenter = Math.max(8, bio.cycleLength - 14);
    if (bio.cycleDay <= 5) return 'menstruation';
    if (bio.cycleDay < ovulationCenter - 1) return 'follicular';
    if (bio.cycleDay <= ovulationCenter + 1) return 'ovulation';
    return 'luteal';
}

export function computeConceptionChance(bio, { knotted = false } = {}) {
    if (bio.pregnant || bio.carryingClutch || bio.postpartumDaysLeft > 7) return 0;
    if (bio.contraception === 'infertile') return 0;

    let base = 0;
    if (bio.mode === 'cycle') {
        const phase = getCyclePhase(bio);
        base = phase === 'ovulation' ? 0.34
            : phase === 'follicular' && bio.cycleDay >= bio.cycleLength - 17 ? 0.16
                : phase === 'menstruation' ? 0.01 : 0.04;
    } else if (bio.mode === 'omegaverse') {
        if (bio.omegaRole !== 'omega') return 0;
        base = bio.inHeatOrRut ? 0.65 : (getCyclePhase(bio) === 'pre_heat' ? 0.22 : 0.05);
        if (knotted) base = Math.min(0.92, base + 0.2);
        if (bio.suppressants === 'standard') base *= 0.25;
        if (bio.suppressants === 'heavy') base *= 0.03;
    } else if (bio.mode === 'oviposition') {
        base = 0.55;
        if (bio.contraception === 'barrier') base *= 0.1;
    } else {
        return 0;
    }

    const mult = bio.contraception === 'barrier' ? 0.06
        : bio.contraception === 'oral' ? 0.015
            : bio.contraception === 'iud' ? 0.005 : 1;
    return clamp(base * mult, 0, 0.98);
}

export function recomputeDerivedVitals(vitals) {
    const bleedingCount = vitals.wounds.filter(w => w.bleeding).reduce((acc, w) => acc + w.severity, 0);
    if (vitals.bloodLossPct >= 28) {
        vitals.circulation = 'hypovolemia';
        vitals.heartRate = Math.max(vitals.heartRate, 128);
        vitals.respiration = 'shallow';
        vitals.breathRate = Math.max(vitals.breathRate, 26);
    } else if (vitals.bloodLossPct >= 14 || bleedingCount >= 2) {
        vitals.circulation = 'pallor';
        vitals.heartRate = Math.max(vitals.heartRate, 106);
    } else if (vitals.stress >= 75 && vitals.circulation === 'normal') {
        vitals.circulation = 'adrenaline';
    }
}

export function triggerConception(entity, state, { rng = defaultRng, knotted = false, force = false } = {}) {
    const { bio } = entity;
    if (bio.mode === 'none') return false;
    if (!force) {
        const chance = computeConceptionChance(bio, { knotted });
        if (chance <= 0 || rng() >= chance) return false;
    }
    if (bio.mode === 'oviposition') {
        if (bio.carryingClutch) return false;
        const count = 2 + Math.floor(rng() * 5); // 2..6 eggs
        bio.carryingClutch = true;
        bio.clutchDays = 1;
        bio.clutchTargetDays = 42;
        bio.clutchTotal = count;
        bio.clutchLaid = 0;
        bio.clutchShells = Array.from({ length: count }, () => SHELL_TRAITS[Math.floor(rng() * SHELL_TRAITS.length)]);
        bio.clutchGenders = Array.from({ length: count }, () => (rng() < 0.5 ? 'female' : 'male'));
        logEvent(state, `${entity.role}: clutch fertilized`);
        return true;
    }

    if (bio.pregnant) return false;
    const multiRoll = rng();
    const count = multiRoll < 0.004 ? 3 : multiRoll < 0.04 ? 2 : 1;
    bio.pregnant = true;
    bio.gestationDays = 1;
    bio.gestationTarget = bio.mode === 'omegaverse' ? 252 : 280;
    bio.fetusCount = count;
    bio.fetusGenders = Array.from({ length: count }, () => (rng() < 0.5 ? 'female' : 'male'));
    bio.complication = rng() < 0.22
        ? COMPLICATION_POOL[1 + Math.floor(rng() * (COMPLICATION_POOL.length - 1))]
        : 'none';
    bio.testTaken = false;
    bio.ultrasoundWeek = 0;
    bio.inHeatOrRut = false;
    bio.heatDaysLeft = 0;
    logEvent(state, `${entity.role}: conception occurred`);
    return true;
}

export function deliverBabies(entity, state, { method = 'natural' } = {}) {
    const { bio } = entity;
    if (!bio.pregnant || bio.fetusCount <= 0) return [];
    const created = [];
    for (let i = 0; i < bio.fetusCount; i += 1) {
        const child = {
            id: `child-${Date.now()}-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
            name: '',
            parentRole: entity.role,
            originMode: bio.mode,
            gender: bio.fetusGenders[i] || 'female',
            bornDate: state.world.rpDate,
            notes: method === 'c_section' ? 'C-section' : 'Natural birth',
        };
        state.offspring.push(child);
        created.push(child);
    }
    bio.pregnant = false;
    bio.gestationDays = 0;
    bio.fetusCount = 0;
    bio.fetusGenders = [];
    bio.complication = 'none';
    bio.testTaken = false;
    bio.ultrasoundWeek = 0;
    bio.postpartumDaysLeft = 42;
    bio.cSectionScarDays = method === 'c_section' ? 56 : 0;
    bio.cycleDay = 1;
    logEvent(state, `${entity.role}: delivered ${created.length} (${method})`);
    return created;
}

export function layEggs(entity, state, count = null) {
    const { bio } = entity;
    if (!bio.carryingClutch || bio.clutchTotal <= bio.clutchLaid) return 0;
    const remaining = bio.clutchTotal - bio.clutchLaid;
    const toLay = count === null ? remaining : clamp(Math.trunc(count), 1, remaining);
    for (let i = 0; i < toLay; i += 1) {
        const idx = bio.clutchLaid + i;
        bio.nest.eggs.push({
            id: `egg-${Date.now()}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
            shell: bio.clutchShells[idx] || 'healthy',
            gender: bio.clutchGenders[idx] || 'female',
            daysIncubated: 0,
            targetDays: 60,
            cracked: false,
        });
    }
    bio.clutchLaid += toLay;
    bio.nest.active = bio.nest.eggs.length > 0;
    if (bio.clutchLaid >= bio.clutchTotal) {
        bio.carryingClutch = false;
        bio.clutchDays = 0;
        bio.clutchTotal = 0;
        bio.clutchLaid = 0;
        bio.clutchShells = [];
        bio.clutchGenders = [];
        bio.postpartumDaysLeft = 10;
    }
    logEvent(state, `${entity.role}: laid ${toLay} egg(s)`);
    return toLay;
}

export function equipNestEggSkin(bio, eggIndex, skinId, unlockedEggSkins = []) {
    const targetBio = bio?.nest && Array.isArray(bio.nest.eggs)
        ? bio
        : (bio?.bio?.nest && Array.isArray(bio.bio.nest.eggs) ? bio.bio : null);
    if (!targetBio) return { ok: false, reason: 'egg_not_found', egg: null };
    const cleanSkin = String(skinId ?? '').trim();
    if (!physIsValidEggSkin(cleanSkin)) return { ok: false, reason: 'invalid_skin', egg: null };
    const unlocked = Array.isArray(unlockedEggSkins)
        ? unlockedEggSkins
        : unlockedEggSkins instanceof Set
            ? [...unlockedEggSkins]
            : Array.isArray(unlockedEggSkins?.unlockedEggSkins)
                ? unlockedEggSkins.unlockedEggSkins
                : [];
    if (!unlocked.map(String).includes(cleanSkin)) return { ok: false, reason: 'skin_locked', egg: null };
    const eggs = targetBio.nest.eggs;
    const idx = typeof eggIndex === 'number' || /^\d+$/.test(String(eggIndex ?? ''))
        ? Math.trunc(Number(eggIndex))
        : eggs.findIndex(item => item && item.id === String(eggIndex));
    const egg = idx >= 0 && idx < eggs.length ? eggs[idx] : null;
    if (!egg) return { ok: false, reason: 'egg_not_found', egg: null };
    egg.eggSkin = cleanSkin;
    return { ok: true, egg };
}

export function hatchReadyEggs(entity, state, { forceAll = false } = {}) {
    const { bio } = entity;
    if (!bio.nest.active || !bio.nest.eggs.length) return [];
    const hatched = [];
    const remaining = [];
    for (const egg of bio.nest.eggs) {
        if (forceAll || egg.daysIncubated >= egg.targetDays) {
            const hatchling = {
                id: `hatch-${Date.now()}-${hatched.length + 1}-${Math.random().toString(36).slice(2, 5)}`,
                name: '',
                parentRole: entity.role,
                originMode: 'oviposition',
                gender: egg.gender,
                bornDate: state.world.rpDate,
                notes: `Hatched (${egg.shell})`,
                ...(physIsValidEggSkin(egg.eggSkin) ? { eggSkin: egg.eggSkin } : {}),
            };
            state.offspring.push(hatchling);
            hatched.push(hatchling);
        } else {
            remaining.push(egg);
        }
    }
    bio.nest.eggs = remaining;
    bio.nest.active = remaining.length > 0;
    if (hatched.length) logEvent(state, `${entity.role}: hatched ${hatched.length}`);
    return hatched;
}

export function advanceSimulationDays(state, deltaDays, { rng = defaultRng } = {}) {
    const days = clamp(Math.trunc(Number(deltaDays) || 0), 0, 365);
    if (days <= 0) return state;

    state.world.rpDate = addDaysToIso(state.world.rpDate, days);
    state.world.dayCount += days;

    for (const key of ['user', 'char']) {
        const entity = state.entities[key];
        const { vitals, bio } = entity;

        // Natural vitals recovery over days
        if (vitals.bloodLossPct > 0) {
            vitals.bloodLossPct = Math.max(0, vitals.bloodLossPct - days * 3);
        }
        vitals.stamina = clamp(vitals.stamina + days * 25, 0, 100);
        vitals.stress = clamp(vitals.stress - days * 10, 0, 100);
        vitals.wounds = vitals.wounds
            .map(w => ({ ...w, bleeding: days >= 1 ? false : w.bleeding, daysOld: w.daysOld + days }))
            .filter(w => w.daysOld < w.severity * 7);
        if (vitals.bloodLossPct === 0 && vitals.wounds.length === 0) {
            vitals.circulation = 'normal';
            vitals.respiration = 'steady';
            vitals.heartRate = 72;
            vitals.breathRate = 14;
        } else {
            recomputeDerivedVitals(vitals);
        }

        if (!state.world.enableAdultBiology || bio.mode === 'none') continue;

        for (let d = 0; d < days; d += 1) {
            if (bio.cSectionScarDays > 0) bio.cSectionScarDays -= 1;
            // External nest eggs continue incubating even while the parent recovers from laying!
            if (bio.mode === 'oviposition' && bio.nest.active && bio.nest.eggs.length > 0) {
                const rate = bio.nest.warmth === 'optimal' ? 1 : bio.nest.warmth === 'cool' ? 0.5 : 0.75;
                for (const egg of bio.nest.eggs) {
                    egg.daysIncubated = Math.min(egg.targetDays, egg.daysIncubated + rate);
                    if (egg.daysIncubated >= egg.targetDays * 0.9) egg.cracked = true;
                }
            }
            if (bio.postpartumDaysLeft > 0) {
                bio.postpartumDaysLeft -= 1;
                continue;
            }
            if (bio.pregnant) {
                bio.gestationDays += 1;
                if (bio.gestationDays >= 98 && bio.complication === 'none' && rng() < 0.004) {
                    bio.complication = COMPLICATION_POOL[1 + Math.floor(rng() * (COMPLICATION_POOL.length - 1))];
                }
                continue;
            }
            if (bio.mode === 'oviposition') {
                if (bio.carryingClutch) {
                    bio.clutchDays = Math.min(bio.clutchTargetDays + 14, bio.clutchDays + 1);
                } else {
                    bio.cycleDay = (bio.cycleDay % bio.cycleLength) + 1;
                }
                continue;
            }
            // Cycle & Omegaverse day progression
            if (bio.mode === 'omegaverse' && bio.inHeatOrRut) {
                bio.heatDaysLeft -= 1;
                if (bio.heatDaysLeft <= 0) {
                    bio.inHeatOrRut = false;
                    bio.pheromoneIntensity = 25;
                }
            }
            bio.cycleDay += 1;
            if (bio.cycleDay > bio.cycleLength) {
                bio.cycleDay = 1;
                if (bio.mode === 'omegaverse' && bio.omegaRole !== 'beta' && bio.suppressants !== 'heavy') {
                    bio.inHeatOrRut = true;
                    bio.heatDaysLeft = bio.suppressants === 'standard' ? 2 : 4;
                    bio.pheromoneIntensity = bio.suppressants === 'standard' ? 55 : 90;
                }
            }
        }
    }
    if (Array.isArray(state.companions) && state.companions.length > 0) {
        advanceCompanionsDays(state.companions, days);
    }
    logEvent(state, `+${days}d → ${state.world.rpDate}`);
    return state;
}

// ---------------------------------------------------------------------------------------------
// Compact per-variant checkpoints (v1.3, spec M6 / 10.1).
// A snapshot stores only what differs from defaults ({ z: 2, d, c?, m? }); companions are diffed against
// their archetype template and story meters against their preset/generic template. Fields that every
// restore preserves from the live state (codexHistory, world.director, world.pendingMemoryHint) and derived
// caches (world.slopRule, scene.imagePrompt) are not stored. Each checkpoint remembers its `parent`
// (the checkpoint the state derived from), so "restore before" follows the active branch, not array order.
// ---------------------------------------------------------------------------------------------

const PHYS_UNSAFE_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

function physIsPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function physSame(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function physDiff(base, value) {
    if (physIsPlainObject(base) && physIsPlainObject(value)) {
        const out = {};
        let changed = false;
        for (const key of Object.keys(value)) {
            if (PHYS_UNSAFE_KEYS.includes(key)) continue;
            const d = physDiff(base[key], value[key]);
            if (d !== undefined) {
                out[key] = d;
                changed = true;
            }
        }
        return changed ? out : undefined;
    }
    if (value === undefined || physSame(base, value)) return undefined;
    return structuredClone(value);
}

function physPatch(base, diff) {
    if (diff === undefined) return base;
    if (physIsPlainObject(base) && physIsPlainObject(diff)) {
        const out = { ...base };
        for (const key of Object.keys(diff)) {
            if (PHYS_UNSAFE_KEYS.includes(key)) continue;
            out[key] = physPatch(base[key], diff[key]);
        }
        return out;
    }
    return diff;
}

function physTurnBase(key) {
    const raw = String(key ?? '');
    const hash = raw.indexOf('#');
    const noSalt = hash === -1 ? raw : raw.slice(0, hash);
    const colon = noSalt.lastIndexOf(':');
    return colon === -1 ? noSalt : noSalt.slice(0, colon);
}

function physMeterGeneric(id) {
    return { id, label: '', icon: '📊', min: 0, max: 100, value: 0, showInHud: false };
}

function physMeterPresetRef(meter) {
    for (const [packId, pack] of Object.entries(METER_PRESET_PACKS)) {
        for (const lang of Object.keys(pack)) {
            if (pack[lang].some(tpl => tpl.id === meter.id && tpl.label === meter.label)) return `${packId}.${lang}`;
        }
    }
    return '';
}

function physMeterTemplate(id, ref) {
    const [packId, lang] = String(ref || '').split('.');
    const tpl = METER_PRESET_PACKS[packId]?.[lang]?.find(item => item.id === id);
    return tpl ? { ...tpl } : physMeterGeneric(id);
}

// variant '' = bare normalized companion; 'ru' / 'en' = freshly created archetype companion in that locale.
function physCompanionTemplate(entry, idx, variant = '') {
    const originChildId = String(entry?.originChildId ?? '');
    if ((variant === 'ru' || variant === 'en') && !originChildId && COMPANION_ARCHETYPES.includes(entry?.archetype)) {
        const tpl = createCompanionFromArchetype(entry.archetype, { locale: variant });
        tpl.id = `comp-${idx + 1}`;
        return tpl;
    }
    return normalizeCompanion({ archetype: entry?.archetype, originChildId }, idx);
}

function physEncodeCompanion(comp, idx) {
    const localized = !comp?.originChildId && COMPANION_ARCHETYPES.includes(comp?.archetype);
    let best = null;
    let bestLen = Infinity;
    for (const variant of localized ? ['', 'ru', 'en'] : ['']) {
        const d = physDiff(physCompanionTemplate(comp, idx, variant), comp) || {};
        d.archetype = comp?.archetype;
        if (comp?.originChildId) d.originChildId = comp.originChildId;
        if (variant) d.l = variant;
        const len = JSON.stringify(d).length;
        if (len < bestLen) {
            best = d;
            bestLen = len;
        }
    }
    return best;
}

export function physEncodeSnapshot(state) {
    const src = structuredClone(state && typeof state === 'object' ? state : createChatState());
    delete src.checkpoints;
    delete src.checkpointHead;
    delete src.codexHistory;
    if (src.world && typeof src.world === 'object') {
        delete src.world.director;
        delete src.world.pendingMemoryHint;
        delete src.world.slopRule;
    }
    if (src.scene && typeof src.scene === 'object') delete src.scene.imagePrompt;
    if (Array.isArray(src.activityLog)) src.activityLog = src.activityLog.slice(-PHYS_SNAPSHOT_LOG_TAIL);

    delete src.cradleRemoved;
    const companions = Array.isArray(src.companions) ? src.companions.filter(comp => !comp.cradleCarry && !comp.sharedNestUid) : [];
    const meters = Array.isArray(src.customMeters) ? src.customMeters : [];
    delete src.companions;
    delete src.customMeters;

    const base = createChatState();
    delete base.companions;
    delete base.customMeters;

    const snapshot = { z: 2, d: physDiff(base, src) || {} };
    if (companions.length) {
        snapshot.c = companions.map((comp, idx) => physEncodeCompanion(comp, idx));
    }
    if (meters.length) {
        snapshot.m = meters.map(meter => {
            const ref = physMeterPresetRef(meter);
            const d = physDiff(physMeterTemplate(meter.id, ref), meter) || {};
            d.id = meter.id;
            if (ref) d.p = ref;
            return d;
        });
    }
    return snapshot;
}

export function physDecodeSnapshot(snapshot) {
    if (!physIsPlainObject(snapshot)) return createChatState();
    if (snapshot.z !== 2) return normalizeChatState(snapshot);
    const raw = physPatch(createChatState(), physIsPlainObject(snapshot.d) ? snapshot.d : {});
    raw.companions = (Array.isArray(snapshot.c) ? snapshot.c : [])
        .filter(physIsPlainObject)
        .map((entry, idx) => physPatch(physCompanionTemplate(entry, idx, entry.l), entry));
    raw.customMeters = (Array.isArray(snapshot.m) ? snapshot.m : [])
        .filter(physIsPlainObject)
        .map(entry => physPatch(physMeterTemplate(String(entry.id ?? ''), entry.p), entry));
    delete raw.checkpoints;
    return normalizeChatState(raw);
}

function physUtf8Bytes(value) {
    const json = JSON.stringify(value) ?? '';
    let bytes = 0;
    for (const ch of json) {
        const code = ch.codePointAt(0);
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return bytes;
}

// Serialized size (UTF-8 bytes) of the compact snapshot that saveCheckpoint would store for `state`.
export function checkpointSnapshotBytes(state) {
    return physUtf8Bytes(physEncodeSnapshot(state));
}

export function saveCheckpoint(state, checkpointKey) {
    if (!checkpointKey) return;
    const key = String(checkpointKey).slice(0, PHYS_KEY_MAX);
    const cps = Array.isArray(state.checkpoints) ? state.checkpoints : [];
    const existing = cps.find(cp => cp.key === key);
    const base = physTurnBase(key);

    let parent = '';
    let head = cps.find(cp => cp.key === state.checkpointHead && cp.key !== key) || null;
    // A sibling variant of the same turn is never a parent: use the sibling's own parent instead.
    if (head && physTurnBase(head.key) === base) {
        head = typeof head.parent === 'string' ? (cps.find(cp => cp.key === head.parent) || null) : null;
    }
    if (head) {
        parent = head.key;
    } else if (existing && typeof existing.parent === 'string') {
        parent = existing.parent;
    } else {
        for (let i = cps.length - 1; i >= 0; i -= 1) {
            if (cps[i].key !== key && physTurnBase(cps[i].key) !== base) {
                parent = cps[i].key;
                break;
            }
        }
    }

    const filtered = cps.filter(cp => cp.key !== key);
    filtered.push({ key, parent, snapshot: physEncodeSnapshot(state) });
    const kept = filtered.slice(-PHYS_CHECKPOINT_LIMIT);
    // Byte budget for all snapshots so clodex_rp_state stays within 64 KB: whatever the live state leaves
    // (bounded to 16..60 KB), evicting the oldest snapshots first.
    const live = { ...state, checkpoints: [] };
    const budget = Math.min(PHYS_CHECKPOINT_MAX_BUDGET,
        Math.max(PHYS_CHECKPOINT_MIN_BUDGET, PHYS_STATE_MAX_BYTES - 1024 - physUtf8Bytes(live)));
    let total = kept.reduce((sum, cp) => sum + physUtf8Bytes(cp) + 1, 0);
    while (kept.length > 1 && total > budget) {
        total -= physUtf8Bytes(kept[0]) + 1;
        kept.shift();
    }
    state.checkpoints = kept;
    state.checkpointHead = key;
}

function physRestoreInto(state, target, keptCheckpoints) {
    const preservedDirector = state.world?.director;
    const preservedHint = state.world?.pendingMemoryHint;
    const preservedSlop = state.world?.slopRule;
    const preservedImagePrompt = state.scene?.imagePrompt;
    const preservedCodex = state.codexHistory;
    const restored = physDecodeSnapshot(target.snapshot);
    const carried = (state.companions || []).filter(comp => comp.cradleCarry || comp.sharedNestUid);
    const removed = state.cradleRemoved || [];
    restored.companions = [...carried, ...restored.companions.filter(comp =>
        !comp.sharedNestUid && !comp.cradleCarry && !removed.includes(comp.id) && !carried.some(live => live.id === comp.id))].slice(0, 6);
    restored.cradleRemoved = removed;
    Object.assign(state, restored);
    if (preservedDirector !== undefined) state.world.director = normalizeDirectorState(preservedDirector);
    if (preservedHint !== undefined) state.world.pendingMemoryHint = String(preservedHint ?? '');
    if (preservedSlop !== undefined) state.world.slopRule = String(preservedSlop ?? '');
    if (preservedImagePrompt !== undefined) state.scene.imagePrompt = String(preservedImagePrompt ?? '');
    state.codexHistory = Array.isArray(preservedCodex) ? preservedCodex : [];
    state.checkpoints = keptCheckpoints;
    state.checkpointHead = target.key;
}

// Restores the exact snapshot of a variant (swipe back to an existing variant). Keeps all checkpoints.
export function restoreCheckpointExact(state, turnKey) {
    const key = String(turnKey ?? '');
    const cps = Array.isArray(state?.checkpoints) ? state.checkpoints : [];
    const target = key ? cps.find(cp => cp.key === key) : null;
    if (!target) return false;
    physRestoreInto(state, target, cps);
    return true;
}

// Rolls back to the state before the turn identified by `checkpointKey` (any variant of that turn).
// Swipe/regenerate: default { prune: false } keeps every variant snapshot so A -> B -> A works.
// Message deletion: { prune: true } also drops that turn's snapshots and all of their descendants.
export function restoreCheckpointBefore(state, checkpointKey, { prune = false } = {}) {
    const key = String(checkpointKey ?? '');
    const cps = Array.isArray(state?.checkpoints) ? state.checkpoints : [];
    if (!key || !cps.length) return false;
    const base = physTurnBase(key);
    const sameTurn = cp => physTurnBase(cp.key) === base;

    let anchor = cps.find(cp => cp.key === key) || null;
    if (!anchor) {
        for (let i = cps.length - 1; i >= 0; i -= 1) {
            if (sameTurn(cps[i])) {
                anchor = cps[i];
                break;
            }
        }
    }
    if (!anchor) return false;

    let target = null;
    if (typeof anchor.parent === 'string') {
        if (!anchor.parent) return false; // first turn of the chat: nothing to roll back to
        target = cps.find(cp => cp.key === anchor.parent && !sameTurn(cp)) || null;
    }
    const firstIdx = cps.findIndex(sameTurn);
    if (!target) target = firstIdx > 0 ? cps[firstIdx - 1] : null;
    if (!target) return false;

    let kept = cps;
    if (prune) {
        const doomed = new Set(cps.filter(sameTurn).map(cp => cp.key));
        let grew = true;
        while (grew) {
            grew = false;
            for (const cp of cps) {
                if (!doomed.has(cp.key) && typeof cp.parent === 'string' && doomed.has(cp.parent)) {
                    doomed.add(cp.key);
                    grew = true;
                }
            }
        }
        cps.forEach((cp, idx) => {
            if (idx > firstIdx && typeof cp.parent !== 'string') doomed.add(cp.key);
        });
        doomed.delete(target.key);
        kept = cps.filter(cp => !doomed.has(cp.key));
    }
    physRestoreInto(state, target, kept);
    return true;
}

function physApplyTurnExtras(state, delta, turnKey) {
    const hasThought = typeof delta.innerThought === 'string' && delta.innerThought.trim();
    const hasActions = Array.isArray(delta.suggestedActions)
        && delta.suggestedActions.some(a => typeof a === 'string' && a.trim());
    if (hasThought || hasActions) {
        state.turnExtras = normalizeTurnExtras({
            turnKey,
            innerThought: hasThought ? delta.innerThought : '',
            suggestedActions: hasActions ? delta.suggestedActions.filter(a => typeof a === 'string') : [],
        });
    }
    if (!state.counters || typeof state.counters !== 'object') {
        state.counters = { turnsSinceLastPhone: PHYS_PHONE_EVERY, turnsSinceWiki: 0 };
    }
    state.counters.turnsSinceLastPhone = physCounter(state.counters.turnsSinceLastPhone, PHYS_PHONE_EVERY) + 1;
    state.counters.turnsSinceWiki = physCounter(state.counters.turnsSinceWiki, 0) + 1;
    if (Array.isArray(delta.phoneEvents) && delta.phoneEvents.some(ev => ev && typeof ev === 'object')) {
        state.counters.turnsSinceLastPhone = 0;
    }
}

export function applyTurnExtraction(state, delta, { checkpointKey = '', rng = defaultRng, saveCheckpoint: persistCheckpoint = true } = {}) {
    if (!delta || typeof delta !== 'object') return state;
    if (!state.underworld || typeof state.underworld !== 'object') state.underworld = physUwCreateState();
    state.underworld = physUwNormalizeState(state.underworld);

    let forwardDays = Math.max(0, Math.trunc(Number(delta.daysElapsed) || 0));
    if (delta.newRpDate) {
        const byIso = diffDaysForward(state.world.rpDate, delta.newRpDate);
        if (byIso > forwardDays) forwardDays = byIso;
    }
    if (forwardDays > 0) {
        advanceSimulationDays(state, forwardDays, { rng });
    }
    if (TIME_SLOTS.includes(delta.timeOfDay)) state.world.timeOfDay = delta.timeOfDay;
    if (typeof delta.location === 'string' && delta.location.trim()) {
        state.world.location = delta.location.trim().slice(0, 140);
    }
    if (typeof delta.weather === 'string' && delta.weather.trim()) {
        state.world.weather = delta.weather.trim().slice(0, 100);
    }

    for (const role of ['user', 'char']) {
        const ed = delta.entities?.[role];
        if (!ed || typeof ed !== 'object') continue;
        const entity = state.entities[role];
        const { vitals, bio } = entity;

        if (state.world.enableVitals) {
            if (Number.isFinite(ed.heartRate)) vitals.heartRate = Math.round(clamp(ed.heartRate, 42, 205));
            if (Number.isFinite(ed.breathRate)) vitals.breathRate = Math.round(clamp(ed.breathRate, 8, 48));
            if (['steady', 'deep', 'rapid', 'breathless', 'shallow'].includes(ed.respiration)) {
                vitals.respiration = ed.respiration;
            }
            if (['normal', 'flushed', 'adrenaline', 'pallor', 'hypovolemia'].includes(ed.circulation)) {
                vitals.circulation = ed.circulation;
            }
            if (Number.isFinite(ed.bloodLossDelta) && ed.bloodLossDelta !== 0) {
                vitals.bloodLossPct = Math.round(clamp(vitals.bloodLossPct + ed.bloodLossDelta, 0, 45));
            }
            if (Number.isFinite(ed.staminaDelta)) {
                vitals.stamina = Math.round(clamp(vitals.stamina + ed.staminaDelta, 0, 100));
            }
            if (Number.isFinite(ed.stressDelta)) {
                vitals.stress = Math.round(clamp(vitals.stress + ed.stressDelta, 0, 100));
            }
            if (typeof ed.newWound === 'string' && ed.newWound.trim()) {
                const label = ed.newWound.trim().slice(0, 90);
                if (!vitals.wounds.some(w => w.label.toLowerCase() === label.toLowerCase())) {
                    vitals.wounds.push({
                        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                        label,
                        bleeding: Boolean(ed.woundBleeding),
                        severity: clamp(Math.round(Number(ed.woundSeverity) || 1), 1, 3),
                        daysOld: 0,
                    });
                }
            }
            if (ed.treatedWounds) {
                vitals.wounds = vitals.wounds.map(w => ({ ...w, bleeding: false }));
            }
            recomputeDerivedVitals(vitals);
        }

        if (state.world.enableAdultBiology && bio.mode !== 'none') {
            if (Number.isFinite(ed.pheromoneIntensity) && bio.mode === 'omegaverse') {
                bio.pheromoneIntensity = Math.round(clamp(ed.pheromoneIntensity, 0, 100));
            }
            if (ed.bondFormed && bio.mode === 'omegaverse') {
                bio.bondType = ed.bondFormed === 'permanent' ? 'permanent' : 'temporary';
                if (typeof ed.bondPartner === 'string' && ed.bondPartner.trim()) {
                    bio.bondPartner = ed.bondPartner.trim().slice(0, 80);
                }
            }
            if (ed.pregnancyTestTaken && bio.pregnant && bio.gestationDays >= 10) {
                bio.testTaken = true;
            }
            if (ed.ultrasoundPerformed && bio.pregnant) {
                const week = Math.floor(bio.gestationDays / 7) + 1;
                bio.ultrasoundWeek = Math.max(bio.ultrasoundWeek, week);
            }
            if (ed.unprotectedIntimacy || ed.intimacyOccurred) {
                triggerConception(entity, state, { rng, knotted: Boolean(ed.knotted) });
            }
            if (ed.birthOccurred && bio.pregnant) {
                deliverBabies(entity, state, { method: ed.birthMethod === 'c_section' ? 'c_section' : 'natural' });
            }
            if (ed.eggsLaidCount && bio.mode === 'oviposition' && bio.carryingClutch) {
                const n = ed.eggsLaidCount === 'all' ? null : Number(ed.eggsLaidCount) || 1;
                layEggs(entity, state, n);
            }
            if (ed.eggsHatched && bio.mode === 'oviposition' && bio.nest.active) {
                hatchReadyEggs(entity, state, { forceAll: true });
            }
        }
    }

    // Update custom meters if present
    if (delta.customMeters && typeof delta.customMeters === 'object') {
        for (const meter of state.customMeters) {
            const nextVal = Number(delta.customMeters[meter.id]);
            if (Number.isFinite(nextVal)) {
                meter.value = Math.round(clamp(nextVal, meter.min, meter.max));
            }
        }
    }

    // Update inventory additions & removals
    for (const role of ['char', 'user']) {
        const added = delta.inventoryAdd?.[role];
        if (Array.isArray(added)) {
            for (const rawItem of added) {
                const item = String(rawItem ?? '').trim().slice(0, 80);
                if (item && state.inventory[role].length < 20
                    && !state.inventory[role].some(x => x.toLowerCase() === item.toLowerCase())) {
                    state.inventory[role].push(item);
                }
            }
        }
        const removed = delta.inventoryRemove?.[role];
        if (Array.isArray(removed) && removed.length) {
            const lowerRem = new Set(removed.map(x => String(x ?? '').trim().toLowerCase()));
            state.inventory[role] = state.inventory[role].filter(x => !lowerRem.has(x.toLowerCase()));
        }
    }

    // U3 world delta is optional and lives in the same tracker response; it is
    // clamped by repApplyWorldDelta so a malformed/overly enthusiastic model
    // cannot mint money or jump the wanted meter in one turn.
    if (delta.worldDelta && typeof delta.worldDelta === 'object') {
        if (Number.isFinite(Number(delta.worldDelta.cashDelta))) {
            const maxCash = physUwMaxCash();
            const cashDelta = Math.trunc(Math.min(50_000, Math.max(-50_000, Number(delta.worldDelta.cashDelta))));
            state.underworld.cash = Math.min(maxCash, Math.max(0, state.underworld.cash + cashDelta));
            state.underworld.houseNet = Math.min(maxCash, Math.max(-maxCash, state.underworld.houseNet + cashDelta));
        }
        physRepApplyWorldDelta(state.underworld, delta.worldDelta);
    }

    // Companion narrative care (feeding, sleeping/resting, petting/playing) + mood reaction
    if (Array.isArray(state.companions) && state.companions.length > 0) {
        const applyZeroPunishDelta = (curRaw, shift, fallback = 85, floor = 20) => {
            const cur = Number.isFinite(Number(curRaw)) ? Number(curRaw) : fallback;
            if (!shift) return Math.round(clamp(cur, 0, 100));
            if (shift > 0) return Math.min(100, Math.round(cur + shift));
            return cur <= floor ? Math.round(cur) : Math.max(floor, Math.round(cur + shift));
        };
        const selectCareTargets = rawTarget => {
            const q = String(rawTarget ?? '').trim().toLowerCase();
            if (state.companions.length === 1) return state.companions;
            if (!q || ['all', 'both', '*', 'все', 'оба', 'every'].includes(q)) return state.companions;
            const exact = state.companions.filter(c => String(c.name || '').trim().toLowerCase() === q);
            if (exact.length > 0) return exact;
            const partial = state.companions.filter(c => {
                const name = String(c.name || '').trim().toLowerCase();
                const arch = String(c.archetype || '').toLowerCase();
                const species = String(c.speciesKey || '').toLowerCase();
                return (name && (name.includes(q) || q.includes(name))) || arch === q || species === q;
            });
            return partial;
        };

        const rawCareList = Array.isArray(delta.companionCare)
            ? delta.companionCare.filter(item => item && typeof item === 'object').slice(0, 6)
            : (delta.companionCare && typeof delta.companionCare === 'object' ? [delta.companionCare] : []);

        let hadCareMoodBoost = false;
        const hasExplicitMood = delta.companionMoodDelta !== undefined
            && delta.companionMoodDelta !== null
            && delta.companionMoodDelta !== ''
            && Number.isFinite(Number(delta.companionMoodDelta));
        const explicitMoodShift = hasExplicitMood ? Math.round(clamp(Number(delta.companionMoodDelta), -15, 15)) : 0;

        for (const care of rawCareList) {
            const fullShift = Number.isFinite(Number(care.fullnessDelta))
                ? Math.round(clamp(Number(care.fullnessDelta), -12, 35)) : 0;
            const energyShift = Number.isFinite(Number(care.energyDelta))
                ? Math.round(clamp(Number(care.energyDelta), -15, 40)) : 0;
            const bondShift = Number.isFinite(Number(care.bondDelta))
                ? Math.round(clamp(Number(care.bondDelta), 0, 8)) : 0;
            const localMoodShift = Number.isFinite(Number(care.moodDelta))
                ? Math.round(clamp(Number(care.moodDelta), -15, 15)) : 0;
            if (!fullShift && !energyShift && !bondShift && !localMoodShift) continue;

            const targets = selectCareTargets(care.target ?? care.name ?? '');
            for (const comp of targets) {
                if (comp.sharedNestUid) continue;
                if (fullShift) comp.fullness = applyZeroPunishDelta(comp.fullness, fullShift, 85, 20);
                if (energyShift) comp.energy = applyZeroPunishDelta(comp.energy, energyShift, 90, 20);
                if (bondShift > 0) {
                    const curBond = Number.isFinite(Number(comp.bond)) ? Number(comp.bond) : 35;
                    comp.bond = Math.min(100, Math.round(curBond + bondShift));
                }
                if (localMoodShift) {
                    comp.mood = applyZeroPunishDelta(comp.mood, localMoodShift, 85, 20);
                    hadCareMoodBoost = true;
                } else if (explicitMoodShift === 0 && (fullShift >= 8 || bondShift >= 2 || energyShift >= 15)) {
                    comp.mood = applyZeroPunishDelta(comp.mood, 4, 85, 20);
                    hadCareMoodBoost = true;
                }
                if (fullShift > 0 || energyShift > 0 || bondShift > 0) {
                    comp.lastActionAt = String(state.world.rpDate || comp.lastActionAt || '').slice(0, 40);
                }
            }
        }

        if (hasExplicitMood && explicitMoodShift !== 0) {
            for (const comp of state.companions) {
                if (comp.sharedNestUid) continue;
                comp.mood = applyZeroPunishDelta(comp.mood, explicitMoodShift, 85, 20);
            }
        } else if (!hasExplicitMood && !hadCareMoodBoost) {
            const freshTrauma = ['user', 'char'].some(r => {
                const ed = delta.entities?.[r];
                return ed && (Boolean(ed.newWound) || Number(ed.bloodLossDelta) > 0);
            });
            const highStress = ['user', 'char'].some(r => {
                const ed = delta.entities?.[r];
                return Number(ed?.stressDelta) >= 15
                    || (state.entities?.[r]?.enabled && state.entities[r].vitals.stress >= 75);
            });
            const soothingTurn = ['user', 'char'].some(r => {
                const ed = delta.entities?.[r];
                return ed && (Boolean(ed.treatedWounds) || Number(ed.stressDelta) <= -15);
            });
            const ambientShift = freshTrauma ? -10 : highStress ? -6 : soothingTurn ? 5 : 0;
            if (ambientShift !== 0) {
                for (const comp of state.companions) {
                if (comp.sharedNestUid) continue;
                    comp.mood = applyZeroPunishDelta(comp.mood, ambientShift, 85, 20);
                }
            }
        }
    }

    // M3/M4/M5 bookkeeping: turnExtras (only when present) and counters. Phone/wiki stores are not touched here.
    physApplyTurnExtras(state, delta, String(checkpointKey || ''));

    if (checkpointKey && persistCheckpoint) saveCheckpoint(state, checkpointKey);
    return state;
}

export function getVisibleBiologySummary(entity, disclosureMode = 'modern') {
    const { bio } = entity;
    const phase = getCyclePhase(bio);
    if (bio.mode === 'none') return { phase: 'off', knownPregnant: false, revealCount: false, revealGender: false };

    if (!bio.pregnant) {
        return { phase, knownPregnant: false, revealCount: false, revealGender: false };
    }

    const week = Math.floor(bio.gestationDays / 7) + 1;
    if (disclosureMode === 'omniscient') {
        return { phase, week, knownPregnant: true, revealCount: true, revealGender: true };
    }
    if (disclosureMode === 'medieval') {
        const suspected = week >= 6;
        return { phase, week, knownPregnant: suspected, revealCount: false, revealGender: false };
    }
    // modern: suspected after missed period (~week 4+) or testTaken; count at US >= 12w; gender at US >= 20w
    const knownPregnant = bio.testTaken || week >= 5;
    const revealCount = bio.ultrasoundWeek >= 12;
    const revealGender = bio.ultrasoundWeek >= 20;
    return { phase, week, knownPregnant, revealCount, revealGender };
}

export function activeEntitiesForTarget(targetMode) {
    if (targetMode === 'user') return ['user'];
    if (targetMode === 'char') return ['char'];
    return ['char', 'user'];
}

function logEvent(state, summary) {
    state.activityLog.push({ atDate: state.world.rpDate, summary });
    if (state.activityLog.length > 40) state.activityLog = state.activityLog.slice(-40);
}
