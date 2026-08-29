# NALVI — Ajuste PASO 8B.5 · `normativeVerified`

Fecha de ejecución: 2026-08-29  
Variante: guaraní paraguayo (`gug-PY`)  
Alcance: ajuste del expediente existente; **sin búsqueda ni selección de candidatos nuevos**.

## Distinción de gobernanza

`normativeVerified` significa que la forma y la acepción autorizada fueron comprobadas directamente contra una fuente normativa oficial Nivel A con localizador exacto. **No significa revisión por una persona experta.** Por eso estas fichas tienen `humanExpertReview: false` y metadatos separados en `normativeVerification`; no se creó un registro `review` ficticio.

La compuerta permite generación únicamente cuando:

- `validationStatus` es `normativeVerified` o `expertVerified`;
- `allowedForGeneration` es `true`;
- no existe conflicto abierto;
- una ficha `normativeVerified` conserva fuente Nivel A, localizador exacto, acepción y usos explícitos.

Siguen bloqueados `unreviewed`, `sourceVerified`, `conflict`, `rejected` y `deprecated`.

## Resultado

- `normativeVerified`: **20**
- `expertVerified`: **0**
- `allowedForGeneration`: **20**
- reglas gramaticales promovidas: **0**
- conjugación habilitada: **no**
- `NEEDS_MORE_EVIDENCE` modificado: **no**
- `BLOCKED` modificado: **no**
- C-001 y C-002: **bloqueados y sin resolver**

## Registros habilitados

La autorización cubre solo la forma y la acepción indicadas. No cubre ejemplos, oraciones, otras acepciones, derivación ni conjugación.

| ID | Forma | Acepción autorizada | Localizador | Usos autorizados |
|---|---|---|---|---|
| `LEX-PILOT-AKA-001` | akã | cabeza | `lexicon/01.htm#e46` | reconocimiento, recuerdo exacto, asociación, escritura controlada |
| `LEX-PILOT-AO-001` | ao | ropa | `lexicon/01.htm#e91` | idem |
| `LEX-PILOT-APYKA-001` | apyka | asiento | `lexicon/01.htm#e110` | idem |
| `LEX-PILOT-ARANDUKA-001` | aranduka | libro | `lexicon/01.htm#e130` | idem |
| `LEX-PILOT-AVATI-001` | avati | maíz | `lexicon/01.htm#e186` | idem |
| `LEX-PILOT-GUYRA-001` | guyra | ave | `lexicon/05.htm#e318` | idem |
| `LEX-PILOT-IRUNDY-001` | irundy | cuatro | `lexicon/08.htm#e377` | idem |
| `LEX-PILOT-JAGUA-001` | jagua | perro | `lexicon/10.htm#e396` | idem |
| `LEX-PILOT-JASY-001` | jasy | luna | `lexicon/10.htm#e426` | idem |
| `LEX-PILOT-JURU-001` | juru | boca | `lexicon/10.htm#e472` | idem |
| `LEX-PILOT-KUARAHY-001` | kuarahy | sol | `lexicon/11.htm#e683` | idem |
| `LEX-PILOT-MANDIO-001` | mandi’o | mandioca | `lexicon/13.htm#e812` | idem |
| `LEX-PILOT-MITA-001` | mitã | niño | `lexicon/13.htm#e859` | idem |
| `LEX-PILOT-MOKOI-001` | mokõi | dos | `lexicon/13.htm#e868` | idem |
| `LEX-PILOT-MBARAKAJA-001` | mbarakaja | gato | `lexicon/14.htm#e902` | idem |
| `LEX-PILOT-MBOHAPY-001` | mbohapy | tres | `lexicon/14.htm#e965` | idem |
| `LEX-PILOT-PANAMBI-001` | panambi | mariposa | `lexicon/21.htm#e1238` | idem |
| `LEX-PILOT-PETEI-001` | peteĩ | uno | `lexicon/21.htm#e1280` | idem |
| `LEX-PILOT-PY-001` | py | pie | `lexicon/21.htm#e1439` | idem |
| `LEX-PILOT-PYHARE-001` | pyhare | noche | `lexicon/21.htm#e1452` | idem |

## Registros que permanecen sin habilitar

Estas cinco fichas de riesgo bajo-medio continúan `notImported` y con `allowedForGeneration: false`:

- `LEX-PILOT-ARA-001`: amplitud semántica de `ára`.
- `LEX-PILOT-JARYI-001`: alcance exacto de parentesco.
- `LEX-PILOT-KUMANDA-001`: glosa regional y alcance léxico.
- `LEX-PILOT-PIRA-001`: animal frente a alimento.
- `LEX-PILOT-SY-001`: alcance humano/animal y uso de parentesco.

También permanecen bloqueados todos los registros de `NEEDS_MORE_EVIDENCE`, `BLOCKED`, C-001, C-002 y cualquier palabra no autorizada.

## Reglas gramaticales

No se promovió ninguna regla. Aunque existen pasajes normativos, las fichas actuales todavía declaran dependencias pendientes de alomorfía, clases nominales, lemas o excepciones. El Grammar Engine conserva su política de devolver `unavailable` o `reviewRequired` antes que inventar. No se habilitó conjugación automática.

## Prueba del PASO 8B

Caso usado: el estudiante falla la selección de `aranduka` (libro) y elige `ao` (ropa).

1. la respuesta se corrige localmente (`canScoreWithoutAI: true`);
2. `wouldAIImproveIntervention: true` permite planificar después de corregir;
3. el payload contiene únicamente `LEX-PILOT-ARANDUKA-001` y `LEX-PILOT-AO-001`;
4. la primera intervención cambia de multiple choice a matching;
5. la segunda actividad usa escritura controlada;
6. ninguna huella repite la actividad fallida;
7. pasan Knowledge Base, Grammar Engine, reglas de actividad, duplicate checker y allowed content;
8. ambas actividades se entregan con `allowedForMastery: false`, por lo que Mastery conserva autoridad;
9. el evento registra llamada, tokens, latencia, resultado y mastery antes/después;
10. una falla simulada de OpenAI produce una actividad local diferente.

La prueba automatizada ejecuta la canalización server-side completa con corpus real y una respuesta estructurada simulada del proveedor. No se realizó una llamada facturable al servicio real porque este entorno local no contiene `OPENAI_API_KEY`; la clave permanece correctamente en Vercel.

## Firebase

No se modificaron Firebase, Firestore ni Firebase Rules. No existe acción manual requerida en Firebase para este ajuste.
