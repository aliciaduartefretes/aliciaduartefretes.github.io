# NALVI Grammar Engine — PASO 4

## Alcance

Esta carpeta convierte la Knowledge Base piloto del PASO 3 en una capa computable y conservadora. No modifica cursos, no se conecta a Firebase ni a OpenAI y no agrega contenido lingüístico nuevo.

El motor prefiere `unavailable` antes que construir una forma sin evidencia suficiente.

## Compuerta obligatoria

Una forma o regla solo puede producir un resultado utilizable cuando, al mismo tiempo:

1. el registro existe;
2. su `validationStatus` es `normativeVerified` o `expertVerified`;
3. `allowedForGeneration` es `true`;
4. tiene procedencia;
5. no hay conflictos abiertos;
6. existe una regla de realización computable y validada, o una forma exacta validada.

Un registro `normativeVerified` necesita además una auditoría Nivel A con localizador exacto y alcance explícito. Para gramática, el alcance puede autorizar solamente componentes del patrón sin autorizar generación. `sourceVerified` conserva valor documental, pero devuelve `reviewRequired`. `unreviewed` también exige revisión. `conflict` queda bloqueado. `rejected` y `deprecated` no se usan.

## Resultado PRE-8C

El inventario de marcadores personales de `CP-AREAL-001` quedó como `normativeVerified` para los componentes `personMarkers`, `inclusiveExclusive` y `oralNasalInclusiveAlternation`. Se mantiene `allowedForGeneration: false` y `conjugationGeneration: false`.

Esto no habilita una conjugación. En el corpus actual hay:

- 1 patrón con componentes normativamente verificados;
- 0 patrones productivos;
- 0 lemas verbales productivos;
- 0 formas verbales reales disponibles.

Faltan un lema verbal con pertenencia inequívoca al patrón, raíz/forma subyacente, perfil oral/nasal y excepciones, además de una regla normativa de realización computable o un paradigma exacto. Por ello PASO 8C no puede iniciarse todavía.

## Funciones

### `getValidatedVerbForm(verbId, grammaticalPerson, options)`

Consulta, en orden:

1. lexema;
2. patrón de conjugación;
3. persona y número;
4. inclusivo/exclusivo;
5. variante oral/nasal;
6. conflictos;
7. excepciones o formas exactas validadas;
8. reglas morfológicas explícitas;
9. estado de validación y permiso de generación.

Nunca usa `normalizedForm` como raíz automáticamente ni supone que conjugar equivale a `prefijo + palabra`. Una composición exige `underlyingForm`, morfemas identificados y `realizationRules` explícitas.

Resultados principales:

- `available`: forma autorizada y trazable;
- `unavailable`: falta información computable;
- `reviewRequired`: hay información, pero no alcanza el nivel de autoridad requerido;
- `conflict`: existe una controversia abierta.

Todos incluyen `aiPermitted: false`. OpenAI no está conectado.

Cuando el resultado es `available`, el contrato devuelve también `lemma`, `person` y `pattern`, además de forma, regla, fuente y estado de validación. Las pruebas productivas actuales usan exclusivamente fixtures no lingüísticas; ninguna se incorpora al corpus.

### `validateSentenceStructure(sentenceData)`

Valida únicamente datos estructurados con `constructionType` y constituyentes con roles. No es un parser completo. Una lista de palabras correctas no vuelve correcta a una estructura mal ordenada.

Actualmente la posesión devuelve `reviewRequired`; negación, interrogación y mandato devuelven `unavailable` porque todavía no existen reglas `expertVerified` habilitadas.

### `compileKnowledgeBase({corpus, governance})`

Genera un índice de lectura con patrones, lexemas, reglas, conflictos, inventarios disponibles y vacíos explícitos. No cambia estados ni activa registros.

## Modelado preparado

El esquema permite representar progresivamente:

- personas e inclusivo/exclusivo;
- marcadores subyacentes y variantes oral/nasal;
- morfemas con función y posición;
- prefijos, raíces, sufijos y estructuras discontinuas mediante orden explícito;
- transformaciones morfofonológicas validadas;
- restricciones, excepciones y conflictos;
- areal, aireal, hareal, verbalizados/chendales y comportamientos especiales;
- regulares, defectivos y unipersonales;
- transitivos, intransitivos y bitransitivos;
- afirmación, negación, interrogación, mandato, posesión y clases nominales.

Que una estructura esté preparada no significa que tenga contenido habilitado.

## Archivos

- `grammar-engine.mjs`: motor puro y sin red.
- `grammar-engine.schema.json`: contrato computable ampliado.
- `compile-knowledge.mjs`: compilador determinístico.
- `compiled-knowledge.json`: índice generado desde PASO 3.
- `tests/grammar-engine.test.mjs`: pruebas productivas y fixtures abstractas.

Las fixtures usan cadenas como `TEST-VERB`, `ROOT`, `TO-` y `TN-`. No son guaraní, no pertenecen al corpus y solo comprueban el comportamiento técnico sin inventar formas lingüísticas.

## Ejecutar

```bash
node grammar-engine/compile-knowledge.mjs
node --test grammar-engine/tests/grammar-engine.test.mjs
```
