import { ctxPack } from './context.js';
import { tnEstimateTokens, tnNormalize } from './textnorm.js';

// CLODEx RP Studio v1.4 — local underworld mechanics.
// This module is deliberately network-free. It owns chat-scoped money, debt,
// collateral and deterministic-enough (crypto-backed) mini-game primitives.

export const UW_MAX_CASH = 999_999_999;
export const UW_MAX_COLLATERAL = 6;
export const UW_SKINS = Object.freeze(['auto', 'crime', 'tavern', 'syndicate']);
export const UW_COLLATERAL_PRESETS = Object.freeze({
    crime: ['apartment', 'car', 'business', 'watch'],
    tavern: ['estate', 'sword', 'artifact', 'oath'],
    syndicate: ['habitat', 'implant', 'deck', 'license'],
});
export const UW_PRESET_VALUES = Object.freeze({
    apartment: 15000,
    estate: 15000,
    habitat: 15000,
    business: 8000,
    artifact: 8000,
    implant: 8000,
    car: 3500,
    sword: 3500,
    deck: 3500,
    watch: 900,
    oath: 900,
    license: 900,
});
export const UW_WORLD_EVENTS = Object.freeze({
    crime: '[World Event: collectors confront {{user}} over unpaid debt; the apartment is inaccessible.]',
    tavern: '[World Event: guild bailiffs seal {{user}}’s quarters over unpaid debt.]',
    syndicate: '[World Event: syndicate agents lock {{user}}’s habitation unit over unpaid debt.]',
});

function uwClamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function uwInt(value, min, max, fallback = min) {
    return Math.trunc(uwClamp(value, min, max, fallback));
}

export function uwDefaultRng() {
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint32Array(1);
        globalThis.crypto.getRandomValues(bytes);
        return bytes[0] / 0x1_0000_0000;
    }
    return Math.random();
}

export function uwResolveSkin(value, { text = '', description = '', scenario = '' } = {}) {
    const requested = String(value ?? '').toLowerCase();
    if (UW_SKINS.includes(requested) && requested !== 'auto') return requested;
    const corpus = `${text} ${description} ${scenario}`.toLowerCase();
    if (/(cyber|сайбер|кибер|corporate|корпорат|neuro|нейро|droid|drone|дрон)/.test(corpus)) return 'syndicate';
    if (/(fantasy|фэнтези|medieval|средневек|magic|маг|guild|гильд|tavern|таверн|dragon|дракон)/.test(corpus)) return 'tavern';
    if (/(crime|криминал|noir|нуар|gang|банд|mafia|маф|police|полици|detective|детектив)/.test(corpus)) return 'crime';
    return 'crime';
}

export function uwCreateState({ skin = 'auto', currency, cash = 500 } = {}) {
    const resolvedSkin = UW_SKINS.includes(skin) ? skin : 'auto';
    const defaultCurrency = currency || (resolvedSkin === 'tavern' ? '🪙' : '$');
    return {
        skin: resolvedSkin,
        currency: String(defaultCurrency).slice(0, 8),
        cash: uwInt(cash, 0, UW_MAX_CASH, 500),
        debt: 0,
        turnsInDebt: 0,
        collateral: [],
        houseNet: 0,
        heat: 0,
        standing: 0,
        factions: [],
        turnsSinceEvent: 4,
        pendingWorldEvent: '',
        eventKind: '',
        calmTurns: 0,
        wagerCooldown: 0,
        collectorNotices: 0,
        allyTurns: 0,
        blackjack: null,
    };
}

export function uwNormalizeState(raw) {
    const out = uwCreateState();
    if (!raw || typeof raw !== 'object') return out;
    out.skin = UW_SKINS.includes(raw.skin) ? raw.skin : 'auto';
    out.currency = String(raw.currency || (out.skin === 'tavern' ? '🪙' : '$')).slice(0, 8);
    out.cash = uwInt(raw.cash, 0, UW_MAX_CASH, 500);
    out.debt = uwInt(raw.debt, 0, UW_MAX_CASH, 0);
    out.turnsInDebt = uwInt(raw.turnsInDebt, 0, 999, 0);
    out.houseNet = uwInt(raw.houseNet, -UW_MAX_CASH, UW_MAX_CASH, 0);
    out.heat = uwClamp(raw.heat, 0, 5, 0);
    out.standing = uwInt(raw.standing, -100, 100, 0);
    out.turnsSinceEvent = uwInt(raw.turnsSinceEvent, 0, 999, 4);
    out.pendingWorldEvent = String(raw.pendingWorldEvent || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 320);
    out.eventKind = ['debt', 'heat', 'faction', 'wager', 'service'].includes(raw.eventKind) ? raw.eventKind : '';
    if (out.debt === 0) out.turnsInDebt = 0;
    out.calmTurns = uwInt(raw.calmTurns, 0, 2, 0);
    out.wagerCooldown = uwInt(raw.wagerCooldown, 0, 3, 0);
    out.collectorNotices = uwInt(raw.collectorNotices, 0, 999, 0);
    out.allyTurns = uwInt(raw.allyTurns, 0, 4, 0);
    out.blackjack = uwNormalizeBlackjack(raw.blackjack);
    const seen = new Set();
    out.collateral = Array.isArray(raw.collateral) ? raw.collateral.filter(item => item && typeof item === 'object').slice(0, UW_MAX_COLLATERAL).map((item, idx) => {
        const id = String(item.id || `pawn-${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `pawn-${idx + 1}`;
        if (seen.has(id)) return null;
        seen.add(id);
        const status = item.status === 'foreclosed' ? 'foreclosed' : 'pawned';
        return {
            id,
            kind: ['preset', 'inventory', 'custom'].includes(item.kind) ? item.kind : 'custom',
            presetKey: String(item.presetKey || '').slice(0, 40),
            label: String(item.label || '').replace(/[<>]/g, '').slice(0, 48),
            ...(item.kind === 'inventory' ? { inventoryLabel: String(item.inventoryLabel || item.label || '').slice(0, 80) } : {}),
            pawnValue: uwInt(item.pawnValue, 0, UW_MAX_CASH, 0),
            redeemCost: uwInt(item.redeemCost, 0, UW_MAX_CASH, 0),
            dueInTurns: uwInt(item.dueInTurns, 0, 999, 0),
            status,
        };
    }).filter(Boolean) : [];
    out.factions = Array.isArray(raw.factions) ? raw.factions.slice(0, 4).map((f, idx) => ({
        id: String(f?.id || `faction-${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `faction-${idx + 1}`,
        name: String(f?.name || 'Faction').replace(/[<>]/g, '').slice(0, 48),
        rep: uwInt(f?.rep, -100, 100, 0),
    })) : [];
    return out;
}

export function uwSafeCollateralLabel(value, { charName = '', userName = '', companions = [] } = {}) {
    const label = String(value ?? '').replace(/[<>()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!label || /https?:\/\//i.test(label)) return '';
    const blocked = /(?:^| )(?:people|persons?|humans?|children|child|kids?|bab(?:y|ies)|npc|slaves?|familiars?|companions?|characters?|человек\w*|люди|реб[её]н\S*|дете?й|дети|сын\S*|дочь\S*|персонаж\S*|раб\S*|спутник\S*)(?: |$)/iu;
    const lower = tnNormalize(label);
    const names = [charName, userName, ...companions.map(c => c?.name)].map(tnNormalize).filter(Boolean);
    if (blocked.test(lower) || names.some(name => ` ${lower} `.includes(` ${name} `))) return '';
    return label;
}

export const uwIsSafeCollateralLabel = uwSafeCollateralLabel;

function uwWager(state, bet) {
    const wager = Number(bet);
    return Number.isSafeInteger(wager) && wager > 0 && wager <= state?.cash ? wager : 0;
}

function uwSettle(state, delta) {
    const before = state.cash;
    state.cash = uwInt(before + delta, 0, UW_MAX_CASH, 0);
    state.houseNet = uwInt(state.houseNet + state.cash - before, -UW_MAX_CASH, UW_MAX_CASH, 0);
}

export function uwRollDice(state, { bet = 0, side = 'over', rng = uwDefaultRng } = {}) {
    const wager = uwWager(state, bet);
    if (!state || wager <= 0) return { ok: false, reason: 'invalid_bet', total: 0, dice: [], payout: 0 };
    const dice = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
    const total = dice[0] + dice[1];
    const normalized = ['over', 'under', 'seven', 'double'].includes(side) ? side : 'over';
    const win = normalized === 'over' ? total > 7 : normalized === 'under' ? total < 7 : normalized === 'seven' ? total === 7 : dice[0] === dice[1];
    const multiplier = normalized === 'seven' ? 4.5 : normalized === 'double' ? 5 : 2;
    const payout = win ? Math.floor(wager * multiplier) : 0;
    uwSettle(state, payout - wager);
    return { ok: true, dice, total, side: normalized, win, payout, net: payout - wager };
}

function uwNormalizeBlackjack(raw) {
    if (!raw || raw.status !== 'playing') return null;
    const lists = [raw.deck, raw.player, raw.dealer];
    if (lists.some(list => !Array.isArray(list)) || raw.player.length < 2 || raw.dealer.length !== 2) return null;
    const cards = lists.flat();
    if (cards.length !== 52 || new Set(cards).size !== 52 || cards.some(n => !Number.isInteger(n) || n < 0 || n > 51)) return null;
    if (!Number.isInteger(raw.wager) || raw.wager < 1 || raw.wager > UW_MAX_CASH) return null;
    return { wager: raw.wager, deck: [...raw.deck], player: [...raw.player], dealer: [...raw.dealer], status: 'playing' };
}

export function uwCardLabel(card) {
    return `${['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][card % 13]}${['♠', '♥', '♦', '♣'][Math.floor(card / 13)]}`;
}

function uwCardValue(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
        const rank = card % 13;
        if (rank === 0) { total += 11; aces += 1; }
        else total += Math.min(10, rank + 1);
    }
    return total - 10 * Math.min(aces, Math.max(0, Math.ceil((total - 21) / 10)));
}

export function uwHandTotal(cards) {
    if (!Array.isArray(cards) || !cards.length) return 0;
    return uwCardValue(cards);
}

function uwFinishBlackjack(state, session, status, payout) {
    const before = state.cash;
    state.cash = Math.min(UW_MAX_CASH, before + payout);
    const net = state.cash - before - session.wager;
    state.houseNet = uwInt(state.houseNet + net, -UW_MAX_CASH, UW_MAX_CASH, 0);
    session.status = status;
    state.blackjack = null;
    return { ok: true, session, status, payout, net, playerTotal: uwCardValue(session.player), dealerTotal: uwCardValue(session.dealer) };
}

export function uwStartBlackjack(state, { bet = 0, rng = uwDefaultRng } = {}) {
    const wager = uwWager(state, bet);
    if (!wager || state.blackjack) return { ok: false, reason: state?.blackjack ? 'active_hand' : 'invalid_bet' };
    const deck = Array.from({ length: 52 }, (_, index) => index);
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const session = { wager, deck, player: [deck.pop()], dealer: [deck.pop()], status: 'playing' };
    session.player.push(deck.pop());
    session.dealer.push(deck.pop());
    state.cash -= wager;
    const playerTotal = uwCardValue(session.player);
    const dealerTotal = uwCardValue(session.dealer);
    if (dealerTotal === 21) return uwFinishBlackjack(state, session, playerTotal === 21 ? 'push' : 'loss', playerTotal === 21 ? wager : 0);
    if (playerTotal === 21) return uwFinishBlackjack(state, session, 'blackjack', Math.floor(wager * 2.5));
    state.blackjack = session;
    return { ok: true, session, playerTotal, status: 'playing', payout: 0 };
}

export function uwBlackjackAction(state, session, action) {
    if (!state || !session || state.blackjack !== session || session.status !== 'playing') return { ok: false, reason: 'finished' };
    if (action === 'double' && (session.player.length !== 2 || session.wager > state.cash || session.wager * 2 > UW_MAX_CASH)) {
        return { ok: false, reason: 'insufficient_cash' };
    }
    if (action === 'hit' || action === 'double') {
        if (action === 'double') {
            state.cash -= session.wager;
            session.wager *= 2;
        }
        session.player.push(session.deck.pop());
        const playerTotal = uwCardValue(session.player);
        if (playerTotal > 21) return uwFinishBlackjack(state, session, 'bust', 0);
        if (action === 'hit' && playerTotal !== 21) return { ok: true, session, status: 'playing', playerTotal, payout: 0 };
    }
    while (uwCardValue(session.dealer) < 17) session.dealer.push(session.deck.pop());
    const playerTotal = uwCardValue(session.player);
    const dealerTotal = uwCardValue(session.dealer);
    const win = dealerTotal > 21 || playerTotal > dealerTotal;
    const push = dealerTotal === playerTotal;
    return uwFinishBlackjack(state, session, win ? 'win' : push ? 'push' : 'loss', win ? session.wager * 2 : push ? session.wager : 0);
}

const UW_SLOT_SYMBOLS = Object.freeze(['🍒', '🔔', '💎', '7️⃣', '🃏']);
const UW_SLOT_TRIPLES = Object.freeze([5, 6, 6, 40, 15]);

export function uwPlaySlots(state, { bet = 0, rng = uwDefaultRng } = {}) {
    const wager = uwWager(state, bet);
    if (!wager) return { ok: false, reason: 'invalid_bet' };
    const draws = Array.from({ length: 3 }, () => Math.floor(rng() * UW_SLOT_SYMBOLS.length));
    const counts = UW_SLOT_SYMBOLS.map((_, i) => draws.filter(draw => draw === i).length);
    const triple = counts.indexOf(3);
    const pair = counts.indexOf(2);
    // 5³ equiprobable draws: (72 from triples + 48 from stake-returning pairs) / 125 = 96%.
    const payout = wager * (triple >= 0 ? UW_SLOT_TRIPLES[triple] : pair >= 0 && pair !== 4 ? 1 : 0);
    uwSettle(state, payout - wager);
    return { ok: true, reels: draws.map(i => UW_SLOT_SYMBOLS[i]), payout, net: payout - wager, win: payout > wager };
}

export function uwStoryWager(state, stake, rng = uwDefaultRng) {
    const choice = { truth: 'answer one question honestly', wish: 'honor one fair wish', secret: 'reveal one guarded secret' };
    if (!Object.hasOwn(choice, stake) || state.wagerCooldown || state.pendingWorldEvent) return { ok: false, reason: 'busy_event' };
    const win = rng() < 0.5;
    const loser = win ? '{{char}}' : '{{user}}';
    const winner = win ? '{{user}}' : '{{char}}';
    uwSetPendingWorldEvent(state, `[Stakes won: ${loser} lost to ${winner} and should ${choice[stake]}.]`, { kind: 'wager' });
    state.wagerCooldown = 3;
    return { ok: true, win };
}

export function uwTakeLoan(state, amount) {
    const value = Number(amount);
    if (!state || !Number.isSafeInteger(value) || value <= 0 || state.debt + value > 5_000
        || state.cash + value > UW_MAX_CASH) return { ok: false, reason: 'invalid_amount' };
    state.cash += value;
    state.debt += value;
    return { ok: true, amount: value, debt: state.debt };
}

export function uwPawnCollateral(state, item, { skin = 'crime', charName = '', userName = '', companions = [] } = {}) {
    if (!state || state.collateral.length >= UW_MAX_COLLATERAL) return { ok: false, reason: 'limit' };
    const label = uwSafeCollateralLabel(item?.label, { charName, userName, companions });
    if (!label) return { ok: false, reason: 'unsafe_label' };
    const presetKey = UW_COLLATERAL_PRESETS[skin]?.includes(item?.presetKey) ? item.presetKey : '';
    const kind = item?.kind === 'inventory' ? 'inventory' : presetKey ? 'preset' : 'custom';
    if (state.collateral.some(entry => entry.presetKey && entry.presetKey === presetKey
        || entry.label.toLowerCase() === label.toLowerCase())) return { ok: false, reason: 'already_pawned' };
    const value = item?.pawnValue === undefined && presetKey ? UW_PRESET_VALUES[presetKey] : Number(item?.pawnValue);
    const loans = state.collateral.reduce((sum, entry) => sum + (entry.status === 'pawned' ? entry.pawnValue : 0), 0);
    if (!Number.isSafeInteger(value) || value < 1 || loans + value > 50_000
        || state.cash + value > UW_MAX_CASH || state.debt + value > UW_MAX_CASH) return { ok: false, reason: 'invalid_value' };
    const entry = {
        id: `pawn-${Date.now().toString(36)}-${Math.floor(uwDefaultRng() * 0xffffffff).toString(36)}`,
        kind,
        presetKey,
        label,
        ...(kind === 'inventory'
            ? { inventoryLabel: String(item.inventoryLabel || item.label || label).replace(/[<>]/g, '').trim().slice(0, 80) }
            : {}),
        pawnValue: value,
        redeemCost: Math.ceil(value * 1.15),
        dueInTurns: 6,
        status: 'pawned',
    };
    state.collateral.push(entry);
    state.cash += value;
    state.debt += value;
    return { ok: true, collateral: entry };
}

export function uwPawnInventoryItem(uwState, userInventory, itemLabel, pawnValue = 250, opts = {}) {
    if (pawnValue && typeof pawnValue === 'object') {
        opts = pawnValue;
        pawnValue = opts.pawnValue ?? 250;
    }
    if (!Array.isArray(userInventory)) return { ok: false, reason: 'not_in_inventory' };
    const needle = String(itemLabel ?? '').trim();
    if (!needle) return { ok: false, reason: 'not_in_inventory' };
    let invIdx = userInventory.findIndex(entry => String(entry ?? '').trim() === needle);
    if (invIdx < 0) {
        invIdx = userInventory.findIndex(entry => String(entry ?? '').trim().toLowerCase() === needle.toLowerCase());
    }
    if (invIdx < 0) return { ok: false, reason: 'not_in_inventory' };
    const exactLabel = String(userInventory[invIdx] ?? '').trim().slice(0, 80);
    const res = uwPawnCollateral(uwState, {
        kind: 'inventory',
        label: exactLabel,
        inventoryLabel: exactLabel,
        pawnValue,
    }, opts);
    if (!res.ok) return res;
    userInventory.splice(invIdx, 1);
    return res;
}

function uwDebtClosed(state) {
    state.turnsInDebt = 0;
    if (state.eventKind === 'debt') uwConsumeWorldEvent(state);
}

export function uwRedeemCollateral(state, id, userInventory) {
    const idx = state?.collateral.findIndex(item => item.id === String(id)) ?? -1;
    if (idx < 0) return { ok: false, reason: 'not_found' };
    const item = state.collateral[idx];
    const principal = Math.min(state.debt, item.pawnValue);
    const cost = item.redeemCost - item.pawnValue + principal;
    if (item.status !== 'pawned' || state.cash < cost) return { ok: false, reason: 'not_redeemable' };
    state.cash -= cost;
    state.debt -= principal;
    if (!state.debt) uwDebtClosed(state);
    state.collateral.splice(idx, 1);
    if (Array.isArray(userInventory) && item.kind === 'inventory') {
        const restored = String(item.inventoryLabel || item.label || '').trim().slice(0, 80);
        if (restored) userInventory.push(restored);
    }
    return { ok: true, item };
}

export function uwSetPendingWorldEvent(state, event, { kind = '', maxTokens = 25 } = {}) {
    if (!state || state.pendingWorldEvent) return false;
    const clean = String(event ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    const text = ctxPack({ worldEvent: clean, maxTokens }).depth0;
    if (!text) return false;
    state.pendingWorldEvent = text;
    state.eventKind = kind;
    return true;
}

export function uwConsumeWorldEvent(state) {
    state.pendingWorldEvent = '';
    state.eventKind = '';
}

export function uwOnTurnCommitted(state, { rng = uwDefaultRng, skin = 'crime', t = key => key } = {}) {
    if (!state) return [];
    const events = [];
    state.wagerCooldown = Math.max(0, state.wagerCooldown - 1);
    if (state.turnsSinceEvent < 4) state.turnsSinceEvent += 1;
    if (state.debt > 0) {
        const debtTurn = state.turnsInDebt + 1;
        state.turnsInDebt = Math.min(debtTurn, 999);
        if (debtTurn % 3 === 0) state.debt = Math.min(UW_MAX_CASH, Math.ceil(state.debt * 115 / 100));
        if (debtTurn <= 2 || debtTurn % 3 === 0) {
            state.collectorNotices = state.collectorNotices % 3 + 1;
            const author = t(`uw.collector.${skin}`);
            const text = t('uw.collectorNotice', { debt: state.debt, currency: state.currency });
            events.push({ kind: 'dm', author, text });
            if (state.collectorNotices === 3) events.push({
                kind: 'voice', author, text: t('uw.collectorVoice'),
                mediaPrompt: `Read in a stern, cold voice: ${text}`,
            });
        }
    }
    for (const item of state.collateral) {
        if (item.status !== 'pawned') continue;
        if (state.debt > 0) item.dueInTurns = Math.max(0, item.dueInTurns - 1);
        if (item.dueInTurns === 0) {
            item.status = 'foreclosed';
            state.debt = Math.max(0, state.debt - item.pawnValue);
            events.push({ kind: 'note', author: t('uw.pawn'), text: t('uw.foreclosure', { item: item.label }) });
        }
    }
    if (!state.debt) uwDebtClosed(state);
    if (state.debt > 0 && !state.pendingWorldEvent && state.turnsSinceEvent >= 4) {
        const turn = state.turnsInDebt;
        const event = turn >= 5
            ? (rng() < 0.45 ? '[World Event: debt enforcers confront {{user}} and demand immediate payment.]' : '')
            : turn >= 3 ? UW_WORLD_EVENTS[skin] : '';
        if (turn >= 5 || event) state.turnsSinceEvent = 0;
        if (event) uwSetPendingWorldEvent(state, event, { kind: 'debt' });
    }
    return events.slice(0, 2);
}

export function uwPayDebt(state, amount = Infinity) {
    const requested = amount === Infinity ? state?.debt : Number(amount);
    const paid = Math.min(state?.cash, state?.debt, requested);
    if (!Number.isSafeInteger(paid) || paid <= 0) return { ok: false, reason: 'invalid_amount' };
    state.cash -= paid;
    state.debt -= paid;
    if (!state.debt) uwDebtClosed(state);
    return { ok: true, paid, remaining: state.debt };
}

export function uwContextLine(state) {
    if (!state) return '';
    const continuity = uwContinuityLine(state);
    if (!continuity && !state.pendingWorldEvent) return '';
    const packed = ctxPack({ scene: continuity, worldEvent: state.pendingWorldEvent || '', maxTokens: 25 });
    return [packed.main, packed.depth0].filter(Boolean).join('\n');
}

// Compact single continuity line (<= 25 tokens) used by prompts/host adapters when
// pendingWorldEvent is placed at depth 0 separately (never duplicated in scene).
export function uwContinuityLine(state) {
    if (!state || typeof state !== 'object') return '';
    const debt = Math.round(Number(state.debt) || 0);
    const heat = Math.round(Math.max(0, Math.min(5, Number(state.heat) || 0)) * 4) / 4;
    const standing = Math.round(Number(state.standing) || 0);
    const factions = Array.isArray(state.factions) ? state.factions : [];
    const hostileObj = factions.find(f => f && Number(f.rep) <= -50 && String(f.name || '').trim());
    const friendly = standing >= 50 || factions.some(f => f && Number(f.rep) >= 60);
    if (debt <= 0 && heat <= 0 && Math.abs(standing) < 25 && !hostileObj && !friendly) return '';

    const cleanHostile = hostileObj
        ? String(hostileObj.name).replace(/[\r\n[\],;]+/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
    const build = (prefix, sep, maxHostileChars) => {
        const bits = [];
        if (debt > 0) bits.push(`debt ${debt}`);
        if (heat > 0) bits.push(`wanted ${Number(heat.toFixed(2))}★`);
        if (Math.abs(standing) >= 25) bits.push(`standing ${standing > 0 ? '+' : ''}${standing}`);
        if (cleanHostile) bits.push(`hostile faction ${cleanHostile.slice(0, maxHostileChars).trim()}`);
        if (friendly) bits.push('friendly NPCs');
        return prefix ? `[${prefix}: ${bits.join(sep)}]` : `[${bits.join(sep)}]`;
    };
    const layouts = [['Underworld', ', '], ['UW', ', '], ['', ',']];
    if (!cleanHostile) {
        for (const [prefix, sep] of layouts) {
            const line = build(prefix, sep, 0);
            if (tnEstimateTokens(line) <= 25) return line;
        }
        return build('', ',', 0);
    }
    const fullCap = Math.min(28, cleanHostile.length);
    for (const [prefix, sep] of layouts) {
        const fullLine = build(prefix, sep, fullCap);
        if (tnEstimateTokens(fullLine) <= 25) return fullLine;
    }
    for (let cap = fullCap - 1; cap >= 3; cap -= 1) {
        for (const [prefix, sep] of layouts) {
            const line = build(prefix, sep, cap);
            if (tnEstimateTokens(line) <= 25) return line;
        }
    }
    return build('', ',', 3);
}
