# NALVI — Knowledge Base piloto del PASO 3

## Alcance

Esta carpeta prueba la arquitectura de conocimiento y su trazabilidad. No es una carga masiva, no se conecta todavía con `renderActivity`, Firebase, Grammar Engine ni OpenAI.

## Fuentes utilizadas conjuntamente

1. `references/INFORME-PASO-0.5.md`.
2. `references/MODELO-DATOS-CORPUS.schema.json`.
3. `references/REGISTRO-FUENTES-INICIAL.json`.
4. Las fuentes jerarquizadas en el informe, con prioridad normativa para la Academia.
5. Tres actividades existentes de Guaraní General, registradas como fuente pedagógica `S-008` y no como autoridad lingüística.

Las tres referencias del PASO 0.5 se copiaron sin cambios y conservan sus huellas SHA-256 originales.

## Contenido del piloto

- Tres patrones de conjugación estructurados: areal, aireal y hareal.
- Una regla básica de orden posesivo.
- Tres candidatos léxicos extraídos de actividades existentes.
- Las contradicciones C-001 y C-002, bloqueadas y pendientes de revisión humana.
- Un registro suplementario que clasifica el contenido actual como material pedagógico no validado.
- La política de gobernanza, áreas incompletas y compuerta de generación.

## Estados

`sourceVerified` solo confirma procedencia. No equivale a aprobación experta. Por eso incluso los patrones extraídos de la gramática mantienen `allowedForGeneration: false`.

Los candidatos provenientes de las actividades actuales están en `unreviewed`. C-001, C-002 y el patrón aireal relacionado permanecen en `conflict`.

## Regla de generación

Solo un registro futuro con `expertVerified`, `allowedForGeneration: true`, procedencia completa y ningún conflicto abierto podrá alimentar generación automática. En este piloto hay cero registros habilitados.

## Áreas pendientes conservadas

El archivo `governance.json` conserva explícitamente los vacíos del PASO 0.5: diminutivos/aumentativos, alomorfos oral/nasal, catálogo verbal por lema, frecuencia, niveles, registros, ejemplos profesionales/conversacionales y revisión humana.

## Validación

Ejecutar `node scripts/validate-paso-3.mjs` desde la raíz de la entrega. El validador comprueba trazabilidad, bloqueos, política de IA, integridad de las referencias y preservación de los seis idiomas.
