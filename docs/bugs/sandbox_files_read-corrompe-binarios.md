# Bug: `sandbox_files_read` corrompe archivos binarios grandes

**Fecha:** 14 sep 2026 · **Reportó:** bliss (vía Claude Code) · **Severidad:** alta — el archivo llega inservible sin error.

## Qué pasa

Al leer un archivo binario que supera el umbral inline (>1 MB, ruta "sube a storage y devuelve URL firmada"),
los bytes se decodifican como UTF-8 antes de subirse: cada byte ≥ 0x80 se sustituye por U+FFFD (`EF BF BD`).
El tamaño reportado y el sha256 corresponden al archivo **ya corrupto**, así que la verificación pasa
y el error no se ve hasta abrirlo.

## Repro

```
sandbox_files_read({ sandboxId, path: "/app/.../clip.mp4" })   # mp4 de 12 MB, sin `encoding`
→ { url, size_bytes: 12376666, sha256: "49db7d1e…", mime: "video/mp4" }
curl -o clip.mp4 "$url"
ffprobe clip.mp4   →   moov atom not found
xxd -l 64 clip.mp4
00000020: 0000 efbf bdef bfbd 6d6f 6f76 ...        # el header de moov era `00 00 xx xx`, los bytes altos salieron como EF BF BD
```

Caja: `sb_41df1dc5-9fd5-4166-9deb-83ea9657513c` (dev-box, tamaño l). Archivo original en la caja:
`/app/openshorts/output/61d34642-182c-4042-96bc-1cb273501e86/subtitled_1789419128_…_clip_1.mp4`
(6.7 MB según el backend que lo sirve; el "size_bytes" de la respuesta fue 12.4 MB — la inflación
es la huella del reemplazo 1 byte → 3 bytes).

## Esperado

Los bytes tal cual. Un `video/mp4` leído por la herramienta debe dar el mismo sha256 que `sha256sum`
dentro de la caja.

## Dónde buscar

La ruta de "archivo grande → storage" lee el contenido como string (probablemente `toString()` /
`text()` sobre el buffer, o el exec que lo saca de la caja lo trae por stdout como texto) y luego
lo sube. La ruta inline con `encoding: "base64"` probablemente no tiene el problema; la de
imágenes <1 MB (MCP image block) hay que revisarla también.

## Workaround usado

Servir el archivo por HTTP desde la caja (`sandbox_expose_port` + `curl`) y bajarlo directo.

## Cómo verificar el fix

```
sandbox_exec:  sha256sum /ruta/archivo.mp4
sandbox_files_read → curl → shasum -a 256   # deben coincidir
```

## Fix (14 sep 2026)

Causa: sin `encoding`, el tool pedía `utf8` al host; Go serializa a JSON con reemplazo U+FFFD y
`offloadOversizedRead` re-codificaba ese string ya corrupto. Ahora el tool **siempre pide base64**
al host y decide del lado EasyBits: UTF-8 válido y <50 KB → inline como texto; lo demás → imagen/storage
con los bytes intactos (`app/.server/mcp/offloadOversizedRead.ts`, `autoDetect`).
Test: `test/offloadOversizedRead.test.ts`. La REST `GET /api/v2/sandboxes/:id/files/read?encoding=utf8`
sigue siendo con pérdida por diseño — para binarios pasar `encoding=base64`.

## Verificado en prod (14 sep 2026, deploy `e9f93263`)

Caja `ubuntu` fresca (la del reporte ya no existía), 2 MB de `/dev/urandom` + texto con acentos:

```
sandbox_exec   sha256sum /tmp/bin.test → 0b3847f8…4380fb
sandbox_files_read /tmp/bin.test       → size_bytes 2097152, sha256 0b3847f8…4380fb
curl -o bin.dl "$url" && shasum -a 256 → 0b3847f8…4380fb   (2097152 bytes)
sandbox_files_read /tmp/txt.test       → { content: "hola ñandú\n", encoding: "utf8" }
```

Bytes intactos y el texto sigue llegando inline. **Cerrado.**
