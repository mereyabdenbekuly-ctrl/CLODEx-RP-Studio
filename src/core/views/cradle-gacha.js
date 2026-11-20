// CLODEx RP Studio v1.4 — Summoning Altar, Egg Skin Collection & Verified Relics view.
// Flat-bundler rules: only `export function` / `export const`, unique top-level names (vGa*, VGA_*).
// All strings are rendered strictly as safe DOM text nodes.
import { vEl } from './director.js';
import { EGG_SKINS, GA_PITY_EPIC, GA_PITY_SSR, GA_RARITIES } from '../gacha.js';
import { relMintUrl, relPublicBadge } from '../relic.js';

export function vGaRarityLabel(t, rarity) {
    const clean = GA_RARITIES.includes(rarity) ? rarity : 'common';
    return t(`gacha.rarity.${clean}`);
}

export function vGaSkinName(t, skinId) {
    const id = String(skinId || '');
    if (EGG_SKINS.some(item => item.id === id)) {
        return t(`gacha.skin.${id}`);
    }
    return id || t('gacha.skinDefault');
}

export function vGaRenderAltar(doc, t, model = {}, actions = {}) {
    const prefs = model.prefs && typeof model.prefs === 'object' ? model.prefs : {};
    const unlockedIds = Array.isArray(prefs.unlockedEggSkins) ? prefs.unlockedEggSkins : [];
    const unlockedSet = new Set(unlockedIds);
    const eggs = Array.isArray(prefs.pendingEggs) ? prefs.pendingEggs.filter(egg => egg && !egg.hatched) : [];
    const currency = String(model.currency || '$');
    const cash = Math.max(0, Math.trunc(Number(model.cash) || 0));
    const summonBusy = Boolean(model.summonBusy);

    const root = vEl(doc, 'div', {
        className: 'clodex-rp-gacha',
        dataset: { rpView: 'gacha' },
    });

    const summonCard = vEl(doc, 'div', { className: 'clodex-rp-card' },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `🥚 ${t('gacha.title')}`),
        vEl(doc, 'p', { className: 'clodex-rp-muted' }, t('gacha.subtitle')),
        vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row clodex-rp-mt' },
            vEl(doc, 'span', { className: 'clodex-rp-muted' },
                `${t('gacha.pity')}: ${vGaRarityLabel(t, 'epic')} ${Number(prefs.epicPity) || 0}/${GA_PITY_EPIC} · ${vGaRarityLabel(t, 'ssr')} ${Number(prefs.ssrPity) || 0}/${GA_PITY_SSR}`),
            vEl(doc, 'strong', {}, t('gacha.cashAvail', { cash: `${currency}${cash.toLocaleString()}` })),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                disabled: summonBusy,
                dataset: { rpAction: 'gacha-summon' },
                onClick: () => actions.onSummon?.(),
            }, summonBusy ? '⏳' : `✨ ${t('gacha.summon')} (${currency}50)`),
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn',
                disabled: summonBusy,
                dataset: { rpAction: 'paid-ritual' },
                onClick: () => actions.onPaidRitual?.(),
            }, `💠 ${t('gacha.paidSummon')}`),
        ),
    );
    root.append(summonCard);

    const pendingCard = vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'gacha-pending' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `🔥 ${t('gacha.pendingTitle')} (${eggs.length})`),
    );
    if (eggs.length === 0) {
        pendingCard.append(vEl(doc, 'div', { className: 'clodex-rp-muted' }, t('gacha.emptyEggs')));
    } else {
        const list = vEl(doc, 'div', { className: 'clodex-rp-list' });
        for (const egg of eggs) {
            const skinObj = EGG_SKINS.find(item => item.id === egg.eggSkin) || EGG_SKINS[0];
            const rarity = GA_RARITIES.includes(egg.rarity) ? egg.rarity : 'common';
            const warmth = Math.max(0, Math.min(100, Math.trunc(Number(egg.warmth) || 0)));
            const artSrc = egg.artPath ? (model.resolveSrc?.(egg.artPath) || egg.artPath) : '';

            let mediaNode;
            if (artSrc) {
                mediaNode = vEl(doc, 'img', {
                    className: 'clodex-rp-egg-art',
                    src: artSrc,
                    alt: egg.name || vGaSkinName(t, egg.eggSkin),
                    dataset: { rpView: 'gacha-egg-art' },
                });
            } else {
                mediaNode = vEl(doc, 'div', { className: 'clodex-rp-egg-orb' }, '🥚');
                mediaNode.style.background = skinObj.theme;
                mediaNode.setAttribute?.('style', `background:${skinObj.theme}`);
            }

            const warmthFill = vEl(doc, 'div', { className: 'clodex-rp-stat-fill is-mood' });
            warmthFill.style.width = `${warmth}%`;
            warmthFill.setAttribute?.('style', `width:${warmth}%`);

            const skinOptionIds = unlockedSet.has(egg.eggSkin)
                ? [...unlockedIds]
                : [egg.eggSkin, ...unlockedIds].filter(Boolean);

            const body = vEl(doc, 'div', { className: 'clodex-rp-egg-body' },
                vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
                    vEl(doc, 'strong', { textContent: String(egg.name || vGaSkinName(t, egg.eggSkin)) }),
                    vEl(doc, 'span', { className: `clodex-rp-rarity is-${rarity}` }, vGaRarityLabel(t, rarity)),
                ),
                vEl(doc, 'div', { className: 'clodex-rp-chips' },
                    vEl(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-cradle' }, `🥚 ${vGaSkinName(t, egg.eggSkin)}`),
                    egg.archetype ? vEl(doc, 'span', { className: 'clodex-rp-chip clodex-rp-chip-bio' }, t(`cradle.archetype.${egg.archetype}`)) : null,
                ),
                egg.mutationTrait ? vEl(doc, 'div', { className: 'clodex-rp-muted' },
                    `🧬 ${t('gacha.traitLabel')}: `,
                    vEl(doc, 'span', { textContent: String(egg.mutationTrait) })) : null,
                egg.personality ? vEl(doc, 'div', { className: 'clodex-rp-muted' },
                    `💫 ${t('gacha.personalityLabel')}: `,
                    vEl(doc, 'span', { textContent: String(egg.personality) })) : null,
                egg.prophecy ? vEl(doc, 'div', { className: 'clodex-rp-muted' },
                    `🔮 ${t('gacha.prophecyLabel')}: `,
                    vEl(doc, 'span', { textContent: String(egg.prophecy) })) : null,
                vEl(doc, 'div', { className: 'clodex-rp-stat-head clodex-rp-mt' },
                    vEl(doc, 'span', {}, t('gacha.warmthLabel', { warmth })),
                    vEl(doc, 'strong', {}, `${warmth}%`),
                ),
                vEl(doc, 'div', { className: 'clodex-rp-stat-bar' }, warmthFill),
                unlockedIds.length > 0 ? vEl(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                    vEl(doc, 'span', {}, t('gacha.equipSkinLabel')),
                    vEl(doc, 'select', {
                        className: 'clodex-rp-input',
                        dataset: { rpAction: 'gacha-egg-skin', eggId: String(egg.id) },
                        onChange: e => actions.onEquipEggSkin?.(egg.id, String(e?.target?.value ?? '')),
                    }, ...skinOptionIds.map(skinId => vEl(doc, 'option', {
                        value: skinId,
                        selected: skinId === egg.eggSkin,
                        disabled: !unlockedSet.has(skinId),
                    }, vGaSkinName(t, skinId)))),
                ) : null,
                vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                    vEl(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn-mini',
                        dataset: { rpAction: 'gacha-warm', eggId: String(egg.id) },
                        onClick: () => actions.onWarm?.(egg.id),
                    }, `🔥 ${t('gacha.warmBtn')}`),
                    vEl(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn-mini active',
                        disabled: warmth < 100,
                        dataset: { rpAction: 'gacha-hatch', eggId: String(egg.id) },
                        onClick: () => actions.onHatch?.(egg.id),
                    }, `🐣 ${t('gacha.hatch')}`),
                ),
            );

            list.append(vEl(doc, 'article', {
                className: `clodex-rp-egg-card${egg.relicUid ? ' clodex-rp-relic-certified' : ''}`,
                dataset: { rpView: 'gacha-egg', eggId: String(egg.id) },
            }, mediaNode, body));
        }
        pendingCard.append(list);
    }
    root.append(pendingCard);

    const galleryChips = EGG_SKINS.map(skin => {
        const isUnlocked = unlockedSet.has(skin.id);
        const chip = vEl(doc, 'span', {
            className: `clodex-rp-chip clodex-rp-skin-chip${isUnlocked ? '' : ' is-locked'}`,
            dataset: { skinId: skin.id, unlocked: isUnlocked ? 'true' : 'false' },
        }, `${isUnlocked ? '✦' : '🔒'} ${vGaSkinName(t, skin.id)} · ${vGaRarityLabel(t, skin.rarity)}`);
        chip.style.background = skin.theme;
        chip.setAttribute?.('style', `background:${skin.theme}`);
        return chip;
    });

    root.append(vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'gacha-skins' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' },
            `🎨 ${t('gacha.skinsGalleryTitle', { unlocked: unlockedIds.length, total: EGG_SKINS.length })}`),
        vEl(doc, 'div', { className: 'clodex-rp-chips' }, ...galleryChips),
    ));

    return root;
}

export function vGaRenderRelics(doc, t, model = {}, actions = {}) {
    const catalog = Array.isArray(model.catalog) ? model.catalog : [];
    const relics = Array.isArray(model.relics) ? model.relics : [];
    const verifiedRelics = model.verifiedRelics instanceof Map ? model.verifiedRelics : new Map();
    const hatchedUids = Array.isArray(model.hatchedRelicUids) ? model.hatchedRelicUids : [];
    const pendingEggs = Array.isArray(model.pendingEggs) ? model.pendingEggs : [];
    const locale = model.locale === 'ru' ? 'ru' : 'en';

    const root = vEl(doc, 'div', {
        className: 'clodex-rp-relics',
        dataset: { rpView: 'relics' },
    });

    const syncCard = vEl(doc, 'div', { className: 'clodex-rp-card' },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `💎 ${t('relic.title')}`),
        vEl(doc, 'div', { className: 'clodex-rp-muted' }, String(model.syncStatus || t('relic.readOnly'))),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                disabled: Boolean(model.checking),
                dataset: { rpAction: 'relic-sync' },
                onClick: () => actions.onSync?.(),
            }, `🔄 ${t('relic.sync')}`),
        ),
        vEl(doc, 'label', { className: 'clodex-rp-subbox clodex-rp-mt clodex-rp-field' },
            vEl(doc, 'span', {}, `🛡️ ${t('relic.verifyPng')}`),
            vEl(doc, 'input', {
                type: 'file',
                accept: 'image/png,.png',
                dataset: { rpAction: 'relic-verify-png' },
                onChange: e => actions.onVerifyPng?.(e?.target?.files?.[0]),
            }),
        ),
        model.cardStatus ? vEl(doc, 'div', {
            role: 'status',
            className: `clodex-rp-badge-line clodex-rp-mt${model.cardVerified ? ' clodex-rp-relic-certified' : ''}`,
            textContent: String(model.cardStatus),
        }) : null,
    );
    root.append(syncCard);

    const editionsCard = vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'relic-editions' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `✦ ${t('relic.editionsTitle')}`),
    );
    if (catalog.length === 0) {
        editionsCard.append(vEl(doc, 'div', { className: 'clodex-rp-muted' }, t('relic.editionsEmpty')));
    } else {
        const list = vEl(doc, 'div', { className: 'clodex-rp-list' });
        for (const edition of catalog) {
            const editionKey = String(edition?.editionKey || edition?.edition_key || '');
            const title = (locale === 'ru' ? edition?.titleRu : edition?.titleEn)
                || edition?.title || editionKey || 'Relic';
            const minted = Number(edition?.mintedCount ?? edition?.minted_count ?? 0);
            const maxSupply = Number(edition?.maxSupply ?? edition?.max_supply ?? 0);
            const mintUrl = relMintUrl(editionKey);

            const mintLink = vEl(doc, 'a', {
                className: 'clodex-rp-btn-mini clodex-rp-link-btn',
                href: mintUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                dataset: { rpAction: 'relic-mint-link', edition: editionKey },
            }, `↗ ${t('relic.mint')}`);
            mintLink.setAttribute?.('href', mintUrl);
            mintLink.setAttribute?.('target', '_blank');
            mintLink.setAttribute?.('rel', 'noopener noreferrer');

            list.append(vEl(doc, 'div', {
                className: 'clodex-rp-list-item clodex-rp-collateral-row',
                dataset: { rpView: 'relic-edition', edition: editionKey },
            },
            vEl(doc, 'span', { textContent: `${title} · ${minted}/${maxSupply}` }),
            vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
                mintLink,
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini',
                    dataset: { rpAction: 'relic-copy-link', edition: editionKey },
                    onClick: () => actions.onCopyLink?.(mintUrl),
                }, `📋 ${t('relic.copyLink')}`),
            )));
        }
        editionsCard.append(list);
    }
    root.append(editionsCard);

    const invCard = vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'relic-inventory' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `📜 ${t('relic.inventoryTitle')}`),
    );
    if (relics.length === 0) {
        invCard.append(vEl(doc, 'div', { className: 'clodex-rp-muted' }, t('relic.inventoryEmpty')));
    } else {
        const list = vEl(doc, 'div', { className: 'clodex-rp-list' });
        for (const relic of relics) {
            const entry = [...verifiedRelics.values()].find(item => item.payload === relic.payload && item.sig === relic.sig);
            if (!entry) {
                list.append(vEl(doc, 'div', { className: 'clodex-rp-list-item' }, t('relic.unverified')));
                continue;
            }
            const uid = entry.claims.relicUid;
            const added = hatchedUids.includes(uid) || pendingEggs.some(egg => egg && egg.relicUid === uid);
            list.append(vEl(doc, 'div', {
                className: 'clodex-rp-list-item clodex-rp-relic-certified clodex-rp-collateral-row',
                dataset: { rpView: 'relic-item', relicUid: uid },
            },
            vEl(doc, 'div', { className: 'clodex-rp-collateral-meta' },
                vEl(doc, 'strong', { textContent: relPublicBadge(relic.payload, true) }),
                vEl(doc, 'span', { className: 'clodex-rp-muted' },
                    `🥚 ${vGaSkinName(t, entry.claims.eggSkin)} · ${vGaRarityLabel(t, entry.claims.rarity)}`),
            ),
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn-mini',
                disabled: added || Boolean(model.summonBusy),
                dataset: { rpAction: 'relic-queue-egg', relicUid: uid },
                onClick: () => actions.onQueueEgg?.(entry.claims),
            }, t(added ? 'relic.added' : 'relic.addEgg'))));
        }
        invCard.append(list);
    }
    root.append(invCard);

    return root;
}
