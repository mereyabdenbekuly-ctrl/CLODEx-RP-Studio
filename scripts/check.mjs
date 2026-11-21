// Strict validation & localization audit for BOTH SillyTavern 1.19+ and Tavo AI (.tpg Manifest v2)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { RLS_CLIENT_VERSION } from '../src/core/release.js';
import { findBundleCollisions, resolveBundleFiles, TAVO_BUNDLES } from './bundles.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function walkJsFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (['dist', 'node_modules', '.git'].includes(entry.name)) continue;
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) out.push(...await walkJsFiles(full));
        else if (/\.(mjs|js)$/.test(entry.name)) out.push(full);
    }
    return out;
}

function graphemeLen(text) {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return [...seg.segment(String(text))].length;
}

function assertSingleLine(text, label, maxLen) {
    assert.ok(typeof text === 'string' && text.trim().length > 0, `${label} must be non-empty`);
    assert.ok(!/[\r\n]/.test(text), `${label} must be single-line`);
    const len = graphemeLen(text);
    assert.ok(len >= 1 && len <= maxLen, `${label} length ${len} exceeds max ${maxLen}`);
}

function readZipEntries(buffer) {
    const entries = [];
    let offset = 0;
    while (offset + 4 <= buffer.length) {
        const sig = buffer.readUInt32LE(offset);
        if (sig !== 0x04034b50) break;
        const compSize = buffer.readUInt32LE(offset + 18);
        const nameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
        entries.push(name);
        offset += 30 + nameLen + extraLen + compSize;
    }
    return entries;
}

function verifyPng(buf, label) {
    assert.ok(buf.length > 24 && buf.length <= 256 * 1024, `${label} size out of bounds`);
    assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${label} invalid PNG signature`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.ok(width <= 512 && height <= 512, `${label} dimensions ${width}x${height} exceed 512x512`);
}

// 1. Check JS syntax across entire tree
const jsFiles = await walkJsFiles(root);
for (const file of jsFiles) {
    const res = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (res.status !== 0) process.exit(res.status || 1);
}

// 2. Validate SillyTavern manifest, version parity & i18n keys
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const stManifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(stManifest.version, pkg.version, 'ST manifest version must match package.json');
assert.equal(RLS_CLIENT_VERSION, pkg.version, 'RLS_CLIENT_VERSION must match package.json');
for (const rel of [stManifest.js, stManifest.css, 'settings.html', ...Object.values(stManifest.i18n)]) {
    await readFile(resolve(root, rel));
}

const stEn = JSON.parse(await readFile(resolve(root, 'i18n/en-us.json'), 'utf8'));
const stRu = JSON.parse(await readFile(resolve(root, 'i18n/ru-ru.json'), 'utf8'));
assert.deepEqual(Object.keys(stEn).sort(), Object.keys(stRu).sort(), 'SillyTavern EN/RU keys must match');
assert.ok(Object.keys(stEn).every(k => k.startsWith('clodex_rp.')), 'ST keys must be namespaced with clodex_rp.');

const uiSourceFiles = ['src/core/hud.js', 'src/tavo/turn.src.js'];
try {
    for (const entry of await readdir(resolve(root, 'src/core/views'))) {
        if (entry.endsWith('.js')) uiSourceFiles.push(`src/core/views/${entry}`);
    }
} catch {
    // views directory is optional
}
const hudSource = (await Promise.all(uiSourceFiles.map(rel => readFile(resolve(root, rel), 'utf8')))).join('\n');
const settingsHtml = await readFile(resolve(root, 'settings.html'), 'utf8');
const literalKeys = [
    ...[...hudSource.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map(m => m[1]),
    ...[...settingsHtml.matchAll(/data-clodex-rp-i18n="([^"]+)"/g)].map(m => m[1]),
];
for (const key of literalKeys) {
    assert.ok(stEn[`clodex_rp.${key}`], `Missing EN translation for runtime key: ${key}`);
    assert.ok(stRu[`clodex_rp.${key}`], `Missing RU translation for runtime key: ${key}`);
}

// 3. Validate Tavo Manifest v2, localization catalogs, limits & classic JS constraints
const tavoManifest = JSON.parse(await readFile(resolve(root, 'tavo/manifest.json'), 'utf8'));
assert.equal(tavoManifest.specVersion, 2);
assert.equal(tavoManifest.version, pkg.version);
assert.match(tavoManifest.id, /^[a-z0-9._-]+$/);
assert.match(tavoManifest.version, /^\d+\.\d+\.\d+$/);
assert.match(tavoManifest.minAppVersion, /^\d+\.\d+\.\d+$/);
assertSingleLine(tavoManifest.author, 'tavo manifest.author', 32);
assert.equal(tavoManifest.localization.defaultLocale, 'en');

const tavoEn = JSON.parse(await readFile(resolve(root, 'tavo/locales/en.json'), 'utf8'));
const tavoRu = JSON.parse(await readFile(resolve(root, 'tavo/locales/ru.json'), 'utf8'));
assert.deepEqual(Object.keys(tavoEn).sort(), Object.keys(tavoRu).sort(), 'Tavo EN/RU locale keys must match');
for (const key of literalKeys) {
    assert.ok(tavoEn[key], `Missing Tavo EN translation for runtime key: ${key}`);
    assert.ok(tavoRu[key], `Missing Tavo RU translation for runtime key: ${key}`);
}
assert.ok(
    (tavoManifest.contributes.sidebar ?? []).some(item => item.id === 'open-cradle'),
    'Tavo manifest must declare open-cradle sidebar action',
);
assert.ok(
    (tavoManifest.contributes.sidebar ?? []).some(item => item.id === 'open-phone' && item.label?.$t === 'actions.openPhone'),
    'Tavo manifest must declare open-phone sidebar action labelled actions.openPhone',
);
assert.ok(tavoManifest.releaseNotes?.$t === `releaseNotes.${pkg.version.replace(/\./g, '_')}`,
    `Tavo releaseNotes must reference releaseNotes.${pkg.version.replace(/\./g, '_')}`);

// htmlFragments: unique ids, existing files, script tags must point at packaged bundles
const REQUIRED_FRAGMENTS = [
    { src: 'ui/hud.html', mount: '/chat/body/end', script: 'ui/hud.js' },
    { src: 'ui/turn.html', mount: '/messages/end?role=character&position=last', script: 'ui/turn.js' },
];
const fragments = tavoManifest.contributes.htmlFragments ?? [];
assert.equal(new Set(fragments.map(f => f.id)).size, fragments.length, 'htmlFragments ids must be unique');
for (const frag of fragments) {
    assert.match(frag.id, /^[a-z0-9-]+$/, `htmlFragment id ${frag.id} invalid`);
    assert.ok(/^ui\/[a-z0-9_-]+\.html$/.test(frag.src), `htmlFragment ${frag.id} src must be ui/<name>.html`);
    assert.ok(typeof frag.mount === 'string' && frag.mount.startsWith('/'), `htmlFragment ${frag.id} mount must be a route`);
}
for (const req of REQUIRED_FRAGMENTS) {
    const frag = fragments.find(f => f.src === req.src);
    assert.ok(frag, `Tavo manifest must declare htmlFragment ${req.src}`);
    assert.equal(frag.mount, req.mount, `${req.src} must mount on ${req.mount}`);
    const html = await readFile(resolve(root, 'tavo', req.src), 'utf8');
    assert.ok(html.includes(`/plugins/${tavoManifest.id}/${req.script}`), `${req.src} must load /plugins/${tavoManifest.id}/${req.script}`);
    assert.ok(!/\son\w+\s*=/i.test(html), `${req.src} must not use inline event handlers`);
    const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
    const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1].trim());
    assert.equal(inlineScripts.length, 0, `${req.src} must not contain inline scripts`);
    for (const src of scriptSrcs) {
        const relPath = src.replace(`/plugins/${tavoManifest.id}/`, '');
        await readFile(resolve(root, 'tavo', relPath));
    }
}

for (const [lang, catalog] of [['en', tavoEn], ['ru', tavoRu]]) {
    const resolveRef = val => (val && typeof val === 'object' && '$t' in val ? catalog[val.$t] : val);
    assertSingleLine(resolveRef(tavoManifest.name), `${lang}:name`, 64);
    const desc = resolveRef(tavoManifest.description);
    assert.ok(typeof desc === 'string' && graphemeLen(desc) >= 200 && graphemeLen(desc) <= 10_000, `${lang}:description must be 200..10000 chars`);
    const notes = resolveRef(tavoManifest.releaseNotes);
    assert.ok(typeof notes === 'string' && graphemeLen(notes) >= 1 && graphemeLen(notes) <= 5_000, `${lang}:releaseNotes invalid`);

    for (const group of ['inputActions', 'sidebar', 'lastMessageActions']) {
        for (const item of tavoManifest.contributes[group] ?? []) {
            assertSingleLine(resolveRef(item.label), `${lang}:${group}.${item.id}`, 48);
        }
    }
    for (const field of tavoManifest.contributes.settings.schema) {
        if (field.label) assertSingleLine(resolveRef(field.label), `${lang}:settings.${field.key || field.type}.label`, 80);
        if (field.description) {
            const d = resolveRef(field.description);
            assert.ok(typeof d === 'string' && graphemeLen(d) <= 500, `${lang}:settings.${field.key}.description > 500`);
        }
        if (field.type === 'info') {
            const txt = resolveRef(field.text);
            assert.ok(typeof txt === 'string' && graphemeLen(txt) <= 500, `${lang}:settings.info > 500`);
        }
    }
}

// Bundler collision gate (spec 10.8): top-level names (function, async function,
// class, const, let, var) must be unique across every file flattened into a bundle.
for (const { out, entry } of TAVO_BUNDLES) {
    const files = await resolveBundleFiles(root, entry);
    const collisions = await findBundleCollisions(root, files);
    assert.equal(
        collisions.length,
        0,
        `Top-level name collisions in ${out}:\n${collisions.map(c => `  ${c.name}: ${c.files.join(' & ')}`).join('\n')}`,
    );
    const code = await readFile(resolve(root, out), 'utf8');
    for (const rel of files) {
        assert.ok(code.includes(`// --- ${rel} ---`), `${out} is stale: missing ${rel} (run npm run package)`);
    }
}

// Verify Tavo classic JS bundles have NO ESM syntax, NO window.tavo/globalThis.tavo, NO navigator.language
for (const { out: rel } of TAVO_BUNDLES) {
    const code = await readFile(resolve(root, rel), 'utf8');
    new vm.Script(code, { filename: rel });
    assert.ok(!/^\s*(import|export)\s/m.test(code), `${rel} must not contain ES module syntax`);
    assert.ok(!/\b(window|globalThis)\.tavo\b/.test(code), `${rel} must not access window.tavo or globalThis.tavo`);
    assert.ok(!/\bnavigator\.language\b/.test(code), `${rel} must not read navigator.language`);
}

// Verify PNG icons & cover
for (const pngRel of ['tavo/cover.png', 'tavo/icons/studio.png', 'tavo/icons/codex.png', 'tavo/icons/voice.png']) {
    verifyPng(await readFile(resolve(root, pngRel)), pngRel);
}

// 4. Verify packaged .tpg and .zip archives
const tpgBuf = await readFile(resolve(root, 'dist', `CLODEx-RP-Studio-${pkg.version}.tpg`));
const tpgEntries = readZipEntries(tpgBuf);
assert.ok(tpgEntries.includes('manifest.json'), '.tpg must contain manifest.json at archive root');
assert.ok(tpgEntries.includes('entry.js'), '.tpg must contain entry.js at archive root');
assert.ok(tpgEntries.includes('ui/hud.html') && tpgEntries.includes('ui/hud.js'), '.tpg must contain HUD fragment');
assert.ok(tpgEntries.includes('ui/turn.html') && tpgEntries.includes('ui/turn.js'), '.tpg must contain turn fragment');
for (const frag of tavoManifest.contributes.htmlFragments ?? []) {
    assert.ok(tpgEntries.includes(frag.src), `.tpg must contain ${frag.src}`);
}
assert.ok(tpgEntries.every(e => !e.includes('\\') && !e.startsWith('/') && !e.includes('..')), '.tpg paths must be clean');

const zipBuf = await readFile(resolve(root, 'dist', `CLODEx-RP-Studio-SillyTavern-${pkg.version}.zip`));
const zipEntries = readZipEntries(zipBuf);
assert.ok(zipEntries.includes('CLODEx-RP-Studio/manifest.json'), 'ST zip must include CLODEx-RP-Studio/manifest.json');
assert.ok(zipEntries.includes('CLODEx-RP-Studio/src/core/companion.js'), 'ST zip must include CLODEx-RP-Studio/src/core/companion.js');
for (const rel of await resolveBundleFiles(root, 'src/st/adapter.js')) {
    assert.ok(zipEntries.includes(`CLODEx-RP-Studio/${rel}`), `ST zip must include every adapter dependency: ${rel}`);
}

console.log(`Audit OK: ${jsFiles.length} JS files, ${Object.keys(tavoEn).length} RU/EN keys, Tavo Manifest v2 (.tpg) & SillyTavern (.zip) verified.`);
