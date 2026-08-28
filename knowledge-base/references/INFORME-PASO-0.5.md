# KUAA — PASO 0.5

## Informe de investigación y diseño del corpus lingüístico base

**Fecha de corte:** 26 de agosto de 2026  
**Variedad objetivo:** guaraní paraguayo (`gug-PY`)  
**Estado:** diagnóstico inicial terminado; corpus masivo **no cargado**  
**Alcance técnico:** no se modificaron `index.html`, el motor de cursos, Firebase ni Vercel.

## 1. Conclusión ejecutiva

Existe una base normativa suficiente para comenzar una construcción rigurosa, pero no para automatizar todavía la generación de ejercicios.

La autoridad principal debe ser la **Gramática Guaraní de la Academia de la Lengua Guaraní**, versión corregida de 2020, complementada por el **Diccionario Guaraní Paraguayo de la Academia**. El **COREGUAPA** de la Secretaría de Políticas Lingüísticas sirve para comprobar uso real y contexto, no para reemplazar la norma. Las publicaciones académicas paraguayas son necesarias para ampliar, contrastar y detectar problemas de clasificación.

La investigación inicial confirma cuatro decisiones:

1. Cada regla, lema, paradigma y ejemplo debe conservar procedencia y página.
2. Norma, uso observado y propuesta terminológica deben almacenarse en capas diferentes.
3. Una contradicción bloquea el uso automático del registro hasta revisión humana.
4. Frecuencia, nivel pedagógico, registro y ámbito profesional no deben inferirse solo desde el diccionario.

## 2. Criterio de autoridad

La [Secretaría de Políticas Lingüísticas describe a la Academia](https://spl.gov.py/es/academia-de-la-lengua-guarani/) como la institución competente para normativizar los aspectos ortográficos, lexicológicos, terminológicos, gramaticales y discursivos. Entre sus fines están elaborar y actualizar la gramática y el diccionario oficiales, formar un corpus de referencia y preservar la sintaxis propia.

Por eso se propone esta jerarquía operativa:

| Nivel | Tipo de fuente | Uso permitido |
|---|---|---|
| A | Academia de la Lengua Guaraní | Norma principal |
| A- | SPL y corpus oficial | Uso documentado, política lingüística y contraste |
| B+ | Universidad o revista académica paraguaya | Ampliación, análisis y detección de variantes |
| B | Publicación especializada de lingüista reconocido | Apoyo con revisión |
| C | Material pedagógico institucional | Solo ejemplos de ámbito o secuenciación, nunca norma final |
| D | Blog, curso particular, Wikipedia o contenido de IA | No se admite como autoridad lingüística |

## 3. Registro inicial de fuentes

### S-001 — Gramática oficial

- **Título:** *Guarani Ñe’ẽtekuaa / Gramática Guaraní*
- **Autor institucional:** Academia de la Lengua Guaraní (Guarani Ñe’ẽ Rerekuapavẽ)
- **Edición:** versión corregida, tercera edición, agosto de 2020
- **Calidad:** A, normativa
- **Cobertura:** ortografía; categorías gramaticales; sustantivo; adjetivo; verbo; voz; tiempo; aspecto; modo; adverbio; pronombre; conjunción; interjección; posposiciones; sintaxis; formación y recuperación de sintaxis propia.
- **Páginas de entrada:** verbo, pp. 87–177; pronombre, pp. 185–196; posposiciones, pp. 202–210; sintaxis, pp. 211–235; formación de palabras, pp. 237–245; guía sintáctica, pp. 247–253.
- **URL consultada:** [copia digital de la edición de la Academia](https://guaraniayvu.org/pdf/GramaticaGuarani.pdf)
- **Riesgo de procedencia:** el archivo contiene la publicación oficial, pero está alojado en un dominio no institucional. Antes de una importación masiva debe obtenerse o cotejarse una copia directa de la Academia o de la SPL y registrar edición o huella digital.

### S-002 — Diccionario de la Academia

- **Título:** *Diccionario Guaraní Paraguayo*
- **Autor institucional:** Academia de la Lengua Guaraní, Departamento de Lexicografía y Terminología
- **Edición identificada:** segunda edición, diciembre de 2021
- **Calidad:** A, normativa lexicográfica
- **Cobertura:** lema, categoría y acepciones normativas; base para ortografía y significado.
- **URL oficial de consulta:** [Diccionario Guaraní Paraguayo en la SPL](https://spl.gov.py/es/diccionario-guarani-paraguayo/)
- **Créditos editoriales:** [créditos alojados por la SPL](https://spl.gov.py/wp-content/uploads/2024/09/Creditos-del-Diccionario-de-la-Academia-de-la-Lengua-Guarani.pdf)
- **Límite:** la ficha lexicográfica no reemplaza datos de frecuencia, nivel, registro, contexto profesional ni evidencia de uso.

### S-003 — Corpus oficial de uso

- **Título:** *Corpus de Referencia del Guaraní Paraguayo Actual (COREGUAPA)*
- **Institución:** Secretaría de Políticas Lingüísticas del Paraguay
- **Calidad:** A- para uso documentado; no es por sí solo autoridad normativa
- **Cobertura:** ocurrencias, contexto y metadatos bibliográficos.
- **URL:** [manual y descripción de COREGUAPA](https://corpus.spl.gov.py/py/infos/info_ayuda)
- **Limitaciones declaradas:** está en construcción; el conjunto descrito contiene diecinueve libros y se concentra en literatura y recopilaciones folclóricas. Conserva la ortografía de origen, salvo la normalización sistemática de `g̃`.
- **Implicación:** debe conservarse tanto la forma original como una eventual forma normalizada. La frecuencia obtenida no puede presentarse como frecuencia general del habla paraguaya sin advertencia de sesgo.

### S-004 — Autoridad institucional de la Academia

- **Título:** *Academia de la Lengua Guaraní — historia, fines y competencias*
- **Institución:** Secretaría de Políticas Lingüísticas del Paraguay
- **Año de consulta:** 2026
- **Calidad:** A para jerarquía institucional
- **URL:** [SPL — Academia de la Lengua Guaraní](https://spl.gov.py/es/academia-de-la-lengua-guarani/)
- **Uso:** define por qué las publicaciones de la Academia prevalecen como norma.

### S-005 — Estudio académico sobre verbos

- **Título:** *Verbos irregulares y aireales de la lengua Guaraní*
- **Autor:** David Galeano Olivera
- **Institución:** Universidad Nacional de Asunción, Instituto Superior de Lenguas
- **Año:** 2022
- **Revista:** Ñemitỹrã, 4(1), pp. 47–52
- **DOI:** [10.47133/NEMITYRA2022100A3](https://doi.org/10.47133/NEMITYRA2022100A3)
- **Calidad:** B+, académica; complementaria, no normativa
- **Cobertura:** verbos aireales, prefijos personales y una clasificación amplia de irregularidad.
- **Riesgo:** presenta una diferencia clasificatoria frente a la gramática oficial; no debe importarse sin conservar ambas formulaciones.

### S-006 — Revisión de lexicografía paraguaya

- **Título:** *El quehacer lexicográfico bilingüe español-guaraní: estado del arte en el Paraguay*
- **Autora:** Estela Peralta
- **Institución:** Universidad del Cono Sur de las Américas
- **Año:** 2018
- **Revista:** Revista Científica de la UCSA, 5(1), pp. 25–40
- **DOI:** [10.18004/ucsa/2409-8752/2018.005(01)025-040](https://doi.org/10.18004/ucsa/2409-8752/2018.005(01)025-040)
- **PDF:** [artículo paginado](https://scielo.iics.una.py/pdf/ucsa/v5n1/2409-8752-ucsa-5-01-25.pdf)
- **Calidad:** B+, revisión académica
- **Aporte:** demuestra que varios diccionarios bilingües anteriores no explicitan adecuadamente fuentes, destinatarios, criterios de selección ni información sintagmática. Justifica que KUAA no mezcle diccionarios sin trazabilidad.

### S-007 — Terminología profesional de informática

- **Título:** *Compilar la terminología guaraní existente y elaborar nuevos términos en el ámbito de la informática e internet — Libro 2*
- **Instituciones:** Fundación Yvy Marãe’ỹ y Consejo Nacional de Ciencia y Tecnología (CONACYT)
- **Equipo técnico:** Perla Álvarez Brítez, Mauro Javier Lugo, Manuel Fernández y Miguel Ángel Verón, entre otros
- **Año:** 2017
- **Calidad:** B+, investigación institucional especializada
- **URL:** [PDF alojado por CONACYT](https://www.conacyt.gov.py/sites/default/files/upload_editores/u294/libro_2.pdf)
- **Cobertura:** criterios terminológicos, morfosintaxis aplicada y vocabulario de informática e internet.
- **Riesgo:** una propuesta terminológica no equivale automáticamente a término sancionado por la Academia o por uso extendido. Cada entrada profesional necesita `termStatus` y revisión.

## 4. Matriz de cobertura

| Área requerida | Fuente principal | Cobertura actual | Estado para automatización |
|---|---|---|---|
| Clases verbales | S-001, pp. 89–108 | Areal, aireal, hareal, categorías verbalizadas/chendales, irregulares, defectivos, unipersonales y transitividad | Parcialmente lista; faltan fichas por lema |
| Prefijos personales | S-001, pp. 87–110 | Paradigmas de persona y número; inclusivo/exclusivo; variantes oral/nasal | Lista para extracción controlada |
| Negación verbal | S-001, características generales y sección verbal | Prefijos/sufijos discontinuos, variantes oral/nasal y condicionamiento fonológico | Requiere tabla formal de alomorfos |
| Tiempo, aspecto y modo | S-001, pp. 123–177 | Inventario amplio con paradigmas oral/nasal | Cubierto, pero no modelado todavía |
| Voz y derivación verbal | S-001, pp. 113–122 | Activa, pasiva, causativa/coactiva, recíproca y otras construcciones | Cubierto, requiere dependencias entre morfemas |
| Morfología nominal | S-001, pp. 49–86 | número, plural morfológico y sintáctico, posesión, alomorfía y grado | Cubierta en lo normativo |
| Diminutivo/aumentativo | S-001 y fuentes complementarias por localizar | Menciones distribuidas, sin una tabla consolidada encontrada en esta revisión | Incompleta; bloquear generación |
| Posesión | S-001, pp. 74–81 | índices de posesión, alomorfos, poseedor antes de poseído, alienable/inalienable | Cubierta; requiere catálogo de clases nominales |
| Nasalidad y cambios morfofonológicos | S-001, varias secciones; S-003 | oposición oral/nasal, armonización y variantes de afijos | Cubierta como reglas dispersas; falta normalización única |
| Estructura de oración | S-001, pp. 211–235 y 247–253 | oración simple/compuesta, orden y sintaxis propia | Cubierta, necesita extracción granular |
| Afirmación, negación, interrogación y órdenes | S-001, pp. 211–235 | partículas interrogativas, imperativas y negación | Cubierta, necesita validación de ejemplos |
| Comparación | S-001, adjetivo y sintaxis | grados y construcciones comparativas | Cubierta de forma dispersa |
| Léxico general | S-002 + S-003 | norma y uso contextual | Suficiente para piloto pequeño, no para carga automática total |
| Frecuencia | S-003 | conteos posibles dentro de un corpus sesgado | Incompleta; no asignar nivel sin método |
| Registro y variantes | S-002, S-003 y revisión experta | Información desigual | Incompleta |
| Uso profesional | S-007 y futuras fuentes sectoriales | Informática disponible como primer dominio | Incompleta y sujeta a sanción de uso |
| Ejemplos validados | S-001 y S-003 | paradigmas normativos y ocurrencias reales | Usables solo con referencia y política de cita |

## 5. Hallazgos lingüísticos relevantes para el futuro modelo

### A. Sistema verbal

La gramática oficial no presenta simplemente tres listas pedagógicas aisladas. Organiza los verbos por conjugación, variabilidad y transitividad, y diferencia verbos propios de categorías nominales verbalizadas.

| Patrón normativo | Serie personal de referencia | Página impresa | Observación de modelado |
|---|---|---|---|
| Areal | `a-, re-, o-, ja-/ña-, ro-, pe-, o-` | 102–103 | Debe registrar variante oral/nasal del prefijo inclusivo |
| Aireal | `ai-, rei-, oi-, jai-/ñai-, roi-, pei-, oi-` | 103–104 | La `i` no debe almacenarse como adorno sin función; existe discrepancia descriptiva entre fuentes |
| Hareal | `ha-, re-, ho-, ja-/ña-, ro-, pe-, ho-` | 104 | La gramática identifica cinco verbos en este patrón |
| Categorías verbalizadas o chendales | índices pronominales con alomorfía oral/nasal | 92–101 | No deben reducirse a una sola serie sin marcar la categoría léxica base |

La misma fuente separa verbos regulares, irregulares, defectivos, unipersonales, transitivos, intransitivos y bitransitivos. Para el futuro motor esto exige que una entrada verbal apunte a un patrón y también declare excepciones, voz, valencia y restricciones de persona.

### B. Morfología

La gramática confirma que los morfemas prefijos y sufijos se unen al lexema y que la selección oral/nasal afecta numerosos afijos. La pluralidad nominal puede ser morfológica o sintáctica. La posesión incluye índices diferentes según persona y forma fonológica del sustantivo; además, el poseedor precede a lo poseído.

No se recomienda guardar la palabra final como único dato. Debe conservarse al menos:

- lexema;
- morfemas en orden;
- función de cada morfema;
- condición oral/nasal;
- forma superficial;
- excepciones y transformación morfofonológica.

### C. Sintaxis

Las reglas de sintaxis deben ser objetos independientes de las traducciones. La gramática documenta afirmación, negación, interrogación, orden/mandato, estructura simple y compuesta, y dedica una guía final a evitar calcos del castellano.

Un ejemplo no debe validarse solo porque sus palabras estén en el diccionario: también debe aprobar orden, concordancia, partículas y naturalidad.

### D. Léxico

El diccionario oficial debe dar el lema normativo y la acepción. COREGUAPA debe aportar evidencia de contexto. Los campos `level`, `frequency`, `register` y `professionalDomain` requieren metodología propia y revisión, porque no son equivalentes a la mera presencia de una palabra en un diccionario.

### E. Ejemplos

Se proponen tres tipos separados:

1. `normativeParadigm`: forma o paradigma documentado por la gramática;
2. `attestedUsage`: ejemplo breve localizado en un corpus o publicación;
3. `generatedCandidate`: ejemplo creado después por el sistema, siempre bloqueado hasta validación.

Un ejemplo generado nunca heredará automáticamente el estado de validez de las palabras que contiene.

## 6. Contradicciones y riesgos detectados

### C-001 — Cantidad y alcance de los verbos “irregulares”

- **variantA:** la gramática oficial identifica tres lexemas variables/verbos irregulares: `ju`, `ha/ho` y `’e` (pp. 95–106, según el apartado).
- **variantB:** Galeano Olivera (2022, pp. 47–52) usa una clasificación amplia de seis: `a/’a`, `u/’u`, `y’u`, `ju`, `ha` y `e/’e`.
- **Hipótesis de conciliación:** la gramática oficial clasifica `’a`, `’u` y `y’u` como regulares hareales, mientras el artículo los incluye entre irregulares por su comportamiento prefijal.
- **Decisión:** `needsHumanReview: true`; no usar “número de verbos irregulares” como regla automática ni pregunta evaluativa hasta que un especialista fije la taxonomía pedagógica de KUAA.

### C-002 — Interpretación de la `i` de los aireales

- **variantA:** la gramática oficial indica que no cumple solo armonización fonética; la vincula con mayor claridad, objeto incorporado y posible diferencia semántica (pp. 95–96).
- **variantB:** el artículo académico de 2022 la denomina “partícula eufónica”.
- **Decisión:** mantener ambas descripciones, no convertir “eufónica” en explicación única y solicitar revisión lingüística.

### C-003 — Forma original frente a forma normalizada

- **variantA:** COREGUAPA conserva la ortografía original de los textos, con una normalización sistemática declarada para `g̃`.
- **variantB:** el contenido pedagógico de KUAA debe seguir la ortografía oficial vigente.
- **Decisión:** guardar `sourceForm` y `normalizedForm`, junto con la transformación aplicada. Nunca sobrescribir el testimonio original.

### C-004 — Término profesional propuesto frente a término sancionado

- **variantA:** proyectos de terminología pueden proponer neologismos funcionales.
- **variantB:** la Academia exige sanción de uso o incorporación formal para la oficialización.
- **Decisión:** usar `termStatus: proposed | attested | academyApproved | deprecated`; solo `academyApproved` o `attested` con revisión experta podrán alimentar generación automática.

## 7. Áreas todavía incompletas

1. Tabla consolidada de diminutivos, aumentativos y condicionamientos.
2. Inventario completo de alomorfos oral/nasal enlazado a cada morfema.
3. Catálogo lema por lema de verbos areales, aireales, hareales y categorías chendales.
4. Frecuencia equilibrada entre habla, prensa, administración, educación, salud, tecnología y literatura.
5. Niveles pedagógicos propios de KUAA, que deben definirse con criterios explícitos.
6. Registro coloquial, formal, arcaico, regional y profesional.
7. Ejemplos conversacionales y profesionales con autorización, procedencia y revisión.
8. Verificación de edición digital oficial de la gramática antes de una ingestión masiva.
9. Protocolo y responsable humano de aprobación lingüística.

## 8. Propuesta de estructura de datos

El archivo `MODELO-DATOS-CORPUS.schema.json` formaliza la propuesta. Las entidades mínimas son:

- `source`: identidad y calidad de la fuente;
- `sourceReference`: referencia concreta, incluida la página;
- `linguisticRule`: regla gramatical o morfológica;
- `lexeme`: lema y sus sentidos;
- `conjugationPattern`: paradigma reutilizable;
- `example`: uso normativo, atestiguado o generado;
- `conflict`: variantes incompatibles o clasificaciones distintas;
- `review`: decisión humana y responsable.

Todos los registros lingüísticos deben incluir las claves solicitadas:

```text
sourceTitle
sourceAuthor
sourceInstitution
sourceYear
sourceURL
sourcePage
validationStatus
```

Los estados propuestos son:

| Estado | Significado | ¿Puede generar ejercicios? |
|---|---|---|
| `unreviewed` | Cargado, procedencia aún no comprobada | No |
| `sourceVerified` | Fuente y localizador comprobados | No, salvo piloto supervisado |
| `expertVerified` | Aprobado por especialista | Sí |
| `conflict` | Existe contradicción abierta | No |
| `rejected` | No aceptado | No |
| `deprecated` | Válido históricamente, no recomendado hoy | No por defecto |

## 9. Flujo de validación propuesto

1. Registrar la fuente y su edición.
2. Extraer una regla, lema o ejemplo en una ficha propia, sin copiar capítulos.
3. Añadir página o localizador exacto.
4. Contrastar con al menos una fuente cuando el dato no sea puramente normativo.
5. Buscar contradicciones existentes.
6. Revisar ortografía y estructura con la norma oficial.
7. Someter a un revisor humano competente.
8. Habilitar `allowedForGeneration: true` únicamente con `expertVerified` y sin conflicto abierto.
9. Conservar historial de cambios y versión de fuente.

## 10. Derechos de autor y almacenamiento de ejemplos

KUAA debe almacenar reglas, hechos lingüísticos, paradigmas estructurados y referencias propias. No debe copiar masivamente libros ni el contenido completo del diccionario o del corpus.

Para ejemplos atestiguados se recomienda guardar:

- una cita breve estrictamente necesaria;
- el localizador bibliográfico o identificador de ocurrencia;
- una nota de derechos/licencia;
- la forma original y, por separado, una normalización justificada.

Cuando no exista permiso suficiente, se guardará solo la referencia y el análisis lingüístico, no el texto completo.

## 11. Recomendación para la próxima revisión

Antes de cargar el corpus, se necesita aprobar:

1. la jerarquía de fuentes;
2. la taxonomía pedagógica de areal/aireal/hareal/chendal;
3. el tratamiento de las contradicciones C-001 y C-002;
4. los estados de validación;
5. la identidad o rol del revisor lingüístico humano;
6. la política de citas y uso de ejemplos.

Hasta esa aprobación, no debe conectarse este modelo con `renderActivity`, Firestore ni generación automática.

