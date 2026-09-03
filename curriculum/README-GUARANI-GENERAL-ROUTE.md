# Ruta pedagógica de Guaraní General — PASO 5

Esta carpeta contiene la primera estructura computable de Guaraní General basada en competencias. No calcula dominio y no modifica Firebase.

## Jerarquía

`GG-ROUTE-01` → 7 módulos → 28 objetivos de aprendizaje → 28 conceptos → actividades existentes.

La unidad de avance conceptual es `learningObjective`, no una cantidad fija de lecciones. La práctica queda declarada como variable para que una etapa posterior pueda seleccionar refuerzo según evidencia, sin que este paso implemente todavía Mastery Engine.

## Relaciones

Cada objetivo puede declarar:

- `conceptIds`;
- `lexemeIds`;
- `grammarRuleIds`;
- `skills`;
- `difficulty`;
- `activityTypes`;
- `existingDynamicActivityIds`;
- `legacyContentRefs`;
- `institutionalMetadata`.

`legacyContentRefs` conserva el enlace con las 28 unidades actuales de Guaraní General. Ninguna unidad ni pregunta fue eliminada.

El objetivo existente `GG-LO-007` (Acciones cotidianas) incorpora además el material canónico de 12 páginas “NALVI GUARANI CONJUGACIÓN EN TIEMPO PRESENTE”. La ruta conserva sus bloques en orden y proyecta únicamente los renglones con espacios en blanco como actividades `fill-blank`; no crea otro módulo, objetivo o recorrido, y no añade distractores. Al abrir la unidad heredada 7 se presenta el material y luego sus 17 renglones mediante el renderer existente. El material y sus actividades se consultan con `getSourceMaterialsForLearningObjective()` y `getActivitiesForLearningObjective()`.

Las correcciones directas de la autora distinguen `Jajoechata` en el diálogo (`¿Mba’éichapa reime Ana?` / `Aime porã, ¿ha nde?` / `Aime porã avei. ¡Jajoechata!`) y `Jajotopata` con el significado “Nos vamos a encontrar”. El contenido fuente correspondiente conserva tres actividades; su SHA-256 normalizado pasa a `1000e98448051acc6b0e4d18a0d4584a7877ae95247841b59ff4dc47823fafe2` y debe alinearse con la autoridad server-side en una integración separada.

## Ciclo pedagógico

La ruta modela las capacidades `ESCUCHA → ENTIENDE → CONSTRUYE → HABLA → APLICA → DOMINA`. Son capacidades asociables a un objetivo, no seis pantallas obligatorias.

## Estado lingüístico

Los objetivos que hacen referencia a contenido lingüístico no validado o con revisión pendiente están marcados como `unreviewed` o `reviewRequired`. Este paso no los habilita para generación automática ni para cálculo de dominio.

Las actividades del ejercitario conservan `allowedForMastery: false` mientras `GG-LO-007` siga en `reviewRequired`. Sí usan un tipo admitido por la progresión local, por lo que una respuesta incorrecta mantiene el bloqueo y una correcta conserva el registro de evidencia sin atribuir aprobación normativa.

## API de consulta local

La capa `assets/js/nalvi-guarani-general-route.js` expone `window.NALVI_GUARANI_GENERAL_ROUTE` con consultas locales para módulos, conceptos, objetivos, unidad heredada, actividades y descriptor institucional. No usa red, Firebase ni OpenAI.

## Pruebas

Ejecutar:

```bash
node --test curriculum/tests/guarani-general-route.test.mjs
node --test curriculum/tests/guarani-general-verbs-fidelity.test.mjs
node scripts/validate-paso-5.mjs
```
