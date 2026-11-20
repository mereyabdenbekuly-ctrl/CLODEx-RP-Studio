// U4: autonomous altar/gacha. Only the paid summon path is allowed to call
// the host API, and callers must explicitly confirm before doing so.

export const GA_RARITIES = Object.freeze(['common', 'rare', 'epic', 'ssr', 'mythic']);
export const GA_RARITY_WEIGHTS = Object.freeze({ common: 0.52, rare: 0.30, epic: 0.13, ssr: 0.042, mythic: 0.008 });
export const GA_PITY_EPIC = 10;
export const GA_PITY_SSR = 30;

export const EGG_SKINS = Object.freeze([
    { id: 'obsidian_kintsugi', name: 'Obsidian Kintsugi', rarity: 'epic', theme: 'linear-gradient(145deg,#0b1020,#c9933d)', descriptor: 'Obsidian egg with luminous golden kintsugi seams, velvet-black reflections, solemn shrine lighting, ornate cracks like repaired constellations.' },
    { id: 'abyssal_crystal', name: 'Abyssal Crystal', rarity: 'ssr', theme: 'linear-gradient(145deg,#07152c,#3c83d8)', descriptor: 'Deep-blue crystal egg with translucent facets, tiny stars suspended inside, cold abyssal glow, prismatic edges, mysterious underwater silence.' },
    { id: 'seraph_porcelain', name: 'Seraph Porcelain', rarity: 'mythic', theme: 'linear-gradient(145deg,#fff6dc,#d9b6ff)', descriptor: 'Ivory porcelain egg with six subtle halo rings, rose-gold filigree, soft celestial radiance, sacred calm, immaculate museum-quality finish.' },
    { id: 'cyber_pod', name: 'Cyber Pod', rarity: 'rare', theme: 'linear-gradient(145deg,#071b24,#22d3ee)', descriptor: 'Sleek cybernetic egg pod with cyan status lights, graphite shell panels, tiny holographic glyphs, rain-slick neon reflections, sci-fi lab mood.' },
    { id: 'dragon_amber', name: 'Dragon Amber', rarity: 'epic', theme: 'linear-gradient(145deg,#34140b,#f59e0b)', descriptor: 'Warm amber egg with a tiny dragon silhouette inside, smoky inclusions, ember sparks, carved scale motifs, dramatic volcanic sunset light.' },
    { id: 'crimson_reliquary', name: 'Crimson Reliquary', rarity: 'ssr', theme: 'linear-gradient(145deg,#24080f,#e11d48)', descriptor: 'Crimson reliquary egg with dark ruby glass, silver lockwork, candlelit gothic altar, restrained occult elegance, faint red inner pulse.' },
    { id: 'lunar_jade', name: 'Lunar Jade', rarity: 'rare', theme: 'linear-gradient(145deg,#072620,#8dd3b8)', descriptor: 'Moonlit jade egg with soft green translucence, silver crescent engravings, misty garden shadows, serene nocturnal atmosphere, polished stone texture.' },
    { id: 'astral_nebula', name: 'Astral Nebula', rarity: 'mythic', theme: 'linear-gradient(145deg,#110b30,#a855f7)', descriptor: 'Cosmic egg containing a swirling nebula, violet and indigo clouds, distant galaxies, tiny comet trails, impossible depth, elegant astral glow.' },
    { id: 'frost_rune', name: 'Frost Rune', rarity: 'epic', theme: 'linear-gradient(145deg,#10243a,#bae6fd)', descriptor: 'Frosted blue egg etched with luminous runes, crystalline snow dust, pale winter light, clean geometric facets, quiet enchanted cold.' },
    { id: 'clockwork_brass', name: 'Clockwork Brass', rarity: 'rare', theme: 'linear-gradient(145deg,#2b1d0e,#fbbf24)', descriptor: 'Brass clockwork egg with visible gears, tiny springs, warm workshop light, engraved numerals, whimsical precision, richly aged metal patina.' },
    { id: 'velvet_thorn', name: 'Velvet Thorn', rarity: 'ssr', theme: 'linear-gradient(145deg,#220c22,#ec4899)', descriptor: 'Deep velvet egg wrapped in delicate silver thorns, magenta bloom highlights, romantic gothic still life, soft theatrical shadows, luxurious texture.' },
    { id: 'solar_halo', name: 'Solar Halo', rarity: 'mythic', theme: 'linear-gradient(145deg,#51200b,#fde047)', descriptor: 'Radiant solar egg with layered golden halo rings, sunlit enamel, tiny phoenix silhouette, warm bloom, triumphant mythic fantasy presentation.' },
]);

export const GA_ARCHETYPES = Object.freeze(['familiar_fox', 'shadow_raven', 'dragon_whelp', 'homunculus', 'celestial_wisp']);

function gaClamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function gaRng() {
    if (globalThis.crypto?.getRandomValues) {
        const data = new Uint32Array(1);
        globalThis.crypto.getRandomValues(data);
        return data[0] / 0x1_0000_0000;
    }
    return Math.random();
}

export function gaNormalizePrefs(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const unlocked = [...new Set((Array.isArray(source.unlockedEggSkins) ? source.unlockedEggSkins : []).map(String).filter(id => EGG_SKINS.some(skin => skin.id === id)))];
    return {
        version: 1,
        unlockedEggSkins: unlocked.slice(0, EGG_SKINS.length),
        epicPity: Math.trunc(gaClamp(source.epicPity, 0, GA_PITY_EPIC - 1, 0)),
        ssrPity: Math.trunc(gaClamp(source.ssrPity, 0, GA_PITY_SSR - 1, 0)),
        relics: Array.isArray(source.relics) ? source.relics.filter(x =>
            typeof x?.payload === 'string' && x.payload.length <= 16_384
            && typeof x?.sig === 'string' && x.sig.length <= 256
        ).map(({ payload, sig }) => ({ payload, sig })) : [],
        hatchedRelicUids: [...new Set((Array.isArray(source.hatchedRelicUids) ? source.hatchedRelicUids : [])
            .filter(value => typeof value === 'string' && /^rpr_[A-Za-z0-9]{1,44}$/.test(value)))],
        pendingEggs: Array.isArray(source.pendingEggs) ? source.pendingEggs.map(gaNormalizeEgg).filter(Boolean).slice(-24) : [],
    };
}

export function gaNormalizeEgg(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const skin = EGG_SKINS.some(item => item.id === raw.eggSkin) ? raw.eggSkin : EGG_SKINS[0].id;
    const rarity = GA_RARITIES.includes(raw.rarity) ? raw.rarity : 'common';
    const archetype = GA_ARCHETYPES.includes(raw.archetype) ? raw.archetype : GA_ARCHETYPES[0];
    return {
        id: String(raw.id || `egg-${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80),
        rarity,
        eggSkin: skin,
        archetype,
        mutationTrait: String(raw.mutationTrait || 'stable lineage').replace(/[<>]/g, '').slice(0, 120),
        warmth: Math.max(0, Math.min(100, Math.trunc(Number(raw.warmth) || 0))),
        hatched: raw.hatched === true,
        name: String(raw.name || '').replace(/[<>]/g, '').slice(0, 80),
        personality: String(raw.personality || '').replace(/[<>]/g, '').slice(0, 240),
        prophecy: String(raw.prophecy || '').replace(/[<>]/g, '').slice(0, 240),
        artPath: String(raw.artPath || '').slice(0, 512),
        ...(typeof raw.relicUid === 'string' && /^rpr_[A-Za-z0-9]{1,44}$/.test(raw.relicUid) ? { relicUid: raw.relicUid } : {}),
    };
}

export function gaWarmEgg(prefs, eggId, amount = 20) {
    const next = gaNormalizePrefs(prefs);
    const egg = next.pendingEggs.find(item => item.id === String(eggId) && !item.hatched);
    if (!egg) return { ok: false, reason: 'egg_not_found', prefs: next };
    egg.warmth = Math.min(100, egg.warmth + Math.max(1, Math.trunc(Number(amount) || 0)));
    return { ok: true, ready: egg.warmth >= 100, egg, prefs: next };
}

export function gaEquipSkinOnEgg(prefs, eggId, skinId) {
    const next = gaNormalizePrefs(prefs);
    const cleanSkin = String(skinId ?? '').trim();
    if (!EGG_SKINS.some(item => item.id === cleanSkin)) {
        return { ok: false, reason: 'invalid_skin', egg: null, prefs: next };
    }
    if (!next.unlockedEggSkins.includes(cleanSkin)) {
        return { ok: false, reason: 'skin_locked', egg: null, prefs: next };
    }
    const egg = next.pendingEggs.find(item => item.id === String(eggId) && !item.hatched);
    if (!egg) return { ok: false, reason: 'egg_not_found', egg: null, prefs: next };
    egg.eggSkin = cleanSkin;
    if (prefs && typeof prefs === 'object' && Array.isArray(prefs.pendingEggs)) {
        const rawEgg = prefs.pendingEggs.find(item => item && String(item.id) === String(eggId) && !item.hatched);
        if (rawEgg) rawEgg.eggSkin = cleanSkin;
    }
    return { ok: true, egg, prefs: next };
}

export function gaHatchEgg(prefs, eggId) {
    const next = gaNormalizePrefs(prefs);
    const egg = next.pendingEggs.find(item => item.id === String(eggId));
    if (!egg) return { ok: false, reason: 'egg_not_found', prefs: next };
    if (egg.hatched || egg.warmth < 100) return { ok: false, reason: 'not_ready', egg, prefs: next };
    next.pendingEggs = next.pendingEggs.filter(item => item !== egg);
    if (egg.relicUid && !next.hatchedRelicUids.includes(egg.relicUid)) next.hatchedRelicUids.push(egg.relicUid);
    egg.hatched = true;
    return { ok: true, egg, prefs: next };
}

// Only call with claims from relVerifyInventory (not the unsigned inventory wrapper).
export function gaQueueVerifiedRelicEgg(prefs, claims) {
    const next = gaNormalizePrefs(prefs);
    if (next.hatchedRelicUids.includes(claims.relicUid) || next.pendingEggs.some(egg => egg.relicUid === claims.relicUid)) {
        return { ok: false, reason: 'already_added', prefs: next };
    }
    if (next.pendingEggs.length >= 24) return { ok: false, reason: 'cradle_full', prefs: next };
    const egg = gaNormalizeEgg({
        ...claims, id: claims.relicUid, name: claims.edition, mutationTrait: claims.genes.trait,
    });
    next.pendingEggs.push(egg);
    return { ok: true, egg, prefs: next };
}

export function gaRollRarity(prefs = {}, { rng = gaRng } = {}) {
    const state = gaNormalizePrefs(prefs);
    const nextEpic = state.epicPity + 1;
    const nextSsr = state.ssrPity + 1;
    if (nextSsr >= GA_PITY_SSR) return rng() < 0.2 ? 'mythic' : 'ssr';
    if (nextEpic >= GA_PITY_EPIC) {
        const roll = rng();
        if (roll < GA_RARITY_WEIGHTS.mythic / (GA_RARITY_WEIGHTS.ssr + GA_RARITY_WEIGHTS.mythic)) return 'mythic';
        return 'epic';
    }
    const roll = rng();
    let cursor = 0;
    for (const rarity of GA_RARITIES) {
        cursor += GA_RARITY_WEIGHTS[rarity];
        if (roll < cursor) return rarity;
    }
    return 'common';
}

export function gaApplyPity(prefs, rarity) {
    const state = gaNormalizePrefs(prefs);
    const high = rarity === 'ssr' || rarity === 'mythic';
    const epic = high || rarity === 'epic';
    state.epicPity = epic ? 0 : Math.min(GA_PITY_EPIC - 1, state.epicPity + 1);
    state.ssrPity = high ? 0 : Math.min(GA_PITY_SSR - 1, state.ssrPity + 1);
    return state;
}

export function gaPickSkin(rarity, prefs = {}, { rng = gaRng } = {}) {
    const unlocked = gaNormalizePrefs(prefs).unlockedEggSkins;
    const eligible = EGG_SKINS.filter(skin => skin.rarity === rarity || (rarity === 'mythic' && skin.rarity === 'ssr'));
    const pool = eligible.length ? eligible : EGG_SKINS;
    const skin = pool[Math.floor(rng() * pool.length)];
    return skin || EGG_SKINS[0];
}

export function gaCreateSummon(prefs = {}, { cash = 0, cost = 50, rng = gaRng, archetypes = GA_ARCHETYPES } = {}) {
    if (Number(cash) < Number(cost)) return { ok: false, reason: 'insufficient_cash', cost: Number(cost) };
    if (gaNormalizePrefs(prefs).pendingEggs.filter(egg => !egg.hatched).length >= 24) {
        return { ok: false, reason: 'cradle_full' };
    }
    const rarity = gaRollRarity(prefs, { rng });
    const skin = gaPickSkin(rarity, prefs, { rng });
    const nextPrefs = gaApplyPity(prefs, rarity);
    if (!nextPrefs.unlockedEggSkins.includes(skin.id)) nextPrefs.unlockedEggSkins.push(skin.id);
    const archetypePool = Array.isArray(archetypes) && archetypes.length ? archetypes : GA_ARCHETYPES;
    const egg = {
        id: `egg-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
        rarity,
        eggSkin: skin.id,
        archetype: archetypePool[Math.floor(rng() * archetypePool.length)],
        mutationTrait: rarity === 'mythic' ? 'mythic resonance' : rarity === 'ssr' ? 'rare mutation' : 'stable lineage',
        warmth: 0,
        hatched: false,
    };
    nextPrefs.pendingEggs = nextPrefs.pendingEggs.filter(item => !item.hatched);
    nextPrefs.pendingEggs.push(egg);
    return { ok: true, egg, prefs: nextPrefs, cash: Number(cash) - Number(cost), cost: Number(cost) };
}

export function gaBuildPaidPrompt({ rarity, skinId, locale = 'ru', charName = '{{char}}' } = {}) {
    const skin = EGG_SKINS.find(item => item.id === skinId) || EGG_SKINS[0];
    const language = locale === 'ru' ? 'Russian and English' : 'English';
    return [
        'Return one compact JSON object only.',
        `Create a ${rarity} companion egg in the ${skin.name} skin for ${charName}.`,
        `Visual descriptor: ${skin.descriptor}`,
        `Include name, mutationTrait, personality, prophecy in ${language}; keep the JSON under 300 tokens.`,
    ].join(' ');
}

export function gaCanStartPaid({ confirmPaid = true, confirmed = false } = {}) {
    return !confirmPaid || confirmed === true;
}

export function gaRegisterHatch(prefs, egg) {
    const next = gaNormalizePrefs(prefs);
    if (egg?.eggSkin && !next.unlockedEggSkins.includes(egg.eggSkin)) next.unlockedEggSkins.push(egg.eggSkin);
    return next;
}
