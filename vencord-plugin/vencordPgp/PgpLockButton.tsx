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
 * Textos via i18n (es/en).
 */
import { ChatBarButton, type ChatBarButtonFactory } from "@api/ChatButtons";
import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import { ContextMenuApi, Menu, React, showToast, UserStore } from "@webpack/common";

import { openAssignKeyModal } from "./AssignKeyModal";
import { resolveEncryptionEnabled } from "./core/channelPolicy";
import { getDmRecipients, isDmChannel } from "./dm";
import { t } from "./i18n";
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
    settings.use(["pgpEnabled", "autoEncryptDMs", "channelOverrides", "language"]);

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
        ? t("lock.tooltip.globallyOff")
        : botOnly
            ? t("lock.tooltip.botOnly", { names })
            : hasBot
                ? t("lock.tooltip.hasBot")
                : state === "missing"
                    ? t("lock.tooltip.missing", { names: missing.map(r => r.name).join(", ") })
                    : state === "on"
                        ? t("lock.tooltip.on", { names })
                        : t("lock.tooltip.off", { names });

    function setOverride(mode: "on" | "off") {
        settings.store.channelOverrides = { ...overrides, [channel.id]: mode };
        notifyState();
    }

    function onToggle() {
        if (!globalOn) {
            showToast(t("toast.globallyDisabled"), "failure");
            return;
        }
        if (botOnly) {
            showToast(t("toast.botNoEncrypt"), "message");
            return;
        }
        if (desired) {
            setOverride("off");
            showToast(t("toast.encryptionOffChannel"), "message");
            return;
        }
        if (hasBot) {
            showToast(t("toast.botGroupCannotEncrypt"), "failure");
            return;
        }

        setOverride("on");
        const stillMissing = recipients.filter(r => keyStore.getEncryptionArmors(r.id).length === 0);
        if (stillMissing.length > 0) {
            showToast(t("toast.encryptionOnMissing", { users: stillMissing.map(r => r.name).join(", ") }), "failure");
            openAssignKeyModal(channel, stillMissing[0].id);
        } else {
            showToast(t("toast.encryptionOn"), "success");
        }
    }

    async function loadStoredKey() {
        if (await hasStoredVault()) {
            openStoredKeyModal();
        } else {
            showToast(t("toast.noStoredKey"), "failure");
        }
    }

    function lockKey() {
        clearDecrypted();
        session.lock();
        decryptCache.lock();
        setOwnPublicArmor(null);
        notifyState();
        showToast(t("toast.keyLocked"), "message");
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
                    label={t("lock.menu.recipientKeys")}
                    action={() => openAssignKeyModal(channel)}
                />
                <Menu.MenuItem
                    id="vc-pgp-save-vault"
                    label={t("lock.menu.saveVault")}
                    disabled={!hasPrivateKey}
                    action={() => openSaveVaultModal()}
                />
                <Menu.MenuItem
                    id="vc-pgp-load-vault"
                    label={t("lock.menu.loadVault")}
                    action={() => { void loadStoredKey(); }}
                />
                <Menu.MenuSeparator />
                {session.isUnlocked && (
                    <Menu.MenuItem
                        id="vc-pgp-lock-key"
                        label={t("lock.menu.lockKey")}
                        action={lockKey}
                    />
                )}
                <Menu.MenuItem
                    id="vc-pgp-open-manager"
                    label={t("common.openManager")}
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
