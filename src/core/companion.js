import { diffDaysForward } from './date.js';
import { EGG_SKINS, GA_RARITIES } from './gacha.js';

export const COMPANION_STAGES = Object.freeze(['infant', 'child', 'teen', 'adult']);

export const COMPANION_ARCHETYPES = Object.freeze([
    'familiar_fox',
    'shadow_raven',
    'dragon_whelp',
    'homunculus',
    'celestial_wisp',
]);

const COMP_ARCHETYPE_PROFILES = Object.freeze({
    familiar_fox: {
        speciesKey: 'spirit_fox',
        gender: 'female',
        defaultName: { ru: 'Искорка', en: 'Emberkit' },
        traits: {
            ru: ['игривый нрав', 'чуткость к эмоциям'],
            en: ['playful spirit', 'emotion-attuned'],
        },
        visualSubject: 'mystical spirit-fox familiar with warm russet-and-gold fur, luminous amber eyes, and ember-tipped tail',
        motionCue: 'ears twitching softly as warm golden ember motes drift around its fluffy tail',
    },
    shadow_raven: {
        speciesKey: 'shadow_raven',
        gender: 'male',
        defaultName: { ru: 'Ноктюрн', en: 'Nocturne' },
        traits: {
            ru: ['зоркий наблюдатель', 'хранитель тайн'],
            en: ['keen observer', 'keeper of secrets'],
        },
        visualSubject: 'arcane shadow-raven familiar with iridescent obsidian plumage, silver-ringed eyes, and faint shadowy wisps',
        motionCue: 'iridescent dark feathers ruffling gently with a clever head tilt and subtle silver eye glint',
    },
    dragon_whelp: {
        speciesKey: 'dragon_whelp',
        gender: 'male',
        defaultName: { ru: 'Игнис', en: 'Ignis' },
        traits: {
            ru: ['гордый нрав', 'пылкое сердце'],
            en: ['proud bearing', 'ember-hearted'],
        },
        visualSubject: 'miniature obsidian-and-crimson dragon whelp with warm glowing scale seams, curved horns, and golden slit eyes',
        motionCue: 'leathery wings folding softly while a warm curl of golden ember smoke rises from its nostrils',
    },
    homunculus: {
        speciesKey: 'homunculus',
        gender: 'female',
        defaultName: { ru: 'Аурелия', en: 'Aurelia' },
        traits: {
            ru: ['пытливый ум', 'алхимическая память'],
            en: ['inquisitive mind', 'alchemical memory'],
        },
        visualSubject: 'delicate alchemical homunculus spirit with luminous porcelain features, expressive violet eyes, and subtle golden filigree runes',
        motionCue: 'faint golden alchemical runes pulsing softly along its collar as it blinks with quiet curiosity',
    },
    celestial_wisp: {
        speciesKey: 'celestial_wisp',
        gender: 'neutral',
        defaultName: { ru: 'Люмен', en: 'Lumen' },
        traits: {
            ru: ['умиротворяющий свет', 'эхо зари'],
            en: ['soothing aura', 'dawn-lit resonance'],
        },
        visualSubject: 'ethereal celestial starlight wisp sprite with gossamer halo wings, warm pearl-gold core, and stardust trails',
        motionCue: 'floating weightlessly in a gentle figure-eight while soft stardust sparkles shimmer around its halo',
    },
    offspring: {
        speciesKey: 'dynasty_heir',
        gender: 'female',
        defaultName: { ru: 'Мира', en: 'Mira' },
        traits: {
            ru: ['черты родителей', 'живой нрав'],
            en: ['parents\' likeness', 'lively spirit'],
        },
        visualSubject: 'cherished second-generation fantasy roleplay heir with expressive eyes and unmistakable familial resemblance',
        motionCue: 'breathing calmly with a natural blink, warm micro-expression, and gentle hair movement in soft air',
    },
});

const COMP_STAGE_VISUALS = Object.freeze({
    infant: 'tiny newborn infant stage nestled in a cozy woven cradle blanket, delicate proportions, wide innocent eyes',
    child: 'young child stage full of bright curiosity, playful posture, small stature, and expressive lively features',
    teen: 'agile adolescent stage with emerging grace, confident posture, sharper features, and growing arcane presence',
    adult: 'fully grown majestic adult stage with regal poise, refined silhouette, and mastered awakened presence',
});

const COMP_ACTION_SPECS = Object.freeze({
    feed: {
        fullness: 22,
        mood: 6,
        bond: 3,
        energy: 5,
        verb: 'warmly fed',
        detail: 'eating happily and feeling cared for',
    },
    pet: {
        fullness: 0,
        mood: 14,
        bond: 6,
        energy: 2,
        verb: 'gently petted and comforted',
        detail: 'leaning into the affectionate touch with trust',
    },
    train: {
        fullness: -6,
        mood: 5,
        bond: 8,
        energy: -12,
        verb: 'practiced a short training lesson with',
        detail: 'showing eager focus and growing discipline',
    },
    play: {
        fullness: -5,
        mood: 16,
        bond: 7,
        energy: -10,
        verb: 'played a lively game with',
        detail: 'brightening the room with playful energy',
    },
    rest: {
        fullness: -2,
        mood: 8,
        bond: 2,
        energy: 28,
        verb: 'tucked in to rest peacefully alongside',
        detail: 'curling up into a calm, restorative nap nearby',
    },
});

const COMP_TRAIT_EN_MAP = Object.freeze({
    'игривый нрав': 'playful spirit',
    'чуткость к эмоциям': 'emotion-attuned',
    'зоркий наблюдатель': 'keen observer',
    'хранитель тайн': 'keeper of secrets',
    'гордый нрав': 'proud bearing',
    'пылкое сердце': 'ember-hearted',
    'пытливый ум': 'inquisitive mind',
    'алхимическая память': 'alchemical memory',
    'умиротворяющий свет': 'soothing dawn aura',
    'эхо зари': 'starlit warmth',
    'древняя чешуя и руны': 'subtle shimmering scales and faint rune marks',
    'руническая чешуя': 'warm glowing runic scales',
    'перламутровая чешуя': 'iridescent pearlescent scales',
    'феромонная связь стаи': 'protective pack-bond instinct',
    'черты родителей': 'inherited parental features',
    'ревностная преданность': 'fierce devotion',
    'печать бездны во взгляде': 'haunting otherworldly gaze',
    'ясный рассудок': 'calm lucid composure',
    'доверчивое сердце': 'warm trusting gaze',
    'настороженный взгляд': 'guarded watchful eyes',
    'печать запретного пламени': 'faint ember-crimson aura',
    'врождённый дар маны': 'luminous arcane spark',
    'острое чутьё': 'razor-sharp intuition',
    'живой нрав': 'spirited curiosity',
    'чуткость к опасности': 'protective vigilance',
});

function compClamp(val, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(val) ? val : min));
}

function compFiniteOr(rawVal, fallback) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return fallback;
    const n = Number(rawVal);
    return Number.isFinite(n) ? n : fallback;
}

function compStageForAge(ageDays) {
    const d = Math.max(0, Math.trunc(Number(ageDays) || 0));
    if (d >= 45) return 'adult';
    if (d >= 21) return 'teen';
    if (d >= 7) return 'child';
    return 'infant';
}

function compCleanMediaPath(value) {
    const text = String(value ?? '').trim();
    if (!text || /^data:/i.test(text) || text.length > 500) return '';
    if (/[\x00-\x1f\x7f]/.test(text)) return '';
    // Reject raw unprefixed base64 blobs accidentally passed as paths
    if (text.length > 180 && !/[/.:]/.test(text)) return '';
    return text;
}

function compMakeId(prefix = 'c') {
    const rand = Math.random().toString(36).slice(2, 7);
    const stamp = (Date.now() % 1_000_000).toString(36);
    return `${prefix}-${stamp}${rand}`;
}

function compTraitToEnglish(trait) {
    const clean = String(trait ?? '').trim();
    if (!clean) return '';
    const lower = clean.toLowerCase();
    if (COMP_TRAIT_EN_MAP[lower]) return COMP_TRAIT_EN_MAP[lower];
    // Keep ASCII traits as-is; map generic Cyrillic custom meter traits to clean English
    if (/^[a-z0-9 _'&-]+$/i.test(clean)) return clean;
    return 'distinctive inherited aura';
}

function compEnforceWordRange(baseText, minWords, maxWords, fillerPool) {
    let words = String(baseText ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);

    let fillerIdx = 0;
    while (words.length < minWords && fillerIdx < fillerPool.length) {
        const extra = fillerPool[fillerIdx].split(/\s+/).filter(Boolean);
        words.push(...extra);
        fillerIdx += 1;
    }

    if (words.length > maxWords) {
        words = words.slice(0, maxWords);
        const last = words[words.length - 1].replace(/[,:;]+$/, '');
        words[words.length - 1] = /[.!?]$/.test(last) ? last : `${last}.`;
    }
    return words.join(' ');
}

export function normalizeCompanion(raw, idx = 0) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const originChildId = String(src.originChildId ?? '').trim().slice(0, 64);
    const archetype = COMPANION_ARCHETYPES.includes(src.archetype)
        ? src.archetype
        : (originChildId || src.archetype === 'offspring' ? 'offspring' : 'familiar_fox');
    const profile = COMP_ARCHETYPE_PROFILES[archetype] || COMP_ARCHETYPE_PROFILES.familiar_fox;

    const ageDays = Math.round(compClamp(Math.trunc(compFiniteOr(src.ageDays, 0)), 0, 36_500));
    const stage = COMPANION_STAGES.includes(src.stage) ? src.stage : compStageForAge(ageDays);
    const gender = ['female', 'male', 'neutral'].includes(src.gender) ? src.gender : profile.gender;
    const rawId = String(src.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const portraitPath = compCleanMediaPath(src.portraitPath);
    const videoPath = compCleanMediaPath(src.videoPath);

    const rawTraits = Array.isArray(src.traits)
        ? src.traits.map(item => String(item ?? '').trim().slice(0, 44)).filter(Boolean).slice(0, 4)
        : [];

    return {
        id: rawId || `comp-${idx + 1}`,
        name: String(src.name ?? '').trim().slice(0, 60) || profile.defaultName.en,
        archetype,
        speciesKey: String(src.speciesKey || profile.speciesKey).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || profile.speciesKey,
        originChildId,
        gender,
        stage,
        ageDays,
        fullness: Math.round(compClamp(compFiniteOr(src.fullness, 85), 0, 100)),
        mood: Math.round(compClamp(compFiniteOr(src.mood, 85), 0, 100)),
        bond: Math.round(compClamp(compFiniteOr(src.bond, 35), 0, 100)),
        energy: Math.round(compClamp(compFiniteOr(src.energy, 90), 0, 100)),
        traits: rawTraits.length > 0 ? rawTraits : [...profile.traits.en],
        voiceId: String(src.voiceId ?? '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 120),
        portraitPath,
        videoPath,
        videoTaskId: String(src.videoTaskId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 160),
        needsStageArt: src.needsStageArt === undefined ? false : Boolean(src.needsStageArt),
        lastActionAt: String(src.lastActionAt ?? '').trim().slice(0, 40),
        ...(GA_RARITIES.includes(src.rarity) ? { rarity: src.rarity } : {}),
        ...(EGG_SKINS.some(skin => skin.id === src.eggSkin) ? { eggSkin: src.eggSkin } : {}),
        ...(typeof src.mutationTrait === 'string' && src.mutationTrait
            ? { mutationTrait: src.mutationTrait.replace(/[<>]/g, '').slice(0, 120) } : {}),
        ...(typeof src.relicUid === 'string' && /^rpr_[A-Za-z0-9]{1,44}$/.test(src.relicUid) ? { relicUid: src.relicUid } : {}),
    };
}

export function createCompanionFromArchetype(archetypeId, { customName = '', locale = 'ru' } = {}) {
    const arch = COMPANION_ARCHETYPES.includes(archetypeId) ? archetypeId : 'familiar_fox';
    const profile = COMP_ARCHETYPE_PROFILES[arch];
    const lang = String(locale || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';
    const cleanName = String(customName ?? '').trim().slice(0, 60) || profile.defaultName[lang];

    return normalizeCompanion({
        id: compMakeId('fam'),
        name: cleanName,
        archetype: arch,
        speciesKey: profile.speciesKey,
        originChildId: '',
        gender: profile.gender,
        stage: 'infant',
        ageDays: 0,
        fullness: 85,
        mood: 85,
        bond: 35,
        energy: 90,
        traits: [...profile.traits[lang]],
        voiceId: '',
        portraitPath: '',
        videoPath: '',
        videoTaskId: '',
        needsStageArt: true,
        lastActionAt: '',
    });
}

function compDeriveOffspringTraits(child, state, lang) {
    const traits = [];
    const originMode = String(child?.originMode || 'cycle');
    const notes = String(child?.notes ?? '').toLowerCase();

    let speciesKey = 'dynasty_heir';
    if (originMode === 'oviposition') {
        speciesKey = 'wyrm_hatchling';
        if (notes.includes('warm_runic')) {
            traits.push(lang === 'ru' ? 'руническая чешуя' : 'warm glowing runic scales');
        } else if (notes.includes('pearl_smooth')) {
            traits.push(lang === 'ru' ? 'перламутровая чешуя' : 'iridescent pearlescent scales');
        } else {
            traits.push(lang === 'ru' ? 'древняя чешуя и руны' : 'ancient scales & runes');
        }
    } else if (originMode === 'omegaverse') {
        speciesKey = 'omega_heir';
        traits.push(lang === 'ru' ? 'феромонная связь стаи' : 'pheromone pack bond');
    } else {
        speciesKey = 'dynasty_heir';
        traits.push(lang === 'ru' ? 'черты родителей' : 'parents\' likeness');
    }

    const meters = Array.isArray(state?.customMeters) ? state.customMeters : [];
    const candidates = [];

    for (const m of meters) {
        if (!m || typeof m !== 'object') continue;
        const id = String(m.id || '').toLowerCase();
        const min = Number.isFinite(Number(m.min)) ? Number(m.min) : 0;
        const max = Number.isFinite(Number(m.max)) && Number(m.max) > min ? Number(m.max) : min + 100;
        const val = compFiniteOr(m.value, min);
        const ratio = (val - min) / (max - min);
        const weight = Math.abs(ratio - 0.5);

        if (id === 'obsession' && val >= 60) {
            candidates.push({ weight: weight + 0.3, trait: lang === 'ru' ? 'ревностная преданность' : 'fierce devotion' });
        } else if (id === 'sanity' && val <= 40) {
            candidates.push({ weight: weight + 0.3, trait: lang === 'ru' ? 'печать бездны во взгляде' : 'haunting abyssal gaze' });
        } else if (id === 'sanity' && val >= 75) {
            candidates.push({ weight: weight + 0.15, trait: lang === 'ru' ? 'ясный рассудок' : 'calm lucid composure' });
        } else if (id === 'trust' && (ratio >= 0.7 || val >= 40)) {
            candidates.push({ weight: weight + 0.25, trait: lang === 'ru' ? 'доверчивое сердце' : 'warm trusting heart' });
        } else if (id === 'trust' && (ratio <= 0.35 || val <= -25)) {
            candidates.push({ weight: weight + 0.25, trait: lang === 'ru' ? 'настороженный взгляд' : 'guarded watchful eyes' });
        } else if (id === 'sin' && val >= 60) {
            candidates.push({ weight: weight + 0.2, trait: lang === 'ru' ? 'печать запретного пламени' : 'mark of forbidden flame' });
        } else if (id === 'mana' && val >= 65) {
            candidates.push({ weight: weight + 0.2, trait: lang === 'ru' ? 'врождённый дар маны' : 'innate arcane spark' });
        } else if (id === 'suspicion' && val >= 60) {
            candidates.push({ weight: weight + 0.2, trait: lang === 'ru' ? 'острое чутьё' : 'razor-sharp intuition' });
        } else if (ratio >= 0.75 && m.label) {
            const label = String(m.label).trim().slice(0, 24).toLowerCase();
            candidates.push({ weight, trait: lang === 'ru' ? `дар: ${label}` : `blessed by ${label}` });
        } else if (ratio <= 0.25 && m.label) {
            const label = String(m.label).trim().slice(0, 24).toLowerCase();
            candidates.push({ weight, trait: lang === 'ru' ? `тень: ${label}` : `marked by low ${label}` });
        }
    }

    candidates.sort((a, b) => b.weight - a.weight);
    for (const item of candidates) {
        if (traits.length >= 3) break;
        if (!traits.includes(item.trait)) traits.push(item.trait);
    }

    if (traits.length < 2) {
        const parentRole = child?.parentRole === 'user' ? 'user' : 'char';
        const stress = Number(state?.entities?.[parentRole]?.vitals?.stress ?? 0);
        if (stress >= 65) {
            traits.push(lang === 'ru' ? 'чуткость к опасности' : 'protective vigilance');
        } else {
            traits.push(lang === 'ru' ? 'живой нрав' : 'spirited curiosity');
        }
    }

    return { speciesKey, traits: traits.slice(0, 3) };
}

export function createCompanionFromOffspring(child, state, { locale = 'ru' } = {}) {
    const srcChild = child && typeof child === 'object' ? child : {};
    const childId = String(srcChild.id || compMakeId('child')).trim().slice(0, 64);
    const lang = String(locale || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';

    if (state && typeof state === 'object') {
        if (!Array.isArray(state.companions)) state.companions = [];
        const existing = state.companions.find(c => c && c.originChildId === childId);
        if (existing) {
            if (!existing.eggSkin && EGG_SKINS.some(skin => skin.id === srcChild.eggSkin)) {
                existing.eggSkin = srcChild.eggSkin;
            }
            return existing;
        }
    }

    const gender = srcChild.gender === 'male' ? 'male' : 'female';
    const originMode = String(srcChild.originMode || 'cycle');
    const fallbackNames = originMode === 'oviposition'
        ? { ru: gender === 'male' ? 'Драко' : 'Астра', en: gender === 'male' ? 'Draco' : 'Astra' }
        : originMode === 'omegaverse'
            ? { ru: gender === 'male' ? 'Ренар' : 'Лира', en: gender === 'male' ? 'Renard' : 'Lyra' }
            : { ru: gender === 'male' ? 'Тео' : 'Мира', en: gender === 'male' ? 'Theo' : 'Mira' };

    const cleanName = String(srcChild.name ?? '').trim().slice(0, 60) || fallbackNames[lang];
    const ageDays = srcChild.bornDate && state?.world?.rpDate
        ? diffDaysForward(srcChild.bornDate, state.world.rpDate)
        : 0;
    const { speciesKey, traits } = compDeriveOffspringTraits(srcChild, state, lang);

    const created = normalizeCompanion({
        id: compMakeId('heir'),
        name: cleanName,
        archetype: 'offspring',
        speciesKey,
        originChildId: childId,
        gender,
        stage: compStageForAge(ageDays),
        ageDays,
        fullness: 85,
        mood: 85,
        bond: 50,
        energy: 90,
        traits,
        voiceId: '',
        portraitPath: '',
        videoPath: '',
        videoTaskId: '',
        needsStageArt: true,
        lastActionAt: String(state?.world?.rpDate ?? ''),
        ...(EGG_SKINS.some(skin => skin.id === srcChild.eggSkin) ? { eggSkin: srcChild.eggSkin } : {}),
    });

    if (state && Array.isArray(state.companions) && state.companions.length < 6) {
        state.companions.push(created);
    }
    return created;
}

export function interactWithCompanion(companion, action, { rpDate = '' } = {}) {
    const target = companion && typeof companion === 'object' ? companion : normalizeCompanion({});
    const actKey = Object.prototype.hasOwnProperty.call(COMP_ACTION_SPECS, action) ? action : 'pet';
    const spec = COMP_ACTION_SPECS[actKey];

    target.fullness = Math.round(compClamp(compFiniteOr(target.fullness, 85) + spec.fullness, 0, 100));
    target.mood = Math.round(compClamp(compFiniteOr(target.mood, 85) + spec.mood, 0, 100));
    target.bond = Math.round(compClamp(compFiniteOr(target.bond, 35) + spec.bond, 0, 100));
    target.energy = Math.round(compClamp(compFiniteOr(target.energy, 90) + spec.energy, 0, 100));
    target.lastActionAt = String(rpDate ?? '').trim().slice(0, 40);

    const stageLabel = COMPANION_STAGES.includes(target.stage) ? target.stage : 'infant';
    const roleLabel = target.originChildId ? `${stageLabel} child` : `${stageLabel} companion`;
    const memoryHint = `{{user}} ${spec.verb} ${target.name} (${roleLabel}); naturally weave a brief moment of ${target.name} ${spec.detail} into this turn.`;

    return { companion: target, memoryHint };
}

export function advanceCompanionsDays(companions, deltaDays) {
    if (!Array.isArray(companions)) return [];
    const days = Math.round(compClamp(Math.trunc(Number(deltaDays) || 0), 0, 36_500));
    if (days <= 0) return companions;

    for (const comp of companions) {
        if (!comp || typeof comp !== 'object') continue;
        const prevStage = COMPANION_STAGES.includes(comp.stage) ? comp.stage : compStageForAge(comp.ageDays);
        comp.ageDays = Math.max(0, Math.trunc(compFiniteOr(comp.ageDays, 0))) + days;
        const nextStage = compStageForAge(comp.ageDays);
        comp.stage = nextStage;
        if (nextStage !== prevStage) {
            comp.needsStageArt = true;
        }
        // Zero Punishment rule: passive time progression never drops vital care meters below 20
        comp.fullness = Math.round(compClamp(Math.max(20, compFiniteOr(comp.fullness, 85) - days * 6), 20, 100));
        comp.energy = Math.round(compClamp(Math.max(20, compFiniteOr(comp.energy, 90) - days * 4), 20, 100));
        comp.mood = Math.round(compClamp(Math.max(20, compFiniteOr(comp.mood, 85) - days * 3), 20, 100));
        comp.bond = Math.round(compClamp(compFiniteOr(comp.bond, 35), 0, 100));
    }
    return companions;
}

function compUnlockedSkinSet(unlockedEggSkins) {
    if (Array.isArray(unlockedEggSkins)) return new Set(unlockedEggSkins.map(String));
    if (unlockedEggSkins instanceof Set) return new Set([...unlockedEggSkins].map(String));
    if (Array.isArray(unlockedEggSkins?.unlockedEggSkins)) return new Set(unlockedEggSkins.unlockedEggSkins.map(String));
    return new Set();
}

export function equipCompanionEggSkin(companion, skinId, unlockedEggSkins = []) {
    if (!companion || typeof companion !== 'object') {
        return { ok: false, reason: 'companion_not_found', companion: null };
    }
    const cleanSkin = String(skinId ?? '').trim();
    if (!EGG_SKINS.some(skin => skin.id === cleanSkin)) {
        return { ok: false, reason: 'invalid_skin', companion };
    }
    if (!compUnlockedSkinSet(unlockedEggSkins).has(cleanSkin)) {
        return { ok: false, reason: 'skin_locked', companion };
    }
    companion.eggSkin = cleanSkin;
    companion.needsStageArt = true;
    return { ok: true, companion };
}

export function buildCompanionPortraitPrompt(companion, {
    charName = '',
    charDescription = '',
    userName = '',
    stylePreset = 'cinematic',
} = {}) {
    const comp = normalizeCompanion(companion);
    const profile = COMP_ARCHETYPE_PROFILES[comp.archetype] || COMP_ARCHETYPE_PROFILES.familiar_fox;
    const stageDesc = COMP_STAGE_VISUALS[comp.stage] || COMP_STAGE_VISUALS.infant;
    const skinObj = comp.eggSkin ? EGG_SKINS.find(item => item.id === comp.eggSkin) : null;

    const styleLead = stylePreset === 'dark_gothic'
        ? 'Dark gothic chiaroscuro portrait illustration, warm candlelight, ornate sanctuary backdrop, rich oil-painted textures.'
        : stylePreset === 'anime_illustration'
            ? 'Masterpiece anime key visual character portrait, luminous cel-shaded lighting, expressive detailed eyes, rich painterly background.'
            : 'Cinematic fantasy character portrait, atmospheric volumetric lighting, shallow depth of field, ultra-detailed digital painting.';

    const moodDesc = comp.mood >= 75
        ? 'radiant joyful expression, bright affectionate gaze, lively posture'
        : comp.mood >= 45
            ? 'calm attentive expression, gentle curious gaze, poised posture'
            : 'wistful tender expression, soft eyes seeking warmth and reassurance';

    const enTraits = comp.traits.map(compTraitToEnglish).filter(Boolean).join(', ') || 'loyal gentle spirit';

    const parentClean = String(charDescription ?? '')
        .replace(/[\r\n#*`<>[\]{}]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .slice(0, skinObj ? 8 : 14)
        .join(' ');

    const lineageClause = comp.originChildId || comp.archetype === 'offspring'
        ? `Subtle familial resemblance to ${charName || 'their parent'}${parentClean ? ` (${parentClean})` : ''}${userName ? ` and ${userName}` : ''}, echoing shared hair, eye, and aura motifs.`
        : `Subtle magical bond motifs echoing ${charName || userName || 'their keeper'}${parentClean ? ` with hints inspired by ${parentClean}` : ''}, harmonious color palette.`;

    const subjectDesc = comp.speciesKey === 'wyrm_hatchling'
        ? 'enchanting dragon-blooded fantasy heir with delicate shimmering scales and warm luminous eyes'
        : profile.visualSubject;

    const skinClause = skinObj
        ? `Shell and aura motif (${skinObj.name}): ${skinObj.descriptor}`
        : '';

    const framingClause = skinObj
        ? 'Centered solo portrait framing, soft rim light, no text overlays, no speech bubbles, no watermarks.'
        : 'Centered solo portrait framing, intricate surface detail, soft rim light, clean composition, no text overlays, no speech bubbles, no watermarks.';

    const rawPrompt = [
        styleLead,
        `Subject: ${comp.name}, a ${comp.gender !== 'neutral' ? `${comp.gender} ` : ''}${subjectDesc}, depicted at the ${stageDesc}.`,
        `Personality and mood: ${moodDesc}, embodying traits of ${enTraits}.`,
        skinClause,
        lineageClause,
        framingClause,
    ].filter(Boolean).join(' ');

    return compEnforceWordRange(rawPrompt, 64, 104, [
        'Warm atmospheric bokeh particles drift gently through the background air, highlighting crisp silhouettes and natural anatomy.',
        'Rich color harmony and museum-grade fantasy concept art finish.',
    ]);
}

export function buildCompanionVideoPrompt(companion) {
    const comp = normalizeCompanion(companion);
    const profile = COMP_ARCHETYPE_PROFILES[comp.archetype] || COMP_ARCHETYPE_PROFILES.familiar_fox;
    const moodMotion = comp.mood >= 75
        ? 'happy lively demeanor and warm affectionate gaze toward the viewer'
        : comp.mood >= 45
            ? 'calm curious demeanor and gentle attentive breathing'
            : 'soft sleepy demeanor settling cozily for warmth';

    const rawPrompt = [
        `Subtle 4-second cinematic image-to-video animation of ${comp.name} at the ${comp.stage} stage:`,
        `${profile.motionCue}, natural eye blink, ${moodMotion}.`,
        'Smooth micro-camera push-in, consistent character anatomy and lighting, drifting ambient dust motes, seamless loopable motion, no distortion or text.',
    ].join(' ');

    return compEnforceWordRange(rawPrompt, 34, 56, [
        'Soft volumetric rim light flickers gently across fine textures in tranquil atmosphere.',
    ]);
}

export function buildCompanionBabbleMessages(companion, {
    charName = '',
    userName = '',
    locale = 'ru',
} = {}) {
    const comp = normalizeCompanion(companion);
    const isRu = String(locale || 'ru').toLowerCase().startsWith('ru');
    const langName = isRu ? 'Russian' : 'English';
    const quoteExample = isRu ? '«...»' : '"..."';

    const stageVoiceRule = comp.stage === 'infant'
        ? (isRu
            ? 'Stage is INFANT: output melodic, pronounceable baby babble, cooing, or familiar purrs/chirps inside quotes (e.g. «Агу-у… мрр, теп-ло!»), 1 short sentence, NO adult vocabulary.'
            : 'Stage is INFANT: output melodic, pronounceable baby coos, babble, or familiar chirps/purrs inside quotes (e.g. "Coo-ooh... mrr, warm!"), 1 short sentence, NO adult vocabulary.')
        : comp.stage === 'child'
            ? 'Stage is CHILD: output 1–2 short, lively, innocent childlike spoken sentences full of curiosity and warmth.'
            : comp.stage === 'teen'
                ? 'Stage is TEEN: output 1–2 expressive adolescent spoken sentences showing emerging personality, wit, and traits.'
                : 'Stage is ADULT: output 1–2 poised, articulate, emotionally resonant spoken sentences reflecting maturity and loyalty.';

    const needNote = comp.fullness <= 35
        ? 'feeling noticeably hungry'
        : comp.energy <= 35
            ? 'feeling sleepy and ready to rest'
            : comp.mood >= 80
                ? 'feeling joyful and affectionate'
                : 'feeling calm and attentive';

    const systemContent = [
        `You roleplay ONLY as ${comp.name} (${comp.originChildId ? 'child/heir' : comp.speciesKey.replace(/_/g, ' ')}, stage: ${comp.stage}).`,
        `Write in ${langName}. Return ONLY 1–2 short spoken sentences enclosed in quotation marks (${quoteExample}) suitable for direct text-to-speech playback, with no narration outside quotes and no markdown.`,
        stageVoiceRule,
        `Traits: ${comp.traits.join(', ')}. Current state: ${needNote}, bond ${comp.bond}/100.`,
    ].join(' ');

    const caregivers = [charName, userName].filter(Boolean).join(' & ') || 'your caregiver';
    const userContent = isRu
        ? `Произнеси одну живую короткую реплику в кавычках от лица ${comp.name} для ${caregivers}.`
        : `Speak one short, vivid in-character line in quotes as ${comp.name} addressing ${caregivers}.`;

    return [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
    ];
}

export function buildCompanionForgeConcept(companion, {
    charName = '',
    userName = '',
    locale = 'ru',
} = {}) {
    const comp = normalizeCompanion(companion);
    const isRu = String(locale || 'ru').toLowerCase().startsWith('ru');
    const parentA = charName || '{{char}}';
    const parentB = userName || '{{user}}';
    const traitsList = comp.traits.join(', ');
    const isHeir = Boolean(comp.originChildId || comp.archetype === 'offspring');

    if (isRu) {
        const lineage = isHeir
            ? `Повзрослевший наследник второго поколения (${comp.gender === 'male' ? 'сын' : 'дочь'} ${parentA} и ${parentB}, проживший ${comp.ageDays} дн. в хронике Колыбели)`
            : `Пробудившийся в самостоятельном облике фамильяр-спутник (${comp.speciesKey.replace(/_/g, ' ')}, воспитанный ${parentA} и ${parentB} за ${comp.ageDays} дн. странствий, узы ${comp.bond}/100)`;
        return [
            `Имя персонажа: ${comp.name}.`,
            `Происхождение и роль: ${lineage}.`,
            `Унаследованные черты характера: ${traitsList}. Темперамент и настрой: ${comp.mood}/100.`,
            `Сделай полноценную карточку второго поколения (CCv2): детальная внешность взрослой стадии, манера речи, личная цель и сложная эмоциональная связь с {{user}} и ${parentA}.`,
            `Включи 5 записей лорбука: (1) детство в Колыбели и уроки ${parentA}, (2) родословная и унаследованные черты (${traitsList}), (3) особый дар или фамильная реликвия, (4) момент взросления и обретения собственного пути, (5) нынешнее отношение к {{user}}.`,
        ].join(' ');
    }

    const lineageEn = isHeir
        ? `Grown second-generation dynasty heir (${comp.gender === 'male' ? 'son' : 'daughter'} of ${parentA} and ${parentB}, raised across ${comp.ageDays} days in the Cradle chronicle)`
        : `Awakened ascendant familiar (${comp.speciesKey.replace(/_/g, ' ')}, raised by ${parentA} and ${parentB} over ${comp.ageDays} days, bond ${comp.bond}/100)`;

    return [
        `Character Name: ${comp.name}.`,
        `Origin & Role: ${lineageEn}.`,
        `Inherited Personality Traits: ${traitsList}. Temperament & morale: ${comp.mood}/100.`,
        `Design a rich second-generation CCv2 character card: adult appearance, distinct voice, personal ambition, and deep history with {{user}} and ${parentA}.`,
        `Include 5 lorebook entries covering: (1) childhood memories in the Cradle with ${parentA}, (2) lineage and inherited traits (${traitsList}), (3) signature gift or family keepsake, (4) coming-of-age turning point, and (5) current dynamic with {{user}}.`,
    ].join(' ');
}
