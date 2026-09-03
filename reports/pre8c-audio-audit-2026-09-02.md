# Auditoría de audio PRE-8C — 2026-09-02

## Alcance

Auditoría realizada desde el checkpoint Git `3f3dd42fe74b1ec972b508775d7c3caabb4f0b60`, sin iniciar PASO 8C y sin modificar producción, Firebase, la lógica de avance/Mastery, Comunidad ni `main`.

La ruta solicitada `docs/recovery/PRE8C_RECOVERY_2026-09-02.md` no existe en el checkpoint, en sus refs Git ni en el ZIP de recuperación. Se utilizó el documento recuperado disponible `INFORME-RECUPERACION-PRE-8C-2026-09-02.md`, especialmente sus secciones 9 y 10, donde la auditoría de las 99 grabaciones figuraba como riesgo abierto.

## Resultado físico y del manifiesto

| Control | Resultado |
|---|---:|
| Versión del manifiesto | `NALVI_RECORDED_AUDIO_V1` |
| Conteo declarado | 99 |
| Registros del manifiesto | 99 |
| Archivos físicos `.m4a` | 99 |
| Checksums de recuperación disponibles | 99 |
| Checksums coincidentes | 99/99 |
| Bytes del corpus | 1,548,150 |
| Archivos faltantes | 0 |
| Archivos extra | 0 |
| Archivos vacíos o con firma no M4A | 0 |
| IDs duplicados | 0 |
| Rutas duplicadas | 0 |
| `sourceFile` duplicados tras NFC/case-fold | 0 |
| Etiquetas duplicadas tras normalización | 0 |
| Aliases de texto ambiguos entre grabaciones | 0 |
| Contenidos binarios SHA-256 duplicados | 0 |

La correspondencia exacta de las 99 entradas está formada por:

- identidad, etiqueta, nombre original y archivo canónico: `assets/audio/guarani/ali-2026/manifest.json`;
- SHA-256 de recuperación por archivo canónico: `RECOVERY-PRE-8C-SHA256SUMS.txt`;
- unión verificable de ambos conjuntos, con bytes y estado, mediante `node scripts/validate-pre8c-audio.mjs --table` o JSON completo mediante `--json`.

El validador exige IDs y archivos correlativos `001`–`099`, nombres NFC, formato `audio/mp4`, `humanRecorded:true`, `authorizedForPlayback:true`, archivo regular no vacío, firma ISO BMFF `ftyp`, coincidencia con el checksum de recuperación y ausencia de cualquier duplicado o alias ambiguo. Falla con código distinto de cero ante una sola divergencia.

## ¿Falta realmente una grabación?

El material original efectivamente entregado contiene 99 grabaciones:

- ZIP: `/Users/aliciaduarte/Downloads/APP GUARANÍ AUDIOS ALI-20260901T195955Z-1-001.zip`
- SHA-256 del ZIP: `1af2efebfb15174bc98d75ef445aa7f8a65ef4a3b064676b5ffd5d93ff951ec2`
- directorio central del ZIP: 99 entradas, todas `.m4a`, ningún otro archivo o directorio explícito;
- `unzip -t`: sin errores;
- carpeta extraída, importación, manifiesto y checkpoint: los mismos 99 contenidos por SHA-256.

La conversación de origen contiene una descripción previa del lote como “100 audios”, pero después de adjuntar ese ZIP se registró que contenía 99. Por tanto:

- certeza alta: el ZIP recibido tenía 99;
- certeza alta: no se perdió ninguna grabación al extraer, importar o recuperar;
- indeterminado: si antes de crear el ZIP se pretendía incluir una grabación número 100 y cuál sería;
- decisión segura: no inventar ni sintetizar una supuesta grabación faltante. Solo las 99 verificables pueden entrar en la whitelist.

## Separación entre autorización técnica y aprobación lingüística

`authorizedForPlayback:true` significa exclusivamente que una grabación humana, físicamente presente y coherente con su identidad/ruta del manifiesto puede reproducirse. No constituye revisión normativa, aprobación lingüística ni habilitación de PASO 8C. El estado de PASO 8C permanece bloqueado.

## Controles de ejecución

La autoridad server-side se deriva del manifiesto al cargar el módulo y verifica cada archivo físico, incluida su coincidencia con el SHA-256 de recuperación. Una solicitud solo se resuelve si `audioId`, ruta canónica relativa, texto y objetivo/respuesta aprobada corresponden a una misma entrada autorizada. Los booleanos enviados por el cliente se ignoran y se reconstruyen en servidor. Si el manifiesto no puede cargarse, una ruta no existe, el archivo no pasa la inspección o los campos no coinciden, la resolución es `null` y no se ofrece `AUDIO_SELECT`.

En cliente, la URL absoluta se deriva únicamente para `fetch` y reproducción. El contrato que atraviesa servicio, planner/fallback y renderer conserva la ruta canónica relativa `assets/audio/guarani/ali-2026/<archivo>`; una URL arbitraria nunca se transforma en autorización.

`NALVI_RECORDED_AUDIO.ready` espera como máximo 8 segundos por el manifiesto. Hasta que resuelve, el botón permanece deshabilitado y no se crea ningún reproductor. Si vence el plazo, `ready` resuelve con `ok:false`, el registry queda en estado `failed` y no reproduce ni sintetiza audio.

## Riesgos que permanecen

1. No existe inventario upstream de 100 nombres que permita confirmar o identificar una omisión anterior al ZIP.
2. La presencia y autorización técnica no validan pronunciación, significado, ortografía ni adecuación pedagógica de ninguna grabación.
3. La validación de reproducción real cubrió el navegador de escritorio disponible y un archivo representativo; falta una matriz manual de los 99 archivos, dispositivos/motores y políticas de autoplay.
4. La integración B no modifica el fixture del catálogo ni el cliente de intervención, reservados al integrador A. La galería queda fail-closed hasta recibir desde A los seis campos canónicos del audio.
5. No se desplegó ni se probó CDN/producción; las rutas se verificaron solo en servidor HTTP local y pruebas unitarias.
6. Antes de producción debe verificarse que el empaquetador serverless incluya los 99 `.m4a` y `RECOVERY-PRE-8C-SHA256SUMS.txt`; si falta cualquiera, la autoridad falla cerrada.
7. Por la prohibición de modificar `main`/producción, el token de caché del registry en `index.html` continúa en V1. Debe actualizarse de forma coordinada antes de desplegar V2.
8. La API histórica `playPronunciation()` confirma inicio de forma síncrona. Si un recurso histórico falla después de devolver `true`, no existe señal para intentar entonces el M4A recuperado; no se sintetiza nada, pero esa reproducción puede quedar fallida.

## Matriz ejecutada

| Comando/control | Resultado |
|---|---|
| `node scripts/validate-pre8c-audio.mjs` | PASS — 99 manifiesto, 99 físicos, 99 SHA, cero diferencias/duplicados |
| `shasum -a 256`, `zipinfo -h` y `unzip -t` sobre el ZIP original | PASS — hash esperado, 99 entradas, cero errores |
| `node --test assets/js/tests/nalvi-recorded-audio.test.mjs assets/js/tests/nalvi-audio-renderer.test.mjs` | PASS — 16/16 |
| `node --test server/tests/recorded-audio-whitelist.test.mjs` | PASS — 13/13 |
| `node --check` en los ocho módulos/scripts JavaScript modificados | PASS |
| `git diff --check` | PASS |
| `npm run test:reinforcement` | PASS — 8/8 |
| `npm run validate:paso-7b` | PASS |
| `npm run test:intervention` | PASS — 9/9 |
| `npm run validate:paso-8` | PASS |
| `npm run test:adaptive-plans` | PASS — 10/10 |
| `npm run validate:paso-8b` | PASS |
| `npm run validate:paso-8b-5-normative` | PASS |
| `npm run test:grammar` | PASS — 15/15 |
| `npm run validate:pre-8c` | PASS_WITH_GATE_CLOSED — `paso8CMayStart:false` |
| `npm run validate:pre-8c-progression` | PASS |
| `npm run test:answer-evaluator` | PASS — 4/4 |
| `npm run test:adaptive-tutor` | FAIL basal — 15/58 PASS, 43 FAIL |
| `npm run test:activity-catalog` | FAIL basal — 4/9 PASS, 5 FAIL |
| `npm run test:progression` | FAIL basal — 7/8 PASS, 1 FAIL |

Los 49 fallos de las tres últimas suites son exactamente los documentados en el checkpoint de recuperación antes de B: fixtures/expectativas antiguas y construcción general de `approvedActivityMaterial`, áreas asignadas a la integración A. La suite específica B añade cobertura de booleanos cliente falsificados, ID/ruta/texto/objetivo incoherentes, archivo ausente/no autorizado/SHA distinto, duplicados y aliases, propagación por fallback y renderer, schema discriminado, carga lenta/timeout, prioridad histórica y fallo seguro de reproducción.

Validación HTTP/browser representativa: desde `debug/activity-catalog.html`, el registry solicitó `/assets/audio/guarani/ali-2026/manifest.json` con HTTP 200, el botón canónico pasó de `loading` a `ready`, y `NALVI-AUDIO-096` solicitó `/assets/audio/guarani/ali-2026/096-jagua.m4a` con HTTP 200, sin errores de consola. Esa corrida utilizó temporalmente el fixture canónico propiedad de A; se retiró del diff B para evitar solapamiento y debe repetirse después de integrar ambos cambios.
