// Single context assembler for the roleplay model (v1.3, spec 10.3 / 11).
// Modules hand over RAW strings; only ctxPack trims them, by priority (first = cut last):
//   slop -> wiki -> scene -> worldEvent -> director.
// Output: `depth0` (director + world event + anti-slop, very end of context) and `main` (scene + wiki, after the main prompt),
// sharing one budget (default 250 tokens estimated with tnEstimateTokens).
//
// Flat-bundler safe: every top-level name is ctx*-prefixed; only `export function` / `export const`.
import { tnEstimateTokens } from './textnorm.js';

export const CTX_MAX_TOKENS = 250;
const CTX_SLOP_MIN_PHRASES = 3;
const CTX_ELLIPSIS = '…';

function ctxClean(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function ctxJoin(a, b) {
    if (a && b) return `${a}\n${b}`;
    return a || b || '';
}

function ctxTokens(text) {
    return text ? tnEstimateTokens(text) : 0;
}

// «…» quoted phrases → keep only the first `keep`; otherwise fall back to the last ': a, b, c' list.
function ctxShrinkSlop(rule, keep) {
    const quoted = rule.match(/«[^«»]*»/g);
    if (quoted && quoted.length > keep) {
        const head = rule.slice(0, rule.indexOf('«')).replace(/\s+$/, '');
        return `${head} ${quoted.slice(0, keep).join(', ')}.`;
    }
    if (quoted) return rule;
    const colon = rule.lastIndexOf(':');
    if (colon === -1) return rule;
    const items = rule.slice(colon + 1).replace(/[.\s]+$/, '').split(',').map(s => s.trim()).filter(Boolean);
    if (items.length <= keep) return rule;
    return `${rule.slice(0, colon + 1)} ${items.slice(0, keep).join(', ')}.`;
}

function ctxIsHeader(line) {
    return /^\s*\[[^\]]*\]:?\s*$/.test(line);
}

// Longest prefix (preferring a word boundary) such that fits(prefix + '…') holds; '' when nothing fits.
function ctxTruncateToFit(text, fits) {
    if (!text) return '';
    if (fits(text)) return text;
    let lo = 0;
    let hi = text.length - 1;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(`${text.slice(0, mid).trimEnd()}${CTX_ELLIPSIS}`)) lo = mid;
        else hi = mid - 1;
    }
    if (lo <= 0) return '';
    let cut = text.slice(0, lo);
    const space = cut.search(/\s\S*$/);
    if (space > 0 && lo - space <= 24) cut = cut.slice(0, space);
    cut = cut.trimEnd();
    return cut ? `${cut}${CTX_ELLIPSIS}` : '';
}

export function ctxPack({ director = '', worldEvent = '', scene = '', wiki = '', slop = '', maxTokens = CTX_MAX_TOKENS } = {}) {
    const budget = Number.isFinite(Number(maxTokens)) ? Math.max(0, Math.floor(Number(maxTokens))) : CTX_MAX_TOKENS;
    const parts = {
        director: ctxClean(director),
        worldEvent: ctxClean(worldEvent),
        scene: ctxClean(scene),
        wiki: ctxClean(wiki),
        slop: ctxClean(slop),
    };

    const measure = p => ctxTokens(ctxJoin(ctxJoin(p.director, p.worldEvent), p.slop)) + ctxTokens(ctxJoin(p.scene, p.wiki));
    const fits = p => measure(p) <= budget;

    // 4. Anti-slop: shrink to 3 phrases, then drop entirely.
    if (!fits(parts) && parts.slop) {
        parts.slop = ctxShrinkSlop(parts.slop, CTX_SLOP_MIN_PHRASES);
        if (!fits(parts)) parts.slop = '';
    }

    // 3. Wiki: drop relevant rows from the end of the list.
    if (!fits(parts) && parts.wiki) {
        const lines = parts.wiki.split('\n');
        while (lines.length && !fits({ ...parts, wiki: lines.join('\n').trim() })) lines.pop();
        const rest = lines.filter(l => l.trim());
        parts.wiki = rest.length && !rest.every(ctxIsHeader) ? lines.join('\n').trim() : '';
    }

    // 2. Scene: drop trailing lines (keep at least one), then truncate characters.
    if (!fits(parts) && parts.scene) {
        const lines = parts.scene.split('\n');
        while (lines.length > 1 && !fits({ ...parts, scene: lines.join('\n').trim() })) lines.pop();
        parts.scene = lines.join('\n').trim();
        if (!fits(parts)) parts.scene = ctxTruncateToFit(parts.scene, s => fits({ ...parts, scene: s }));
    }

    // 2.5. World events are depth-0 safety rails: trim them only after the
    // scene/wiki have yielded, and never let a long event evict the director.
    if (!fits(parts) && parts.worldEvent) {
        parts.worldEvent = ctxTruncateToFit(parts.worldEvent, event => fits({ ...parts, worldEvent: event }));
        if (!fits(parts)) parts.worldEvent = '';
    }

    // 1. Director: cut only if it alone exceeds the whole budget.
    if (!fits(parts) && parts.director) {
        parts.director = ctxTruncateToFit(parts.director, d => fits({ ...parts, director: d }));
    }

    const depth0 = ctxJoin(ctxJoin(parts.director, parts.worldEvent), parts.slop);
    const main = ctxJoin(parts.scene, parts.wiki);
    const tokenStats = {
        director: ctxTokens(parts.director),
        scene: ctxTokens(parts.scene),
        wiki: ctxTokens(parts.wiki),
        slop: ctxTokens(parts.slop),
        total: ctxTokens(depth0) + ctxTokens(main),
    };
    // Keep the v1.3 object shape byte-for-byte for callers that did not opt in
    // to world events, while exposing the new diagnostic when it is used.
    if (parts.worldEvent) tokenStats.worldEvent = ctxTokens(parts.worldEvent);
    return {
        depth0,
        main,
        tokens: tokenStats,
    };
}
