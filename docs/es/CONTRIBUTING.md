# Contribuir

[English](../../CONTRIBUTING.md) | **Español**

Gracias por plantearte contribuir. Este proyecto maneja criptografía y mensajes
privados, así que los cambios se revisan de forma conservadora.

## Preparación

```powershell
git clone <tu-fork>
cd cifrador-discord
npm install
npm test
```

Requisitos: Node.js 22+ y npm. Para compilar el plugin también necesitas un
checkout de Vencord y `corepack pnpm`; ver [Instalación](INSTALL.md).

## Estructura del repositorio

- `src/` — núcleo independiente, NodeNext ESM. Los imports relativos terminan en
  `.js`.
- `vencord-plugin/vencordPgp/` — plugin de Vencord. Su carpeta `core/` es una
  copia de `src/` sin los sufijos `.js`.
- `scripts/` — sincronización, generación del payload, generador de claves,
  escaneo de secretos y test del instalador.
- `installer/` — instalador de Windows y payload precompilado.
- `docs/` — documentación en inglés; `docs/es/` — documentación en español.

### Las dos copias del núcleo

`src/*.ts` y `vencord-plugin/vencordPgp/core/*.ts` deben ser idénticos salvo por
las extensiones de los imports. Después de editar el núcleo:

```powershell
node scripts/sync-vencord-core.mjs <checkout-vencord>\src\userplugins\vencordPgp\core
```

No edites a mano la copia `core/` del plugin. El script de sincronización es el
único paso necesario; `src/` ya contiene los ajustes de límite.

## Pruebas

```powershell
npm test            # build + 57 pruebas
npm run testTsc     # comprobación de tipos
npm run lint        # escaneo de secretos
npm run test:installer  # E2E del instalador de Windows (sandbox)
```

- Añade pruebas para los cambios de comportamiento en `src/tests/`.
- No debilites una prueba para que pase un cambio.
- Las pruebas generan claves ECC efímeras; no necesitan red.
- Si cambias el instalador, ejecuta `npm run test:installer`.
- Si cambias el plugin, compílalo en un checkout de Vencord con
  `corepack pnpm testTsc && corepack pnpm build`.

## Estilo de código

- Sigue el estilo del entorno: TypeScript, 2 espacios en el núcleo, 4 en el
  plugin, comillas dobles.
- Mantén el núcleo libre de imports de Discord para que siga siendo testeable en
  Node.
- Sin criptografía casera, sin llamadas de red nuevas, sin keyservers.
- Nunca registres en logs texto claro, claves privadas, passphrases ni cuerpos
  descifrados.
- Todo comportamiento nuevo que pueda fallar debe fallar cerrado y conservar el
  borrador del usuario.

## Documentación

- **El inglés es el idioma canónico.** Cada documento de usuario tiene una
  versión en inglés en `docs/<NOMBRE>.md` y un espejo en español en
  `docs/es/<NOMBRE>.md`.
- `README.md` (inglés) y `README.es.md` (español) deben actualizarse juntos.
- Añade la línea de cambio de idioma al principio de cada página:
  `**English** | [Español](es/NOMBRE.md)` o
  `[English](../NOMBRE.md) | **Español**`.
- Mantén comandos, opciones, límites y rutas idénticos en ambas versiones.
- Actualiza el índice de documentación de ambos README al añadir una página.
- Si cambias el comportamiento, actualiza la página o páginas relevantes,
  incluidas `LIMITATIONS.md`, `THREAT_MODEL.md` y `SECURITY.md` cuando
  corresponda.

## Secretos

Nunca hagas commit de claves privadas, passphrases, tokens ni contenido real de
mensajes. `npm run lint` escanea el árbol en busca de bloques de clave privada
OpenPGP y literales de passphrase. Los fixtures de prueba deben usar claves
efímeras generadas en tiempo de ejecución.

`pgp-keys/` está en `.gitignore`. No lo quites de ahí.

## Pull requests

Antes de abrir un PR:

- [ ] `npm test` pasa.
- [ ] `npm run testTsc` pasa.
- [ ] `npm run lint` pasa.
- [ ] Las dos copias del núcleo están sincronizadas.
- [ ] La documentación en inglés y español está actualizada.
- [ ] No hay secretos, rutas locales ni archivos específicos de una máquina.
- [ ] El PR explica el impacto de seguridad del cambio.

Los PR pequeños y enfocados son más fáciles de revisar. Si un cambio afecta al
formato de transporte, al almacenamiento de claves, a las decisiones de confianza
o al comportamiento fail-closed, abre primero un issue y describe el impacto en
el modelo de amenazas.

## Mensajes de commit

Usa asuntos cortos en imperativo, por ejemplo:

```text
Fix signature verification for unverified keys
Add Spanish translations for installer docs
```

Referencia un issue cuando exista. No mezcles refactors y cambios de
comportamiento en el mismo commit si puedes evitarlo.

## Licencia

Al contribuir, aceptas que tu contribución se licencia bajo GPL-3.0-or-later, la
licencia de este proyecto.
