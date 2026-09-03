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
  audioId: "",
  audioPath: "",
  audioText: "",
  audioAuthorized: false,
  humanRecorded: false,
  audioSource: "",
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
      instruction: "Elige la palabra que encaja en la situación.", prompt: "¿Qué palabra corresponde?",
      contextText: "Un animal doméstico ladra al escuchar un ruido.",
      contextAuthorized: true,
      options: animalOptions, correctOptionId: "jagua", correctAnswer: "jagua", acceptedAnswers: ["jagua"]
    }),
    base(ACTIVITY_TYPES.ARROW_MATCH, "arrow-match", {
      instruction: "Relaciona cada palabra con su significado.", prompt: "Forma tres relaciones.", pairs: animalPairs, correctAnswer: "jagua", acceptedAnswers: ["jagua"]
    }),
    base(ACTIVITY_TYPES.CATEGORY_SORT, "category-sort", {
      instruction: "Clasifica cada tarjeta.", prompt: "Separa animales y números.",
      categories: [{ id: "animals", label: "Animales", authorized: true }, { id: "numbers", label: "Números", authorized: true }],
      items: [
        { id: "jagua", text: "jagua", categoryId: "animals", authorized: true }, { id: "guyra", text: "guyra", categoryId: "animals", authorized: true },
        { id: "mbarakaja", text: "mbarakaja", categoryId: "animals", authorized: true }, { id: "petei", text: "peteĩ", categoryId: "numbers", authorized: true },
        { id: "mokoi", text: "mokõi", categoryId: "numbers", authorized: true }, { id: "mbohapy", text: "mbohapy", categoryId: "numbers", authorized: true }
      ], correctAnswer: "animals-numbers", acceptedAnswers: ["animals-numbers"]
    }),
    base(ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, "dialogue-next-turn", {
      instruction: "Elige la respuesta que mantiene el sentido.", prompt: "¿Qué palabra tendría sentido ahora?",
      dialogueAuthorized: true,
      dialogue: [{ id: "t1", speaker: "A", text: "Estoy viendo algo brillante durante el día.", authorized: true }, { id: "t2", speaker: "B", text: "¿Qué ves en el cielo?", authorized: true }],
      options: [option("sun", "kuarahy"), option("moon", "jasy"), option("night", "pyhare")], correctOptionId: "sun", correctAnswer: "kuarahy", acceptedAnswers: ["kuarahy"]
    }),
    base(ACTIVITY_TYPES.INDEPENDENT_RECALL, "independent-recall", {
      instruction: "Recupera la palabra sin opciones.", prompt: "Escribe en guaraní la palabra que significa libro.", contextText: "No hay pistas visibles.",
      skill: "writing", correctAnswer: "aranduka", acceptedAnswers: ["aranduka"], helpLevel: 0, answerExposure: "HIDDEN", hints: []
    }),
    base(ACTIVITY_TYPES.AUDIO_SELECT, "audio-select", {
      instruction: "Escucha y elige la palabra grabada.", prompt: "Selecciona la opción que corresponde al audio.",
      audioId: "NALVI-AUDIO-096", audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a", audioText: "Jagua",
      audioAuthorized: true, humanRecorded: true, audioSource: "manifest-human-recording",
      options: animalOptions, correctOptionId: "jagua", correctAnswer: "jagua", acceptedAnswers: ["jagua"]
    })
  ];
}

export const CATALOG_EXAMPLES = Object.freeze(createCatalogExamples());
