import { vEl } from './director.js';

function vCrButton(doc, label, click, disabled = false) {
    return vEl(doc, 'button', { type: 'button', className: 'clodex-rp-btn-mini', disabled, onClick: click }, label);
}

function vCrInput(doc, label, value, onInput, maxLength, tag = 'input', readOnly = false) {
    return vEl(doc, 'label', { className: 'clodex-rp-field' },
        vEl(doc, 'span', {}, label),
        vEl(doc, tag, { className: 'clodex-rp-input', value, maxLength, readOnly, spellcheck: false, autocomplete: 'off',
            onInput: e => onInput?.(String(e.target.value)), rows: tag === 'textarea' ? 2 : undefined }),
    );
}

export function vCrRenderGifts(doc, t, model, actions) {
    const isOpen = Boolean(model.target || model.latest || model.draft || model.busy);
    const panel = vEl(doc, 'details', { className: 'clodex-rp-card', open: isOpen, dataset: { rpView: 'pet-gifts' } },
        vEl(doc, 'summary', {}, '🎁 ' + t('gift.title')),
        vEl(doc, 'p', { className: 'clodex-rp-muted' }, t('gift.offlineNotice')),
        vEl(doc, 'div', { hidden: !model.target },
            vEl(doc, 'strong', {}, model.target?.name || ''),
            vCrInput(doc, t('gift.alias'), model.alias, actions.onAlias, 32),
            vCrInput(doc, t('gift.note'), model.note, actions.onNote, 140),
            vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
                vCrButton(doc, t('gift.package'), actions.onConfirm, model.busy),
                vCrButton(doc, t('gift.cancel'), actions.onCancel, model.busy)),
        ),
        vEl(doc, 'div', { hidden: !model.latest },
            vCrInput(doc, t('gift.code'), model.latest, null, 5470, 'textarea', true),
        ),
        vCrInput(doc, t('gift.paste'), model.draft, actions.onDraft, 5470, 'textarea'),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
            vCrButton(doc, t('gift.redeem'), actions.onRedeem, model.busy),
            vCrButton(doc, t('gift.import'), actions.onImport, model.busy)),
    );
    if (model.sent?.length) panel.append(vEl(doc, 'details', { open: Boolean(model.latest) },
        vEl(doc, 'summary', {}, t('gift.sentHistory')),
        ...model.sent.map(item => vEl(doc, 'div', { className: 'clodex-rp-card' },
            vEl(doc, 'strong', {}, item.name || t('gift.title')),
            vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
                vCrButton(doc, t('gift.copy'), () => actions.onCopy(item.code)),
                vCrButton(doc, t('gift.export'), () => actions.onExport(item.code)),
                vCrButton(doc, t('gift.recall'), () => actions.onRecall(item.giftId), model.busy)),
        )),
    ));
    return panel;
}

export function vCrRenderJoin(doc, t, model, actions) {
    return vEl(doc, 'details', { className: 'clodex-rp-card', open: Boolean(model.target || model.code || model.busy), dataset: { rpView: 'nest-join' } },
        vEl(doc, 'summary', {}, '🤝 ' + t('nest.title')),
        vCrInput(doc, t('nest.alias'), model.alias, actions.onAlias, 32),
        model.target ? vEl(doc, 'strong', {}, model.target.name) : vCrInput(doc, t('nest.invite'), model.code, actions.onCode, 14),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
            model.target
                ? vCrButton(doc, t('nest.create'), actions.onCreate, model.busy)
                : vCrButton(doc, t('nest.join'), actions.onJoin, model.busy),
            model.target ? vCrButton(doc, t('gift.cancel'), actions.onCancel) : null,
            vCrButton(doc, t('nest.refresh'), actions.onRefresh)),
    );
}

export function vCrRenderNest(doc, t, item, model, actions) {
    if (!item.sharedNestUid) return vCrButton(doc, '🤝 ' + t('nest.create'), actions.onCreate, model.busy);
    const rtfLocale = t('nest.locale') === 'ru' ? 'ru' : 'en';
    const dateFmt = new Intl.RelativeTimeFormat(rtfLocale, { numeric: 'always' });
    return vEl(doc, 'section', { className: 'clodex-rp-subbox clodex-rp-mt', dataset: { rpView: 'shared-nest' } },
        vEl(doc, 'strong', {}, item.sharedPartnerAlias
            ? '🤝 ' + t('nest.withPartner', { name: item.sharedPartnerAlias })
            : '🤝 ' + t('nest.waiting')),
        item.nestInvite ? vCrInput(doc, t('nest.invite'), item.nestInvite, null, 14, 'input', true) : null,
        model.waiting ? vEl(doc, 'div', { className: 'clodex-rp-muted' }, t('nest.queued')) : null,
        ...(item.nestEvents || []).map(evt => {
            const minutes = Math.max(0, Math.floor((Date.now() - evt.at * 1000) / 60000));
            const when = minutes >= 60 ? dateFmt.format(-Math.floor(minutes / 60), 'hour') : dateFmt.format(-minutes, 'minute');
            const delta = evt.fullnessDelta ? ' · 🍖 ' + (evt.fullnessDelta > 0 ? '+' : '') + evt.fullnessDelta + '%'
                : evt.energyDelta ? ' · 💤 ' + (evt.energyDelta > 0 ? '+' : '') + evt.energyDelta + '%' : '';
            return vEl(doc, 'div', { className: 'clodex-rp-muted' },
                (evt.actorRole === item.sharedRole ? t('nest.you') : item.sharedPartnerAlias || t('nest.partner')) +
                ': ' + t(`nest.action.${evt.action}`) + delta + ' · ' + when);
        }),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row' },
            vCrButton(doc, '↻ ' + t('nest.refresh'), actions.onRefresh),
            item.nestInvite ? vCrButton(doc, t('gift.copy'), () => actions.onCopy(item.nestInvite)) : null,
            item.nestCanRotate ? vCrButton(doc, t('nest.rotate'), actions.onRotate, model.busy) : null,
            vCrButton(doc, t('nest.leave'), actions.onLeave, model.busy)),
    );
}

export function vCrRenderRelicClaim(doc, t, model, actions) {
    return vEl(doc, 'section', { className: 'clodex-rp-card', dataset: { rpView: 'relic-gift-claim' } },
        vCrInput(doc, t('relic.giftCode'), model.code, actions.onInput, 'RPR-GIFT-XXXX-XXXX-XXXX'.length),
        vCrButton(doc, t('relic.giftActivate'), actions.onClaim, model.busy),
    );
}
