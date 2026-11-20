// U3: local wanted/standing/faction mechanics. No network calls are performed here.

export const REP_MAX_HEAT = 5;
export const REP_WORLD_EVENTS = Object.freeze({
    crime: {
        tail: '[World Event: plainclothes officers discreetly tailing {{user}} due to local heat]',
        raid: '[World Event: patrol officers intercept {{user}} after a spike in local heat]',
        faction: '[World Event: rival gang members recognize {{user}} in the current location]',
    },
    tavern: {
        tail: '[World Event: city watch quietly follows {{user}} after rumors spread through the district]',
        raid: '[World Event: the town guard blocks {{user}}\'s route and demands answers]',
        faction: '[World Event: hostile guild agents cross paths with {{user}} in the current tavern]',
    },
    syndicate: {
        tail: '[World Event: surveillance drones shadow {{user}} after a local heat spike]',
        raid: '[World Event: corporate security intercepts {{user}} for a compliance sweep]',
        faction: '[World Event: hostile syndicate operatives identify {{user}} in the current sector]',
    },
});

export const REP_SERVICES = Object.freeze({
    clearHeat: { cost: 180, heat: -2 },
    npcDossier: { cost: 260, heat: 0 },
    muscle: { cost: 320, heat: 0 },
});

function repClamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function repNormalizeFactions(raw) {
    const out = [];
    const seen = new Set();
    for (const [index, item] of (Array.isArray(raw) ? raw : []).entries()) {
        if (!item || typeof item !== 'object') continue;
        const id = String(item.id || `faction-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `faction-${index + 1}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name: String(item.name || 'Faction').replace(/[<>]/g, '').trim().slice(0, 48), rep: Math.round(repClamp(item.rep, -100, 100, 0)) });
        if (out.length >= 4) break;
    }
    return out;
}

export function repNormalizeState(state) {
    const target = state && typeof state === 'object' ? state : {};
    // Heat changes are quarter-star increments (services and small local
    // consequences use ±0.25★).  Rounding to halves silently erased those
    // changes, so keep the smallest unit promised by the tracker contract.
    target.heat = Math.round(repClamp(target.heat, 0, REP_MAX_HEAT, 0) * 4) / 4;
    target.standing = Math.round(repClamp(target.standing, -100, 100, 0));
    target.factions = repNormalizeFactions(target.factions);
    target.turnsSinceEvent = Math.max(0, Math.trunc(Number(target.turnsSinceEvent) || 0));
    return target;
}

export function repApplyWorldDelta(state, worldDelta) {
    if (!state || !worldDelta || typeof worldDelta !== 'object') return state;
    repNormalizeState(state);
    const heatDelta = repClamp(worldDelta.heatDelta, -2, 3, 0);
    const standingDelta = Math.round(repClamp(worldDelta.standingDelta, -25, 25, 0));
    state.heat = Math.round(repClamp(state.heat + heatDelta, 0, REP_MAX_HEAT, 0) * 4) / 4;
    state.standing = Math.round(repClamp(state.standing + standingDelta, -100, 100, 0));
    const faction = worldDelta.faction;
    if (faction && typeof faction === 'object' && String(faction.name || '').trim()) {
        const name = String(faction.name).replace(/[<>]/g, '').trim().slice(0, 48);
        const delta = Math.round(repClamp(faction.delta, -30, 30, 0));
        let found = state.factions.find(item => item.name.toLowerCase() === name.toLowerCase());
        if (!found && state.factions.length < 4) {
            found = { id: `faction-${Date.now().toString(36)}`, name, rep: 0 };
            state.factions.push(found);
        }
        if (found) found.rep = Math.round(repClamp(found.rep + delta, -100, 100, 0));
    }
    return state;
}

export function repCoolHeat(state, { calmTurn = true, advanceTurn = true } = {}) {
    if (!state) return state;
    repNormalizeState(state);
    // Underworld's turn hook owns the shared turnsSinceEvent counter. Callers
    // that run both hooks pass advanceTurn:false to avoid a double tick.
    if (advanceTurn) state.turnsSinceEvent += 1;
    if (calmTurn && state.turnsSinceEvent % 3 === 0) state.heat = Math.max(0, Math.round((state.heat - 0.25) * 4) / 4);
    return state;
}

export function repRollWorldEvent(state, { rng = Math.random, skin = 'crime' } = {}) {
    if (!state) return { event: '', kind: '' };
    repNormalizeState(state);
    const pack = REP_WORLD_EVENTS[skin] || REP_WORLD_EVENTS.crime;
    if (state.turnsSinceEvent < 4) return { event: '', kind: '' };
    if (state.heat >= 4 && rng() < 0.5) {
        state.turnsSinceEvent = 0;
        return { event: pack.raid, kind: 'heat' };
    }
    if (state.heat >= 2 && rng() < 0.3) {
        state.turnsSinceEvent = 0;
        return { event: pack.tail, kind: 'heat' };
    }
    if (state.factions.some(f => f.rep <= -50) && rng() < 0.3) {
        state.turnsSinceEvent = 0;
        return { event: pack.faction, kind: 'faction' };
    }
    return { event: '', kind: '' };
}

export function repImportFactions(state, rows, { skin = 'crime' } = {}) {
    if (!state) return [];
    const names = Array.isArray(rows) ? rows : [];
    const fallback = skin === 'tavern' ? ['Городская стража', 'Гильдия', 'Культ'] : skin === 'syndicate' ? ['Корпоративная СБ', 'Синдикат', 'Сопротивление'] : ['Оперативники', 'Уличная банда', 'Решалы'];
    const source = names.length ? names : fallback.map(name => ({ name }));
    state.factions = repNormalizeFactions(source.map((row, idx) => ({ id: row.id || `faction-${idx + 1}`, name: row.name || row.title || row.label, rep: row.rep || 0 })));
    return state.factions;
}

export function repUseService(state, serviceId, { target = '', skin = 'crime' } = {}) {
    if (!state) return { ok: false, reason: 'state_required' };
    repNormalizeState(state);
    const service = REP_SERVICES[serviceId];
    if (!service) return { ok: false, reason: 'unknown_service' };
    if (Number(state.cash) < service.cost) return { ok: false, reason: 'insufficient_cash', cost: service.cost };
    state.cash -= service.cost;
    if (serviceId === 'clearHeat') {
        state.heat = Math.max(0, Math.round((state.heat + service.heat) * 4) / 4);
        return { ok: true, serviceId, cost: service.cost, event: `[World Event: a ${skin} fixer quietly erases traces and lowers {{user}}'s wanted heat]` };
    }
    if (serviceId === 'npcDossier') {
        return { ok: true, serviceId, cost: service.cost, target: String(target || 'current NPC').slice(0, 80), dossierRequested: true };
    }
    return { ok: true, serviceId, cost: service.cost, event: `[World Event: hired ${skin === 'tavern' ? 'mercenaries' : skin === 'syndicate' ? 'a cyber-team' : 'muscle'} move against ${String(target || 'the current target').slice(0, 70)}]` };
}

export function repContextLine(state) {
    if (!state || (Number(state.heat) <= 0 && Math.abs(Number(state.standing) || 0) < 25)) return '';
    const bits = [];
    if (Number(state.heat) > 0) bits.push(`wanted ${Number(state.heat).toFixed(1)}★`);
    if (Number(state.standing)) bits.push(`standing ${Number(state.standing) > 0 ? '+' : ''}${Math.round(Number(state.standing))}`);
    const hostile = Array.isArray(state.factions) ? state.factions.filter(f => Number(f.rep) <= -50).slice(0, 1) : [];
    if (hostile.length) bits.push(`hostile faction ${String(hostile[0].name).slice(0, 28)}`);
    return `[Reputation continuity: ${bits.join(', ')}]`.slice(0, 180);
}
