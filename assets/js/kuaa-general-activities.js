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
        target: "Mba’éichapa reime",
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
          { id: "greeting-turn-1", speaker: "A", text: "¿Mba’éichapa reime Ana?", authorized: true },
          { id: "greeting-turn-2", speaker: "B", text: "Aime porã, ¿ha nde?", authorized: true }
        ],
        options: [
          { id: "greeting-question", text: "¿Mba’éichapa reime Ana?", authorized: true },
          { id: "greeting-reply", text: "Aime porã, ¿ha nde?", authorized: true },
          { id: "greeting-close", text: "Aime porã avei. ¡Jajoechata!", authorized: true }
        ],
        correctOptionId: "greeting-close",
        correctAnswer: "Aime porã avei. ¡Jajoechata!"
      },
      legacy: { unit: 0, question: 0 },
      prompt: {
        es: "¿Qué forma completa pregunta cómo está una persona?",
        en: "Which complete form asks one person how they are?",
        pt: "Qual forma completa pergunta a uma pessoa como ela está?",
        fr: "Quelle forme complète demande à une personne comment elle va ?",
        it: "Quale forma completa chiede a una persona come sta?",
        de: "Welche vollständige Form fragt eine Person nach ihrem Befinden?"
      },
      explanation: {
        es: "En guaraní, usa Mba’éichapa reime con una persona y Mba’éichapa peime con varias. Mba’éichapa solo puede aceptarse socialmente como abreviación, pero en los ejercicios se exige la forma completa. Puedes responder Aime porã.",
        en: "In Guaraní, greetings often open a warm, personal conversation. Use Mba’éichapa reime with one person and Mba’éichapa peime with several people. Mba’éichapa alone can be accepted socially as an abbreviation, but exercises require the complete form. You can answer Aime porã.",
        pt: "Em guarani, use Mba’éichapa reime com uma pessoa e Mba’éichapa peime com várias. Mba’éichapa sozinho pode ser aceito socialmente como abreviação, mas os exercícios exigem a forma completa. Você pode responder Aime porã.",
        fr: "En guarani, utilisez Mba’éichapa reime avec une personne et Mba’éichapa peime avec plusieurs. Employé seul, Mba’éichapa peut être socialement accepté comme abréviation, mais les exercices exigent la forme complète. Vous pouvez répondre Aime porã.",
        it: "In guaraní, usa Mba’éichapa reime con una persona e Mba’éichapa peime con più persone. Mba’éichapa da solo può essere accettato socialmente come abbreviazione, ma negli esercizi è richiesta la forma completa. Puoi rispondere Aime porã.",
        de: "Auf Guaraní verwendest du Mba’éichapa reime für eine Person und Mba’éichapa peime für mehrere. Mba’éichapa allein kann gesellschaftlich als Abkürzung akzeptiert sein, in den Übungen ist aber die vollständige Form erforderlich. Du kannst mit Aime porã antworten."
      },
      options: [
        { id: "plural", label: "¿Mba’éichapa peime?" },
        { id: "singular", label: "¿Mba’éichapa reime?" },
        { id: "greeting", label: "Maitei" }
      ],
      correctOptionId: "singular"
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
          es: "Nos vamos a encontrar",
          en: "We are going to meet",
          pt: "Nós vamos nos encontrar",
          fr: "Nous allons nous rencontrer",
          it: "Ci incontreremo",
          de: "Wir werden uns treffen"
        }
      },
      legacy: { unit: 0, question: 2 },
      prompt: {
        es: "¿Cómo dices «nos vamos a encontrar»?",
        en: "How do you say “we are going to meet”?",
        pt: "Como se diz “nós vamos nos encontrar”?",
        fr: "Comment dit-on « nous allons nous rencontrer » ?",
        it: "Come si dice «ci incontreremo»?",
        de: "Wie sagt man „Wir werden uns treffen“?"
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
    version: "NALVI-P5-DATA-3",
    courseId: "general",
    learningModel: "competency-route",
    activities
  });
})();
