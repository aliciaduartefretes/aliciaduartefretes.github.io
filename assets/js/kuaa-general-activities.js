/*
 * KUAA · Paso 1
 * Datos de muestra para Guaraní General.
 *
 * Este archivo contiene solamente contenido. No crea HTML, no registra
 * listeners y no conoce Firebase. Las actividades pueden venir de otra
 * fuente en una etapa futura sin cambiar los componentes visuales.
 */
(() => {
  "use strict";

  const activities = [
    {
      id: "general-u01-significado-mba-eichapa",
      courseId: "general",
      unitId: "general-u01",
      learningObjectiveId: "GG-LO-001",
      conceptIds: ["GG-C-001"],
      lexemeIds: ["LEX-CANDIDATE-MBAEICHAPA"],
      grammarRuleIds: [],
      skill: "comprehension",
      difficulty: "foundation-1",
      activityType: "multiple-choice",
      pedagogicalPhase: "ENTIENDE",
      contentValidationStatus: "unreviewed",
      allowedForMastery: false,
      type: "multiple-choice",
      semanticPair: {
        target: "Mba’éichapa",
        adaptiveReuseAuthorized: true,
        meaning: {
          es: "¿Cómo estás?",
          en: "How are you?",
          pt: "Como você está?",
          fr: "Comment vas-tu ?",
          it: "Come stai?",
          de: "Wie geht es dir?"
        }
      },
      adaptiveDialogue: {
        authorized: true,
        sourceContentId: "general-u01-dialogue-greetings",
        turns: [
          { id: "greeting-turn-1", speaker: "A", text: "Mba’éichapa, Ana?", authorized: true },
          { id: "greeting-turn-2", speaker: "B", text: "Iporã, aguyje. Ha nde?", authorized: true }
        ],
        options: [
          { id: "greeting-reply", text: "Iporã, aguyje. Ha nde?", authorized: true },
          { id: "greeting-close", text: "Iporã avei. Jajotopata!", authorized: true },
          { id: "greeting-thanks", text: "Aguyje", authorized: true }
        ],
        correctOptionId: "greeting-close",
        correctAnswer: "Iporã avei. Jajotopata!"
      },
      legacy: { unit: 0, question: 0 },
      prompt: {
        es: "¿Qué expresa «Mba’éichapa»?",
        en: "What does “Mba’éichapa” express?",
        pt: "O que “Mba’éichapa” expressa?",
        fr: "Que veut dire « Mba’éichapa » ?",
        it: "Che cosa esprime «Mba’éichapa»?",
        de: "Was drückt „Mba’éichapa“ aus?"
      },
      options: [
        {
          id: "thanks",
          label: {
            es: "Gracias",
            en: "Thank you",
            pt: "Obrigado/a",
            fr: "Merci",
            it: "Grazie",
            de: "Danke"
          }
        },
        {
          id: "status",
          label: {
            es: "¿Cómo estás?",
            en: "How are you?",
            pt: "Como você está?",
            fr: "Comment vas-tu ?",
            it: "Come stai?",
            de: "Wie geht es dir?"
          }
        },
        {
          id: "see-you",
          label: {
            es: "Nos vemos",
            en: "See you",
            pt: "Até mais",
            fr: "À bientôt",
            it: "Ci vediamo",
            de: "Bis bald"
          }
        }
      ],
      correctOptionId: "status"
    },
    {
      id: "general-u01-elegir-aguyje",
      courseId: "general",
      unitId: "general-u01",
      learningObjectiveId: "GG-LO-001",
      conceptIds: ["GG-C-001"],
      lexemeIds: ["LEX-CANDIDATE-AGUYJE"],
      grammarRuleIds: [],
      skill: "comprehension",
      difficulty: "foundation-1",
      activityType: "multiple-choice",
      pedagogicalPhase: "ENTIENDE",
      contentValidationStatus: "unreviewed",
      allowedForMastery: false,
      type: "multiple-choice",
      semanticPair: {
        target: "Aguyje",
        adaptiveReuseAuthorized: true,
        meaning: {
          es: "Gracias",
          en: "Thank you",
          pt: "Obrigado/a",
          fr: "Merci",
          it: "Grazie",
          de: "Danke"
        }
      },
      legacy: { unit: 0, question: 1 },
      prompt: {
        es: "Elige «gracias».",
        en: "Choose “thank you”.",
        pt: "Escolha “obrigado/a”.",
        fr: "Choisissez « merci ».",
        it: "Scegli «grazie».",
        de: "Wähle „Danke“."
      },
      options: [
        { id: "maitei", label: "Maitei" },
        { id: "aguyje", label: "Aguyje" },
        { id: "ipora", label: "Iporã" }
      ],
      correctOptionId: "aguyje"
    },
    {
      id: "general-u01-escuchar-jajotopata",
      courseId: "general",
      unitId: "general-u01",
      learningObjectiveId: "GG-LO-001",
      conceptIds: ["GG-C-001"],
      lexemeIds: ["LEX-CANDIDATE-JAJOTOPATA"],
      grammarRuleIds: [],
      skill: "listening",
      difficulty: "foundation-1",
      activityType: "listening",
      pedagogicalPhase: "ESCUCHA",
      contentValidationStatus: "unreviewed",
      allowedForMastery: false,
      type: "listening",
      semanticPair: {
        target: "Jajotopata",
        adaptiveReuseAuthorized: true,
        meaning: {
          es: "Nos vemos",
          en: "See you",
          pt: "Até mais",
          fr: "À bientôt",
          it: "Ci vediamo",
          de: "Bis bald"
        }
      },
      legacy: { unit: 0, question: 2 },
      prompt: {
        es: "¿Cómo dices «nos vemos»?",
        en: "How do you say “see you”?",
        pt: "Como se diz “até mais”?",
        fr: "Comment dit-on « à bientôt » ?",
        it: "Come si dice «ci vediamo»?",
        de: "Wie sagt man „Bis bald“?"
      },
      instruction: {
        es: "Escucha la expresión y elige lo que oyes.",
        en: "Listen to the expression and choose what you hear.",
        pt: "Ouça a expressão e escolha o que você escuta.",
        fr: "Écoutez l’expression et choisissez ce que vous entendez.",
        it: "Ascolta l’espressione e scegli ciò che senti.",
        de: "Höre den Ausdruck und wähle aus, was du hörst."
      },
      audioText: "Jajotopata",
      options: [
        { id: "jajotopata", label: "Jajotopata" },
        { id: "che-rera", label: "Che réra" },
        { id: "koero", label: "Ko’ẽrõ" }
      ],
      correctOptionId: "jajotopata"
    }
  ];

  const deepFreeze = value => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };

  window.KUAA_GENERAL_ACTIVITY_DATA = deepFreeze({
    version: "NALVI-P5-DATA-2",
    courseId: "general",
    learningModel: "competency-route",
    activities
  });
})();
