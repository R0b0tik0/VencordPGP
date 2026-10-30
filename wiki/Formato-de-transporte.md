[English](Transport-Format) | **Español**

```text
[VPGP:v1]
-----BEGIN PGP MESSAGE-----
<armor ASCII OpenPGP, base64>
-----END PGP MESSAGE-----
```

- **Línea 1:** marcador estable `[VPGP:v1]` = protocolo + versión. Permite:
  - detectar sin intentar descifrar todos los mensajes (`startsWith` + armor),
  - evitar colisiones con texto normal,
  - evolucionar a `v2` sin ambigüedad.
- **Resto:** **armor ASCII OpenPGP estándar** (RFC 9580, OpenPGP.js). Los
  mensajes salientes no se comprimen, así que el tamaño es predecible.
- Payload cifrado (JSON): `{"v":1,"body":"<texto exacto>","sentAt":123}`. La
  versión del payload es independiente del marcador y se valida tras descifrar.
- No puede haber nada tras `END PGP MESSAGE`; el contenido mezclado se rechaza.
- El texto se preserva **byte a byte** (Markdown, URLs, emojis y saltos de
  línea), salvo que va codificado en JSON dentro del payload.

## Detección

```ts
isPgpTransport(c) =
  c.trimStart().startsWith("[VPGP:v1]") &&
  c.includes("-----BEGIN PGP MESSAGE-----");
```

Un texto que solo parece un marcador (`[VPGP:v1] hola`) no es transporte; no se
descifra ni produce un error agresivo (`looksLikeMarkerButInvalid` está
disponible para tests y UI).

## Límites

| Límite | Valor | Propósito |
|---|---|---|
| Longitud del transporte | 8.192 caracteres | Rechazar bloques entrantes absurdos (anti-DoS) |
| Texto antes de cifrar | 3.000 caracteres | Mantener el armor dentro del límite de Discord |
| Cifrado saliente | 2.000 caracteres (4.000 con la opción Nitro) | Límite de Discord; fail-closed, nunca truncar |
| Cuerpo descifrado | 5.000 caracteres | Validación anti-DoS |
| Datos OpenPGP descomprimidos | 24 KB | Rechazar bombas de descompresión |
| Caché de descifrado | 500 entradas | RAM acotada |
| Mapa de textos descifrados | 500 entradas | RAM acotada |

v1 **no** fragmenta mensajes. Si el armor supera el límite configurado, el envío
se cancela y el borrador se conserva.

## Ejemplo

```text
[VPGP:v1]
-----BEGIN PGP MESSAGE-----

wV4D... (cifrado para Bob + Alice, firmado por Alice)
-----END PGP MESSAGE-----
```

## Versionado

Cambia la versión (y la `v` del payload) cuando cambie el formato. No reutilices
`v1` con otro significado. El marcador permite rechazar versiones desconocidas
de forma explícita en vez de interpretarlas mal.

## Lo que nunca contiene

- Claves privadas ni passphrases.
- Metadatos en claro más allá de lo que OpenPGP pone en las cabeceras de sus
  paquetes.
- Adjuntos o embeds; solo el cuerpo del mensaje va dentro del payload.

## Trabajo futuro (no v1)

La fragmentación autenticada con IDs, orden y autenticación por fragmento es
posible en una versión futura. v1 cancela a propósito los envíos demasiado
largos.

---

**Relacionado:** [Inicio](Inicio) · [Arquitectura y diseno](Arquitectura-y-diseno) · [Modelo de amenazas](Modelo-de-amenazas)
