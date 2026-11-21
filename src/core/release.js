export const RLS_CLIENT_VERSION = '1.5.1';

const RLS_SEMVER_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:-([a-z0-9.]{1,16}))?$/;
const RLS_ANNOUNCE_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const RLS_SECRET_RE = /\bsk-[a-z0-9_-]{6,}/gi;

export function rlsNormalizeHost(raw) {
    const val = String(raw ?? '').trim().toLowerCase();
    if (val === 'tavo') return 'tavo';
    if (val === 'sillytavern' || val === 'st') return 'sillytavern';
    return 'other';
}

export function rlsParseSemver(raw) {
    const m = String(raw ?? '').trim().match(RLS_SEMVER_RE);
    if (!m) return null;
    return {
        raw: m[0],
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        pre: m[4] || '',
    };
}

export function rlsIsNewerVersion(remoteVer, localVer = RLS_CLIENT_VERSION) {
    const rem = rlsParseSemver(remoteVer);
    const loc = rlsParseSemver(localVer);
    if (!rem || !loc) return false;
    if (rem.major !== loc.major) return rem.major > loc.major;
    if (rem.minor !== loc.minor) return rem.minor > loc.minor;
    if (rem.patch !== loc.patch) return rem.patch > loc.patch;
    if (loc.pre && !rem.pre) return true;
    return false;
}

export function rlsSafeUrl(raw) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed || trimmed.length > 512) return '';
    try {
        const u = new URL(trimmed);
        if (u.protocol !== 'https:' || u.username || u.password || u.hash) return '';
        const host = u.hostname.toLowerCase();
        if (host === 'clodex.xyz') return u.href;
        if (host === 'github.com' && u.pathname.startsWith('/mereyabdenbekuly-ctrl/CLODEx-RP-Studio/')) return u.href;
        return '';
    } catch {
        return '';
    }
}

function rlsCleanLine(raw, maxLen = 140) {
    return String(raw ?? '')
        .replace(RLS_SECRET_RE, '[redacted]')
        .replace(/[\u0000-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, maxLen);
}

export function rlsNormalizeBulletin(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const ver = rlsParseSemver(raw.latestVersion);
    if (!ver) return null;
    const tpgUrl = rlsSafeUrl(raw.tpgUrl);
    const releaseUrl = rlsSafeUrl(raw.releaseUrl);
    if (!tpgUrl || !releaseUrl) return null;
    const zipUrl = rlsSafeUrl(raw.zipUrl);
    const titleRu = rlsCleanLine(raw.titleRu, 120);
    const titleEn = rlsCleanLine(raw.titleEn, 120);
    if (!titleRu || !titleEn) return null;
    const cleanArr = arr => (Array.isArray(arr) ? arr.map(x => rlsCleanLine(x, 140)).filter(Boolean).slice(0, 4) : []);
    const announcementId = RLS_ANNOUNCE_ID_RE.test(String(raw.announcementId ?? '').trim())
        ? String(raw.announcementId).trim()
        : '';
    const promo = String(raw.promoGiftCode ?? '').trim();
    const promoGiftCode = /^CLXPET1:[A-Za-z0-9_-]{1,5462}$/.test(promo) ? promo : '';
    return {
        latestVersion: ver.raw,
        titleRu,
        titleEn,
        highlightsRu: cleanArr(raw.highlightsRu),
        highlightsEn: cleanArr(raw.highlightsEn),
        tpgUrl,
        zipUrl,
        releaseUrl,
        announcementId,
        announcementRu: rlsCleanLine(raw.announcementRu, 280),
        announcementEn: rlsCleanLine(raw.announcementEn, 280),
        promoGiftCode,
    };
}

export function rlsSanitizeFeedback({ category = 'idea', message = '', contact = '' } = {}) {
    const cat = ['idea', 'bug', 'praise'].includes(category) ? category : 'idea';
    const msg = String(message ?? '')
        .replace(RLS_SECRET_RE, '[redacted]')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, 1000);
    if ([...msg].length < 3) throw new Error('tooShort');
    return {
        category: cat,
        message: msg,
        contact: rlsCleanLine(contact, 80),
    };
}
