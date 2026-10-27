/*
 * PGP Key Manager (UI de settings).
 *
 * - Privada: solo RAM (no se escribe en settings ni se sincroniza).
 * - Passphrase: input type=password, solo RAM de sesión.
 * - Públicas: userId snowflake como PK; nombre solo informativo; huella
 *   completa; verificación manual; multi-clave; import/export/borrado.
 */
import { copyWithToast } from "@utils/discord";
import { React, showToast } from "@webpack/common";

import { PgpError } from "./core/errors";
import { clearDecrypted, resetDecryptionCache } from "./render";
import {
    decryptCache, getOwnPublicArmor, getPrivateArmorDraft, keyStore,
    notifyState, persistPublicKeys, session, setOwnPublicArmor, setPrivateArmorDraft,
} from "./state";
import { deleteVault, hasStoredVault, loadFromVault, saveToVault } from "./vault";

function errorText(e: unknown): string {
    if (e instanceof PgpError) return e.message;
    if (e instanceof Error && e.message) return e.message;
    return "Operacion fallida.";
}

function keyStatus(k: { verified: boolean; revoked: boolean; expired: boolean; }): string {
    if (k.revoked) return "REVOCADA";
    if (k.expired) return "CADUCADA";
    if (k.verified) return "verificada";
    return "NO verificada";
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
            if (!armor) throw new PgpError("VAULT_INVALID", "Carga o pega primero tu clave privada.");
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
            setMessage("Clave privada guardada cifrada en este equipo (almacen local).");
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
            setMessage("Clave cargada y desbloqueada desde el almacen cifrado.");
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
        setMessage("Clave guardada eliminada de este equipo.");
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
            setMessage(`Clave desbloqueada: ${fp.replace(/(.{4})/g, "$1 ").trim()}`);
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
        setMessage("Clave bloqueada; cache y texto descifrado purgados.");
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
        setMessage("Claves y datos temporales borrados.");
        notifyState();
    }

    async function addPublicKey() {
        setMessage(null);
        try {
            const previous = keyStore.getUser(userId)?.keys.map(k => k.fingerprint) ?? [];
            const entry = await keyStore.addPublicKey(userId, nick || userId, pubArmor);
            persistPublicKeys();
            if (previous.length > 0 && !previous.includes(entry.fingerprint)) {
                setMessage(
                    `ADVERTENCIA: nueva clave para ${userId}. Si no la esperabas, verifica la huella por otro canal antes de marcarla como verificada.`
                );
                showToast({ text: "PGP: nueva clave para un usuario conocido; verifica la huella.", variant: "critical" });
            } else {
                setMessage(`Clave importada: ${entry.fingerprintPretty}`);
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

    return (
        <div className="vc-pgp-panel">
            <div className="vc-pgp-warning">
                La clave privada permanece <b>solo en memoria</b> por defecto. Opcionalmente puedes
                guardarla <b>cifrada en este equipo</b> (seccion "Clave guardada") para no pegarla en cada inicio.
                Nunca se escribe en ajustes ni se sincroniza con la nube.
            </div>

            <h3>Clave privada</h3>
            <div className="vc-pgp-note">
                Estado: <b>{session.hasArmored ? (session.isUnlocked ? "cargada y desbloqueada" : "cargada y bloqueada") : "sin cargar"}</b>.
                La clave no se muestra aqui por seguridad: vive en memoria (o en el almacen cifrado).
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
                        Reemplazar clave privada
                    </button>
                )}
                {showKeyInput && session.hasArmored && (
                    <button className="vc-pgp-btn" onClick={() => { setShowKeyInput(false); setPrivateArmor(""); }}>
                        Cancelar
                    </button>
                )}
            </div>
            {session.hasArmored && (
                <input
                    className="vc-pgp-input"
                    type="password"
                    placeholder="Passphrase de la clave (dejala vacia si no tiene)"
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
                    {session.isUnlocked ? "Re-desbloquear" : "Desbloquear"}
                </button>
                <button className="vc-pgp-btn" onClick={lock} disabled={!session.hasArmored}>Bloquear clave</button>
                <button className="vc-pgp-btn vc-pgp-danger" onClick={wipe}>Borrar todo</button>
                {ownPublic && (
                    <button
                        className="vc-pgp-btn"
                        onClick={() => void copyWithToast(ownPublic, "Clave publica copiada")}
                    >
                        Copiar mi clave publica
                    </button>
                )}
            </div>
            {message && <div className="vc-pgp-msg">{message}</div>}

            <h3>Clave guardada (cifrada con contrasena)</h3>
            <p className="vc-pgp-note">
                Guarda tu clave privada cifrada con una contrasena de almacenamiento para no tener que pegarla
                en cada inicio. Se guarda <b>solo en este equipo</b> (almacen local de Vencord), nunca en ajustes
        ni en la nube. La contrasena de almacenamiento <b>no se guarda</b>: la introduces al cargarla.
            </p>
            {hasStored && <div className="vc-pgp-msg">Hay una clave guardada en este equipo.</div>}
            <input
                className="vc-pgp-input"
                type="password"
                autoComplete="new-password"
                placeholder="Contrasena de almacenamiento (min. 8 caracteres)"
                value={storagePassword}
                onChange={e => setStoragePassword(e.currentTarget.value)}
            />
            <label className="vc-pgp-check">
                <input
                    type="checkbox"
                    checked={includePassphrase}
                    onChange={e => setIncludePassphrase(e.currentTarget.checked)}
                />
                Guardar tambien la passphrase de la clave (mas comodo; queda protegida por esta contrasena)
            </label>
            <div className="vc-pgp-row">
                <button className="vc-pgp-btn" onClick={() => { void saveVault(); }}>Guardar cifrada</button>
                {hasStored && (
                    <button className="vc-pgp-btn" onClick={() => { void loadStoredVault(); }}>
                        Cargar y desbloquear
                    </button>
                )}
                {hasStored && (
                    <button className="vc-pgp-btn vc-pgp-danger" onClick={() => { void deleteStoredVault(); }}>
                        Borrar guardada
                    </button>
                )}
            </div>

            <h3>Claves publicas por usuario</h3>
            <p className="vc-pgp-note">
                Usa el <b>ID de Discord</b> (clic derecho → Copiar ID), no el nombre. El nombre es solo informativo.
                Verifica la huella por un canal independiente antes de marcarla como verificada.
            </p>
            <p className="vc-pgp-note">
                Atajo: en un MD, <b>clic derecho</b> en el candado de la barra de chat asigna la clave del destinatario;
                <b> clic izquierdo</b> activa/desactiva el cifrado en esa conversacion.
            </p>
            <input
                className="vc-pgp-input"
                placeholder="User ID (snowflake, solo digitos)"
                value={userId}
                onChange={e => setUserId(e.currentTarget.value)}
            />
            <input
                className="vc-pgp-input"
                placeholder="Nombre visible (informativo)"
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
                <button className="vc-pgp-btn" onClick={addPublicKey}>Añadir / sustituir</button>
            </div>

            {users.length === 0 && <p className="vc-pgp-note">Aún no hay claves publicas asignadas.</p>}
            {users.map(u => (
                <div className="vc-pgp-user" key={u.userId}>
                    <div className="vc-pgp-user-head">
                        <strong>{u.userId}</strong>
                        <span className="vc-pgp-muted"> ({u.displayName || "sin nombre"})</span>
                    </div>
                    {u.keys.map(k => (
                        <div className="vc-pgp-key" key={k.fingerprint}>
                            <code className="vc-pgp-fingerprint">{k.fingerprintPretty}</code>
                            <span className={k.verified && !k.revoked && !k.expired ? "vc-pgp-ok" : "vc-pgp-warn"}>
                                {keyStatus(k)}
                            </span>
                            <button
                                className="vc-pgp-btn vc-pgp-small"
                                onClick={() => void copyWithToast(k.fingerprintPretty, "Huella copiada")}
                            >
                                Copiar huella
                            </button>
                            <button
                                className="vc-pgp-btn vc-pgp-small"
                                onClick={() => void copyWithToast(k.armored, "Clave publica copiada")}
                            >
                                Exportar
                            </button>
                            <button
                                className="vc-pgp-btn vc-pgp-small"
                                onClick={() => toggleVerified(u.userId, k.fingerprint, !k.verified)}
                            >
                                {k.verified ? "Desmarcar" : "Marcar verificada"}
                            </button>
                            <button
                                className="vc-pgp-btn vc-pgp-small vc-pgp-danger"
                                onClick={() => removeKey(u.userId, k.fingerprint)}
                            >
                                Eliminar
                            </button>
                        </div>
                    ))}
                </div>
            ))}
            <span style={{ display: "none" }}>{refresh}</span>
        </div>
    );
}
