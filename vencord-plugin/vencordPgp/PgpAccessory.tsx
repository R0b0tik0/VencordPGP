/*
 * Vista del mensaje PGP: el texto descifrado es el contenido principal y el
 * bloque cifrado queda OCULTO por defecto. El usuario puede revelarlo con
 * "ver cifrado" y volver a ocultarlo con "ver descifrado".
 *
 * El claro se renderiza con el Parser de Discord (Markdown/URLs/emojis
 * seguros, sin innerHTML). El ciphertext original sigue intacto en el store.
 */
import type { Message } from "@vencord/discord-types";
import { openPluginModal } from "@components/settings";
import { plugins } from "@api/PluginManager";
import { ChannelStore, Parser, React, ReactDOM, SelectedChannelStore, showToast } from "@webpack/common";

import { isSupportedChannel } from "./core/channelPolicy";
import { isPgpTransport } from "./core/transport";
import { decryptMessage, getLocalPlaintext, isLocallyDecrypted } from "./render";
import { decryptCache, getStateVersion, session, subscribeState } from "./state";
import { requestStoredKeyUnlock } from "./StoredKeyModal";
import { hasStoredVault } from "./vault";

function signatureLabel(message: Message): string {
    const entry = decryptCache.get(message.id, message.editedTimestamp?.getTime() ?? null);
    if (!entry || entry.body === undefined) return "";
    if (!entry.signed) return " · sin firma";
    if (entry.signatureValid === true) return " · ✓ firmado verificado";
    if (entry.signatureValid === false) return " · ⚠ FIRMA INVÁLIDA";
    return " · firmado (sin verificar)";
}

function parseBody(body: string, message: Message) {
    try {
        return Parser.parse(body, true, {
            channelId: message.channel_id,
            messageId: message.id,
            allowLinks: true,
            allowHeading: true,
            allowList: true,
            allowEmojiLinks: true,
            viewingChannelId: SelectedChannelStore.getChannelId(),
        });
    } catch {
        return <span style={{ whiteSpace: "pre-wrap" }}>{body}</span>;
    }
}

/**
 * Coloca el contenido descifrado en la posicion del contenido original del
 * mensaje (no en el area de accesorios), para que las reacciones queden
 * debajo como en un mensaje normal.
 *
 * Crea un contenedor justo despues de `#message-content-<id>` y renderiza ahi
 * via ReactDOM.createPortal. Si `hideOriginal` es true, oculta el bloque
 * cifrado original; al desmontar/revelar se restaura.
 */
function MessageContentPortal({ messageId, hideOriginal, children }: {
    messageId: string;
    hideOriginal: boolean;
    children: React.ReactNode;
}) {
    const [target, setTarget] = React.useState<HTMLElement | null>(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        let container: HTMLElement | null = null;
        let contentEl: HTMLElement | null = null;
        let previousDisplay = "";

        const setup = (attempt: number) => {
            if (cancelled) return;
            contentEl = document.getElementById("message-content-" + messageId) as HTMLElement | null;
            const parent = contentEl?.parentElement;
            if (!contentEl || !parent) {
                if (attempt < 5) {
                    setTimeout(() => setup(attempt + 1), 100);
                } else {
                    setFailed(true);
                }
                return;
            }

            container = document.createElement("div");
            container.className = "vc-pgp-portal";
            parent.insertBefore(container, contentEl.nextSibling);
            previousDisplay = contentEl.style.display;
            if (hideOriginal) contentEl.style.display = "none";

            setFailed(false);
            setTarget(container);
        };

        setup(0);

        return () => {
            cancelled = true;
            if (contentEl) contentEl.style.display = previousDisplay;
            container?.remove();
        };
    }, [messageId, hideOriginal]);

    if (failed) return <>{children}</>;
    if (!target) return null;
    return ReactDOM.createPortal(children, target);
}

export function PgpAccessory({ message }: { message: Message; }) {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => subscribeState(force), []);

    const [revealed, setRevealed] = React.useState(false);

    const isCipher = isPgpTransport(message.content);
    const decrypted = isLocallyDecrypted(message.id);
    const version = getStateVersion();

    React.useEffect(() => {
        if (isCipher) void decryptMessage(message);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message.id, message.content, message.editedTimestamp, isCipher, decrypted, version]);

    // Solo DM/GDM (mismo alcance que el envio). En guilds/hilos el ciphertext
    // se deja intacto: no se procesa contenido PGP ajeno a la politica.
    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel || !isSupportedChannel({ id: channel.id, type: channel.type })) return null;

    async function onUnlockClick() {
        try {
            if (await hasStoredVault()) {
                const ok = await requestStoredKeyUnlock();
                if (ok) showToast({ text: "PGP: clave desbloqueada.", variant: "success" });
            } else {
                const self = plugins["VencordPGP"];
                if (self) openPluginModal(self);
            }
        } catch {
            // Sin UI disponible: no romper el render.
        }
    }

    if (isCipher) {
        if (!session.isUnlocked) {
            return (
                <button className="vc-pgp-badge vc-pgp-badge-error vc-pgp-unlock" onClick={() => { void onUnlockClick(); }}>
                    🔒 PGP bloqueado · clic para desbloquear
                </button>
            );
        }
        const entry = decryptCache.get(message.id, message.editedTimestamp?.getTime() ?? null);
        if (entry?.error) {
            return <span className="vc-pgp-badge vc-pgp-badge-error">🔒 Mensaje PGP no descifrable</span>;
        }

        const plaintext = getLocalPlaintext(message.id) ?? entry?.body;
        if (plaintext === undefined) {
            return <span className="vc-pgp-badge vc-pgp-badge-muted">🔒 Descifrando PGP…</span>;
        }

        if (revealed) {
            return (
                <div className="vc-pgp-plain-foot">
                    <span className="vc-pgp-badge-mini">🔒 texto cifrado</span>
                    <button className="vc-pgp-link" onClick={() => setRevealed(false)}>ver descifrado</button>
                </div>
            );
        }

        return (
            <>
                {/* Solo el texto va en la posicion del contenido (encima de las
                    reacciones); el pie PGP queda en el area de accesorios, debajo. */}
                <MessageContentPortal messageId={message.id} hideOriginal>
                    <div className="vc-pgp-plain-body">{parseBody(plaintext, message)}</div>
                </MessageContentPortal>
                <div className="vc-pgp-plain-foot">
                    <span className={entry?.signatureValid === false ? "vc-pgp-badge-mini vc-pgp-bad-sig" : "vc-pgp-badge-mini"}>
                        🔒 PGP{signatureLabel(message)}
                    </span>
                    <button className="vc-pgp-link" onClick={() => setRevealed(true)}>ver cifrado</button>
                </div>
            </>
        );
    }

    if (!decrypted) return null;

    const entry = decryptCache.get(message.id, message.editedTimestamp?.getTime() ?? null);
    const bad = entry?.signatureValid === false;
    return (
        <span className={bad ? "vc-pgp-badge vc-pgp-badge-error" : "vc-pgp-badge"}>
            🔒 PGP{signatureLabel(message)}
        </span>
    );
}
