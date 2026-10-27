/*
 * Candado en la barra de chat (solo MD/grupos MD).
 *
 * - Clic izquierdo: activa/desactiva el cifrado en ESTA conversacion.
 * - Clic derecho: menu contextual con accesos rapidos:
 *     · Clave publica del destinatario
 *     · Guardar MI clave privada cifrada (vault local, sin ir a Ajustes)
 *     · Cargar clave privada guardada
 *     · Bloquear clave privada
 *     · Abrir PGP Key Manager
 *
 * Estado visual: cerrado verde = cifrado activo; abierto = desactivado;
 * amarillo con punto = activo pero faltan claves.
 */
import { ChatBarButton, type ChatBarButtonFactory } from "@api/ChatButtons";
import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import { ContextMenuApi, Menu, React, showToast, UserStore } from "@webpack/common";

import { openAssignKeyModal } from "./AssignKeyModal";
import { resolveEncryptionEnabled } from "./core/channelPolicy";
import { getDmRecipients, isDmChannel } from "./dm";
import { LockIcon, UnlockIcon } from "./icons";
import { clearDecrypted } from "./render";
import { openSaveVaultModal } from "./SaveVaultModal";
import { openStoredKeyModal } from "./StoredKeyModal";
import {
    decryptCache, getPrivateArmorDraft, keyStore, notifyState, session,
    setOwnPublicArmor, subscribeState,
} from "./state";
import { hasStoredVault } from "./vault";

interface PgpSettingsLike {
    store: any;
    use: (paths: any) => any;
}

type Props = Parameters<ChatBarButtonFactory>[0] & { settings: PgpSettingsLike; };

export function PgpLockButton({ channel, isMainChat, settings }: Props) {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => subscribeState(force), []);
    settings.use(["pgpEnabled", "autoEncryptDMs", "channelOverrides"]);

    if (!isMainChat || !isDmChannel(channel)) return null;

    const recipients = getDmRecipients(channel);
    if (recipients.length === 0) return null;

    const overrides = (settings.store.channelOverrides ?? {}) as Record<string, "on" | "off">;
    const override = overrides[channel.id];
    const globalOn = !!settings.store.pgpEnabled;
    const botOnly = recipients.every(r => UserStore.getUser(r.id)?.bot === true);
    const hasBot = recipients.some(r => UserStore.getUser(r.id)?.bot === true);
    const desired = globalOn && !botOnly && resolveEncryptionEnabled(override, !!settings.store.autoEncryptDMs);
    const missing = desired
        ? recipients.filter(r => keyStore.getEncryptionArmors(r.id).length === 0)
        : [];
    const state: "on" | "off" | "missing" = !globalOn || botOnly || !desired
        ? "off"
        : hasBot || missing.length > 0
            ? "missing"
            : "on";

    const names = recipients.map(r => r.name).join(", ");
    const tooltip = !globalOn
        ? "PGP desactivado globalmente. Activalo en Ajustes > Vencord > Plugins > VencordPGP."
        : botOnly
            ? `Bot (${names}): los mensajes con bots no se cifran.`
            : hasBot
                ? `PGP activo, pero la conversacion incluye un bot: el envio cifrado se cancela.`
                : state === "missing"
                    ? `PGP activo pero faltan claves para ${missing.map(r => r.name).join(", ")}. Clic: desactivar. Clic derecho: menu.`
                    : state === "on"
                        ? `PGP cifrado activo (${names}). Clic: desactivar. Clic derecho: menu.`
                        : `PGP desactivado (${names}). Clic: activar. Clic derecho: menu.`;

    function setOverride(mode: "on" | "off") {
        settings.store.channelOverrides = { ...overrides, [channel.id]: mode };
        notifyState();
    }

    function onToggle() {
        if (!globalOn) {
            showToast({ text: "PGP: esta desactivado globalmente. Activalo en Ajustes > Vencord > Plugins > VencordPGP.", variant: "critical" });
            return;
        }
        if (botOnly) {
            showToast({ text: "PGP: los mensajes con bots no se cifran.", variant: "default" });
            return;
        }
        if (desired) {
            setOverride("off");
            showToast({ text: "PGP: cifrado desactivado en esta conversacion.", variant: "default" });
            return;
        }
        if (hasBot) {
            showToast({ text: "PGP: no se puede cifrar un grupo con bots. Quita el bot o deja el cifrado desactivado.", variant: "critical" });
            return;
        }

        setOverride("on");
        const stillMissing = recipients.filter(r => keyStore.getEncryptionArmors(r.id).length === 0);
        if (stillMissing.length > 0) {
            showToast({
                text: `PGP: cifrado activado, pero faltan claves para ${stillMissing.map(r => r.name).join(", ")}.`,
                variant: "critical",
            });
            openAssignKeyModal(channel, stillMissing[0].id);
        } else {
            showToast({ text: "PGP: cifrado activado en esta conversacion.", variant: "success" });
        }
    }

    async function loadStoredKey() {
        if (await hasStoredVault()) {
            openStoredKeyModal();
        } else {
            showToast({ text: "PGP: no hay ninguna clave privada guardada en este equipo.", variant: "critical" });
        }
    }

    function lockKey() {
        clearDecrypted();
        session.lock();
        decryptCache.lock();
        setOwnPublicArmor(null);
        notifyState();
        showToast({ text: "PGP: clave privada bloqueada.", variant: "default" });
    }

    function openManager() {
        const self = plugins["VencordPGP"];
        if (self) openPluginModal(self);
    }

    function onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        const hasPrivateKey = session.hasArmored || !!getPrivateArmorDraft().trim();

        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu
                navId="vc-pgp-lock-menu"
                onClose={() => ContextMenuApi.closeContextMenu()}
                aria-label="PGP"
            >
                <Menu.MenuItem
                    id="vc-pgp-recipient-keys"
                    label="Clave publica del destinatario..."
                    action={() => openAssignKeyModal(channel)}
                />
                <Menu.MenuItem
                    id="vc-pgp-save-vault"
                    label="Guardar mi clave privada cifrada..."
                    disabled={!hasPrivateKey}
                    action={() => openSaveVaultModal()}
                />
                <Menu.MenuItem
                    id="vc-pgp-load-vault"
                    label="Cargar clave privada guardada..."
                    action={() => { void loadStoredKey(); }}
                />
                <Menu.MenuSeparator />
                {session.isUnlocked && (
                    <Menu.MenuItem
                        id="vc-pgp-lock-key"
                        label="Bloquear clave privada"
                        action={lockKey}
                    />
                )}
                <Menu.MenuItem
                    id="vc-pgp-open-manager"
                    label="Abrir PGP Key Manager"
                    action={openManager}
                />
            </Menu.Menu>
        ));
    }

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={onToggle}
            onContextMenu={onContextMenu}
            buttonProps={{ "aria-haspopup": "menu" }}
        >
            <span className={`vc-pgp-chat-lock vc-pgp-lock-${state}`}>
                {state === "off"
                    ? <UnlockIcon height={20} width={20} />
                    : <LockIcon height={20} width={20} />}
                {state === "missing" && <span className="vc-pgp-lock-dot" />}
            </span>
        </ChatBarButton>
    );
}
