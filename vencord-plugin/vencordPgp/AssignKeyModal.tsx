/*
 * Modal para asignar/gestionar la clave publica del destinatario de un MD
 * directamente desde el candado de la barra de chat (clic derecho).
 *
 * Solo se guardan claves publicas. La privada nunca se toca aqui.
 * Textos via i18n (es/en).
 */
import { copyWithToast } from "@utils/discord";
import type { Channel, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast } from "@webpack/common";

import { errorText, t } from "./i18n";
import { getDmRecipients, type DmRecipient } from "./dm";
import { resetDecryptionCache } from "./render";
import { getOwnPublicArmor, keyStore, notifyState, persistPublicKeys, subscribeState } from "./state";

export function openAssignKeyModal(channel: Channel, initialUserId?: string): void {
    const recipients = getDmRecipients(channel);
    if (recipients.length === 0) {
        showToast(t("toast.noRecipients"), "failure");
        return;
    }
    openModal(modalProps => (
        <AssignKeyModal
            modalProps={modalProps}
            recipients={recipients}
            initialUserId={initialUserId}
        />
    ));
}

function AssignKeyModal({ modalProps, recipients, initialUserId }: {
    modalProps: RenderModalProps;
    recipients: DmRecipient[];
    initialUserId?: string;
}) {
    const [selected, setSelected] = React.useState(
        initialUserId && recipients.some(r => r.id === initialUserId) ? initialUserId : recipients[0].id
    );
    const [armor, setArmor] = React.useState("");
    const [message, setMessage] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [, force] = React.useReducer((x: number) => x + 1, 0);

    React.useEffect(() => subscribeState(force), []);

    const recipient = recipients.find(r => r.id === selected) ?? recipients[0];
    const user = keyStore.getUser(selected);
    const keys = user?.keys ?? [];
    const ownPublic = getOwnPublicArmor();

    async function save() {
        setSaving(true);
        setMessage(null);
        try {
            const previous = (keyStore.getUser(selected)?.keys ?? []).map(k => k.fingerprint);
            const entry = await keyStore.addPublicKey(selected, recipient.name, armor);
            persistPublicKeys();
            resetDecryptionCache(); // reintentar mensajes que fallaron por falta/clave incorrecta
            notifyState();
            setArmor("");
            if (previous.length > 0 && !previous.includes(entry.fingerprint)) {
                setMessage(t("assign.newKeyWarn", {
                    name: recipient.name,
                    fp: entry.fingerprintPretty,
                }));
                showToast(t("toast.newKeyKnownUser"), "failure");
            } else {
                setMessage(t("assign.saved", { fp: entry.fingerprintPretty }));
            }
        } catch (e) {
            setMessage(errorText(e));
        } finally {
            setSaving(false);
        }
    }

    function toggleVerified(fingerprint: string, verified: boolean) {
        keyStore.markVerified(selected, fingerprint, verified);
        persistPublicKeys();
        resetDecryptionCache();
        notifyState();
    }

    function removeKey(fingerprint: string) {
        keyStore.removePublicKey(selected, fingerprint);
        if (!keyStore.getUser(selected)?.keys.length) keyStore.removeUser(selected);
        persistPublicKeys();
        resetDecryptionCache();
        notifyState();
    }

    async function copyOwnPublic() {
        if (!ownPublic) {
            setMessage(t("assign.unlockToCopy"));
            return;
        }
        await copyWithToast(ownPublic, t("common.copyPublicKey"));
    }

    return (
        <Modal
            {...modalProps}
            title={t("assign.title")}
            subtitle={t("assign.subtitle")}
            actions={[
                {
                    text: t("common.close"),
                    variant: "secondary",
                    onClick: modalProps.onClose,
                },
                {
                    text: saving ? t("common.saving") : t("assign.save"),
                    variant: "primary",
                    onClick: () => { void save(); },
                    disabled: !armor.trim() || saving,
                },
            ]}
        >
            <div className="vc-pgp-modal">
                {recipients.length > 1 && (
                    <section>
                        <div className="vc-pgp-modal-label">{t("assign.recipient")}</div>
                        <select
                            className="vc-pgp-select"
                            value={selected}
                            onChange={e => {
                                setSelected(e.currentTarget.value);
                                setArmor("");
                                setMessage(null);
                            }}
                        >
                            {recipients.map(r => (
                                <option value={r.id} key={r.id}>
                                    {r.name} · {keyStore.getEncryptionArmors(r.id).length ? t("assign.keyOk") : t("assign.noKey")}
                                </option>
                            ))}
                        </select>
                    </section>
                )}

                <div className="vc-pgp-modal-note">
                    {t("assign.userLabel")} <b>{recipient.name}</b> · ID <code>{recipient.id}</code>
                </div>

                {keys.length === 0 && (
                    <div className="vc-pgp-modal-warn">
                        {t("assign.noPublicKeyWarn")}
                    </div>
                )}

                {keys.map(k => (
                    <div className="vc-pgp-modal-key" key={k.fingerprint}>
                        <code className="vc-pgp-fingerprint">{k.fingerprintPretty}</code>
                        <span className={k.verified && !k.revoked && !k.expired ? "vc-pgp-ok" : "vc-pgp-warn"}>
                            {k.revoked
                                ? t("common.status.revoked")
                                : k.expired
                                    ? t("common.status.expired")
                                    : k.verified
                                        ? t("common.status.verified")
                                        : t("common.status.unverified")}
                        </span>
                        <button
                            className="vc-pgp-btn vc-pgp-small"
                            onClick={() => void copyWithToast(k.fingerprintPretty, t("common.copyFingerprint"))}
                        >
                            {t("common.copyFingerprintButton")}
                        </button>
                        <button
                            className="vc-pgp-btn vc-pgp-small"
                            onClick={() => toggleVerified(k.fingerprint, !k.verified)}
                        >
                            {k.verified ? t("common.unmarkVerified") : t("common.markVerified")}
                        </button>
                        <button
                            className="vc-pgp-btn vc-pgp-small vc-pgp-danger"
                            onClick={() => removeKey(k.fingerprint)}
                        >
                            {t("common.delete")}
                        </button>
                    </div>
                ))}

                <section>
                    <div className="vc-pgp-modal-label">{t("assign.addOrReplaceHeading")}</div>
                    <textarea
                        className="vc-pgp-textarea"
                        rows={6}
                        spellCheck={false}
                        placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                        value={armor}
                        onChange={e => setArmor(e.currentTarget.value)}
                    />
                </section>

                <div className="vc-pgp-row">
                    <button className="vc-pgp-btn" onClick={() => { void copyOwnPublic(); }}>
                        {t("common.copyOwnPublicKey")}
                    </button>
                </div>

                {message && <div className="vc-pgp-msg">{message}</div>}

                <div className="vc-pgp-modal-note">
                    {t("assign.footerNote")}
                </div>
            </div>
        </Modal>
    );
}
