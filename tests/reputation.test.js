import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { resolveBundleFiles } from '../scripts/bundles.mjs';
import { createChatState } from '../src/core/physiology.js';
import { buildSystemContext } from '../src/core/prompts.js';
import { repApplyWorldDelta, repCoolHeat, repNormalizeState } from '../src/core/reputation.js';
import { tnEstimateTokens } from '../src/core/textnorm.js';
import { uwContinuityLine } from '../src/core/underworld.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('reputation heat preserves quarter-star deltas', () => {
    const state = { heat: 1, standing: 0, factions: [], turnsSinceEvent: 0 };
    repApplyWorldDelta(state, { heatDelta: -0.25 });
    assert.equal(state.heat, 0.75);
    repNormalizeState(state);
    assert.equal(state.heat, 0.75);
});

test('shared underworld/reputation turn counter can cool without a second tick', () => {
    const state = { heat: 1, standing: 0, factions: [], turnsSinceEvent: 3 };
    repCoolHeat(state, { calmTurn: true, advanceTurn: false });
    assert.equal(state.turnsSinceEvent, 3);
    assert.equal(state.heat, 0.75);
    repCoolHeat(state, { calmTurn: true });
    assert.equal(state.turnsSinceEvent, 4);
});

test('buildSystemContext emits a single combined continuity line (<= 25 tokens) in both ESM and flat Tavo IIFE', async () => {
    const state = createChatState('2026-11-20');
    state.underworld.debt = 2400;
    state.underworld.heat = 2.75;
    state.underworld.standing = 55;
    state.underworld.factions = [
        { id: 'f1', name: 'Корпоративная СБ', rep: -65 },
        { id: 'f2', name: 'Сопротивление', rep: 70 },
    ];

    const line = uwContinuityLine(state.underworld);
    assert.ok(tnEstimateTokens(line) <= 25, `Expected <= 25 tokens, got ${tnEstimateTokens(line)}: ${line}`);
    assert.match(line, /debt 2400/);
    assert.match(line, /wanted 2\.75★/);
    assert.match(line, /standing \+55/);
    assert.match(line, /hostile faction Корпорат/);
    assert.match(line, /friendly NPCs/);

    const sysCtx = buildSystemContext(state, { userName: 'Dante', charName: 'Vergil' });
    const continuityLines = sysCtx.split('\n').filter(l => /^\[(Underworld|UW|Reputation|debt )/.test(l));
    assert.equal(continuityLines.length, 1, `Expected exactly 1 continuity line, got: ${JSON.stringify(continuityLines)}`);
    assert.equal(continuityLines[0], line);

    // Standing below threshold (< 25) is omitted while faction friendliness (>= 60) still triggers friendly NPCs
    state.underworld.debt = 0;
    state.underworld.heat = 0;
    state.underworld.standing = 10;
    state.underworld.factions = [{ id: 'f2', name: 'Гильдия', rep: 65 }];
    const friendlyOnly = uwContinuityLine(state.underworld);
    assert.equal(friendlyOnly, '[Underworld: friendly NPCs]');

    // Flat classic-IIFE bundle simulation (imports stripped like scripts/package.mjs)
    const entryFiles = (await resolveBundleFiles(root, 'src/core/prompts.js'));
    const strippedParts = [];
    for (const rel of entryFiles) {
        const src = await readFile(resolve(root, rel), 'utf8');
        assert.ok(!/\bimport\s*\{[^}]*\bas\b/.test(src), `${rel} must not use import { ... as ... } aliases`);
        strippedParts.push(
            src
                .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
                .replace(/^\s*export\s+(async\s+function|function|class|const|let)\s+/gm, '$1 '),
        );
    }
    const iife = `(function () {\n'use strict';\n${strippedParts.join('\n\n')}\nreturn { buildSystemContext, createChatState };\n})();`;
    const bundle = new vm.Script(iife).runInNewContext({
        structuredClone, Math, Number, String, Boolean, Array, Object, Date, RegExp, JSON, Set, Map, Uint8Array,
    });
    const st = bundle.createChatState('2026-11-20');
    st.underworld.debt = 900;
    st.underworld.heat = 1.5;
    st.underworld.standing = -40;
    st.underworld.factions = [{ id: 'f1', name: 'Syndicate', rep: -70 }];
    const bundledCtx = bundle.buildSystemContext(st);
    const bundledLines = bundledCtx.split('\n').filter(l => /^\[(Underworld|UW|Reputation)/.test(l));
    assert.equal(bundledLines.length, 1);
    assert.match(bundledLines[0], /debt 900.*wanted 1\.5★.*standing -40.*hostile faction Syndicate/);
});
