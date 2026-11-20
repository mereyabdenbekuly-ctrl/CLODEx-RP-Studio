// Dependency-free builder & packager for CLODEx RP Studio:
// 1) Syncs SillyTavern (i18n/*.json) and Tavo v2 (tavo/locales/*.json) catalogs from src/core/localesData.js
// 2) Generates crisp PNG icon & cover assets for Tavo
// 3) Bundles classic IIFE scripts for Tavo (entry.js, ui/hud.js & ui/turn.js) where ESM is unsupported.
//    Files are ordered topologically from each entry's import graph (scripts/bundles.mjs).
// 4) Emits dist/CLODEx-RP-Studio-<version>.tpg and dist/CLODEx-RP-Studio-SillyTavern-<version>.zip
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { EN_CATALOG, RU_CATALOG } from '../src/core/localesData.js';
import { relNormalizePublicJwk } from '../src/core/relic.js';
import { findBundleCollisions, resolveBundleFiles, TAVO_BUNDLES } from './bundles.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const relicKeySetting = process.env.CLODEX_RP_RELIC_PUBLIC_JWK;
const relicPublicKey = relicKeySetting ? relNormalizePublicJwk(JSON.parse(relicKeySetting)) : null;
if (relicKeySetting) {
    if (!relicPublicKey) throw new Error('CLODEX_RP_RELIC_PUBLIC_JWK must be an ES256 public JWK.');
    await webcrypto.subtle.importKey('jwk', relicPublicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

function packageRpSource(relativePath, source) {
    if (relativePath !== 'src/core/relic.js') return source;
    const marker = '/* rel:public-key */ null';
    if (!source.includes(marker)) throw new Error('Missing RP Relic public-key marker.');
    return source.replace(marker, relicPublicKey ? `Object.freeze(${JSON.stringify(relicPublicKey)})` : 'null');
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generateBadgePng(width, height, accentRgb = [245, 158, 11], secondaryRgb = [139, 92, 246]) {
    const stride = width * 4 + 1;
    const raw = Buffer.alloc(stride * height);
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const radius = Math.min(width, height) * 0.44;
    const ringInner = radius * 0.62;

    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * stride;
        raw[rowOffset] = 0; // filter: None
        for (let x = 0; x < width; x += 1) {
            const px = rowOffset + 1 + x * 4;
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.hypot(dx, dy);
            const t = (x + y) / (width + height);

            // Dark rounded square background
            const maxAxis = Math.max(Math.abs(dx) / (width / 2), Math.abs(dy) / (height / 2));
            if (maxAxis > 0.94 && dist > radius * 1.18) {
                raw[px] = 0; raw[px + 1] = 0; raw[px + 2] = 0; raw[px + 3] = 0;
                continue;
            }

            let r = 16, g = 20, b = 32, a = 255;
            if (dist <= radius && dist >= ringInner) {
                r = Math.round(accentRgb[0] * (1 - t) + secondaryRgb[0] * t);
                g = Math.round(accentRgb[1] * (1 - t) + secondaryRgb[1] * t);
                b = Math.round(accentRgb[2] * (1 - t) + secondaryRgb[2] * t);
            } else if (Math.abs(dx) < width * 0.055 && Math.abs(dy) < radius * 0.48
                || Math.abs(dy) < height * 0.055 && Math.abs(dx) < radius * 0.48) {
                // Subtle center star/cross motif
                r = 253; g = 230; b = 138;
            }
            raw[px] = r;
            raw[px + 1] = g;
            raw[px + 2] = b;
            raw[px + 3] = a;
        }
    }

    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const idat = deflateSync(raw, { level: 9 });
    return Buffer.concat([
        sig,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

async function bundleClassicIife(entryRelativePaths) {
    const collisions = await findBundleCollisions(root, entryRelativePaths);
    if (collisions.length) {
        const lines = collisions.map(c => `  ${c.name}: ${c.files.join(' & ')}`).join('\n');
        throw new Error(`Top-level name collision in Tavo bundle ${entryRelativePaths.at(-1)}:\n${lines}`);
    }
    const parts = [];
    for (const rel of entryRelativePaths) {
        const src = packageRpSource(rel, await readFile(resolve(root, rel), 'utf8'));
        const stripped = src
            .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
            .replace(/^\s*export\s+(async\s+function|function|class|const|let)\s+/gm, '$1 ');
        if (/^\s*export\s/m.test(stripped)) {
            throw new Error(`${rel}: unsupported export form (only export function/const/let/class/async function)`);
        }
        parts.push(`// --- ${rel} ---\n${stripped.trim()}`);
    }
    const iife = `/* Generated by CLODEx RP Studio packager — Classic JS for Tavo Plugin Runtime */\n(function () {\n'use strict';\n\n${parts.join('\n\n')}\n\n})();\n`;
    // Validate classic JS syntax immediately (rejects stray import/export or syntax errors)
    new vm.Script(iife, { filename: entryRelativePaths.at(-1) });
    return iife;
}

function buildZipArchive(entries) {
    const local = [];
    const central = [];
    let offset = 0;

    for (const { archivePath, data } of entries) {
        if (archivePath.includes('\\') || archivePath.startsWith('/') || archivePath.includes('..')) {
            throw new Error(`Unsafe archive path: ${archivePath}`);
        }
        const name = Buffer.from(archivePath, 'utf8');
        const crc = crc32(data);

        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x800, 6); // UTF-8 filename flag
        header.writeUInt16LE(0, 8);     // STORE
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(33, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(data.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(name.length, 26);
        local.push(header, name, data);

        const dir = Buffer.alloc(46);
        dir.writeUInt32LE(0x02014b50, 0);
        dir.writeUInt16LE(20, 4);
        dir.writeUInt16LE(20, 6);
        dir.writeUInt16LE(0x800, 8);
        dir.writeUInt16LE(0, 10);
        dir.writeUInt16LE(0, 12);
        dir.writeUInt16LE(33, 14);
        dir.writeUInt32LE(crc, 16);
        dir.writeUInt32LE(data.length, 20);
        dir.writeUInt32LE(data.length, 24);
        dir.writeUInt16LE(name.length, 28);
        dir.writeUInt32LE(offset, 42);
        central.push(dir, name);

        offset += header.length + name.length + data.length;
    }

    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...local, centralBuf, end]);
}

async function writeWithDir(targetPath, content) {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
}

// 1. Sync SillyTavern & Tavo locale JSON files from single source of truth
const stEn = Object.fromEntries(Object.entries(EN_CATALOG).map(([k, v]) => [`clodex_rp.${k}`, v]));
const stRu = Object.fromEntries(Object.entries(RU_CATALOG).map(([k, v]) => [`clodex_rp.${k}`, v]));

await writeWithDir(resolve(root, 'i18n/en-us.json'), `${JSON.stringify(stEn, null, 2)}\n`);
await writeWithDir(resolve(root, 'i18n/ru-ru.json'), `${JSON.stringify(stRu, null, 2)}\n`);
await writeWithDir(resolve(root, 'tavo/locales/en.json'), `${JSON.stringify(EN_CATALOG, null, 2)}\n`);
await writeWithDir(resolve(root, 'tavo/locales/ru.json'), `${JSON.stringify(RU_CATALOG, null, 2)}\n`);

// 2. Generate Tavo PNG assets (64x64 icons + 256x256 cover)
await writeWithDir(resolve(root, 'tavo/icons/studio.png'), generateBadgePng(64, 64, [245, 158, 11], [139, 92, 246]));
await writeWithDir(resolve(root, 'tavo/icons/codex.png'), generateBadgePng(64, 64, [16, 185, 129], [59, 130, 246]));
await writeWithDir(resolve(root, 'tavo/icons/voice.png'), generateBadgePng(64, 64, [236, 72, 153], [245, 158, 11]));
await writeWithDir(resolve(root, 'tavo/cover.png'), generateBadgePng(256, 256, [245, 158, 11], [139, 92, 246]));

// 3. Bundle Tavo classic JS files & copy CSS
const bundleFiles = {};
for (const { out, entry } of TAVO_BUNDLES) {
    const files = await resolveBundleFiles(root, entry);
    bundleFiles[out] = files;
    await writeWithDir(resolve(root, out), await bundleClassicIife(files));
}
const sharedCss = await readFile(resolve(root, 'style.css'));

await writeWithDir(resolve(root, 'tavo/ui/hud.css'), sharedCss);

// 4. Package Tavo .tpg (manifest.json MUST be at archive root!)
const tavoFiles = [
    'manifest.json',
    'entry.js',
    'cover.png',
    'icons/studio.png',
    'icons/codex.png',
    'icons/voice.png',
    'locales/en.json',
    'locales/ru.json',
    'ui/hud.html',
    'ui/hud.css',
    'ui/hud.js',
    'ui/turn.html',
    'ui/turn.js',
];
const tavoEntries = [];
for (const rel of tavoFiles) {
    tavoEntries.push({
        archivePath: rel,
        data: await readFile(resolve(root, 'tavo', rel)),
    });
}
const tavoManifest = JSON.parse(await readFile(resolve(root, 'tavo/manifest.json'), 'utf8'));
await mkdir(resolve(root, 'dist'), { recursive: true });
const tpgPath = resolve(root, 'dist', `CLODEx-RP-Studio-${tavoManifest.version}.tpg`);
await writeFile(tpgPath, buildZipArchive(tavoEntries));

// 5. Package SillyTavern .zip
// SillyTavern loads native ES modules: ship every module reachable from the
// adapter (same import graph as the Tavo bundles) plus the locale source.
const stModuleFiles = new Set(await resolveBundleFiles(root, 'src/st/adapter.js'));
stModuleFiles.add('src/core/localesData.js');
const stFiles = [
    'manifest.json',
    'index.js',
    'settings.html',
    'style.css',
    'README.md',
    'README.en.md',
    'LICENSE',
    'CHANGELOG.md',
    'i18n/en-us.json',
    'i18n/ru-ru.json',
    ...[...stModuleFiles].sort(),
];
const stEntries = [];
for (const rel of stFiles) {
    stEntries.push({
        archivePath: `CLODEx-RP-Studio/${rel}`,
        data: Buffer.from(packageRpSource(rel, await readFile(resolve(root, rel), 'utf8'))),
    });
}
const stManifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const stZipPath = resolve(root, 'dist', `CLODEx-RP-Studio-SillyTavern-${stManifest.version}.zip`);
await writeFile(stZipPath, buildZipArchive(stEntries));

console.log(`Built Tavo package:       ${tpgPath}`);
console.log(`Built SillyTavern ZIP:    ${stZipPath}`);
for (const [out, files] of Object.entries(bundleFiles)) {
    console.log(`  ${out}: ${files.length} modules`);
}
