// CLODEx RP Studio v1.4 — Underworld, Casino, Pawn Shop & Reputation view.
// Flat-bundler rules: only `export function` / `export const`, unique top-level names (vUw*, VUW_*).
// All strings are rendered strictly as safe DOM text nodes.
import { vEl } from './director.js';
import {
    UW_COLLATERAL_PRESETS, UW_PRESET_VALUES, UW_SKINS, uwCardLabel, uwHandTotal,
} from '../underworld.js';
import { REP_MAX_HEAT, REP_SERVICES } from '../reputation.js';

export const VUW_WAGER_STAKES = Object.freeze(['truth', 'wish', 'secret']);

export const VUW_PRESET_ICONS = Object.freeze({
    apartment: '🏠',
    car: '🚗',
    business: '🏢',
    watch: '⌚',
    estate: '🏰',
    sword: '⚔️',
    artifact: '🔮',
    oath: '📜',
    habitat: '🏙',
    implant: '🦾',
    deck: '💻',
    license: '🪪',
});

const VUW_FALLBACK_PRESET_VALUES = Object.freeze({
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

function vUwPresetValue(presetKey) {
    if (typeof UW_PRESET_VALUES === 'object' && UW_PRESET_VALUES && Number.isFinite(UW_PRESET_VALUES[presetKey])) {
        return UW_PRESET_VALUES[presetKey];
    }
    return VUW_FALLBACK_PRESET_VALUES[presetKey] ?? 1000;
}

function vUwSafeHandTotal(cards) {
    if (typeof uwHandTotal === 'function') return uwHandTotal(cards);
    let total = 0;
    let aces = 0;
    for (const card of Array.isArray(cards) ? cards : []) {
        const rank = card % 13;
        if (rank === 0) {
            total += 11;
            aces += 1;
        } else {
            total += Math.min(10, rank + 1);
        }
    }
    return total - 10 * Math.min(aces, Math.max(0, Math.ceil((total - 21) / 10)));
}

function vUwFormatSigned(currency, amount) {
    const num = Math.trunc(Number(amount) || 0);
    if (num > 0) return `+${currency}${num.toLocaleString()}`;
    if (num < 0) return `-${currency}${Math.abs(num).toLocaleString()}`;
    return `${currency}0`;
}

function vUwFormatHeat(heat) {
    const val = Math.max(0, Math.min(REP_MAX_HEAT, Number(heat) || 0));
    return Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.?0+$/, '');
}

function vUwRenderStars(doc, heat) {
    const val = Math.max(0, Math.min(REP_MAX_HEAT, Number(heat) || 0));
    const wrap = vEl(doc, 'span', {
        className: 'clodex-rp-uw-stars',
        dataset: { rpView: 'uw-wanted-stars', heat: vUwFormatHeat(val) },
    });
    for (let i = 1; i <= REP_MAX_HEAT; i += 1) {
        const full = val >= i;
        const partial = !full && val > i - 1;
        wrap.append(vEl(doc, 'span', {
            className: `clodex-rp-uw-star${full ? ' is-full' : partial ? ' is-half' : ' is-empty'}`,
        }, full || partial ? '★' : '☆'));
    }
    return wrap;
}

function vUwRenderCasinoOutcome(doc, t, outcome, currency, charName) {
    if (!outcome || typeof outcome !== 'object') return null;
    const net = Number(outcome.net) || 0;
    const tone = outcome.game === 'wager'
        ? (outcome.win ? 'is-win' : 'is-loss')
        : net > 0
            ? 'is-win'
            : net < 0
                ? 'is-loss'
                : 'is-push';

    const box = vEl(doc, 'div', {
        className: `clodex-rp-uw-outcome ${tone}`,
        role: 'status',
        dataset: { rpView: 'casino-outcome', game: String(outcome.game || '') },
    });

    if (outcome.game === 'dice') {
        const d0 = outcome.dice?.[0] ?? 1;
        const d1 = outcome.dice?.[1] ?? 1;
        const tag = outcome.win ? t('uw.winTag') : t('uw.lossTag');
        box.append(
            vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
                vEl(doc, 'strong', {}, `🎲 [${d0}] + [${d1}] = ${outcome.total}`),
                vEl(doc, 'strong', {}, `${tag} · ${vUwFormatSigned(currency, net)}`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-muted' },
                `${t(`uw.dice.${['over', 'under', 'seven', 'double'].includes(outcome.side) ? outcome.side : 'over'}`)} · ${t('uw.payout')}: ${currency}${Number(outcome.payout || 0).toLocaleString()}`),
        );
        return box;
    }

    if (outcome.game === 'slots') {
        const reels = Array.isArray(outcome.reels) && outcome.reels.length === 3 ? outcome.reels : ['🍒', '🔔', '💎'];
        const tag = net > 0 ? t('uw.winTag') : net < 0 ? t('uw.lossTag') : t('uw.pushTag');
        box.append(
            vEl(doc, 'div', {
                className: 'clodex-rp-uw-reels',
                dataset: { rpView: 'slots-reels' },
            }, `[ ${reels[0]} | ${reels[1]} | ${reels[2]} ]`),
            vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
                vEl(doc, 'span', {}, `${t('uw.payout')}: ${currency}${Number(outcome.payout || 0).toLocaleString()}`),
                vEl(doc, 'strong', {}, `${tag} · ${t('uw.net')}: ${vUwFormatSigned(currency, net)}`),
            ),
        );
        return box;
    }

    if (outcome.game === 'blackjack') {
        const statusKey = ['win', 'loss', 'push', 'blackjack', 'bust'].includes(outcome.status) ? outcome.status : 'loss';
        const playerCards = (Array.isArray(outcome.player) ? outcome.player : []).map(uwCardLabel).join(' ');
        const dealerCards = (Array.isArray(outcome.dealer) ? outcome.dealer : []).map(uwCardLabel).join(' ');
        box.append(
            vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
                vEl(doc, 'strong', {}, `🃏 ${t(`uw.bj.status.${statusKey}`)}`),
                vEl(doc, 'strong', {}, `${t('uw.net')}: ${vUwFormatSigned(currency, net)}`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row clodex-rp-mt' },
                vEl(doc, 'span', {}, `${t('uw.bj.player')}: `),
                vEl(doc, 'span', { className: 'clodex-rp-uw-cards' }, `${playerCards} (${outcome.playerTotal})`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
                vEl(doc, 'span', {}, `${t('uw.bj.dealer')}: `),
                vEl(doc, 'span', { className: 'clodex-rp-uw-cards' }, `${dealerCards} (${outcome.dealerTotal})`),
            ),
        );
        return box;
    }

    if (outcome.game === 'wager') {
        const stakeKey = VUW_WAGER_STAKES.includes(outcome.stake) ? outcome.stake : 'truth';
        box.append(vEl(doc, 'div', {},
            `🗝️ ${t(outcome.win ? 'uw.wagerWin' : 'uw.wagerLoss', {
                char: charName || '{{char}}',
                stake: t(`uw.stake.${stakeKey}`),
            })}`));
        return box;
    }

    return null;
}

function vUwRenderBlackjackActive(doc, t, bj, cash, currency, actions) {
    if (!bj || bj.status !== 'playing') return null;
    const playerCards = (Array.isArray(bj.player) ? bj.player : []).map(uwCardLabel).join(' ');
    const playerTotal = vUwSafeHandTotal(bj.player);
    const dealerUpcard = Array.isArray(bj.dealer) && bj.dealer.length ? uwCardLabel(bj.dealer[0]) : '?';
    const canDouble = Array.isArray(bj.player) && bj.player.length === 2 && Number(cash) >= Number(bj.wager);

    return vEl(doc, 'div', {
        className: 'clodex-rp-uw-bj',
        dataset: { rpView: 'blackjack-active' },
    },
    vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
        vEl(doc, 'span', {}, `🃏 ${t('uw.bj.player')}: `),
        vEl(doc, 'span', { className: 'clodex-rp-uw-cards', dataset: { rpView: 'bj-player-hand' } }, `${playerCards} (${playerTotal})`),
        vEl(doc, 'span', { className: 'clodex-rp-muted' }, `${t('uw.bj.wager')}: ${currency}${Number(bj.wager || 0).toLocaleString()}`),
    ),
    vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
        vEl(doc, 'span', {}, `🎩 ${t('uw.bj.dealer')}: `),
        vEl(doc, 'span', { className: 'clodex-rp-uw-cards', dataset: { rpView: 'bj-dealer-hand' } }, `${dealerUpcard} [🂠]`),
    ),
    vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
        vEl(doc, 'button', {
            type: 'button',
            className: 'clodex-rp-btn clodex-rp-btn-primary',
            dataset: { rpAction: 'uw-bj-hit' },
            onClick: () => actions.onBjAction?.('hit'),
        }, `🃏 ${t('uw.bj.hit')}`),
        vEl(doc, 'button', {
            type: 'button',
            className: 'clodex-rp-btn',
            dataset: { rpAction: 'uw-bj-stand' },
            onClick: () => actions.onBjAction?.('stand'),
        }, `✋ ${t('uw.bj.stand')}`),
        vEl(doc, 'button', {
            type: 'button',
            className: 'clodex-rp-btn',
            disabled: !canDouble,
            dataset: { rpAction: 'uw-bj-double' },
            onClick: () => actions.onBjAction?.('double'),
        }, `⏫ ${t('uw.bj.double')}`),
    ));
}

export function vUwRender(doc, t, model = {}, actions = {}) {
    const uw = model.uw && typeof model.uw === 'object' ? model.uw : {};
    const selectedSkin = UW_SKINS.includes(uw.skin) ? uw.skin : 'auto';
    const resolvedSkin = ['crime', 'tavern', 'syndicate'].includes(model.resolvedSkin) ? model.resolvedSkin : 'crime';
    const currency = String(uw.currency || (resolvedSkin === 'tavern' ? '🪙' : '$'));
    const cash = Math.max(0, Math.trunc(Number(uw.cash) || 0));
    const debt = Math.max(0, Math.trunc(Number(uw.debt) || 0));
    const turnsInDebt = Math.max(0, Math.trunc(Number(uw.turnsInDebt) || 0));
    const heat = Math.max(0, Math.min(REP_MAX_HEAT, Number(uw.heat) || 0));
    const standing = Math.trunc(Number(uw.standing) || 0);
    const betDraft = Math.max(1, Math.trunc(Number(model.betDraft) || 25));
    const pawnValueDraft = Math.max(1, Math.trunc(Number(model.pawnValueDraft) || 500));
    const collateralDraft = String(model.collateralDraft ?? '');
    const targetDraft = String(model.targetDraft ?? '');
    const wagerStake = VUW_WAGER_STAKES.includes(model.wagerStake) ? model.wagerStake : 'truth';
    const charName = String(model.charName || '{{char}}');
    const userInventory = Array.isArray(model.userInventory) ? model.userInventory : [];
    const collateral = Array.isArray(uw.collateral) ? uw.collateral : [];
    const factions = Array.isArray(uw.factions) ? uw.factions : [];
    const presetKeys = UW_COLLATERAL_PRESETS[resolvedSkin] || UW_COLLATERAL_PRESETS.crime;

    const root = vEl(doc, 'div', {
        className: `clodex-rp-underworld is-${resolvedSkin}`,
        dataset: { rpView: 'underworld', skin: resolvedSkin },
    });

    // Overview & Skin Selector Card
    const overviewCard = vEl(doc, 'div', { className: 'clodex-rp-card' },
        vEl(doc, 'div', { className: 'clodex-rp-uw-top' },
            vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `🎲 ${t('uw.title')}`),
            vEl(doc, 'label', { className: 'clodex-rp-uw-skin' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, t('uw.skinLabel')),
                vEl(doc, 'select', {
                    className: 'clodex-rp-input',
                    dataset: { rpAction: 'uw-skin' },
                    onChange: e => actions.onSkin?.(String(e?.target?.value ?? 'auto')),
                }, ...UW_SKINS.map(s => vEl(doc, 'option', { value: s, selected: s === selectedSkin }, t(`uw.skin.${s}`)))),
            ),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-uw-stats clodex-rp-mt' },
            vEl(doc, 'div', { className: 'clodex-rp-uw-stat' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, `💰 ${t('uw.cash')}`),
                vEl(doc, 'strong', {}, `${currency}${cash.toLocaleString()}`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-uw-stat' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, `💸 ${t('uw.debt')}`),
                vEl(doc, 'strong', {}, `${currency}${debt.toLocaleString()}${turnsInDebt > 0 ? ` (${t('uw.turnsInDebt', { turns: turnsInDebt })})` : ''}`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-uw-stat' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, `🚔 ${t('uw.wanted')}`),
                vEl(doc, 'strong', {}, `${vUwFormatHeat(heat)}★`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-uw-stat' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, `⚖️ ${t('uw.standing')}`),
                vEl(doc, 'strong', {}, standing > 0 ? `+${standing}` : String(standing)),
            ),
        ),
        uw.pendingWorldEvent ? vEl(doc, 'div', {
            className: 'clodex-rp-uw-event clodex-rp-mt',
            dataset: { rpView: 'uw-world-event' },
        }, `⚡ ${t('uw.pendingEventBadge')}: `, vEl(doc, 'span', { textContent: String(uw.pendingWorldEvent) })) : null,
    );
    root.append(overviewCard);

    // 1. Casino & Story Wager Card
    const casinoCard = vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'uw-casino' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `🎰 ${t(`uw.casinoTitle.${resolvedSkin}`)}`),
        vEl(doc, 'label', { className: 'clodex-rp-field' },
            vEl(doc, 'span', {}, `${t('uw.bet')} (${currency})`),
            vEl(doc, 'input', {
                type: 'number',
                min: 1,
                className: 'clodex-rp-input',
                value: String(betDraft),
                dataset: { rpAction: 'uw-bet' },
                onInput: e => actions.onBetInput?.(Math.max(1, Math.trunc(Number(e?.target?.value) || 1))),
            }),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, `🎲 ${t('uw.diceLabel')}`),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            ...[
                ['over', '⬆️'],
                ['under', '⬇️'],
                ['seven', '7️⃣'],
                ['double', '🎯'],
            ].map(([side, icon]) => vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn',
                dataset: { rpAction: 'uw-dice', side },
                onClick: () => actions.onDice?.(side),
            }, `${icon} ${t(`uw.dice.${side}`)}`)),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                dataset: { rpAction: 'uw-slots' },
                onClick: () => actions.onSlots?.(),
            }, `🎰 ${t('uw.slots.spin')}`),
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                disabled: Boolean(uw.blackjack),
                dataset: { rpAction: 'uw-bj-deal' },
                onClick: () => actions.onBjDeal?.(),
            }, `🃏 ${t('uw.bj.deal')}`),
        ),
        vUwRenderBlackjackActive(doc, t, uw.blackjack, cash, currency, actions),
        vUwRenderCasinoOutcome(doc, t, model.lastOutcome, currency, charName),
        vEl(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt', dataset: { rpView: 'uw-wager-box' } },
            vEl(doc, 'strong', {}, `🗝️ ${t('uw.wagerTitle', { char: charName })}`),
            vEl(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                ...VUW_WAGER_STAKES.map(stake => vEl(doc, 'button', {
                    type: 'button',
                    className: `clodex-rp-chip-btn${wagerStake === stake ? ' active' : ''}`,
                    dataset: { rpAction: 'uw-wager-stake', stake },
                    onClick: () => actions.onWagerStake?.(stake),
                }, t(`uw.stake.${stake}`))),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    disabled: Number(uw.wagerCooldown) > 0 || Boolean(uw.pendingWorldEvent),
                    dataset: { rpAction: 'uw-wager' },
                    onClick: () => actions.onStoryWager?.(),
                }, `🎲 ${t('uw.wagerBtn', { char: charName })}`),
                Number(uw.wagerCooldown) > 0
                    ? vEl(doc, 'span', { className: 'clodex-rp-muted', dataset: { rpView: 'uw-wager-cooldown' } },
                        `⏳ ${t('uw.wagerCooldown', { turns: uw.wagerCooldown })}`)
                    : null,
            ),
        ),
    );
    root.append(casinoCard);

    // 2. Pawn Shop & Debt Card
    const pawnCard = vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'uw-pawn' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `🏦 ${t(`uw.pawnTitle.${resolvedSkin}`)}`),
        vEl(doc, 'label', { className: 'clodex-rp-field' },
            vEl(doc, 'span', {}, `${t('uw.pawnValueLabel')} (${currency})`),
            vEl(doc, 'input', {
                type: 'number',
                min: 1,
                max: 50000,
                className: 'clodex-rp-input',
                value: String(pawnValueDraft),
                dataset: { rpAction: 'uw-pawn-value' },
                onInput: e => actions.onPawnValueInput?.(Math.max(1, Math.min(50000, Math.trunc(Number(e?.target?.value) || 500)))),
            }),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn',
                dataset: { rpAction: 'uw-take-loan' },
                onClick: () => actions.onTakeLoan?.(),
            }, `💸 ${t('uw.takeLoan')}`),
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                disabled: debt <= 0 || cash <= 0,
                dataset: { rpAction: 'uw-pay-debt' },
                onClick: () => actions.onPayDebt?.(),
            }, `✅ ${t('uw.payDebt')}`),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
            vEl(doc, 'strong', {}, `🏷️ ${t('uw.presetsLabel')}`),
            vEl(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
                ...presetKeys.map(presetKey => {
                    const icon = VUW_PRESET_ICONS[presetKey] || '🏷️';
                    const val = vUwPresetValue(presetKey);
                    const label = t(`uw.preset.${presetKey}`);
                    const already = collateral.some(item => item.presetKey === presetKey);
                    return vEl(doc, 'button', {
                        type: 'button',
                        className: `clodex-rp-chip-btn${already ? ' active' : ''}`,
                        disabled: already,
                        dataset: { rpAction: 'uw-pawn-preset', preset: presetKey },
                        onClick: () => actions.onPawnPreset?.(presetKey, label, val),
                    }, `${icon} ${label} (+${currency}${val.toLocaleString()})`);
                }),
            ),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt', dataset: { rpView: 'uw-inventory' } },
            vEl(doc, 'strong', {}, `🎒 ${t('uw.inventoryPawnLabel')}`),
            userInventory.length === 0
                ? vEl(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, t('uw.inventoryEmpty'))
                : vEl(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt' },
                    ...userInventory.map((itemLabel, idx) => vEl(doc, 'div', { className: 'clodex-rp-list-item' },
                        vEl(doc, 'span', { textContent: String(itemLabel) }),
                        vEl(doc, 'button', {
                            type: 'button',
                            className: 'clodex-rp-btn-mini',
                            dataset: { rpAction: 'uw-pawn-inv', index: String(idx), item: String(itemLabel) },
                            onClick: () => actions.onPawnInventory?.(String(itemLabel), idx),
                        }, `🏷️ ${t('uw.pawnAction')} (+${currency}${pawnValueDraft.toLocaleString()})`),
                    ))),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            vEl(doc, 'input', {
                type: 'text',
                className: 'clodex-rp-input',
                maxLength: 48,
                placeholder: t('uw.collateralPlaceholder'),
                value: collateralDraft,
                dataset: { rpAction: 'uw-collateral-label' },
                onInput: e => actions.onCollateralInput?.(String(e?.target?.value ?? '')),
            }),
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn',
                dataset: { rpAction: 'uw-pawn-custom' },
                onClick: () => actions.onPawnCustom?.(),
            }, `🏷️ ${t('uw.pawnAction')}`),
        ),
        collateral.length === 0
            ? vEl(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, t('uw.collateralEmpty'))
            : vEl(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt', dataset: { rpView: 'uw-collateral-list' } },
                ...collateral.map(item => {
                    const statusKey = item.status === 'foreclosed' ? 'foreclosed' : 'pawned';
                    return vEl(doc, 'div', {
                        className: 'clodex-rp-list-item clodex-rp-collateral-row',
                        dataset: { rpView: 'uw-collateral-row', collateralId: String(item.id) },
                    },
                    vEl(doc, 'div', { className: 'clodex-rp-collateral-meta' },
                        vEl(doc, 'strong', { textContent: String(item.label) }),
                        vEl(doc, 'span', { className: 'clodex-rp-muted' },
                            `${t(`uw.collateralStatus.${statusKey}`)} · ${t('uw.redeemCostLabel', { cost: `${currency}${Number(item.redeemCost || 0).toLocaleString()}` })} · ${t('uw.dueInTurnsLabel', { turns: Number(item.dueInTurns) || 0 })}`),
                    ),
                    vEl(doc, 'button', {
                        type: 'button',
                        className: 'clodex-rp-btn-mini',
                        disabled: statusKey !== 'pawned',
                        dataset: { rpAction: 'uw-redeem', collateralId: String(item.id) },
                        onClick: () => actions.onRedeem?.(item.id),
                    }, t('uw.redeem')));
                })),
    );
    root.append(pawnCard);

    // 3. Wanted, Factions & Shadow Services Card
    const repCard = vEl(doc, 'div', { className: 'clodex-rp-card', dataset: { rpView: 'uw-reputation' } },
        vEl(doc, 'h4', { className: 'clodex-rp-card-title' }, `🚔 ${t(`uw.repTitle.${resolvedSkin}`)}`),
        vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
            vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, `${t('uw.wanted')}:`),
                vUwRenderStars(doc, heat),
                vEl(doc, 'strong', {}, `${vUwFormatHeat(heat)} / ${REP_MAX_HEAT}★`),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
                vEl(doc, 'span', { className: 'clodex-rp-muted' }, `${t('uw.standing')}:`),
                vEl(doc, 'strong', {}, `${standing > 0 ? `+${standing}` : String(standing)} / 100`),
            ),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt' },
            vEl(doc, 'div', { className: 'clodex-rp-uw-bj-row' },
                vEl(doc, 'strong', {}, `🏴 ${t('uw.factionsTitle')}`),
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini',
                    dataset: { rpAction: 'uw-import-factions' },
                    onClick: () => actions.onImportFactions?.(),
                }, `📚 ${t('uw.importFactions')}`),
            ),
            factions.length === 0
                ? vEl(doc, 'div', { className: 'clodex-rp-muted clodex-rp-mt' }, t('uw.factionsEmpty'))
                : vEl(doc, 'div', { className: 'clodex-rp-list clodex-rp-mt', dataset: { rpView: 'uw-factions' } },
                    ...factions.map(f => {
                        const repVal = Math.trunc(Number(f.rep) || 0);
                        const repClass = repVal <= -50 ? ' is-hostile' : repVal >= 60 ? ' is-friendly' : '';
                        return vEl(doc, 'div', { className: 'clodex-rp-list-item' },
                            vEl(doc, 'span', { textContent: String(f.name) }),
                            vEl(doc, 'span', { className: `clodex-rp-uw-faction-rep${repClass}` },
                                repVal > 0 ? `+${repVal}` : String(repVal)),
                        );
                    })),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-subbox clodex-rp-mt', dataset: { rpView: 'uw-services' } },
            vEl(doc, 'strong', {}, `🕶️ ${t('uw.servicesTitle')}`),
            vEl(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
                vEl(doc, 'span', {}, t('uw.targetLabel')),
                vEl(doc, 'input', {
                    type: 'text',
                    className: 'clodex-rp-input',
                    maxLength: 70,
                    placeholder: t('uw.targetPlaceholder', { char: charName }),
                    value: targetDraft,
                    dataset: { rpAction: 'uw-target' },
                    onInput: e => actions.onTargetInput?.(String(e?.target?.value ?? '')),
                }),
            ),
            vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    dataset: { rpAction: 'uw-service', service: 'clearHeat' },
                    onClick: () => actions.onService?.('clearHeat'),
                }, `🧹 ${t(`uw.service.clearHeat.${resolvedSkin}`)} (${currency}${REP_SERVICES.clearHeat.cost})`),
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    disabled: Boolean(model.dossierBusy),
                    dataset: { rpAction: 'uw-service', service: 'npcDossier' },
                    onClick: () => actions.onService?.('npcDossier'),
                }, model.dossierBusy
                    ? `⏳ ${t('uw.dossierBusy')}`
                    : `🕵️ ${t(`uw.service.npcDossier.${resolvedSkin}`)} (${currency}${REP_SERVICES.npcDossier.cost})`),
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn',
                    dataset: { rpAction: 'uw-service', service: 'muscle' },
                    onClick: () => actions.onService?.('muscle'),
                }, `${resolvedSkin === 'tavern' ? '⚔️' : resolvedSkin === 'syndicate' ? '🤖' : '🥊'} ${t(`uw.service.muscle.${resolvedSkin}`)} (${currency}${REP_SERVICES.muscle.cost})`),
            ),
        ),
    );
    root.append(repCard);

    return root;
}
