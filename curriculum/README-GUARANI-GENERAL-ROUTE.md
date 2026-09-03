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

## Ciclo pedagógico

La ruta modela las capacidades `ESCUCHA → ENTIENDE → CONSTRUYE → HABLA → APLICA → DOMINA`. Son capacidades asociables a un objetivo, no seis pantallas obligatorias.

## Estado lingüístico

Los objetivos que hacen referencia a contenido lingüístico no validado o con revisión pendiente están marcados como `unreviewed` o `reviewRequired`. Este paso no los habilita para generación automática ni para cálculo de dominio.

## API de consulta local

La capa `assets/js/nalvi-guarani-general-route.js` expone `window.NALVI_GUARANI_GENERAL_ROUTE` con consultas locales para módulos, conceptos, objetivos, unidad heredada, actividades y descriptor institucional. No usa red, Firebase ni OpenAI.

## Pruebas

Ejecutar:

```bash
node --test curriculum/tests/guarani-general-route.test.mjs
node scripts/validate-paso-5.mjs
```

