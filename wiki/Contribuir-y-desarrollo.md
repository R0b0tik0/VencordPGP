[English](Contributing-and-Development) | **Español**

Gracias por plantearte contribuir. Este proyecto maneja criptografía y mensajes privados, así que los cambios se revisan de forma conservadora. Si el código es nuevo para ti, empieza por [Arquitectura y diseño](Arquitectura-y-diseno).

## Preparación

```powershell
git clone <your-fork>
cd cifrador-discord
npm install
npm test
```

Requisitos: Node.js 22+ y npm. Para compilar el plugin también necesitas un checkout de Vencord y `corepack pnpm`; consulta [Instalación](Instalacion).

## Estructura del repositorio

- `src/` — núcleo independiente, ESM NodeNext. Los imports relativos terminan en `.js`.
- `vencord-plugin/vencordPgp/` — plugin de Vencord. Su carpeta `core/` es una copia de `src/` sin los sufijos `.js`.
- `scripts/` — sincronización, generación del payload, generador de claves, escaneo de secretos, test del instalador, generación de la wiki.
- `installer/` — instalador de Windows y payload precompilado.
- `docs/` — documentación en inglés; `docs/es/` — documentación en español.
- `wiki/` — páginas de la wiki de GitHub (generadas desde `docs/` más páginas de índice manuales).

## Las dos copias del núcleo

`src/*.ts` y `vencord-plugin/vencordPgp/core/*.ts` deben ser idénticos salvo por las extensiones de los imports. Después de editar el núcleo:

```powershell
node scripts/sync-vencord-core.mjs <vencord-checkout>\src\userplugins\vencordPgp\core
```

No edites a mano la copia `core/` del plugin. El script de sincronización es el único paso necesario; `src/` ya contiene los ajustes de límite (`maxTransportChars`, `MAX_PLAINTEXT_CHARS=3000`). El script también comprueba que no haya corrupción de codificación.

## Tests

```powershell
npm test                # compila + suites del núcleo y de la cámara
npm run testTsc         # comprobación de tipos
npm run lint            # escaneo de secretos (no es ESLint)
npm run test:installer  # E2E del instalador de Windows (sandbox)
```

- Añade tests para cambios de comportamiento en `src/tests/`.
- No debilites un test para que un cambio pase.
- Los tests generan claves ECC efímeras; no necesitan red.
- Si cambias el instalador, ejecuta `npm run test:installer`.
- Si cambias el plugin, compílalo en un checkout de Vencord con `corepack pnpm testTsc && corepack pnpm build`.

## Reglas del plugin de Vencord

- Instálalo como **userplugin**: copia la carpeta a `<Vencord>\src\userplugins\vencordPgp\`.
- Compila y despliega con `corepack pnpm testTsc && corepack pnpm build` (pnpm va fijado por corepack, no global) y copia `dist/*` a `%APPDATA%\Vencord\dist`.
- Nunca `import ... from "react"`; importa `React` y los hooks desde `@webpack/common`.
- Nunca llames `enabled` a un ajuste del plugin; colisiona con el flag propio de Vencord. El interruptor global es `pgpEnabled`.
- El checkout de Vencord necesita `@openpgp/web-stream-tools` como devDependency porque Vencord compila con `skipLibCheck: false`.
- `corepack pnpm lint` puede fallar en el checkout de Vencord con estos archivos (falta la cabecera GPL original, orden de imports). Las puertas son `testTsc` y `build`.
- La interfaz sigue el idioma de Discord (ajuste `language`: `auto|es|en`). Cada texto nuevo va en los dos catálogos de `i18n.ts`; `en` está tipado contra `es`, así que una clave ausente falla el type-check.
- `core/` no lleva textos de UI: los mensajes de `PgpError` se traducen por código en `errorText()`. No dupliques esos textos en los componentes.
- El instalador de Windows mantiene su propia tabla `$script:Messages` (`es`/`en`) y usa `T "key" @(args)`. Mantén ambas tablas sincronizadas.

## Estilo de código

- Sigue el estilo del entorno: TypeScript, 2 espacios en el núcleo, 4 en el plugin, comillas dobles.
- Mantén el núcleo libre de imports de Discord para que siga siendo testeable en Node.
- Sin criptografía propia, sin nuevas llamadas de red, sin keyservers.
- Nunca registres en logs texto plano, claves privadas, passphrases ni cuerpos descifrados.
- Todo comportamiento nuevo que pueda fallar debe fallar cerrado y conservar el borrador del usuario.

## Documentación

- **El inglés es el idioma canónico.** Cada documento de usuario tiene versión inglesa en `docs/<NAME>.md` y espejo español en `docs/es/<NAME>.md`.
- `README.md` (inglés) y `README.es.md` (español) deben actualizarse juntos.
- Mantén comandos, flags, límites y rutas idénticos en ambas versiones.
- Actualiza el índice de documentación en ambos README al añadir una página.
- Si cambias el comportamiento, actualiza la página o páginas afectadas, incluidos `LIMITATIONS.md`, `THREAT_MODEL.md` y `SECURITY.md` cuando corresponda.
- La wiki es un espejo de `docs/`; regenérala con `node scripts/build-wiki.mjs` tras cambiar la documentación y publícala con `scripts/publish-wiki.ps1`.

## Secretos

Nunca hagas commit de claves privadas, passphrases, tokens ni contenido real de mensajes. `npm run lint` escanea el árbol en busca de bloques de clave privada OpenPGP y literales de passphrase. Los fixtures de test deben usar claves efímeras generadas en tiempo de ejecución.

`pgp-keys/` está en `.gitignore`. No la quites de ahí.

## Pull requests

Antes de abrir un PR:

- [ ] `npm test` pasa.
- [ ] `npm run testTsc` pasa.
- [ ] `npm run lint` pasa.
- [ ] Las dos copias del núcleo están sincronizadas.
- [ ] La documentación en inglés y español está actualizada.
- [ ] La wiki está regenerada si cambió la documentación.
- [ ] No hay secretos, rutas locales ni archivos específicos de la máquina.
- [ ] El PR explica el impacto de seguridad del cambio.

Los PR pequeños y enfocados son más fáciles de revisar. Si un cambio afecta al formato de transporte, al almacenamiento de claves, a las decisiones de confianza o al comportamiento fail-closed, abre antes un issue y describe el impacto en el modelo de amenazas.

## Mensajes de commit

Usa asuntos cortos en imperativo, por ejemplo:

```text
Fix signature verification for unverified keys
Add Spanish translations for installer docs
```

Referencia un issue cuando exista. No mezcles refactorizaciones y cambios de comportamiento en el mismo commit si puedes evitarlo.

## Licencia

Al contribuir, aceptas que tu contribución se licencie bajo GPL-3.0-or-later, la licencia de este proyecto.

---

**Relacionado:** [Arquitectura y diseño](Arquitectura-y-diseno) · [Instalación](Instalacion) · [Política de seguridad](Politica-de-seguridad)
