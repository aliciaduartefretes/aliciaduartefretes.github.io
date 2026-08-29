# NALVI — PASO 8B.5 · Expediente de revisión humana

> **Actualización 2026-08-29:** este expediente histórico no fue regenerado. El ajuste posterior habilitó 20 acepciones concretas como `normativeVerified` y mantuvo 5 fichas de riesgo bajo-medio sin autorización. Véase `PASO-8B-5-AJUSTE-NORMATIVE-VERIFIED.md`.

Fecha de preparación: 2026-08-28  
Variante: guaraní paraguayo (`gug-PY`)  
Fase: preparación documental; **sin activación**

## Resultado ejecutivo

- 25 fichas quedaron en `READY_FOR_HUMAN_REVIEW`.
- 5 registros quedaron en `NEEDS_MORE_EVIDENCE`.
- 4 registros quedaron en `BLOCKED`.
- 0 registros fueron marcados `expertVerified`.
- 0 registros recibieron `allowedForGeneration: true`.
- No se modificaron la aplicación, `index.html`, Knowledge Base, Grammar Engine, Firebase ni Firebase Rules.
- No se ejecutó una prueba real con OpenAI porque todavía no existe corpus autorizado.

`READY_FOR_HUMAN_REVIEW` significa únicamente que la forma tiene procedencia oficial suficiente para llegar a una revisión experta. **No significa que ya esté aprobada.** Las glosas españolas de este expediente son ayudas de trabajo y deben confirmarse durante la revisión; la autoridad primaria sigue siendo la entrada oficial enlazada.

## Fuente principal

**S-002 — Diccionario Guaraní Paraguayo**, Departamento de Lexicografía y Terminología de la Academia de la Lengua Guaraní, segunda edición (2021), publicado para consulta por la Secretaría de Políticas Lingüísticas. La SPL identifica a la Academia como autora del diccionario digital y a la Academia como autoridad normalizadora del guaraní paraguayo.

- Portal oficial: <https://spl.gov.py/es/diccionario-guarani-paraguayo/>
- Registro interno: `knowledge-base/references/REGISTRO-FUENTES-INICIAL.json`

## READY_FOR_HUMAN_REVIEW

Ninguna de estas fichas está importada todavía. Su `validationStatus` actual es `notImported`; la fuente usada está `sourceVerified`.

| Decisión | ID | Forma | Significado de trabajo | Categoría | Localizador oficial | Ejemplo | Riesgo | Motivo de candidatura |
|---|---|---|---|---|---|---|---|---|
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-AKA-001` | akã | cabeza | sustantivo | [01.htm#e46](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/01.htm#e46) | Sí | bajo | Lema corporal cotidiano; no depende de conjugación ni de C-001/C-002. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-AO-001` | ao | ropa; prenda | sustantivo | [01.htm#e91](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/01.htm#e91) | Sí | bajo | Definición directa; sin morfología productiva requerida. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-APYKA-001` | apyka | asiento; silla | sustantivo | [01.htm#e110](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/01.htm#e110) | Sí | bajo | Objeto cotidiano y concreto. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-ARANDUKA-001` | aranduka | libro | sustantivo | [01.htm#e130](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/01.htm#e130) | Sí | bajo | Léxico escolar elemental. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-ARA-001` | ára | día; período iluminado | sustantivo | [01.htm#e160](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/01.htm#e160) | Sí | bajo-medio | Debe preservarse el sentido seleccionado por amplitud semántica. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-AVATI-001` | avati | maíz | sustantivo | [01.htm#e186](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/01.htm#e186) | Sí | bajo | Sustantivo cotidiano y culturalmente relevante. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-GUYRA-001` | guyra | ave; pájaro | sustantivo | [05.htm#e318](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/05.htm#e318) | Sí | bajo | Léxico elemental de fauna. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-IRUNDY-001` | irundy | cuatro | numeral | [08.htm#e377](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/08.htm#e377) | Sí | bajo | Numeral básico con posición explícita en la serie. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-JAGUA-001` | jagua | perro | sustantivo | [10.htm#e396](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/10.htm#e396) | Sí | bajo | Fauna doméstica cotidiana. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-JARYI-001` | jarýi | abuela | parentesco | [10.htm#e413](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/10.htm#e413) | Sí | bajo-medio | La revisión debe confirmar el alcance familiar exacto. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-JASY-001` | jasy | luna | sustantivo | [10.htm#e426](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/10.htm#e426) | Sí | bajo | Definición oficial concreta. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-JURU-001` | juru | boca | sustantivo | [10.htm#e472](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/10.htm#e472) | Sí | bajo | No se propone todavía posesión ni derivación. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-KUARAHY-001` | kuarahy | sol | sustantivo | [11.htm#e683](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/11.htm#e683) | Sí | bajo | Lema elemental con entrada concreta. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-KUMANDA-001` | kumanda | poroto; frijol | sustantivo | [11.htm#e705](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/11.htm#e705) | Sí | bajo-medio | Confirmar glosa regional y eventual variante nasal. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-MANDIO-001` | mandi’o | mandioca | sustantivo | [13.htm#e812](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/13.htm#e812) | Sí | bajo | Acepciones botánica y alimentaria documentadas. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-MITA-001` | mitã | niño; criatura | sustantivo | [13.htm#e859](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/13.htm#e859) | Sí | bajo | Persona cotidiana, sin conflicto conocido. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-MOKOI-001` | mokõi | dos | numeral | [13.htm#e868](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/13.htm#e868) | Sí | bajo | Definido explícitamente como 2. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-MBARAKAJA-001` | mbarakaja | gato | sustantivo | [14.htm#e902](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/14.htm#e902) | Sí | bajo | Animal doméstico elemental. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-MBOHAPY-001` | mbohapy | tres | numeral | [14.htm#e965](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/14.htm#e965) | Sí | bajo | Definido explícitamente como 3. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-PANAMBI-001` | panambi | mariposa | sustantivo | [21.htm#e1238](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/21.htm#e1238) | Sí | bajo | Fauna elemental con entrada oficial. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-PETEI-001` | peteĩ | uno | numeral | [21.htm#e1280](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/21.htm#e1280) | Sí | bajo | Posición explícita en la serie numérica. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-PIRA-001` | pira | pez; pescado | sustantivo | [21.htm#e1307](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/21.htm#e1307) | No | bajo-medio | Fijar si la actividad enseña el animal o el alimento. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-PY-001` | py | pie | sustantivo | [21.htm#e1439](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/21.htm#e1439) | No | bajo | No se propone todavía posesión ni derivación. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-PYHARE-001` | pyhare | noche | sustantivo | [21.htm#e1452](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/21.htm#e1452) | Sí | bajo | Sustantivo temporal cotidiano. |
| ☐ Aprobar ☐ Rechazar ☐ Posponer | `LEX-PILOT-SY-001` | sy | madre | parentesco | [24.htm#e1600](https://spl.gov.py/recurso/Diccionario%20Guarani%20Paraguayo/lexicon/24.htm#e1600) | Uso en S-001 p. 251 | bajo-medio | Confirmar alcance humano/animal antes de crear distractores. |

## NEEDS_MORE_EVIDENCE

| ID | Forma/tema | Estado actual | Motivo |
|---|---|---|---|
| `LEX-CANDIDATE-MBAEICHAPA` | mba’éichapa | `unreviewed` | Solo tiene como fuente una actividad interna; falta ficha oficial que confirme forma, función y glosa exacta. |
| `LEX-CANDIDATE-AGUYJE` | aguyje | `unreviewed` | S-001 atestigua uso, pero la entrada oficial localizada es `mboaguyje`; hace falta revisar categoría y equivalencia pragmática. |
| `LEX-CANDIDATE-JAJOTOPATA` | jajotopata | `unreviewed` | Es forma verbal compleja; faltan lema, segmentación, persona, tiempo/aspecto y validación de uso. |
| `CP-AREAL-001` | patrón areal | `sourceVerified` | No tiene lemas elegibles asociados ni reglas negativas completas; la conjugación está fuera del piloto. |
| `RULE-POSSESSION-001` | poseedor → poseído | `sourceVerified` | La propia ficha requiere alomorfía, clases nominales y oral/nasal antes de generar. |

## BLOCKED

| ID | Tema | Estado | Motivo del bloqueo |
|---|---|---|---|
| `CP-AIREAL-001` | patrón aireal | `conflict` | Depende de C-002. |
| `CP-HAREAL-001` | patrón hareal | `sourceVerified`, con `conflictIds` | Su alcance se cruza con C-001. |
| `C-001` | cantidad y alcance de verbos irregulares | `conflict` | No se resuelve en este paso. |
| `C-002` | función de `i` en aireales | `conflict` | No se resuelve en este paso. |

## Cómo registrar la decisión humana

Para cada ID de `READY_FOR_HUMAN_REVIEW`, la persona revisora debe registrar una decisión individual:

```text
ID:
DECISIÓN: APROBAR | RECHAZAR | POSPONER
GLOSA CONFIRMADA:
CATEGORÍA CONFIRMADA:
SENTIDO/RESTRICCIÓN:
REVIEWED BY:
OBSERVACIÓN:
```

Para otorgar `expertVerified`, `reviewedBy` debe identificar a la persona que realizó la **revisión lingüística experta**. Una aprobación meramente administrativa no debe registrarse como verificación experta.

## Qué ocurrirá después, y solo después, de la aprobación

1. Crear o actualizar exclusivamente las fichas aprobadas.
2. Mantener `source`, `sourcePage`, `version`, `reviewedBy` y `reviewedAt`.
3. Asignar `validationStatus: expertVerified` y `allowedForGeneration: true` solo a esas fichas.
4. Recompilar/validar Knowledge Base y Grammar Engine.
5. Ejecutar la prueba real de `generateAdaptiveInterventionPlan` únicamente con ese subconjunto.
6. Conservar fallback local y bloqueo de C-001/C-002.

No se realizó ninguna de estas operaciones en esta fase.
