/*
 * Guardar la clave privada cifrada (vault local) desde el menú del candado,
 * sin pasar por Ajustes ni cerrar Discord.
 *
 * Cifrado: PBKDF2-SHA256 + AES-256-GCM (WebCrypto). La contrasena de
 * almacenamiento no se guarda. Opcionalmente guarda tambien la passphrase de
 * la clave (si esta en memoria), para cargar y desbloquear con una sola.
 * Textos via i18n (es/en).
 */
import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast } from "@webpack/common";

import { PgpError } from "./core/errors";
import { errorText, t } from "./i18n";
import { getPrivateArmorDraft, session } from "./state";
import { saveToVault } from "./vault";

export function openSaveVaultModal(): void {
    openModal(modalProps => <SaveVaultModal modalProps={modalProps} />);
}

function SaveVaultModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const [password, setPassword] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [includePassphrase, setIncludePassphrase] = React.useState(true);
    const [message, setMessage] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const armor = getPrivateArmorDraft().trim();
    const keyPassphrase = session.getPassphrase();
    const valid = !!armor && password.length >= 8 && password === confirm;

    async function save() {
        if (!armor) {
            setMessage(t("save.needsKey"));
            return;
        }
        if (password.length < 8) {
            setMessage(t("save.tooShort"));
            return;
        }
        if (password !== confirm) {
            setMessage(t("save.mismatch"));
            return;
        }

        setBusy(true);
        setMessage(null);
        try {
            await saveToVault(
                {
                    armor,
                    passphrase: includePassphrase && keyPassphrase ? keyPassphrase : undefined,
                },
                password
            );
            showToast(t("toast.privateKeySaved"), "success");
            modalProps.onClose();
        } catch (e) {
            setMessage(e instanceof PgpError ? errorText(e) : t("save.failed"));
        } finally {
            setBusy(false);
        }
    }

    function openManager() {
        modalProps.onClose();
        const self = plugins["VencordPGP"];
        if (self) openPluginModal(self);
    }

    return (
        <Modal
            {...modalProps}
            title={t("save.title")}
            subtitle={t("save.subtitle")}
            actions={[
                {
                    text: t("common.cancel"),
                    variant: "secondary",
                    onClick: modalProps.onClose,
                },
                {
                    text: busy ? t("common.saving") : t("save.confirm"),
                    variant: "primary",
                    onClick: () => { void save(); },
                    disabled: !valid || busy,
                },
            ]}
        >
            <div className="vc-pgp-modal">
                {!armor && (
                    <div className="vc-pgp-modal-warn">
                        {t("save.noKeyWarn")}
                    </div>
                )}

                <input
                    className="vc-pgp-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("save.passwordPlaceholder")}
                    value={password}
                    onChange={e => setPassword(e.currentTarget.value)}
                />
                <input
                    className="vc-pgp-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("save.repeatPlaceholder")}
                    value={confirm}
                    onChange={e => setConfirm(e.currentTarget.value)}
                />

                <label className="vc-pgp-check">
                    <input
                        type="checkbox"
                        checked={includePassphrase}
                        onChange={e => setIncludePassphrase(e.currentTarget.checked)}
                    />
                    {t("save.includePassphrase")}
                </label>

                <div className="vc-pgp-modal-note">
                    {t("save.note")}
                </div>

                {message && <div className="vc-pgp-msg">{message}</div>}

                <div className="vc-pgp-row">
                    <button className="vc-pgp-btn" onClick={openManager}>
                        {t("common.openManager")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
