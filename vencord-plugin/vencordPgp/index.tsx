/*
 * VencordPGP — cifrado/descifrado PGP automatico para MD y grupos MD.
 *
 * Integracion verificada contra Vencord 1.15.x:
 *  - definePlugin/OptionType: @utils/types
 *  - definePluginSettings: @api/Settings
 *  - onBeforeMessageSend/Edit: @api/MessageEvents (cancel => borrador intacto)
 *  - renderMessageAccessory: @api/MessageAccessories (muestra el claro y oculta
 *    el bloque cifrado por DOM; no se modifica el store)
 *  - chatBarButton: @api/ChatButtons (candado: activa/desactiva por conversacion
 *    y gestiona la clave publica del destinatario)
 *  - DataStore: almacen local de la clave privada cifrada (keyVault)
 *  - flux MESSAGE_CREATE/UPDATE/DELETE
 *
 * Fail-closed: si falta una clave o el cifrado falla, se cancela el envio.
 * La privada vive en RAM salvo que se guarde cifrada (vault.ts).
 */
import "./styles.css";

import type { MessageObject, SendMessageOptions, SendMessageProps } from "@api/MessageEvents";
import { definePluginSettings, SettingsStore } from "@api/Settings";
import type { Message } from "@vencord/discord-types";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, LocaleStore, showToast, UserStore } from "@webpack/common";

import { isSupportedChannel, resolveEncryptionEnabled, type ChannelLike } from "./core/channelPolicy";
import { PgpError } from "./core/errors";
import { KeyStore } from "./core/keyStore";
import { planOutgoing, encryptOutgoing } from "./core/outgoing";
import { isPgpTransport } from "./core/transport";
import { configureI18n, errorTextByCode, t } from "./i18n";
import { PgpAccessory } from "./PgpAccessory";
import { PgpLockButton } from "./PgpLockButton";
import { PgpLockIcon } from "./icons";
import { PgpPanel } from "./PgpPanel";
import { decryptMessage, forgetDecrypted, clearDecrypted, getLocalPlaintext, isLocallyDecrypted } from "./render";
import { requestStoredKeyUnlock } from "./StoredKeyModal";
import {
    decryptCache, getOwnPublicArmor, keyStore, notifyState, session,
    setOwnPublicArmor, setPublicKeysSaver,
} from "./state";
import { hasStoredVault } from "./vault";

const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        get description() { return t("settings.language.desc"); },
        options: [
            { get label() { return t("settings.language.auto"); }, value: "auto", default: true },
            { get label() { return t("settings.language.es"); }, value: "es" },
            { get label() { return t("settings.language.en"); }, value: "en" },
        ],
    },
    pgpEnabled: {
        type: OptionType.BOOLEAN,
        get description() { return t("settings.pgpEnabled.desc"); },
        default: true,
    },
    autoEncryptDMs: {
        type: OptionType.BOOLEAN,
        get description() { return t("settings.autoEncryptDMs.desc"); },
        default: true,
    },
    channelOverrides: {
        type: OptionType.CUSTOM,
        get description() { return t("settings.channelOverrides.desc"); },
        default: {} as Record<string, "on" | "off">,
    },
    signMessages: {
        type: OptionType.BOOLEAN,
        get description() { return t("settings.signMessages.desc"); },
        default: true,
    },
    messageLimit: {
        type: OptionType.SELECT,
        get description() { return t("settings.messageLimit.desc"); },
        default: 2000,
        options: [
            { get label() { return t("settings.messageLimit.2000"); }, value: 2000, default: true },
            { get label() { return t("settings.messageLimit.4000"); }, value: 4000 },
        ],
    },
    publicKeysByUser: {
        type: OptionType.CUSTOM,
        get description() { return t("settings.publicKeysByUser.desc"); },
        default: {} as Record<string, unknown>,
    },
    keyManager: {
        type: OptionType.COMPONENT,
        component: () => <PgpPanel />,
    },
});

/** Re-render de la UI (y textos) cuando cambia el idioma elegido. */
let languageChangeListener: (() => void) | null = null;

/** LocaleStore de Discord (modo "auto"); si no esta disponible, navigator.language. */
configureI18n({
    getSetting: () => {
        try {
            return (settings.store.language ?? "auto") as "auto" | "es" | "en";
        } catch {
            return "auto";
        }
    },
    getDiscordLocale: () => {
        try {
            return LocaleStore?.locale ?? navigator.language;
        } catch {
            return typeof navigator !== "undefined" ? navigator.language : "en";
        }
    },
});

const MessageActions = findByPropsLazy("deleteMessage", "startEditMessage") as {
    startEditMessage?(channelId: string, messageId: string, content: any, ...rest: any[]): void;
};
let originalStartEdit: ((...args: any[]) => any) | null = null;
let patchedStartEdit: ((...args: any[]) => any) | null = null;

function selfId(): string {
    return UserStore.getCurrentUser()?.id ?? "";
}

function channelOf(channelId: string): ChannelLike | null {
    const ch = ChannelStore.getChannel(channelId);
    if (!ch) return null;
    const raw = (ch as any).recipients ?? (ch as any).rawRecipients ?? [];
    const recipientIds: string[] = (Array.isArray(raw) ? raw : [])
        .map((r: any) => typeof r === "string" ? r : r?.id)
        .filter((x: any): x is string => typeof x === "string" && x.length > 0);
    return { id: ch.id ?? channelId, type: ch.type, recipientIds, name: ch.name };
}

function hasBotRecipient(recipients: string[]): boolean {
    return recipients.some(id => UserStore.getUser(id)?.bot === true);
}

function allRecipientsAreBots(recipients: string[]): boolean {
    return recipients.length > 0 && recipients.every(id => UserStore.getUser(id)?.bot === true);
}

/** URLs de GIF (picker de Discord): Tenor, Giphy, Klipy o cualquier .gif. */
const GIF_URL_RE = /(?:https?:\/\/[^\s<>"']+\.gif(?:[?#][^\s<>"']*)?|https?:\/\/[^\s<>"']*(?:tenor\.com|giphy\.com|klipy\.com)[^\s<>"']*)/i;

function isGifContent(content: string): boolean {
    return GIF_URL_RE.test(content);
}

/** Ajuste global + override por conversacion (candado de la barra de chat). */
function isEncryptionEnabledFor(channelId: string): boolean {
    const overrides = (settings.store.channelOverrides ?? {}) as Record<string, "on" | "off">;
    return resolveEncryptionEnabled(overrides[channelId], !!settings.store.autoEncryptDMs);
}

/** Evita repetir el aviso en cada mensaje de la misma conversacion. */
const warnedUnverifiedChannels = new Set<string>();

function warnUnverifiedRecipients(channelId: string, recipients: string[]): void {
    const unverified = keyStore.getUnverifiedEncryptionUserIds(recipients);
    if (unverified.length === 0) return;
    const warnKey = `${channelId}|${unverified.join(",")}`;
    if (warnedUnverifiedChannels.has(warnKey)) return;
    warnedUnverifiedChannels.add(warnKey);
    showToast(t("toast.unverifiedRecipients", { users: unverified.join(", ") }), "failure");
}

async function requireUnlockedForEncryption() {
    if (session.isUnlocked) return session.requireUnlocked();

    // Si hay armor en RAM y passphrase de sesion, intenta desbloquear sin molestar.
    if (session.hasArmored) {
        try {
            await session.unlock();
            return session.requireUnlocked();
        } catch { /* sigue: puede requerir contrasena de almacenamiento */ }
    }

    // Solo si hay una clave guardada cifrada se pide la contrasena, y solo ahora
    // (al intentar cifrar). Nunca al abrir Discord.
    if (await hasStoredVault()) {
        const ok = await requestStoredKeyUnlock();
        if (ok && session.isUnlocked) return session.requireUnlocked();
        throw new PgpError("PRIVATE_KEY_LOCKED", t("err.PRIVATE_KEY_LOCKED"));
    }

    if (session.hasArmored) {
        throw new PgpError("PRIVATE_KEY_LOCKED", t("err.PRIVATE_KEY_LOCKED"));
    }

    throw new PgpError("MISSING_PRIVATE_KEY", t("err.MISSING_PRIVATE_KEY"));
}

function ownPublicOrDerive(unlocked: ReturnType<typeof session.requireUnlocked>): string {
    const existing = getOwnPublicArmor();
    if (existing) return existing;
    const pub = unlocked.toPublic().armor();
    setOwnPublicArmor(pub);
    return pub;
}

/**
 * Reutiliza el boton de editar original de Discord: si el mensaje es PGP y ya
 * esta descifrado, startEditMessage recibe el texto claro en vez del cifrado,
 * de modo que el editor se abre con el contenido editable. Al guardar, preEdit
 * lo vuelve a cifrar y Discord hace una edicion real (mismo mensaje).
 */
function patchEditAction(): void {
    try {
        const actions = MessageActions as any;
        if (typeof actions?.startEditMessage !== "function" || originalStartEdit) return;
        const original = actions.startEditMessage;
        originalStartEdit = original;
        patchedStartEdit = function (this: any, channelId: string, messageId: string, content: any, ...rest: any[]) {
            try {
                const plain = getLocalPlaintext(messageId);
                if (plain !== undefined) {
                    if (typeof content === "string" && isPgpTransport(content)) {
                        content = plain;
                    } else if (content && typeof content === "object" && typeof content.content === "string" && isPgpTransport(content.content)) {
                        content = { ...content, content: plain };
                    }
                }
            } catch { /* noop */ }
            return original.call(this, channelId, messageId, content, ...rest);
        };
        actions.startEditMessage = patchedStartEdit;
    } catch { /* modulo no disponible */ }
}

function unpatchEditAction(): void {
    try {
        const actions = MessageActions as any;
        if (originalStartEdit && patchedStartEdit && actions?.startEditMessage === patchedStartEdit) {
            actions.startEditMessage = originalStartEdit;
        }
    } catch { /* noop */ }
    originalStartEdit = null;
    patchedStartEdit = null;
}

/** Fallback explicito si el boton original no abriese el texto claro. */
function startPgpEdit(msg: Message): void {
    const plain = getLocalPlaintext(msg.id);
    if (plain === undefined) {
        showToast(t("toast.notDecryptedEdit"), "failure");
        return;
    }
    const actions = MessageActions as any;
    if (typeof actions?.startEditMessage !== "function") {
        showToast(t("toast.editorUnavailable"), "failure");
        return;
    }
    actions.startEditMessage(msg.channel_id, msg.id, plain);
}

function toastError(e: unknown) {
    const error = e instanceof PgpError ? errorTextByCode(e.code) : t("toast.cryptoFailed");
    showToast(t("toast.sendFailed", { error }), "failure");
}

async function preSend(channelId: string, msg: MessageObject, options: SendMessageOptions, props: SendMessageProps) {
    if (!settings.store.pgpEnabled) return;
    const ch = channelOf(channelId);
    if (!ch || !isSupportedChannel(ch)) return;

    const encryptionOn = isEncryptionEnabledFor(channelId);
    const content = msg.content ?? "";
    const gif = isGifContent(content);
    const sticker = !!props?.hasStickers;

    // GIF/sticker: Discord necesita la URL/sticker original para renderizarlo.
    // El GIF/sticker solo se envia SIN cifrar. Si hay texto adicional, se
    // cancelaria el envio: ese texto no debe salir en claro por accidente.
    if (encryptionOn && (gif || sticker)) {
        const hasExtraText = content.replace(GIF_URL_RE, "").trim().length > 0;
        if (hasExtraText) {
            showToast(t("toast.gifWithTextSend"), "failure");
            return { cancel: true };
        }
        return;
    }

    if (encryptionOn && props?.hasAttachments) {
        showToast(t("toast.attachments"), "failure");
    }

    if (!content.trim()) return;

    const plan = planOutgoing(ch, content, {
        enabled: encryptionOn,
        selfId: selfId(),
    });
    if (!plan.shouldEncrypt) return;
    const recipients = plan.recipients ?? [];
    // MD 1:1 con bot: no se cifra para no romper comandos (comportamiento
    // documentado). Grupo con bot + humanos: cancelar, no enviar en claro.
    if (hasBotRecipient(recipients)) {
        if (allRecipientsAreBots(recipients)) return;
        showToast(t("toast.botGroupSend"), "failure");
        return { cancel: true };
    }
    warnUnverifiedRecipients(ch.id, recipients);

    try {
        const unlocked = await requireUnlockedForEncryption();
        const transport = await encryptOutgoing({
            channel: ch,
            content,
            selfId: selfId(),
            keyStore,
            ownPublicArmor: ownPublicOrDerive(unlocked),
            signingKey: settings.store.signMessages ? unlocked : null,
            maxTransportChars: Number(settings.store.messageLimit) || 2000,
        });
        msg.content = transport;
        // El ciphertext no debe generar menciones/pings ni filtrar metadatos.
        if (options && typeof options === "object") {
            (options as any).allowedMentions = { parse: [], repliedUser: false, replied_user: false };
        }
    } catch (e) {
        toastError(e);
        return { cancel: true };
    }
}

async function preEdit(channelId: string, messageId: string, msg: MessageObject) {
    if (!settings.store.pgpEnabled) return;
    const content = msg.content ?? "";
    if (!content.trim()) return;
    if (isPgpTransport(content)) {
        // El editor muestra el ciphertext (no se descifro o el parche no aplico):
        // bloquear para no reenviar el bloque cifrado como si fuera texto editado.
        showToast(t("toast.notDecryptedUseMenu"), "failure");
        return { cancel: true };
    }
    const ch = channelOf(channelId);
    if (!ch || !isSupportedChannel(ch)) return;

    const encryptionOn = isEncryptionEnabledFor(channelId);
    if (encryptionOn && isGifContent(content)) {
        const hasExtraText = content.replace(GIF_URL_RE, "").trim().length > 0;
        if (hasExtraText) {
            showToast(t("toast.gifWithTextEdit"), "failure");
            return { cancel: true };
        }
        return;
    }

    const plan = planOutgoing(ch, content, {
        enabled: encryptionOn,
        selfId: selfId(),
    });
    if (!plan.shouldEncrypt) return;
    const recipients = plan.recipients ?? [];
    if (hasBotRecipient(recipients)) {
        if (allRecipientsAreBots(recipients)) return;
        showToast(t("toast.botGroupEdit"), "failure");
        return { cancel: true };
    }
    warnUnverifiedRecipients(ch.id, recipients);

    try {
        const unlocked = await requireUnlockedForEncryption();
        msg.content = await encryptOutgoing({
            channel: ch,
            content,
            selfId: selfId(),
            keyStore,
            ownPublicArmor: ownPublicOrDerive(unlocked),
            signingKey: settings.store.signMessages ? unlocked : null,
            maxTransportChars: Number(settings.store.messageLimit) || 2000,
        });
        forgetDecrypted(messageId);
    } catch (e) {
        toastError(e);
        return { cancel: true };
    }
}

async function hydratePublicKeys() {
    keyStore.clear();
    const parsed = KeyStoreFromSetting();
    for (const user of parsed.listUsers()) {
        for (const key of user.keys) {
            try {
                await keyStore.addPublicKey(user.userId, user.displayName || "", key.armored);
                if (key.verified) keyStore.markVerified(user.userId, key.fingerprint, true);
            } catch { /* clave invalida/revocada: omitir */ }
        }
    }
    notifyState();
}

function KeyStoreFromSetting() {
    try {
        return KeyStore.fromJSON(settings.store.publicKeysByUser ?? {});
    } catch {
        return new KeyStore();
    }
}

export default definePlugin({
    name: "VencordPGP",
    get description() { return t("plugin.description"); },
    authors: [{ name: "vencord-pgp", id: 0n }],
    tags: ["Chat", "Privacy"],
    settings,

    async start() {
        setPublicKeysSaver(() => {
            settings.store.publicKeysByUser = JSON.parse(JSON.stringify(keyStore.toJSON()));
        });
        // Cambiar de idioma repinta la UI ya montada (panel, candado, mensajes).
        languageChangeListener = () => notifyState();
        SettingsStore.addChangeListener("plugins.VencordPGP.language", languageChangeListener);
        await hydratePublicKeys();
        patchEditAction();
        // No se pide la contrasena al arrancar: solo al intentar cifrar.
    },

    stop() {
        if (languageChangeListener) {
            SettingsStore.removeChangeListener("plugins.VencordPGP.language", languageChangeListener);
            languageChangeListener = null;
        }
        unpatchEditAction();
        warnedUnverifiedChannels.clear();
        // Bloqueo: purga clave desbloqueada, passphrase, cache y texto claro.
        // Conserva el armor SOLO en RAM (no persistido) para no obligar a
        // repegarlo si el usuario desactiva/reactiva el plugin en la sesion.
        clearDecrypted();
        session.lock();
        decryptCache.clear();
        keyStore.clear();
        setOwnPublicArmor(null);
        notifyState();
    },

    onBeforeMessageSend: preSend,
    onBeforeMessageEdit: preEdit,

    chatBarButton: {
        icon: PgpLockIcon,
        render: props => <PgpLockButton {...props} settings={settings} />,
    },

    messagePopoverButton: {
        icon: PgpLockIcon,
        render(msg: Message) {
            if (msg.author?.id !== selfId()) return null;
            if (msg.state !== "SENT") return null;
            if (!isLocallyDecrypted(msg.id)) return null;
            if (getLocalPlaintext(msg.id) === undefined) return null;
            return {
                label: t("popover.editPgpMessage"),
                icon: PgpLockIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: () => startPgpEdit(msg),
            };
        },
    },

    renderMessageAccessory(props) {
        if (!props?.message) return null;
        return <PgpAccessory message={props.message as Message} />;
    },

    flux: {
        MESSAGE_CREATE(e: { message?: Message; }) {
            if (e?.message) void decryptMessage(e.message);
        },
        MESSAGE_UPDATE(e: { message?: Message; }) {
            if (e?.message?.id) void decryptMessage(e.message);
        },
        MESSAGE_DELETE(e: { id?: string; }) {
            if (e?.id) {
                forgetDecrypted(e.id);
                decryptCache.invalidate(e.id);
            }
        },
        CHANNEL_SELECT() {
            notifyState();
        },
    },
});
