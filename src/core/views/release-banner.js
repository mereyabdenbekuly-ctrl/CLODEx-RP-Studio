import { vEl } from './director.js';

export function vRlsRenderBanner(doc, t, model, actions) {
    const { bulletin, showUpdate, showAnnouncement, host, updating } = model;
    if (!bulletin || (!showUpdate && !showAnnouncement)) return null;
    const isRu = model.locale === 'ru';
    const title = isRu ? bulletin.titleRu : bulletin.titleEn;
    const highlights = (isRu ? bulletin.highlightsRu : bulletin.highlightsEn) || [];
    const announcementText = isRu ? (bulletin.announcementRu || bulletin.announcementEn) : (bulletin.announcementEn || bulletin.announcementRu);

    const children = [];
    if (showUpdate) {
        const downloadUrl = host === 'sillytavern' ? (bulletin.zipUrl || bulletin.releaseUrl) : bulletin.tpgUrl;
        const primaryAction = host === 'sillytavern' && actions.onSelfUpdate
            ? vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn-mini active',
                disabled: Boolean(updating),
                dataset: { rpAction: 'release-self-update' },
                onClick: () => actions.onSelfUpdate(),
            }, updating ? t('release.updating') : `🔄 ${t('release.updateSt')}`)
            : vEl(doc, 'a', {
                className: 'clodex-rp-btn-mini active clodex-rp-link-btn',
                href: downloadUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                dataset: { rpAction: 'release-download' },
            }, `📥 ${t(host === 'tavo' ? 'release.downloadTpg' : 'release.downloadZip', { version: bulletin.latestVersion })}`);
        if (primaryAction.tagName === 'A') {
            primaryAction.setAttribute?.('href', downloadUrl);
            primaryAction.setAttribute?.('target', '_blank');
            primaryAction.setAttribute?.('rel', 'noopener noreferrer');
        }
        const notesLink = vEl(doc, 'a', {
            className: 'clodex-rp-btn-mini clodex-rp-link-btn',
            href: bulletin.releaseUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            dataset: { rpAction: 'release-notes' },
        }, `↗ ${t('release.whatsNew')}`);
        notesLink.setAttribute?.('href', bulletin.releaseUrl);
        notesLink.setAttribute?.('target', '_blank');
        notesLink.setAttribute?.('rel', 'noopener noreferrer');

        children.push(
            vEl(doc, 'div', { className: 'clodex-rp-list-item' },
                vEl(doc, 'strong', {}, `🆕 ${title}`),
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini',
                    title: t('release.dismiss'),
                    dataset: { rpAction: 'release-dismiss' },
                    onClick: () => actions.onDismissUpdate?.(bulletin.latestVersion),
                }, '✕'),
            ),
            ...highlights.map(line => vEl(doc, 'div', { className: 'clodex-rp-muted' }, line)),
            host === 'tavo' ? vEl(doc, 'div', { className: 'clodex-rp-muted' }, t('release.tavoHint')) : null,
            vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' }, primaryAction, notesLink),
        );
    }

    if (showAnnouncement && (announcementText || bulletin.promoGiftCode)) {
        children.push(
            vEl(doc, 'div', { className: 'clodex-rp-list-item clodex-rp-mt' },
                vEl(doc, 'strong', {}, `📢 ${announcementText || t('release.promoTitle')}`),
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini',
                    title: t('release.dismiss'),
                    dataset: { rpAction: 'announcement-dismiss' },
                    onClick: () => actions.onDismissAnnouncement?.(bulletin.announcementId),
                }, '✕'),
            ),
            bulletin.promoGiftCode ? vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
                vEl(doc, 'button', {
                    type: 'button',
                    className: 'clodex-rp-btn-mini active',
                    dataset: { rpAction: 'claim-promo-pet' },
                    onClick: () => actions.onClaimPromo?.(bulletin.promoGiftCode, bulletin.announcementId),
                }, `🎁 ${t('release.claimPromoPet')}`),
            ) : null,
        );
    }

    return vEl(doc, 'section', { className: 'clodex-rp-card', dataset: { rpView: 'release-banner' } }, ...children);
}

export function vRlsRenderFeedback(doc, t, model, actions) {
    if (!model.open) return null;
    const categories = [
        ['idea', `💡 ${t('release.cat.idea')}`],
        ['bug', `🐛 ${t('release.cat.bug')}`],
        ['praise', `❤️ ${t('release.cat.praise')}`],
    ];
    return vEl(doc, 'section', { className: 'clodex-rp-card', dataset: { rpView: 'feedback-panel' } },
        vEl(doc, 'div', { className: 'clodex-rp-list-item' },
            vEl(doc, 'strong', {}, `💬 ${t('release.feedbackTitle')}`),
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn-mini',
                dataset: { rpAction: 'feedback-close' },
                onClick: () => actions.onClose?.(),
            }, '✕'),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-chips clodex-rp-mt' },
            ...categories.map(([id, label]) => vEl(doc, 'button', {
                type: 'button',
                className: `clodex-rp-chip-btn ${model.category === id ? 'active' : ''}`,
                dataset: { rpAction: 'feedback-cat', cat: id },
                onClick: () => actions.onCategory?.(id),
            }, label)),
        ),
        vEl(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
            vEl(doc, 'span', {}, t('release.feedbackPlaceholder')),
            vEl(doc, 'textarea', {
                className: 'clodex-rp-input',
                rows: 2,
                maxLength: 1000,
                value: model.message,
                dataset: { rpInput: 'feedback-message' },
                onInput: e => actions.onMessage?.(String(e.target.value)),
            }),
        ),
        vEl(doc, 'label', { className: 'clodex-rp-field clodex-rp-mt' },
            vEl(doc, 'span', {}, t('release.feedbackContact')),
            vEl(doc, 'input', {
                type: 'text',
                className: 'clodex-rp-input',
                maxLength: 80,
                value: model.contact,
                dataset: { rpInput: 'feedback-contact' },
                onInput: e => actions.onContact?.(String(e.target.value)),
            }),
        ),
        vEl(doc, 'div', { className: 'clodex-rp-btn-row clodex-rp-mt' },
            vEl(doc, 'button', {
                type: 'button',
                className: 'clodex-rp-btn clodex-rp-btn-primary',
                disabled: Boolean(model.busy),
                dataset: { rpAction: 'feedback-submit' },
                onClick: () => actions.onSubmit?.(),
            }, model.busy ? t('release.feedbackSending') : t('release.feedbackSubmit')),
        ),
    );
}
