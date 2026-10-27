/*
 * Guardar la clave privada cifrada (vault local) desde el menú del candado,
 * sin pasar por Ajustes ni cerrar Discord.
 *
 * Cifrado: PBKDF2-SHA256 + AES-256-GCM (WebCrypto). La contrasena de
 * almacenamiento no se guarda. Opcionalmente guarda tambien la passphrase de
 * la clave (si esta en memoria), para cargar y desbloquear con una sola.
 */
import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, showToast } from "@webpack/common";

import { PgpError } from "./core/errors";
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
            setMessage("Carga primero tu clave privada en PGP Key Manager.");
            return;
        }
        if (password.length < 8) {
            setMessage("La contrasena de almacenamiento debe tener al menos 8 caracteres.");
            return;
        }
        if (password !== confirm) {
            setMessage("Las contrasenas no coinciden.");
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
            showToast({ text: "PGP: clave privada guardada cifrada en este equipo.", variant: "success" });
            modalProps.onClose();
        } catch (e) {
            setMessage(e instanceof PgpError ? e.message : "No se pudo guardar la clave privada.");
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
            title="Guardar clave privada cifrada"
            subtitle="Se guarda solo en este equipo, cifrada con una contrasena que eliges. La contrasena no se guarda."
            actions={[
                {
                    text: "Cancelar",
                    variant: "secondary",
                    onClick: modalProps.onClose,
                },
                {
                    text: busy ? "Guardando..." : "Guardar cifrada",
                    variant: "primary",
                    onClick: () => { void save(); },
                    disabled: !valid || busy,
                },
            ]}
        >
            <div className="vc-pgp-modal">
                {!armor && (
                    <div className="vc-pgp-modal-warn">
                        No hay clave privada cargada. Pega tu clave en PGP Key Manager y vuelve a abrir este menu.
                    </div>
                )}

                <input
                    className="vc-pgp-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Contrasena de almacenamiento (min. 8 caracteres)"
                    value={password}
                    onChange={e => setPassword(e.currentTarget.value)}
                />
                <input
                    className="vc-pgp-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repite la contrasena"
                    value={confirm}
                    onChange={e => setConfirm(e.currentTarget.value)}
                />

                <label className="vc-pgp-check">
                    <input
                        type="checkbox"
                        checked={includePassphrase}
                        onChange={e => setIncludePassphrase(e.currentTarget.checked)}
                    />
                    Guardar tambien la passphrase de la clave (si esta en memoria)
                </label>

                <div className="vc-pgp-modal-note">
                    Cifrado PBKDF2-SHA256 + AES-256-GCM. Se guarda en el almacen local de Vencord
                    (IndexedDB), nunca en ajustes ni en la nube. Si olvidas la contrasena, podras
                    volver a pegar tu clave privada.
                </div>

                {message && <div className="vc-pgp-msg">{message}</div>}

                <div className="vc-pgp-row">
                    <button className="vc-pgp-btn" onClick={openManager}>
                        Abrir PGP Key Manager
                    </button>
                </div>
            </div>
        </Modal>
    );
}
