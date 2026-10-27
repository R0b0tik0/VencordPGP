/*
 * Modal para asignar/gestionar la clave publica del destinatario de un MD
 * directamente desde el candado de la barra de chat (clic derecho).
 *
 * Solo se guardan claves publicas. La privada nunca se toca aqui.
 */
import { copyWithToast } from "@utils/discord";
import type { Channel, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast } from "@webpack/common";

import { PgpError } from "./core/errors";
import { getDmRecipients, type DmRecipient } from "./dm";
import { resetDecryptionCache } from "./render";
import { getOwnPublicArmor, keyStore, notifyState, persistPublicKeys, subscribeState } from "./state";

function errorText(e: unknown): string {
    if (e instanceof PgpError) return e.message;
    if (e instanceof Error && e.message) return e.message;
    return "Operacion fallida.";
}

export function openAssignKeyModal(channel: Channel, initialUserId?: string): void {
    const recipients = getDmRecipients(channel);
    if (recipients.length === 0) {
        showToast({ text: "PGP: esta conversacion no tiene destinatarios.", variant: "critical" });
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
                setMessage(
                    `ADVERTENCIA: clave nueva para ${recipient.name}. Verifica la huella (${entry.fingerprintPretty}) por otro canal antes de marcarla como verificada.`
                );
                showToast({ text: "PGP: nueva clave para un usuario conocido; verifica la huella.", variant: "critical" });
            } else {
                setMessage(`Clave guardada: ${entry.fingerprintPretty}`);
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
            setMessage("Desbloquea tu clave privada para copiar tu clave publica.");
            return;
        }
        await copyWithToast(ownPublic, "Clave publica copiada");
    }

    return (
        <Modal
            {...modalProps}
            title="Claves PGP del MD"
            subtitle="Asigna la clave publica de cada destinatario. Nunca se comparte tu clave privada."
            actions={[
                {
                    text: "Cerrar",
                    variant: "secondary",
                    onClick: modalProps.onClose,
                },
                {
                    text: saving ? "Guardando..." : "Guardar clave",
                    variant: "primary",
                    onClick: () => { void save(); },
                    disabled: !armor.trim() || saving,
                },
            ]}
        >
            <div className="vc-pgp-modal">
                {recipients.length > 1 && (
                    <section>
                        <div className="vc-pgp-modal-label">Destinatario</div>
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
                                    {r.name} · {keyStore.getEncryptionArmors(r.id).length ? "clave OK" : "sin clave"}
                                </option>
                            ))}
                        </select>
                    </section>
                )}

                <div className="vc-pgp-modal-note">
                    Usuario: <b>{recipient.name}</b> · ID <code>{recipient.id}</code>
                </div>

                {keys.length === 0 && (
                    <div className="vc-pgp-modal-warn">
                        Sin clave publica para este usuario. Los mensajes cifrados no se podran enviar hasta que la añadas.
                    </div>
                )}

                {keys.map(k => (
                    <div className="vc-pgp-modal-key" key={k.fingerprint}>
                        <code className="vc-pgp-fingerprint">{k.fingerprintPretty}</code>
                        <span className={k.verified && !k.revoked && !k.expired ? "vc-pgp-ok" : "vc-pgp-warn"}>
                            {k.revoked ? "REVOCADA" : k.expired ? "CADUCADA" : k.verified ? "verificada" : "NO verificada"}
                        </span>
                        <button
                            className="vc-pgp-btn vc-pgp-small"
                            onClick={() => void copyWithToast(k.fingerprintPretty, "Huella copiada")}
                        >
                            Copiar huella
                        </button>
                        <button
                            className="vc-pgp-btn vc-pgp-small"
                            onClick={() => toggleVerified(k.fingerprint, !k.verified)}
                        >
                            {k.verified ? "Desmarcar" : "Marcar verificada"}
                        </button>
                        <button
                            className="vc-pgp-btn vc-pgp-small vc-pgp-danger"
                            onClick={() => removeKey(k.fingerprint)}
                        >
                            Eliminar
                        </button>
                    </div>
                ))}

                <section>
                    <div className="vc-pgp-modal-label">Añadir / sustituir clave publica</div>
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
                        Copiar mi clave publica
                    </button>
                </div>

                {message && <div className="vc-pgp-msg">{message}</div>}

                <div className="vc-pgp-modal-note">
                    Compara la huella por voz o en persona antes de marcarla como verificada.
                    El cifrado no autentica por si solo al remitente.
                </div>
            </div>
        </Modal>
    );
}
