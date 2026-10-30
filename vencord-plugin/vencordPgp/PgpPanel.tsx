/*
 * PGP Key Manager (UI de settings).
 *
 * - Privada: solo RAM (no se escribe en settings ni se sincroniza).
 * - Passphrase: input type=password, solo RAM de sesión.
 * - Públicas: userId snowflake como PK; nombre solo informativo; huella
 *   completa; verificación manual; multi-clave; import/export/borrado.
 * - Textos via i18n (es/en, ajuste `language`).
 */
import { copyWithToast } from "@utils/discord";
import { React, showToast } from "@webpack/common";

import { errorText, t } from "./i18n";
import { clearDecrypted, resetDecryptionCache } from "./render";
import {
    decryptCache, getOwnPublicArmor, getPrivateArmorDraft, keyStore,
    notifyState, persistPublicKeys, session, setOwnPublicArmor, setPrivateArmorDraft,
    subscribeState,
} from "./state";
import { deleteVault, hasStoredVault, loadFromVault, saveToVault } from "./vault";

/** Renderiza los `<b>...</b>` del catálogo i18n (texto propio, no de usuario). */
function rich(text: string): React.ReactNode {
    return text.split(/(<b>[\s\S]*?<\/b>)/g).map((part, i) => {
        if (part.startsWith("<b>") && part.endsWith("</b>")) {
            return <b key={i}>{part.slice(3, -4)}</b>;
        }
        return part;
    });
}

function keyStatus(k: { verified: boolean; revoked: boolean; expired: boolean; }): string {
    if (k.revoked) return t("common.status.revoked");
    if (k.expired) return t("common.status.expired");
    if (k.verified) return t("common.status.verified");
    return t("common.status.unverified");
}

export function PgpPanel() {
    const [privateArmor, setPrivateArmor] = React.useState(getPrivateArmorDraft());
    const [showKeyInput, setShowKeyInput] = React.useState(false);
    const [passphrase, setPassphrase] = React.useState("");
    const [message, setMessage] = React.useState<string | null>(null);
    const [userId, setUserId] = React.useState("");
    const [nick, setNick] = React.useState("");
    const [pubArmor, setPubArmor] = React.useState("");
    const [refresh, force] = React.useReducer((x: number) => x + 1, 0);

    // Repinta al cambiar estado/idioma desde el candado, los modales o los ajustes.
    React.useEffect(() => subscribeState(force), []);

    const users = keyStore.listUsers();
    const ownPublic = getOwnPublicArmor();

    const [storagePassword, setStoragePassword] = React.useState("");
    const [includePassphrase, setIncludePassphrase] = React.useState(true);
    const [hasStored, setHasStored] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        void hasStoredVault()
            .then(v => { if (alive) setHasStored(v); })
            .catch(() => { /* noop */ });
        return () => { alive = false; };
    }, []);

    async function saveVault() {
        setMessage(null);
        try {
            const armor = privateArmor.trim() || getPrivateArmorDraft().trim();
            if (!armor) {
                setMessage(t("panel.msg.vaultNeedsKey"));
                return;
            }
            const keyPassphrase = passphrase || session.getPassphrase() || "";
            await saveToVault(
                {
                    armor,
                    passphrase: includePassphrase && keyPassphrase ? keyPassphrase : undefined,
                },
                storagePassword
            );
            setHasStored(true);
            setStoragePassword("");
            setMessage(t("panel.msg.saved"));
            notifyState();
        } catch (e) {
            setMessage(errorText(e));
        }
    }

    async function loadStoredVault() {
        setMessage(null);
        try {
            const payload = await loadFromVault(storagePassword);
            // setPrivateArmorDraft resetea el desbloqueo: hacerlo antes de unlock.
            setPrivateArmorDraft(payload.armor);
            setPrivateArmor("");
            setShowKeyInput(false);
            const pass = payload.passphrase ?? passphrase;
            session.setPassphrase(pass);
            await session.unlock();
            setOwnPublicArmor(session.requireUnlocked().toPublic().armor());
            setStoragePassword("");
            setMessage(t("panel.msg.loaded"));
            resetDecryptionCache();
            notifyState();
        } catch (e) {
            setMessage(errorText(e));
        }
    }

    async function deleteStoredVault() {
        await deleteVault();
        setHasStored(false);
        setStoragePassword("");
        setMessage(t("panel.msg.deleted"));
    }

    async function unlock() {
        setMessage(null);
        try {
            const armor = privateArmor.trim();
            if (armor) session.setArmored(armor); // solo si el usuario pego una nueva
            session.setPassphrase(passphrase);
            await session.unlock();
            const unlocked = session.requireUnlocked();
            setOwnPublicArmor(unlocked.toPublic().armor());
            const fp = unlocked.getFingerprint().toUpperCase();
            setMessage(t("panel.msg.unlockedFp", { fp: fp.replace(/(.{4})/g, "$1 ").trim() }));
            setPassphrase("");
            setPrivateArmor("");       // no conservar el armor en el estado del panel
            setShowKeyInput(false);
            resetDecryptionCache(); // reintentar mensajes que fallaron por clave bloqueada
            notifyState();
        } catch (e) {
            setMessage(errorText(e));
            notifyState();
        }
    }

    function lock() {
        clearDecrypted();
        session.lock();
        decryptCache.lock();
        setOwnPublicArmor(null);
        setPassphrase("");
        setMessage(t("panel.msg.locked"));
        notifyState();
    }

    function wipe() {
        clearDecrypted();
        session.wipe();
        decryptCache.clear();
        keyStore.clear();
        setOwnPublicArmor(null);
        setPrivateArmorDraft("");
        setPrivateArmor("");
        setShowKeyInput(false);
        setPassphrase("");
        persistPublicKeys();
        void deleteVault().then(() => setHasStored(false)).catch(() => { /* noop */ });
        setMessage(t("panel.msg.wiped"));
        notifyState();
    }

    async function addPublicKey() {
        setMessage(null);
        try {
            const previous = keyStore.getUser(userId)?.keys.map(k => k.fingerprint) ?? [];
            const entry = await keyStore.addPublicKey(userId, nick || userId, pubArmor);
            persistPublicKeys();
            if (previous.length > 0 && !previous.includes(entry.fingerprint)) {
                setMessage(t("panel.msg.newKeyWarn", { user: userId }));
                showToast(t("toast.newKeyKnownUser"), "failure");
            } else {
                setMessage(t("panel.msg.imported", { fp: entry.fingerprintPretty }));
            }
            setPubArmor("");
            resetDecryptionCache();
            notifyState();
            force();
        } catch (e) {
            setMessage(errorText(e));
        }
    }

    function removeKey(uid: string, fp: string) {
        keyStore.removePublicKey(uid, fp);
        if (!keyStore.getUser(uid)?.keys.length) keyStore.removeUser(uid);
        persistPublicKeys();
        resetDecryptionCache();
        notifyState();
        force();
    }

    function toggleVerified(uid: string, fp: string, verified: boolean) {
        keyStore.markVerified(uid, fp, verified);
        persistPublicKeys();
        resetDecryptionCache();
        notifyState();
        force();
    }

    const stateText = session.hasArmored
        ? (session.isUnlocked ? t("panel.state.loadedUnlocked") : t("panel.state.loadedLocked"))
        : t("panel.state.notLoaded");

    return (
        <div className="vc-pgp-panel">
            <div className="vc-pgp-warning">
                {rich(t("panel.warning"))}
            </div>

            <h3>{t("panel.privateKeyHeading")}</h3>
            <div className="vc-pgp-note">
                {rich(t("panel.stateLine", { state: stateText }))}
                {" "}
                {t("panel.stateNote")}
            </div>
            {(!session.hasArmored || showKeyInput) && (
                <textarea
                    className="vc-pgp-textarea"
                    rows={6}
                    spellCheck={false}
                    placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
                    value={privateArmor}
                    onChange={e => {
                        const v = e.currentTarget.value;
                        setPrivateArmor(v);
                        setPrivateArmorDraft(v);
                        setOwnPublicArmor(null);
                        notifyState();
                    }}
                />
            )}
            <div className="vc-pgp-row">
                {session.hasArmored && !showKeyInput && (
                    <button className="vc-pgp-btn" onClick={() => setShowKeyInput(true)}>
                        {t("panel.replaceKey")}
                    </button>
                )}
                {showKeyInput && session.hasArmored && (
                    <button className="vc-pgp-btn" onClick={() => { setShowKeyInput(false); setPrivateArmor(""); }}>
                        {t("common.cancel")}
                    </button>
                )}
            </div>
            {session.hasArmored && (
                <input
                    className="vc-pgp-input"
                    type="password"
                    placeholder={t("panel.passphrasePlaceholder")}
                    autoComplete="new-password"
                    value={passphrase}
                    onChange={e => setPassphrase(e.currentTarget.value)}
                />
            )}
            <div className="vc-pgp-row">
                <button
                    className="vc-pgp-btn"
                    onClick={unlock}
                    disabled={!session.hasArmored && !privateArmor.trim()}
                >
                    {session.isUnlocked ? t("panel.reunlock") : t("panel.unlock")}
                </button>
                <button className="vc-pgp-btn" onClick={lock} disabled={!session.hasArmored}>{t("panel.lockKey")}</button>
                <button className="vc-pgp-btn vc-pgp-danger" onClick={wipe}>{t("panel.wipe")}</button>
                {ownPublic && (
                    <button
                        className="vc-pgp-btn"
                        onClick={() => void copyWithToast(ownPublic, t("common.copyPublicKey"))}
                    >
                        {t("common.copyOwnPublicKey")}
                    </button>
                )}
            </div>
            {message && <div className="vc-pgp-msg">{message}</div>}

            <h3>{t("panel.storedHeading")}</h3>
            <p className="vc-pgp-note">
                {rich(t("panel.storedNote"))}
            </p>
            {hasStored && <div className="vc-pgp-msg">{t("panel.storedExists")}</div>}
            <input
                className="vc-pgp-input"
                type="password"
                autoComplete="new-password"
                placeholder={t("panel.storagePasswordPlaceholder")}
                value={storagePassword}
                onChange={e => setStoragePassword(e.currentTarget.value)}
            />
            <label className="vc-pgp-check">
                <input
                    type="checkbox"
                    checked={includePassphrase}
                    onChange={e => setIncludePassphrase(e.currentTarget.checked)}
                />
                {t("panel.includePassphrase")}
            </label>
            <div className="vc-pgp-row">
                <button className="vc-pgp-btn" onClick={() => { void saveVault(); }}>{t("panel.saveEncrypted")}</button>
                {hasStored && (
                    <button className="vc-pgp-btn" onClick={() => { void loadStoredVault(); }}>
                        {t("panel.loadAndUnlock")}
                    </button>
                )}
                {hasStored && (
                    <button className="vc-pgp-btn vc-pgp-danger" onClick={() => { void deleteStoredVault(); }}>
                        {t("panel.deleteStored")}
                    </button>
                )}
            </div>

            <h3>{t("panel.publicKeysHeading")}</h3>
            <p className="vc-pgp-note">
                {rich(t("panel.publicKeysNoteId"))}
            </p>
            <p className="vc-pgp-note">
                {rich(t("panel.publicKeysNoteShortcut"))}
            </p>
            <input
                className="vc-pgp-input"
                placeholder={t("panel.userIdPlaceholder")}
                value={userId}
                onChange={e => setUserId(e.currentTarget.value)}
            />
            <input
                className="vc-pgp-input"
                placeholder={t("panel.nickPlaceholder")}
                value={nick}
                onChange={e => setNick(e.currentTarget.value)}
            />
            <textarea
                className="vc-pgp-textarea"
                rows={5}
                spellCheck={false}
                placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                value={pubArmor}
                onChange={e => setPubArmor(e.currentTarget.value)}
            />
            <div className="vc-pgp-row">
                <button className="vc-pgp-btn" onClick={addPublicKey}>{t("panel.addOrReplace")}</button>
            </div>

            {users.length === 0 && <p className="vc-pgp-note">{t("panel.noKeys")}</p>}
            {users.map(u => (
                <div className="vc-pgp-user" key={u.userId}>
                    <div className="vc-pgp-user-head">
                        <strong>{u.userId}</strong>
                        <span className="vc-pgp-muted"> ({u.displayName || t("common.unnamed")})</span>
                    </div>
                    {u.keys.map(k => (
                        <div className="vc-pgp-key" key={k.fingerprint}>
                            <code className="vc-pgp-fingerprint">{k.fingerprintPretty}</code>
                            <span className={k.verified && !k.revoked && !k.expired ? "vc-pgp-ok" : "vc-pgp-warn"}>
                                {keyStatus(k)}
                            </span>
                            <button
                                className="vc-pgp-btn vc-pgp-small"
                                onClick={() => void copyWithToast(k.fingerprintPretty, t("common.copyFingerprint"))}
                            >
                                {t("common.copyFingerprintButton")}
                            </button>
                            <button
                                className="vc-pgp-btn vc-pgp-small"
                                onClick={() => void copyWithToast(k.armored, t("common.copyPublicKey"))}
                            >
                                {t("common.export")}
                            </button>
                            <button
                                className="vc-pgp-btn vc-pgp-small"
                                onClick={() => toggleVerified(u.userId, k.fingerprint, !k.verified)}
                            >
                                {k.verified ? t("common.unmarkVerified") : t("common.markVerified")}
                            </button>
                            <button
                                className="vc-pgp-btn vc-pgp-small vc-pgp-danger"
                                onClick={() => removeKey(u.userId, k.fingerprint)}
                            >
                                {t("common.delete")}
                            </button>
                        </div>
                    ))}
                </div>
            ))}
            <span style={{ display: "none" }}>{refresh}</span>
        </div>
    );
}
