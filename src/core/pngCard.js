// Pure Web-standard (Uint8Array / DataView) PNG Character Card V2 chunk injector & reader.
// Works identically in Node.js 20+, SillyTavern browser, and Tavo AI mobile/desktop WebViews.

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32Bytes(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function utf8ToBase64(text) {
    const utf8 = new TextEncoder().encode(text);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < utf8.length; i += chunk) {
        binary += String.fromCharCode(...utf8.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToUtf8(b64) {
    const binary = atob(b64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function makeTextChunk(keyword, textValue) {
    const keyBytes = new TextEncoder().encode(keyword);
    const valBytes = new TextEncoder().encode(textValue);
    const data = new Uint8Array(keyBytes.length + 1 + valBytes.length);
    data.set(keyBytes, 0);
    data[keyBytes.length] = 0; // null separator per PNG tEXt spec
    data.set(valBytes, keyBytes.length + 1);

    const typeBytes = new TextEncoder().encode('tEXt');
    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, 4);
    const crc = crc32Bytes(crcInput);

    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length, false);
    out.set(typeBytes, 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc, false);
    return out;
}

export function assertValidPng(pngBytes) {
    if (!(pngBytes instanceof Uint8Array) || pngBytes.length < 24) {
        throw new Error('Invalid PNG buffer.');
    }
    for (let i = 0; i < 8; i += 1) {
        if (pngBytes[i] !== PNG_SIG[i]) throw new Error('Invalid PNG signature.');
    }
}

export function embedCharacterCardInPng(pngBytes, cardObject) {
    const input = pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes);
    assertValidPng(input);

    const json = JSON.stringify(cardObject);
    const charaChunk = makeTextChunk('chara', utf8ToBase64(json));

    const keptChunks = [input.subarray(0, 8)];
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    let offset = 8;
    let inserted = false;

    while (offset + 12 <= input.length) {
        const len = view.getUint32(offset, false);
        const chunkEnd = offset + 12 + len;
        if (chunkEnd > input.length) throw new Error('Truncated PNG chunk.');
        const type = String.fromCharCode(
            input[offset + 4], input[offset + 5], input[offset + 6], input[offset + 7],
        );

        if (type === 'tEXt') {
            // Strip old chara/ccv3 chunk if replacing
            const dataStart = offset + 8;
            let zeroIdx = dataStart;
            while (zeroIdx < dataStart + len && input[zeroIdx] !== 0) zeroIdx += 1;
            const keyword = new TextDecoder().decode(input.subarray(dataStart, zeroIdx));
            if (keyword === 'chara' || keyword === 'ccv3') {
                offset = chunkEnd;
                continue;
            }
        }

        if (type === 'IEND' && !inserted) {
            keptChunks.push(charaChunk);
            inserted = true;
        }
        keptChunks.push(input.subarray(offset, chunkEnd));
        offset = chunkEnd;
        if (type === 'IEND') break;
    }

    if (!inserted) throw new Error('PNG missing IEND chunk.');
    const totalLength = keptChunks.reduce((sum, part) => sum + part.length, 0);
    const merged = new Uint8Array(totalLength);
    let cursor = 0;
    for (const part of keptChunks) {
        merged.set(part, cursor);
        cursor += part.length;
    }
    return merged;
}

export function extractCharacterCardFromPng(pngBytes) {
    const input = pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes);
    assertValidPng(input);
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    let offset = 8;

    while (offset + 12 <= input.length) {
        const len = view.getUint32(offset, false);
        const chunkEnd = offset + 12 + len;
        if (chunkEnd > input.length) break;
        const type = String.fromCharCode(
            input[offset + 4], input[offset + 5], input[offset + 6], input[offset + 7],
        );
        if (type === 'tEXt') {
            const dataStart = offset + 8;
            let zeroIdx = dataStart;
            while (zeroIdx < dataStart + len && input[zeroIdx] !== 0) zeroIdx += 1;
            const keyword = new TextDecoder().decode(input.subarray(dataStart, zeroIdx));
            if (keyword === 'chara') {
                const payloadB64 = new TextDecoder().decode(input.subarray(zeroIdx + 1, dataStart + len));
                return JSON.parse(base64ToUtf8(payloadB64));
            }
        }
        offset = chunkEnd;
        if (type === 'IEND') break;
    }
    return null;
}

// CCv2 helpers kept separate from the generic PNG chunk reader so existing
// forge exports remain unchanged. The relic payload contains no account data.
export function embedRelicInCharacterCard(cardObject, certPayload, certSignature) {
    const card = cardObject && typeof cardObject === 'object' ? structuredClone(cardObject) : {};
    if (!card.data || typeof card.data !== 'object') card.data = {};
    if (!card.data.extensions || typeof card.data.extensions !== 'object') card.data.extensions = {};
    card.data.extensions.clodex_rp_relic = {
        payload: typeof certPayload === 'string' ? certPayload : JSON.stringify(certPayload),
        sig: String(certSignature ?? ''),
    };
    return card;
}

export function extractRelicFromCharacterCard(cardObject) {
    const relic = cardObject?.data?.extensions?.clodex_rp_relic;
    if (!relic || typeof relic !== 'object' || !relic.payload || !relic.sig) return null;
    return { payload: String(relic.payload), sig: String(relic.sig) };
}
