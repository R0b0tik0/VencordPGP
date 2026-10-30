/*
 * Carga a demanda de la clave privada guardada (cifrada).
 *
 * - NO se abre al iniciar Discord.
 * - Se abre cuando el usuario intenta enviar/editar en una conversacion cifrada
 *   y la clave esta bloqueada (o manualmente desde el panel).
 * - La contrasena de almacenamiento no se guarda nunca.
 * - Textos via i18n (es/en).
 */
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast } from "@webpack/common";

import { PgpError } from "./core/errors";
import { errorText, t } from "./i18n";
import { resetDecryptionCache } from "./render";
import {
    notifyState, session, setOwnPublicArmor, setPrivateArmorDraft,
} from "./state";
import { deleteVault, loadFromVault } from "./vault";

let pendingRequest: Promise<boolean> | null = null;

/**
 * Pide la contrasena de almacenamiento y carga+desbloquea la clave.
 * Resuelve true si quedo desbloqueada; false si el usuario cancela/falla.
 * Si ya hay un modal abierto, devuelve la misma promesa (no duplica).
 */
export function requestStoredKeyUnlock(): Promise<boolean> {
    if (pendingRequest) return pendingRequest;

    pendingRequest = new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            pendingRequest = null;
            resolve(ok);
        };

        try {
            openModal(modalProps => (
                <StoredKeyModal modalProps={modalProps} onDone={finish} />
            ));
        } catch {
            finish(false);
        }
    });

    return pendingRequest;
}

/** Apertura manual (panel), sin promesa asociada. */
export function openStoredKeyModal(): void {
    openModal(modalProps => <StoredKeyModal modalProps={modalProps} />);
}

function StoredKeyModal({ modalProps, onDone }: {
    modalProps: RenderModalProps;
    onDone?: (ok: boolean) => void;
}) {
    const [storagePassword, setStoragePassword] = React.useState("");
    const [keyPassphrase, setKeyPassphrase] = React.useState("");
    const [message, setMessage] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const finish = (ok: boolean) => onDone?.(ok);
    const close = () => {
        finish(false);
        modalProps.onClose();
    };

    async function load() {
        setBusy(true);
        setMessage(null);
        try {
            const payload = await loadFromVault(storagePassword);
            // setPrivateArmorDraft resetea el desbloqueo: hacerlo antes de unlock.
            setPrivateArmorDraft(payload.armor);
            const passphrase = payload.passphrase ?? keyPassphrase;
            session.setPassphrase(passphrase || null);
            try {
                await session.unlock();
            } catch (e) {
                // Clave protegida: pedir la passphrase. Las claves SIN passphrase
                // se desbloquean arriba con vacio (no llegan aqui).
                if (e instanceof PgpError && e.code === "PRIVATE_KEY_LOCKED") {
                    setMessage(t("stored.needsPassphrase"));
                    return;
                }
                throw e;
            }
            setOwnPublicArmor(session.requireUnlocked().toPublic().armor());
            resetDecryptionCache();
            notifyState();
            showToast(t("toast.keyLoadedUnlocked"), "success");
            finish(true);
            modalProps.onClose();
        } catch (e) {
            setMessage(errorText(e));
        } finally {
            setBusy(false);
        }
    }

    async function removeStored() {
        await deleteVault();
        notifyState();
        showToast(t("toast.storedKeyDeleted"), "message");
        finish(false);
        modalProps.onClose();
    }

    return (
        <Modal
            {...modalProps}
            onClose={close}
            title={t("stored.title")}
            subtitle={t("stored.subtitle")}
            actions={[
                {
                    text: t("stored.notNow"),
                    variant: "secondary",
                    onClick: close,
                },
                {
                    text: busy ? t("common.loading") : t("stored.load"),
                    variant: "primary",
                    onClick: () => { void load(); },
                    disabled: storagePassword.length === 0 || busy,
                },
            ]}
        >
            <div className="vc-pgp-modal">
                <input
                    className="vc-pgp-input"
                    type="password"
                    autoFocus
                    placeholder={t("stored.passwordPlaceholder")}
                    value={storagePassword}
                    onChange={e => setStoragePassword(e.currentTarget.value)}
                />
                <input
                    className="vc-pgp-input"
                    type="password"
                    placeholder={t("stored.passphrasePlaceholder")}
                    value={keyPassphrase}
                    onChange={e => setKeyPassphrase(e.currentTarget.value)}
                />
                <div className="vc-pgp-modal-note">
                    {t("stored.note")}
                </div>
                {message && <div className="vc-pgp-msg">{message}</div>}
                <div className="vc-pgp-row">
                    <button className="vc-pgp-btn vc-pgp-danger" onClick={() => { void removeStored(); }}>
                        {t("stored.delete")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
