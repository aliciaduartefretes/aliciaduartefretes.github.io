import { ACTIVITY_TYPES, cognitiveDemandFor } from "./nalvi-activity-catalog.mjs";

const lexemeIds = ["LEX-PILOT-AKA-001", "LEX-PILOT-ARANDUKA-001", "LEX-PILOT-JAGUA-001"];
const option = (id, text, extra = {}) => ({ id, text, authorized: true, ...extra });
const base = (type, id, overrides = {}) => ({
  id,
  type,
  activityType: type,
  conceptId: `catalog-${id}`,
  conceptIds: [`catalog-${id}`],
  learningObjectiveId: "catalog-review",
  skill: "vocabulary",
  difficulty: "foundation-1",
  instruction: "Resuelve la actividad.",
  prompt: "",
  contextText: "",
  options: [],
  pairs: [],
  tiles: [],
  categories: [],
  items: [],
  segments: [],
  corrections: [],
  dialogue: [],
  questions: [],
  steps: [],
  correctOrder: [],
  hints: [],
  explanation: "",
  correctAnswer: "",
  acceptedAnswers: [],
  correctOptionId: "",
  correctCorrectionId: "",
  lexemeIds,
  grammarRuleIds: [],
  sourceIds: ["SRC-ALG-GRAMATICA-2018"],
  conflictIds: [],
  hasOpenConflict: false,
  distractorQuality: "PLAUSIBLE",
  answerExposure: "HIDDEN",
  helpLevel: 0,
  requiresStudentResponse: true,
  cognitiveDemand: cognitiveDemandFor(type),
  ...overrides
});

const animalPairs = [
  { id: "jagua", left: "jagua", right: "perro", authorized: true },
  { id: "guyra", left: "guyra", right: "ave", authorized: true },
  { id: "mbarakaja", left: "mbarakaja", right: "gato", authorized: true }
];
const animalOptions = [option("jagua", "jagua"), option("guyra", "guyra"), option("mbarakaja", "mbarakaja")];

export function createCatalogExamples() {
  return [
    base(ACTIVITY_TYPES.CONTEXT_CHOICE, "context-choice", {
      instruction: "Elige la palabra que encaja en la situación.", prompt: "Un animal doméstico ladra al escuchar un ruido.",
      options: animalOptions, correctOptionId: "jagua", correctAnswer: "jagua", acceptedAnswers: ["jagua"]
    }),
    base(ACTIVITY_TYPES.IMAGE_CHOICE, "image-choice", {
      instruction: "Elige la imagen que corresponde.", prompt: "¿Cuál opción representa lo que ilumina el día?",
      options: [
        option("sun", "kuarahy", { image: "../assets/images/catalog/sun.svg", alt: "Sol" }),
        option("moon", "jasy", { image: "../assets/images/catalog/moon.svg", alt: "Luna" }),
        option("book", "aranduka", { image: "../assets/images/catalog/book.svg", alt: "Libro" })
      ], correctOptionId: "sun", correctAnswer: "kuarahy", acceptedAnswers: ["kuarahy"]
    }),
    base(ACTIVITY_TYPES.ARROW_MATCH, "arrow-match", {
      instruction: "Relaciona cada palabra con su significado.", prompt: "Forma tres relaciones.", pairs: animalPairs, correctAnswer: "jagua"
    }),
    base(ACTIVITY_TYPES.CATEGORY_SORT, "category-sort", {
      instruction: "Clasifica cada tarjeta.", prompt: "Separa animales y números.",
      categories: [{ id: "animals", label: "Animales" }, { id: "numbers", label: "Números" }],
      items: [
        { id: "jagua", text: "jagua", categoryId: "animals", authorized: true }, { id: "guyra", text: "guyra", categoryId: "animals", authorized: true },
        { id: "mbarakaja", text: "mbarakaja", categoryId: "animals", authorized: true }, { id: "petei", text: "peteĩ", categoryId: "numbers", authorized: true },
        { id: "mokoi", text: "mokõi", categoryId: "numbers", authorized: true }, { id: "mbohapy", text: "mbohapy", categoryId: "numbers", authorized: true }
      ], correctAnswer: "animals-numbers"
    }),
    base(ACTIVITY_TYPES.WORD_TILE_BUILDER, "word-tile-builder", {
      instruction: "Construye la palabra que significa gato.", prompt: "Usa los segmentos necesarios.", skill: "writing",
      tiles: [option("d1", "ta"), option("a2", "ka"), option("a1", "mbara"), option("d2", "ra"), option("a3", "ja"), option("d3", "po")],
      correctOrder: ["a1", "a2", "a3"], correctAnswer: "mbarakaja", acceptedAnswers: ["mbarakaja"]
    }),
    base(ACTIVITY_TYPES.SENTENCE_TILE_BUILDER, "sentence-tile-builder", {
      instruction: "Ordena la secuencia documentada.", prompt: "Construye la serie del uno al cuatro.", skill: "application",
      tiles: [option("n3", "mbohapy"), option("n1", "peteĩ"), option("n4", "irundy"), option("n2", "mokõi")],
      correctOrder: ["n1", "n2", "n3", "n4"], correctAnswer: "peteĩ mokõi mbohapy irundy", acceptedAnswers: ["peteĩ mokõi mbohapy irundy"]
    }),
    base(ACTIVITY_TYPES.GUIDED_GAP, "guided-gap", {
      instruction: "Completa con la palabra adecuada.", prompt: "Elige según el contexto.", contextText: "Una persona señala un animal doméstico que ladra.",
      template: "Ese animal es {{blank}}.", options: animalOptions, correctOptionId: "jagua", correctAnswer: "jagua", acceptedAnswers: ["jagua"]
    }),
    base(ACTIVITY_TYPES.ERROR_SPOTTING, "error-spotting", {
      instruction: "Encuentra y corrige la palabra que no corresponde.", prompt: "La explicación contiene una asociación incorrecta.",
      segments: [{ id: "s1", text: "La palabra para libro es" }, { id: "s2", text: "apyka", isIncorrect: true }],
      corrections: [option("c1", "aranduka"), option("c2", "ao"), option("c3", "juru")], correctCorrectionId: "c1", correctAnswer: "aranduka",
      correctedSentence: "La palabra para libro es aranduka."
    }),
    base(ACTIVITY_TYPES.CONCEPT_CONTRAST, "concept-contrast", {
      instruction: "Distingue conceptos cercanos.", prompt: "¿Qué palabra designa la parte del cuerpo usada para hablar?",
      options: [option("juru", "juru"), option("py", "py"), option("aka", "akã")], correctOptionId: "juru", correctAnswer: "juru", acceptedAnswers: ["juru"]
    }),
    base(ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, "dialogue-next-turn", {
      instruction: "Elige la respuesta que mantiene el sentido.", prompt: "¿Qué palabra tendría sentido ahora?",
      dialogue: [{ id: "t1", speaker: "A", text: "Estoy viendo algo brillante durante el día." }, { id: "t2", speaker: "B", text: "¿Qué ves en el cielo?" }],
      options: [option("sun", "kuarahy"), option("moon", "jasy"), option("night", "pyhare")], correctOptionId: "sun", correctAnswer: "kuarahy", acceptedAnswers: ["kuarahy"]
    }),
    base(ACTIVITY_TYPES.DIALOGUE_ORDER, "dialogue-order", {
      instruction: "Ordena el intercambio.", prompt: "Reconstruye la secuencia lógica.",
      dialogue: [{ id: "d3", speaker: "A", text: "¿Y cuál sigue?" }, { id: "d1", speaker: "A", text: "Di el primer número." }, { id: "d4", speaker: "B", text: "mokõi" }, { id: "d2", speaker: "B", text: "peteĩ" }],
      correctOrder: ["d1", "d2", "d3", "d4"], correctAnswer: "d1 d2 d3 d4"
    }),
    base(ACTIVITY_TYPES.DIALOGUE_COMPREHENSION, "dialogue-comprehension", {
      instruction: "Lee y demuestra qué comprendiste.", prompt: "Observa la conversación.",
      dialogue: [{ id: "q1", speaker: "A", text: "Busco algo para leer." }, { id: "q2", speaker: "B", text: "Aquí tienes un aranduka." }, { id: "q3", speaker: "A", text: "Eso necesitaba." }],
      questions: [{ id: "question-1", prompt: "¿Qué recibió la persona?", options: [option("book", "aranduka"), option("seat", "apyka"), option("clothes", "ao")], correctOptionId: "book", correctAnswer: "aranduka" }],
      correctOptionId: "book", correctAnswer: "aranduka", acceptedAnswers: ["aranduka"]
    }),
    base(ACTIVITY_TYPES.TWO_STEP_CHALLENGE, "two-step-challenge", {
      instruction: "Resuelve los dos pasos.", prompt: "Pasa de clasificación a aplicación.",
      steps: [
        { activityType: ACTIVITY_TYPES.CONTEXT_CHOICE, prompt: "¿A qué categoría pertenece aranduka?", options: [option("object", "Objeto"), option("animal", "Animal"), option("number", "Número")], correctOptionId: "object", correctAnswer: "Objeto" },
        { activityType: ACTIVITY_TYPES.CONTEXT_CHOICE, prompt: "Una persona quiere leer. ¿Qué necesita?", options: [option("book", "aranduka"), option("seat", "apyka"), option("clothes", "ao")], correctOptionId: "book", correctAnswer: "aranduka" }
      ], correctAnswer: "aranduka", acceptedAnswers: ["aranduka"]
    }),
    base(ACTIVITY_TYPES.INDEPENDENT_RECALL, "independent-recall", {
      instruction: "Recupera la palabra sin opciones.", prompt: "Escribe en guaraní la palabra que significa libro.", contextText: "No hay pistas visibles.",
      skill: "writing", correctAnswer: "aranduka", acceptedAnswers: ["aranduka"], helpLevel: 0, answerExposure: "HIDDEN", hints: []
    })
  ];
}

export const CATALOG_EXAMPLES = Object.freeze(createCatalogExamples());
