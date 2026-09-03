# NALVI — Informe de recuperación pre-8C

Fecha de congelación: 2026-09-02 (America/Denver)  
Objetivo: preservar el estado local recuperado sin añadir funciones, sin modificar `main`, sin `push` y sin despliegue.

## 1. Ruta exacta de la carpeta recuperada

Fuente local recuperada del chat anterior:

`/Users/aliciaduarte/Documents/Codex/2026-08-26/files-mentioned-by-the-user-index/outputs/NALVI-paso-8B-adaptive-intervention-plans`

La fuente no contiene `.git`; es una copia de trabajo/exportación de 264 archivos y aproximadamente 45 MB.

Copia congelada y preparada para continuar:

`/Users/aliciaduarte/Documents/ChatGPT/NALVI - PRODUCTO Y DESARROLLO`

La copia se aplicó sobre `origin/main` sin eliminar ningún archivo existente en el commit base.

## 2. Rama y worktree actuales

- Rama local de recuperación: `codex/recovery-pre-8c-20260902`
- Upstream de referencia: `origin/main`
- Worktree: `/Users/aliciaduarte/Documents/ChatGPT/NALVI - PRODUCTO Y DESARROLLO`
- `main` no fue modificado ni desplegado.
- La rama es exclusivamente local; no se ejecutó `git push`.

## 3. Último commit existente antes de la recuperación

- Commit base: `de9315b0f621b4e5fc59936f46a9ce1ce5b9fbca`
- Padre: `0b17145ee78271971359508c4c6916803cd830a6`
- Fecha: `2026-09-02 10:00:15 -0600`
- Autor: `aliciaduartefretes <aliciaduartefretes@gmail.com>`
- Asunto: `chore: remove misplaced answer evaluator test`

Este es el HEAD de `origin/main` utilizado para reconstruir la relación entre la última versión publicada y los archivos locales recuperados.

## 4. Resultado completo de `git status`

Antes de crear el commit de recuperación:

- 15 archivos rastreados modificados.
- 178 archivos no rastreados recuperados.
- 0 archivos eliminados.
- 193 rutas cambiadas en total.

La salida completa, ruta por ruta, está preservada en:

`RECOVERY-PRE-8C-PRECOMMIT-STATUS.txt`

Después del commit, el estado esperado y obligatorio es un worktree limpio. El hash del commit y la comprobación final se registran en la entrega de esta recuperación.

## 5. Archivos modificados después del último commit

### 5.1 Archivos rastreados con contenido diferente: 15

1. `activity-catalog/catalog-examples.mjs`
2. `activity-catalog/nalvi-activity-catalog.mjs`
3. `activity-catalog/nalvi-activity-quality.mjs`
4. `assets/css/nalvi-activity-catalog.css`
5. `assets/js/kuaa-general-activities.js`
6. `assets/js/nalvi-activity-catalog-renderer.mjs`
7. `assets/js/nalvi-intervention-client.mjs`
8. `index.html`
9. `knowledge-base/references/MODELO-DATOS-CORPUS.schema.json`
10. `progression-engine/fallback-intervention.mjs`
11. `prompts/nalvi-tutor-critic-v1.md`
12. `prompts/nalvi-tutor-planner-v1.md`
13. `scripts/validate-paso-8B-5-normative.mjs`
14. `server/adaptive-tutor-schema.mjs`
15. `server/intervention-service.mjs`

Diff rastreado: 616 inserciones y 261 eliminaciones.

### 5.2 Archivos recuperados que no estaban en el commit base: 178

Incluyen:

- 99 grabaciones humanas `.m4a` y su `manifest.json`.
- `assets/js/nalvi-recorded-audio.js`.
- `scripts/import-recorded-audio.mjs`.
- esquemas, pruebas, validadores y documentación de fases anteriores.
- capturas de validación, versiones estables y dos ZIP de entregas anteriores.

La lista exhaustiva se encuentra en `RECOVERY-PRE-8C-PRECOMMIT-STATUS.txt`.

No se registraron eliminaciones. Los recursos presentes en `origin/main` pero ausentes de la carpeta fuente se conservaron.

## 6. Funciones completamente implementadas

Las siguientes capas permanecen implementadas y sus suites específicas pasan en el estado recuperado:

- Reinforcement Engine y su compuerta de conocimiento autorizado: 8/8.
- Intervention Engine: bloqueo tras error, fingerprints, variación de estrategia, evidencia guiada y seis idiomas: 9/9.
- Núcleo de planes adaptativos de 1 a 4 actividades, fallback local y filtro GREEN/YELLOW/RED: 10/10.
- Grammar Engine conservador: 15/15; no inventa conjugaciones ni promueve reglas incompletas.
- Evaluador de respuestas: normalización segura, equivalencias contextuales aprobadas, `near_miss` y derivación a revisión humana: 4/4.
- Progression Gate central: un error no avanza, salir no completa, la evidencia guiada no equivale a dominio y el servidor deriva Mastery.
- Validaciones estáticas de PASO 8 y PASO 8B.
- Compuerta pre-8C: `paso8CMayStart=false`, con cero patrones productivos, cero lemas verbales productivos y cero formas verbales reales autorizadas.
- Persistencia estructural de audio: manifiesto con 99 registros, 99 IDs únicos, 99 nombres únicos, 99 archivos presentes, cero ausentes y cero vacíos; las muestras inicial y final son reconocidas como audio M4A AAC/ALAC. El manifiesto registra `humanRecorded=true` y `authorizedForPlayback=true` en todos los registros.

Estas funciones no implican que el conjunto completo de cambios posteriores esté estabilizado; las incompatibilidades descritas abajo siguen abiertas.

## 7. Funciones implementadas pero pendientes de validación o estabilización

- Catálogo V1.1 reducido a seis tipos habilitados: `CONTEXT_CHOICE`, `ARROW_MATCH`, `CATEGORY_SORT`, `DIALOGUE_NEXT_TURN`, `INDEPENDENT_RECALL` y `AUDIO_SELECT`.
- Retiro de `GUIDED_GAP` y de los formatos piloto deshabilitados para impedir el ejercicio incoherente `Respuesta: ___ / Quién / Dónde / Cuándo`.
- Activación de intervenciones de audio.
- Resolver y reproductor de audio grabado con prioridad declarada para los audios históricos.
- Integración del manifiesto de 99 audios en el cliente y en `index.html`.
- Renderizado y textos de audio para español, inglés, portugués, francés, italiano y alemán.
- Construcción de `approvedActivityMaterial` para restringir opciones, pares, contextos, diálogos y audio a material expresamente reutilizable.
- Marcas `adaptiveReuseAuthorized` y diálogo autorizado en actividades existentes.
- Sanitización server-side del material aprobado.
- Fallback determinístico reescrito para consumir únicamente material autorizado.
- Esquemas y prompts de Planner/Critic ajustados al catálogo reducido.

Estas piezas existen en código, pero no deben publicarse: todavía producen fallos en progresión, catálogo y tutor adaptativo.

## 8. Pruebas ejecutadas

Entorno: Node `v24.18.1`, npm `11.16.0`; requisito declarado por el proyecto: Node `>=20`.

| Comando | Resultado | Detalle |
|---|---|---|
| `npm run test:reinforcement` | PASS | 8/8 |
| `npm run validate:paso-7b` | FAIL en este worktree | El validador pasa en la ruta fuente, pero aquí usa una ruta URL con `%20` y no encuentra `assets/js/nalvi-reinforcement-client.js`. |
| `npm run test:intervention` | PASS | 9/9 |
| `npm run validate:paso-8` | PASS | `ok=true` |
| `npm run test:adaptive-plans` | PASS | 10/10 |
| `npm run validate:paso-8b` | PASS | `ok=true` |
| `npm run validate:paso-8b-5-normative` | FAIL en este worktree | El validador pasa en la ruta fuente, pero aquí usa una ruta URL con `%20` y no encuentra `grammar-engine/grammar-engine.mjs`. |
| `npm run test:grammar` | PASS | 15/15 |
| `npm run validate:pre-8c` | PASS con compuerta cerrada | `PASS_WITH_GATE_CLOSED`; `paso8CMayStart=false`. |
| `npm run test:progression` | FAIL | 7/8; falla la variación de modalidad/huella en el caso “mamá”. |
| `npm run validate:pre-8c-progression` | PASS | `ok=true`; 6 tipos; un error no avanza. |
| `npm run test:adaptive-tutor` | FAIL | 15/58; 43 fallos. |
| `npm run test:activity-catalog` | FAIL | 4/9; 5 fallos. |
| `npm run test:answer-evaluator` | PASS | 4/4. |

Total de pruebas unitarias/evaluaciones: 121.  
PASS: 72.  
FAIL: 49.

En la ruta fuente sin espacios, los seis validadores finalizan con código 0. Las dos fallas adicionales del worktree congelado revelan un defecto de portabilidad de los validadores, no una diferencia de contenido.

También se ejecutaron todas las pruebas `.test.mjs` descubiertas que no están incluidas por los scripts de `package.json`:

| Prueba adicional | Resultado | Detalle |
|---|---|---|
| `curriculum/tests/guarani-general-route.test.mjs` | FAIL | 11/12; la comparación exacta antigua no contempla `adaptiveDialogue` y `adaptiveReuseAuthorized`. |
| `firebase/firestore-paso-6.test.mjs` | BLOCKED/FAIL | 0/1; falta la dependencia `@firebase/rules-unit-testing`. |
| `mastery-engine/tests/mastery-engine.test.mjs` | PASS | 12/12. |
| `server/tests/firebase-id-token.test.mjs` | PASS | 2/2. |
| `server/tests/normative-pilot-activation.test.mjs` | PASS | 3/3. |

Total de todas las pruebas descubiertas por archivo: 151.  
PASS: 100.  
FAIL/BLOCKED: 51, de las cuales una corresponde a la dependencia ausente de Firebase.

## 9. Errores y riesgos abiertos

1. **49 pruebas funcionales fallan.** No existe autorización para publicar ni declarar estable esta iteración.
2. **Desalineación de contrato.** Parte de las pruebas y fixtures todavía espera 14 tipos habilitados y audio apagado; el código recuperado usa seis tipos y audio encendido.
3. **Fallback vacío.** Las fixtures antiguas no aportan `approvedActivityMaterial` ni `authorized:true`; el fallback puede quedarse solo con `INDEPENDENT_RECALL`, que no se alinea con algunos tipos de error, y terminar con un plan sin actividades.
4. **Material aprobado ausente en el planner.** `pseudonymizedContext()` no propaga actualmente `approvedActivityMaterial`, aunque Planner/Critic necesitan ese inventario para elegir pares, categorías, diálogos, contextos y audio permitidos.
5. **Diálogo incompleto en el límite del servidor.** `sanitizeApprovedActivityMaterial()` no conserva actualmente `dialogueOptions`, `dialogueCorrectOptionId` ni `dialogueCorrectAnswer`, aunque `safeDialogue()` los necesita.
6. **Contexto susceptible de convertirse en texto basura.** El cliente envía `contexts` como objetos `{text, authorized}`, mientras una ruta de sanitización server-side puede tratarlos como texto y producir `"[object Object]"`.
7. **Audio incompleto al renderizar.** `toRenderable()` no conserva de forma completa `audioPath` y `audioAuthorized`; un `AUDIO_SELECT` procedente del servidor o fallback puede llegar sin una fuente reproducible.
8. **Autorización de audio insuficiente en servidor.** La ruta/booleano de audio proviene de la solicitud y aún no se contrasta server-side contra una whitelist derivada del manifiesto.
9. **Carga asíncrona de audio.** El manifiesto se carga mediante `fetch`; falta demostrar qué ocurre si el estudiante intenta reproducir un audio antes de que `ready` termine.
10. **Regresión de progresión.** El caso “mamá” no acepta la primera selección esperada y no demuestra todavía dos modalidades/fingerprints distintos.
11. **Portabilidad de rutas.** Dos validadores fallan cuando el worktree contiene espacios porque convierten la ruta a `%20` y la pasan sin decodificar a `node --check`.
12. **Prueba curricular obsoleta.** Una prueba de igualdad exacta falla por los metadatos nuevos de reuso; debe decidirse qué campos forman parte del contrato estable.
13. **Prueba de Firestore bloqueada.** No está instalada `@firebase/rules-unit-testing`; no se validaron nuevamente las reglas en esta recuperación.
14. **Audio no validado extremo a extremo.** Falta comprobar reproducción real, prioridad sobre los audios existentes, HTTP 200, móvil, escritorio y seis idiomas.
15. **Cantidad de audios.** El material recuperado contiene 99 grabaciones, no 100; debe verificarse si falta una o si el ZIP original realmente contenía 99.
16. **Reuso de material pendiente de Marcelo.** `Mba’éichapa`, `Aguyje` y `Jajotopata` están marcados para reuso adaptativo, pero siguen en `PENDING_MARCELO`; debe garantizarse que el reuso sea exclusivamente literal y `LESSON_BOUNDED`, nunca aprobación experta, Mastery ni generación.
17. **No hubo validación visual final** de los seis formatos nuevos ni prueba real de la secuencia posterior al error.
18. **PASO 8C continúa bloqueado.** Existen cero formas verbales productivas autorizadas y siete decisiones lingüísticas pendientes de Marcelo.
19. **Historial Git reconstruido.** La carpeta fuente no era un repositorio; la rama se reconstruyó de forma verificable sobre `origin/main` y conserva los archivos recuperados sin borrar los recursos publicados.

## 10. Punto exacto de reanudación

Retomar exclusivamente desde la rama local `codex/recovery-pre-8c-20260902` y desde el commit de checkpoint indicado en la entrega de recuperación. No comenzar PASO 8C.

Orden de estabilización requerido:

1. Reconciliar el catálogo de seis formatos con schemas, prompts, validadores, ejemplos y fixtures.
2. Corregir la construcción, sanitización y propagación completa de `approvedActivityMaterial` —incluido su envío a Planner/Critic y la preservación de diálogo, contextos y whitelist de audio— para que todos los tipos de error permitidos obtengan al menos una actividad autorizada y no vacía.
3. Recuperar el caso de progresión “mamá”: dos errores deben producir actividades aceptadas, modalidades distintas y fingerprints distintos.
4. Actualizar las expectativas obsoletas de 14 tipos/audio apagado sin debilitar las barreras contra tipos retirados, filtración de respuesta o contenido no autorizado.
5. Reconciliar la prueba curricular con el contrato de metadatos adaptativos y restaurar la prueba de Firestore con su dependencia controlada.
6. Hacer portables los dos validadores a rutas con espacios, sin cambiar comportamiento funcional.
7. Auditar la correspondencia de las 99 grabaciones, duplicados, posible audio faltante, prioridad sobre audios existentes, espera de carga asíncrona y propagación completa hasta el renderer.
8. Ejecutar nuevamente las 14 órdenes y todas las pruebas adicionales hasta obtener cero fallos, y después realizar validación visual y de reproducción en desktop y móvil para los seis idiomas.
9. Mantener `paso8CMayStart=false` hasta incorporar y aprobar la evidencia normativa pendiente.

## Garantías del checkpoint

- No se añadió ninguna función de producto durante la recuperación.
- No se modificó `main`.
- No se eliminó ni sobrescribió ningún respaldo anterior.
- No se ejecutó `git push`.
- No se desplegó a Vercel ni a producción.
- No se modificó Firebase.
