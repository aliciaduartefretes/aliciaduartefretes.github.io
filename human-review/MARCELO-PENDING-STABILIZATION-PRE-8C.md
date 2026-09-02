# NALVI — Lista lingüística pendiente para Marcelo

Fecha: 2026-09-01  
Alcance: estabilización previa al PASO 8C  
Estado general: `PENDING_MARCELO`

Esta lista registra dudas encontradas durante la auditoría de preguntas, respuestas y explicaciones. Ninguna propuesta de este documento fue aplicada como validación humana, `expertVerified`, `humanApproved` ni `allowedForGeneration`.

| ID | Ubicación / pantalla | Curso · módulo · objetivo | Texto actual | Corrección o alternativa propuesta | Contexto completo | Tipo de problema | Estado | Observaciones |
|---|---|---|---|---|---|---|---|---|
| `MR-2026-001` | Lección y quiz de saludos | Guaraní General · Módulo inicial · Saludos y cortesía | `Mba’éichapa` → `¿Cómo estás?` | Confirmar grafía normativa, función pragmática y equivalencia contextual exacta. | Aparece en explicación, diálogo y pregunta “¿Qué expresa «Mba’éichapa»?”. | Ortografía + equivalencia contextual | `PENDING_MARCELO` | El expediente anterior ya la mantiene en `NEEDS_MORE_EVIDENCE`; no promover automáticamente. |
| `MR-2026-002` | Lección y quiz de saludos | Guaraní General · Módulo inicial · Saludos y cortesía | `Aguyje` → `Gracias` | Confirmar que la equivalencia es válida en este acto de cortesía y precisar variantes admitidas en la respuesta. | Diálogo: “Iporã, aguyje. Ha nde?”; pregunta: “Elige «gracias».” | Equivalencia pragmática | `PENDING_MARCELO` | El expediente anterior indica que falta confirmar categoría y equivalencia pragmática. |
| `MR-2026-003` | Lección y quiz de saludos | Guaraní General · Módulo inicial · Saludos y cortesía | `Jajotopata` → `Nos vemos` | Confirmar la forma, segmentación y sentido de despedida utilizado. | Diálogo final y pregunta “¿Cómo dices «nos vemos»?”. | Forma verbal compleja | `PENDING_MARCELO` | Mantener sin aprobación experta; no usar para generación productiva. |
| `MR-2026-004` | Quiz de saludos y unidad de sentimientos | Guaraní General · Módulo inicial · Saludos / Sentimientos | `Iporã` → `Bien / bonito` | Delimitar por contexto cuáles acepciones deben aceptarse y cuándo no son intercambiables. | Pregunta “«Iporã» puede significar…” y uso como respuesta a `Mba’éichapa`. | Polisemia contextual | `PENDING_MARCELO` | No crear una lista global de sinónimos; cada equivalencia debe quedar vinculada al ejercicio. |
| `MR-2026-005` | Lección y quiz de presentación | Guaraní General · Módulo inicial · Cómo presentarte | `Moõguápa nde?` → `¿De dónde eres?` | Confirmar grafía, segmentación y traducción contextual exacta. | Diálogo de presentación y pregunta “¿Cómo preguntas de dónde es alguien?”. | Ortografía + estructura interrogativa | `PENDING_MARCELO` | No sustituir por la variante legacy `Moõgua nde` sin aprobación. |
| `MR-2026-006` | Lección de presentación / conversación | Guaraní General · Módulo inicial · Cómo presentarte | `Mba’éichapa nde réra?` → `¿Cómo te llamas?` | Confirmar la construcción completa y su uso natural en el contexto mostrado. | Pregunta de revisión y diálogo “Maitei! Che réra Ana. Mba’éichapa nde réra?”. | Construcción interrogativa | `PENDING_MARCELO` | La forma no debe considerarse validada solo porque sus palabras individuales estén registradas. |
| `MR-2026-007` | Lección y quiz de lugares | Guaraní General · Módulo inicial · Lugares y direcciones | `El sufijo «-pe» puede indicar… Ubicación` | Confirmar el alcance exacto y la redacción pedagógica autorizada para `-pe`. | Explicación: `ógape`, `Paraguaýpe`; quiz con opciones Plural / Negación / Ubicación. | Regla gramatical | `PENDING_MARCELO` | No habilitar generación gramatical ni PASO 8C a partir de esta formulación resumida. |

## Regla de aplicación

Cuando Marcelo revise la lista, registrar por entrada `APPROVED` o `REJECTED`. Solo las correcciones aprobadas pueden pasar después a `APPLIED`. La aprobación de un texto visible no implica automáticamente `expertVerified` ni autorización para generación.
