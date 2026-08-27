/*
 * NALVI · PASO 5
 * Ruta pedagógica computable de Guaraní General.
 *
 * Esta capa no calcula dominio, no escribe en Firebase, no llama servicios
 * externos y no contiene secretos. Conserva referencias a la experiencia
 * heredada mientras cambia la unidad conceptual de progreso de "lección" a
 * "objetivo de aprendizaje".
 */
(() => {
  "use strict";

  const VERSION = "NALVI-P5-CURRICULUM-1";
  const LANGUAGES = Object.freeze(["es", "en", "pt", "fr", "it", "de"]);
  const i18n = (es, en, pt, fr, it, de) => ({ es, en, pt, fr, it, de });

  const pedagogicalCycle = [
    { id: "ESCUCHA", skill: "listening", label: i18n("Escucha", "Listen", "Escute", "Écoutez", "Ascolta", "Hören") },
    { id: "ENTIENDE", skill: "comprehension", label: i18n("Entiende", "Understand", "Entenda", "Comprenez", "Comprendi", "Verstehen") },
    { id: "CONSTRUYE", skill: "construction", label: i18n("Construye", "Build", "Construa", "Construisez", "Costruisci", "Aufbauen") },
    { id: "HABLA", skill: "speaking", label: i18n("Habla", "Speak", "Fale", "Parlez", "Parla", "Sprechen") },
    { id: "APLICA", skill: "application", label: i18n("Aplica", "Apply", "Aplique", "Appliquez", "Applica", "Anwenden") },
    { id: "DOMINA", skill: "mastery-evidence", label: i18n("Domina", "Master", "Domine", "Maîtrisez", "Padroneggia", "Beherrschen") }
  ];

  const modules = [
    {
      id: "GG-MOD-01",
      order: 1,
      title: i18n("Primeros intercambios", "First exchanges", "Primeiras interações", "Premiers échanges", "Primi scambi", "Erste Gespräche"),
      description: i18n("Iniciar una conversación y compartir información personal básica.", "Start a conversation and share basic personal information.", "Iniciar uma conversa e compartilhar informações pessoais básicas.", "Commencer une conversation et partager des informations personnelles de base.", "Iniziare una conversazione e condividere informazioni personali di base.", "Ein Gespräch beginnen und grundlegende persönliche Informationen teilen."),
      learningObjectiveIds: ["GG-LO-001", "GG-LO-002", "GG-LO-003", "GG-LO-004"]
    },
    {
      id: "GG-MOD-02",
      order: 2,
      title: i18n("Bases para comprender", "Foundations for understanding", "Bases para compreender", "Bases pour comprendre", "Basi per comprendere", "Grundlagen zum Verstehen"),
      description: i18n("Reconocer formas escritas y organizar información familiar y cuantitativa.", "Recognize written forms and organize family and quantity information.", "Reconhecer formas escritas e organizar informações familiares e quantitativas.", "Reconnaître les formes écrites et organiser les informations familiales et quantitatives.", "Riconoscere forme scritte e organizzare informazioni familiari e quantitative.", "Schriftformen erkennen und Familien- sowie Mengenangaben ordnen."),
      learningObjectiveIds: ["GG-LO-005", "GG-LO-006", "GG-LO-007", "GG-LO-008"]
    },
    {
      id: "GG-MOD-03",
      order: 3,
      title: i18n("Vida cotidiana", "Everyday life", "Vida cotidiana", "Vie quotidienne", "Vita quotidiana", "Alltag"),
      description: i18n("Resolver necesidades, estados, ubicaciones y referencias temporales frecuentes.", "Handle common needs, states, locations and time references.", "Lidar com necessidades, estados, lugares e referências temporais frequentes.", "Gérer les besoins, les états, les lieux et les repères temporels courants.", "Gestire bisogni, stati, luoghi e riferimenti temporali comuni.", "Häufige Bedürfnisse, Zustände, Orte und Zeitangaben bewältigen."),
      learningObjectiveIds: ["GG-LO-009", "GG-LO-010", "GG-LO-011", "GG-LO-012"]
    },
    {
      id: "GG-MOD-04",
      order: 4,
      title: i18n("Autonomía inicial", "Initial autonomy", "Autonomia inicial", "Autonomie initiale", "Autonomia iniziale", "Erste Selbstständigkeit"),
      description: i18n("Preguntar, negar, describir rutinas y resolver compras sencillas.", "Ask questions, negate, describe routines and handle simple purchases.", "Perguntar, negar, descrever rotinas e resolver compras simples.", "Poser des questions, nier, décrire des routines et effectuer des achats simples.", "Fare domande, negare, descrivere routine e gestire acquisti semplici.", "Fragen stellen, verneinen, Routinen beschreiben und einfache Einkäufe bewältigen."),
      learningObjectiveIds: ["GG-LO-013", "GG-LO-014", "GG-LO-015", "GG-LO-016"]
    },
    {
      id: "GG-MOD-05",
      order: 5,
      title: i18n("Gramática en uso", "Grammar in use", "Gramática em uso", "Grammaire en usage", "Grammatica in uso", "Grammatik im Gebrauch"),
      description: i18n("Observar cómo se organizan oraciones, acciones, estados y rasgos de oralidad o nasalidad.", "Observe how sentences, actions, states and oral or nasal features are organized.", "Observar como se organizam frases, ações, estados e traços de oralidade ou nasalidade.", "Observer l’organisation des phrases, des actions, des états et des traits oraux ou nasaux.", "Osservare come si organizzano frasi, azioni, stati e tratti orali o nasali.", "Beobachten, wie Sätze, Handlungen, Zustände sowie orale oder nasale Merkmale organisiert sind."),
      learningObjectiveIds: ["GG-LO-017", "GG-LO-018", "GG-LO-019", "GG-LO-020"]
    },
    {
      id: "GG-MOD-06",
      order: 6,
      title: i18n("Precisión comunicativa", "Communicative precision", "Precisão comunicativa", "Précision communicative", "Precisione comunicativa", "Kommunikative Genauigkeit"),
      description: i18n("Distinguir negación, interrogación, referencias temporales y mandatos en usos guiados.", "Distinguish negation, questions, time references and commands in guided use.", "Distinguir negação, interrogação, referências temporais e comandos em usos guiados.", "Distinguer la négation, l’interrogation, les repères temporels et les ordres dans des usages guidés.", "Distinguere negazione, interrogazione, riferimenti temporali e comandi in usi guidati.", "Verneinung, Fragen, Zeitbezüge und Aufforderungen in geführten Anwendungen unterscheiden."),
      learningObjectiveIds: ["GG-LO-021", "GG-LO-022", "GG-LO-023", "GG-LO-024"]
    },
    {
      id: "GG-MOD-07",
      order: 7,
      title: i18n("Relaciones y discurso", "Relationships and discourse", "Relações e discurso", "Relations et discours", "Relazioni e discorso", "Beziehungen und Diskurs"),
      description: i18n("Relacionar posesión, ubicación, referencia y conexión de ideas en intercambios breves.", "Relate possession, location, reference and connected ideas in short exchanges.", "Relacionar posse, localização, referência e conexão de ideias em interações breves.", "Relier possession, localisation, référence et enchaînement des idées dans de brefs échanges.", "Collegare possesso, posizione, riferimento e connessione di idee in brevi scambi.", "Besitz, Ort, Bezug und Ideenverknüpfung in kurzen Gesprächen verbinden."),
      learningObjectiveIds: ["GG-LO-025", "GG-LO-026", "GG-LO-027", "GG-LO-028"]
    }
  ];

  const concepts = [
    { id: "GG-C-001", title: i18n("Saludos, cortesía y despedidas", "Greetings, courtesy and farewells", "Saudações, cortesia e despedidas", "Salutations, politesse et adieux", "Saluti, cortesia e congedi", "Begrüßung, Höflichkeit und Abschied"), validationScope: "curriculum-mapping" },
    { id: "GG-C-002", title: i18n("Presentación personal", "Personal introduction", "Apresentação pessoal", "Présentation personnelle", "Presentazione personale", "Persönliche Vorstellung"), validationScope: "curriculum-mapping" },
    { id: "GG-C-003", title: i18n("Participantes de la conversación", "Conversation participants", "Participantes da conversa", "Participants à la conversation", "Partecipanti alla conversazione", "Gesprächsteilnehmende"), validationScope: "curriculum-mapping" },
    { id: "GG-C-004", title: i18n("Relación entre grafía y sonido", "Writing and sound relationship", "Relação entre escrita e som", "Relation entre graphie et son", "Rapporto tra grafia e suono", "Beziehung zwischen Schrift und Laut"), validationScope: "curriculum-mapping" },
    { id: "GG-C-005", title: i18n("Familia y posesión", "Family and possession", "Família e posse", "Famille et possession", "Famiglia e possesso", "Familie und Besitz"), validationScope: "curriculum-mapping" },
    { id: "GG-C-006", title: i18n("Cantidad y edad", "Quantity and age", "Quantidade e idade", "Quantité et âge", "Quantità ed età", "Menge und Alter"), validationScope: "curriculum-mapping" },
    { id: "GG-C-007", title: i18n("Acciones cotidianas", "Everyday actions", "Ações cotidianas", "Actions quotidiennes", "Azioni quotidiane", "Alltägliche Handlungen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-008", title: i18n("Comida, bebida y necesidades", "Food, drink and needs", "Comida, bebida e necessidades", "Nourriture, boisson et besoins", "Cibo, bevande e bisogni", "Essen, Trinken und Bedürfnisse"), validationScope: "curriculum-mapping" },
    { id: "GG-C-009", title: i18n("Estados y descripciones", "States and descriptions", "Estados e descrições", "États et descriptions", "Stati e descrizioni", "Zustände und Beschreibungen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-010", title: i18n("Ubicación y dirección", "Location and direction", "Localização e direção", "Localisation et direction", "Posizione e direzione", "Ort und Richtung"), validationScope: "curriculum-mapping" },
    { id: "GG-C-011", title: i18n("Referencias temporales", "Time references", "Referências temporais", "Repères temporels", "Riferimenti temporali", "Zeitangaben"), validationScope: "curriculum-mapping" },
    { id: "GG-C-012", title: i18n("Interacción básica integrada", "Integrated basic interaction", "Interação básica integrada", "Interaction de base intégrée", "Interazione di base integrata", "Integrierte einfache Interaktion"), validationScope: "curriculum-mapping" },
    { id: "GG-C-013", title: i18n("Preguntas para comprender", "Questions for understanding", "Perguntas para compreender", "Questions pour comprendre", "Domande per comprendere", "Fragen zum Verstehen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-014", title: i18n("Negación y confirmación", "Negation and confirmation", "Negação e confirmação", "Négation et confirmation", "Negazione e conferma", "Verneinung und Bestätigung"), validationScope: "curriculum-mapping" },
    { id: "GG-C-015", title: i18n("Rutina y frecuencia", "Routine and frequency", "Rotina e frequência", "Routine et fréquence", "Routine e frequenza", "Routine und Häufigkeit"), validationScope: "curriculum-mapping" },
    { id: "GG-C-016", title: i18n("Compras y servicios", "Shopping and services", "Compras e serviços", "Achats et services", "Acquisti e servizi", "Einkaufen und Dienstleistungen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-017", title: i18n("Organización de la oración", "Sentence organization", "Organização da frase", "Organisation de la phrase", "Organizzazione della frase", "Satzorganisation"), validationScope: "curriculum-mapping" },
    { id: "GG-C-018", title: i18n("Acciones y referencias personales", "Actions and personal reference", "Ações e referência pessoal", "Actions et référence personnelle", "Azioni e riferimento personale", "Handlungen und Personenbezug"), validationScope: "curriculum-mapping" },
    { id: "GG-C-019", title: i18n("Estados y cualidades", "States and qualities", "Estados e qualidades", "États et qualités", "Stati e qualità", "Zustände und Eigenschaften"), validationScope: "curriculum-mapping" },
    { id: "GG-C-020", title: i18n("Oralidad, nasalidad y escritura", "Orality, nasality and writing", "Oralidade, nasalidade e escrita", "Oralité, nasalité et écriture", "Oralità, nasalità e scrittura", "Oralität, Nasalität und Schrift"), validationScope: "curriculum-mapping" },
    { id: "GG-C-021", title: i18n("Construcciones negativas", "Negative constructions", "Construções negativas", "Constructions négatives", "Costruzioni negative", "Negative Konstruktionen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-022", title: i18n("Interrogación guiada", "Guided questions", "Interrogação guiada", "Interrogation guidée", "Interrogazione guidata", "Geführte Fragen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-023", title: i18n("Tiempo y aspecto", "Time and aspect", "Tempo e aspecto", "Temps et aspect", "Tempo e aspetto", "Zeit und Aspekt"), validationScope: "curriculum-mapping" },
    { id: "GG-C-024", title: i18n("Mandatos, invitaciones y cortesía", "Commands, invitations and courtesy", "Comandos, convites e cortesia", "Ordres, invitations et politesse", "Comandi, inviti e cortesia", "Aufforderungen, Einladungen und Höflichkeit"), validationScope: "curriculum-mapping" },
    { id: "GG-C-025", title: i18n("Posesión y alternancias nominales", "Possession and nominal alternations", "Posse e alternâncias nominais", "Possession et alternances nominales", "Possesso e alternanze nominali", "Besitz und nominale Alternationen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-026", title: i18n("Ubicación y relaciones espaciales", "Location and spatial relationships", "Localização e relações espaciais", "Localisation et relations spatiales", "Posizione e relazioni spaziali", "Ort und räumliche Beziehungen"), validationScope: "curriculum-mapping" },
    { id: "GG-C-027", title: i18n("Referencia y pluralidad", "Reference and plurality", "Referência e pluralidade", "Référence et pluralité", "Riferimento e pluralità", "Referenz und Pluralität"), validationScope: "curriculum-mapping" },
    { id: "GG-C-028", title: i18n("Conexión de ideas", "Connecting ideas", "Conexão de ideias", "Enchaînement des idées", "Connessione delle idee", "Ideen verknüpfen"), validationScope: "curriculum-mapping" }
  ];

  const objective = ({ id, moduleId, order, canDo, conceptId, skills, difficulty, activityTypes, legacyUnitIndex, lexemeIds = [], grammarRuleIds = [], knowledgeStatus = "curriculumOnly", existingDynamicActivityIds = [] }) => ({
    id,
    moduleId,
    order,
    canDo,
    conceptIds: [conceptId],
    lexemeIds,
    grammarRuleIds,
    skills,
    difficulty,
    activityTypes,
    existingDynamicActivityIds,
    legacyContentRefs: [{ source: "index.html", legacyUnitIndex, legacyQuestionRange: [0, 3] }],
    knowledgeStatus,
    institutionalMetadata: {
      reportableByObjective: true,
      reportableSkills: skills,
      reinforcementSignalReady: true,
      masteryCalculated: false
    }
  });

  const learningObjectives = [
    objective({
      id: "GG-LO-001", moduleId: "GG-MOD-01", order: 1, conceptId: "GG-C-001", legacyUnitIndex: 0,
      canDo: i18n("Podrá saludar, preguntar cómo está alguien, agradecer y despedirse en un intercambio breve.", "Can greet, ask how someone is, thank them and say goodbye in a short exchange.", "Poderá cumprimentar, perguntar como alguém está, agradecer e se despedir em uma interação breve.", "Pourra saluer, demander comment va quelqu’un, remercier et prendre congé dans un bref échange.", "Potrà salutare, chiedere come sta qualcuno, ringraziare e congedarsi in un breve scambio.", "Kann in einem kurzen Gespräch begrüßen, nach dem Befinden fragen, danken und sich verabschieden."),
      skills: ["listening", "comprehension", "speaking", "interaction"], difficulty: "foundation-1",
      activityTypes: ["listening", "multiple-choice", "speaking", "scenario"],
      lexemeIds: ["LEX-CANDIDATE-MBAEICHAPA", "LEX-CANDIDATE-AGUYJE", "LEX-CANDIDATE-JAJOTOPATA"],
      knowledgeStatus: "unreviewed",
      existingDynamicActivityIds: ["general-u01-significado-mba-eichapa", "general-u01-elegir-aguyje", "general-u01-escuchar-jajotopata"]
    }),
    objective({
      id: "GG-LO-002", moduleId: "GG-MOD-01", order: 2, conceptId: "GG-C-002", legacyUnitIndex: 1,
      canDo: i18n("Podrá decir su nombre y compartir información personal básica en frases breves.", "Can say their name and share basic personal information in short sentences.", "Poderá dizer seu nome e compartilhar informações pessoais básicas em frases curtas.", "Pourra dire son nom et partager des informations personnelles de base en phrases courtes.", "Potrà dire il proprio nome e condividere informazioni personali di base con frasi brevi.", "Kann den eigenen Namen nennen und grundlegende persönliche Angaben in kurzen Sätzen machen."),
      skills: ["listening", "construction", "speaking", "interaction"], difficulty: "foundation-1",
      activityTypes: ["listening", "order-sentence", "writing", "speaking", "scenario"]
    }),
    objective({
      id: "GG-LO-003", moduleId: "GG-MOD-01", order: 3, conceptId: "GG-C-003", legacyUnitIndex: 2,
      canDo: i18n("Podrá identificar a quién se refiere una forma personal dentro de un intercambio básico.", "Can identify who a personal form refers to in a basic exchange.", "Poderá identificar a quem uma forma pessoal se refere em uma interação básica.", "Pourra identifier à qui renvoie une forme personnelle dans un échange de base.", "Potrà identificare a chi si riferisce una forma personale in uno scambio di base.", "Kann erkennen, auf wen sich eine Personenform in einem einfachen Gespräch bezieht."),
      skills: ["comprehension", "grammar-awareness", "construction"], difficulty: "foundation-1",
      activityTypes: ["multiple-choice", "matching", "fill-blank", "order-sentence"]
    }),
    objective({
      id: "GG-LO-004", moduleId: "GG-MOD-01", order: 4, conceptId: "GG-C-004", legacyUnitIndex: 3,
      canDo: i18n("Podrá reconocer grafías características y distinguirlas al escuchar o leer palabras conocidas.", "Can recognize characteristic spellings and distinguish them in familiar spoken or written words.", "Poderá reconhecer grafias características e distingui-las ao ouvir ou ler palavras conhecidas.", "Pourra reconnaître des graphies caractéristiques et les distinguer dans des mots connus, entendus ou lus.", "Potrà riconoscere grafie caratteristiche e distinguerle ascoltando o leggendo parole note.", "Kann typische Schreibweisen in bekannten gehörten oder gelesenen Wörtern erkennen und unterscheiden."),
      skills: ["listening", "reading", "pronunciation-awareness"], difficulty: "foundation-1",
      activityTypes: ["listening", "multiple-choice", "matching", "speaking"]
    }),
    objective({
      id: "GG-LO-005", moduleId: "GG-MOD-02", order: 1, conceptId: "GG-C-005", legacyUnitIndex: 4,
      canDo: i18n("Podrá identificar integrantes de la familia y comprender relaciones posesivas básicas ya presentadas.", "Can identify family members and understand previously presented basic possessive relationships.", "Poderá identificar familiares e compreender relações possessivas básicas já apresentadas.", "Pourra identifier les membres de la famille et comprendre les relations possessives de base déjà présentées.", "Potrà identificare i familiari e comprendere relazioni possessive di base già presentate.", "Kann Familienmitglieder erkennen und bereits eingeführte einfache Besitzbeziehungen verstehen."),
      skills: ["comprehension", "vocabulary", "construction"], difficulty: "foundation-2",
      activityTypes: ["multiple-choice", "matching", "fill-blank", "writing"],
      grammarRuleIds: ["RULE-POSSESSION-001"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-006", moduleId: "GG-MOD-02", order: 2, conceptId: "GG-C-006", legacyUnitIndex: 5,
      canDo: i18n("Podrá comprender y expresar cantidades iniciales y participar en una pregunta básica sobre la edad.", "Can understand and express initial quantities and take part in a basic exchange about age.", "Poderá compreender e expressar quantidades iniciais e participar de uma pergunta básica sobre idade.", "Pourra comprendre et exprimer des quantités initiales et participer à un échange de base sur l’âge.", "Potrà comprendere ed esprimere quantità iniziali e partecipare a uno scambio di base sull’età.", "Kann erste Mengenangaben verstehen und ausdrücken sowie an einem einfachen Austausch über das Alter teilnehmen."),
      skills: ["listening", "comprehension", "speaking"], difficulty: "foundation-2",
      activityTypes: ["listening", "multiple-choice", "matching", "speaking", "scenario"]
    }),
    objective({
      id: "GG-LO-007", moduleId: "GG-MOD-02", order: 3, conceptId: "GG-C-007", legacyUnitIndex: 6,
      canDo: i18n("Podrá comprender y producir algunas expresiones ya enseñadas sobre acciones cotidianas.", "Can understand and produce selected previously taught expressions about everyday actions.", "Poderá compreender e produzir algumas expressões já ensinadas sobre ações cotidianas.", "Pourra comprendre et produire certaines expressions déjà enseignées sur les actions quotidiennes.", "Potrà comprendere e produrre alcune espressioni già insegnate sulle azioni quotidiane.", "Kann einige bereits vermittelte Ausdrücke zu alltäglichen Handlungen verstehen und verwenden."),
      skills: ["comprehension", "construction", "speaking"], difficulty: "foundation-2",
      activityTypes: ["multiple-choice", "fill-blank", "order-sentence", "speaking"],
      grammarRuleIds: ["CP-AREAL-001", "CP-AIREAL-001", "CP-HAREAL-001"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-008", moduleId: "GG-MOD-02", order: 4, conceptId: "GG-C-008", legacyUnitIndex: 7,
      canDo: i18n("Podrá comunicar necesidades básicas relacionadas con comida y bebida en situaciones conocidas.", "Can communicate basic food and drink needs in familiar situations.", "Poderá comunicar necessidades básicas de comida e bebida em situações conhecidas.", "Pourra communiquer des besoins élémentaires liés à la nourriture et à la boisson dans des situations connues.", "Potrà comunicare bisogni di base relativi a cibo e bevande in situazioni note.", "Kann in vertrauten Situationen grundlegende Bedürfnisse zu Essen und Trinken ausdrücken."),
      skills: ["listening", "speaking", "application"], difficulty: "foundation-2",
      activityTypes: ["listening", "multiple-choice", "speaking", "scenario"]
    }),
    objective({
      id: "GG-LO-009", moduleId: "GG-MOD-03", order: 1, conceptId: "GG-C-009", legacyUnitIndex: 8,
      canDo: i18n("Podrá expresar y comprender estados o descripciones sencillas ya trabajadas.", "Can express and understand simple previously practised states or descriptions.", "Poderá expressar e compreender estados ou descrições simples já trabalhados.", "Pourra exprimer et comprendre des états ou descriptions simples déjà travaillés.", "Potrà esprimere e comprendere stati o descrizioni semplici già esercitati.", "Kann einfache bereits geübte Zustände oder Beschreibungen ausdrücken und verstehen."),
      skills: ["comprehension", "speaking", "application"], difficulty: "foundation-2",
      activityTypes: ["multiple-choice", "matching", "writing", "speaking"]
    }),
    objective({
      id: "GG-LO-010", moduleId: "GG-MOD-03", order: 2, conceptId: "GG-C-010", legacyUnitIndex: 9,
      canDo: i18n("Podrá preguntar por una ubicación y comprender indicaciones básicas dentro de contextos conocidos.", "Can ask about a location and understand basic directions in familiar contexts.", "Poderá perguntar por uma localização e compreender indicações básicas em contextos conhecidos.", "Pourra demander un lieu et comprendre des indications de base dans des contextes connus.", "Potrà chiedere una posizione e comprendere indicazioni di base in contesti noti.", "Kann nach einem Ort fragen und einfache Wegangaben in vertrauten Kontexten verstehen."),
      skills: ["listening", "interaction", "application"], difficulty: "foundation-2",
      activityTypes: ["listening", "order-sentence", "speaking", "scenario"]
    }),
    objective({
      id: "GG-LO-011", moduleId: "GG-MOD-03", order: 3, conceptId: "GG-C-011", legacyUnitIndex: 10,
      canDo: i18n("Podrá comprender y usar referencias temporales básicas en intercambios breves.", "Can understand and use basic time references in short exchanges.", "Poderá compreender e usar referências temporais básicas em interações breves.", "Pourra comprendre et utiliser des repères temporels de base dans de brefs échanges.", "Potrà comprendere e usare riferimenti temporali di base in brevi scambi.", "Kann grundlegende Zeitangaben in kurzen Gesprächen verstehen und verwenden."),
      skills: ["listening", "comprehension", "application"], difficulty: "foundation-2",
      activityTypes: ["listening", "matching", "order-sentence", "scenario"]
    }),
    objective({
      id: "GG-LO-012", moduleId: "GG-MOD-03", order: 4, conceptId: "GG-C-012", legacyUnitIndex: 11,
      canDo: i18n("Podrá combinar saludos, presentación y preguntas conocidas en una conversación básica guiada.", "Can combine greetings, introductions and familiar questions in a guided basic conversation.", "Poderá combinar saudações, apresentação e perguntas conhecidas em uma conversa básica guiada.", "Pourra combiner salutations, présentation et questions connues dans une conversation de base guidée.", "Potrà combinare saluti, presentazione e domande note in una conversazione di base guidata.", "Kann Begrüßung, Vorstellung und bekannte Fragen in einem geführten einfachen Gespräch verbinden."),
      skills: ["listening", "comprehension", "construction", "speaking", "application", "interaction"], difficulty: "foundation-3",
      activityTypes: ["listening", "order-sentence", "writing", "speaking", "scenario"]
    })
  ];

  learningObjectives.push(
    objective({
      id: "GG-LO-013", moduleId: "GG-MOD-04", order: 1, conceptId: "GG-C-013", legacyUnitIndex: 12,
      canDo: i18n("Podrá formular preguntas guiadas para pedir información o aclarar algo que no comprende.", "Can use guided questions to request information or clarify something they do not understand.", "Poderá formular perguntas guiadas para pedir informações ou esclarecer algo que não compreende.", "Pourra formuler des questions guidées pour demander une information ou clarifier ce qu’il ne comprend pas.", "Potrà formulare domande guidate per chiedere informazioni o chiarire ciò che non comprende.", "Kann mit geführten Fragen Informationen erbitten oder Unverstandenes klären."),
      skills: ["comprehension", "construction", "interaction"], difficulty: "foundation-3",
      activityTypes: ["multiple-choice", "order-sentence", "writing", "scenario"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-014", moduleId: "GG-MOD-04", order: 2, conceptId: "GG-C-014", legacyUnitIndex: 13,
      canDo: i18n("Podrá reconocer y usar en contextos conocidos expresiones completas de negación y confirmación ya enseñadas.", "Can recognize and use previously taught complete expressions of negation and confirmation in familiar contexts.", "Poderá reconhecer e usar, em contextos conhecidos, expressões completas de negação e confirmação já ensinadas.", "Pourra reconnaître et utiliser, dans des contextes connus, des expressions complètes de négation et de confirmation déjà enseignées.", "Potrà riconoscere e usare, in contesti noti, espressioni complete di negazione e conferma già insegnate.", "Kann bereits vermittelte vollständige Ausdrücke der Verneinung und Bestätigung in vertrauten Kontexten erkennen und verwenden."),
      skills: ["listening", "comprehension", "application"], difficulty: "foundation-3",
      activityTypes: ["listening", "multiple-choice", "matching", "scenario"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-015", moduleId: "GG-MOD-04", order: 3, conceptId: "GG-C-015", legacyUnitIndex: 14,
      canDo: i18n("Podrá describir de forma guiada una rutina básica y reconocer expresiones frecuentes de tiempo.", "Can describe a basic routine with guidance and recognize common time expressions.", "Poderá descrever de forma guiada uma rotina básica e reconhecer expressões frequentes de tempo.", "Pourra décrire de façon guidée une routine simple et reconnaître des expressions temporelles fréquentes.", "Potrà descrivere in modo guidato una routine di base e riconoscere espressioni temporali frequenti.", "Kann eine einfache Routine angeleitet beschreiben und häufige Zeitangaben erkennen."),
      skills: ["listening", "construction", "speaking"], difficulty: "foundation-3",
      activityTypes: ["listening", "order-sentence", "writing", "speaking"]
    }),
    objective({
      id: "GG-LO-016", moduleId: "GG-MOD-04", order: 4, conceptId: "GG-C-016", legacyUnitIndex: 15,
      canDo: i18n("Podrá participar en una compra sencilla usando expresiones ya trabajadas para precio y cantidad.", "Can take part in a simple purchase using previously practised expressions for price and quantity.", "Poderá participar de uma compra simples usando expressões já trabalhadas para preço e quantidade.", "Pourra effectuer un achat simple avec des expressions déjà travaillées pour le prix et la quantité.", "Potrà partecipare a un acquisto semplice usando espressioni già esercitate per prezzo e quantità.", "Kann mit bereits geübten Ausdrücken zu Preis und Menge an einem einfachen Einkauf teilnehmen."),
      skills: ["listening", "speaking", "application", "interaction"], difficulty: "foundation-3",
      activityTypes: ["listening", "multiple-choice", "speaking", "scenario"]
    }),
    objective({
      id: "GG-LO-017", moduleId: "GG-MOD-05", order: 1, conceptId: "GG-C-017", legacyUnitIndex: 16,
      canDo: i18n("Podrá ordenar elementos de oraciones breves a partir de modelos previamente validados.", "Can order elements of short sentences from previously validated models.", "Poderá ordenar elementos de frases curtas a partir de modelos previamente validados.", "Pourra ordonner les éléments de phrases courtes à partir de modèles préalablement validés.", "Potrà ordinare gli elementi di frasi brevi a partire da modelli precedentemente validati.", "Kann Elemente kurzer Sätze anhand zuvor validierter Modelle ordnen."),
      skills: ["comprehension", "construction", "grammar-awareness"], difficulty: "foundation-3",
      activityTypes: ["multiple-choice", "order-sentence", "fill-blank", "writing"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-018", moduleId: "GG-MOD-05", order: 2, conceptId: "GG-C-018", legacyUnitIndex: 17,
      canDo: i18n("Podrá reconocer en formas documentadas quién realiza una acción, sin generalizar patrones no validados.", "Can identify who performs an action in documented forms without generalizing unvalidated patterns.", "Poderá reconhecer, em formas documentadas, quem realiza uma ação sem generalizar padrões não validados.", "Pourra reconnaître, dans des formes documentées, qui accomplit une action sans généraliser des modèles non validés.", "Potrà riconoscere, in forme documentate, chi compie un’azione senza generalizzare schemi non validati.", "Kann in dokumentierten Formen erkennen, wer eine Handlung ausführt, ohne unvalidierte Muster zu verallgemeinern."),
      skills: ["comprehension", "grammar-awareness", "application"], difficulty: "foundation-3",
      activityTypes: ["multiple-choice", "matching", "fill-blank"], grammarRuleIds: ["CP-AREAL-001", "CP-AIREAL-001", "CP-HAREAL-001"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-019", moduleId: "GG-MOD-05", order: 3, conceptId: "GG-C-019", legacyUnitIndex: 18,
      canDo: i18n("Podrá distinguir en ejemplos enseñados expresiones de acción frente a expresiones de estado o cualidad.", "Can distinguish expressions of action from expressions of state or quality in taught examples.", "Poderá distinguir, em exemplos ensinados, expressões de ação de expressões de estado ou qualidade.", "Pourra distinguer, dans les exemples enseignés, les expressions d’action de celles d’état ou de qualité.", "Potrà distinguere, negli esempi insegnati, espressioni di azione da espressioni di stato o qualità.", "Kann in vermittelten Beispielen Handlungs- von Zustands- oder Eigenschaftsausdrücken unterscheiden."),
      skills: ["comprehension", "grammar-awareness", "application"], difficulty: "foundation-3",
      activityTypes: ["multiple-choice", "matching", "writing"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-020", moduleId: "GG-MOD-05", order: 4, conceptId: "GG-C-020", legacyUnitIndex: 19,
      canDo: i18n("Podrá reconocer diferencias de oralidad y nasalidad en pares y ejemplos previamente documentados.", "Can recognize oral and nasal differences in previously documented pairs and examples.", "Poderá reconhecer diferenças de oralidade e nasalidade em pares e exemplos previamente documentados.", "Pourra reconnaître les différences d’oralité et de nasalité dans des paires et exemples préalablement documentés.", "Potrà riconoscere differenze di oralità e nasalità in coppie ed esempi precedentemente documentati.", "Kann orale und nasale Unterschiede in zuvor dokumentierten Paaren und Beispielen erkennen."),
      skills: ["listening", "reading", "pronunciation-awareness"], difficulty: "foundation-3",
      activityTypes: ["listening", "matching", "multiple-choice", "speaking"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-021", moduleId: "GG-MOD-06", order: 1, conceptId: "GG-C-021", legacyUnitIndex: 20,
      canDo: i18n("Podrá reconocer y reconstruir negaciones completas ya validadas sin producir formas nuevas por analogía.", "Can recognize and reconstruct validated complete negative forms without producing new forms by analogy.", "Poderá reconhecer e reconstruir negações completas já validadas sem produzir novas formas por analogia.", "Pourra reconnaître et reconstruire des négations complètes validées sans produire de nouvelles formes par analogie.", "Potrà riconoscere e ricostruire negazioni complete validate senza produrre nuove forme per analogia.", "Kann validierte vollständige Negationen erkennen und rekonstruieren, ohne analog neue Formen zu bilden."),
      skills: ["comprehension", "construction", "grammar-awareness"], difficulty: "foundation-4",
      activityTypes: ["multiple-choice", "order-sentence", "fill-blank"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-022", moduleId: "GG-MOD-06", order: 2, conceptId: "GG-C-022", legacyUnitIndex: 21,
      canDo: i18n("Podrá identificar la función interrogativa en preguntas completas previamente enseñadas.", "Can identify interrogative function in previously taught complete questions.", "Poderá identificar a função interrogativa em perguntas completas previamente ensinadas.", "Pourra identifier la fonction interrogative dans des questions complètes déjà enseignées.", "Potrà identificare la funzione interrogativa in domande complete già insegnate.", "Kann die Fragefunktion in bereits vermittelten vollständigen Fragen erkennen."),
      skills: ["listening", "comprehension", "grammar-awareness"], difficulty: "foundation-4",
      activityTypes: ["listening", "multiple-choice", "matching", "scenario"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-023", moduleId: "GG-MOD-06", order: 3, conceptId: "GG-C-023", legacyUnitIndex: 22,
      canDo: i18n("Podrá interpretar referencias temporales en expresiones completas y contextos ya presentados.", "Can interpret time references in complete expressions and previously presented contexts.", "Poderá interpretar referências temporais em expressões completas e contextos já apresentados.", "Pourra interpréter les repères temporels dans des expressions complètes et des contextes déjà présentés.", "Potrà interpretare riferimenti temporali in espressioni complete e contesti già presentati.", "Kann Zeitbezüge in vollständigen Ausdrücken und bereits vorgestellten Kontexten deuten."),
      skills: ["listening", "comprehension", "application"], difficulty: "foundation-4",
      activityTypes: ["listening", "matching", "order-sentence", "scenario"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-024", moduleId: "GG-MOD-06", order: 4, conceptId: "GG-C-024", legacyUnitIndex: 23,
      canDo: i18n("Podrá distinguir en ejemplos guiados una instrucción, una invitación y una petición cortés.", "Can distinguish an instruction, an invitation and a polite request in guided examples.", "Poderá distinguir, em exemplos guiados, uma instrução, um convite e um pedido cortês.", "Pourra distinguer, dans des exemples guidés, une instruction, une invitation et une demande polie.", "Potrà distinguere, in esempi guidati, un’istruzione, un invito e una richiesta cortese.", "Kann in geführten Beispielen Anweisung, Einladung und höfliche Bitte unterscheiden."),
      skills: ["listening", "comprehension", "interaction"], difficulty: "foundation-4",
      activityTypes: ["listening", "multiple-choice", "speaking", "scenario"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-025", moduleId: "GG-MOD-07", order: 1, conceptId: "GG-C-025", legacyUnitIndex: 24,
      canDo: i18n("Podrá interpretar relaciones de posesión en ejemplos documentados y reconocer alternancias sin generalizarlas.", "Can interpret possession in documented examples and recognize alternations without generalizing them.", "Poderá interpretar relações de posse em exemplos documentados e reconhecer alternâncias sem generalizá-las.", "Pourra interpréter les relations de possession dans des exemples documentés et reconnaître les alternances sans les généraliser.", "Potrà interpretare relazioni di possesso in esempi documentati e riconoscere alternanze senza generalizzarle.", "Kann Besitzbeziehungen in dokumentierten Beispielen deuten und Alternationen erkennen, ohne sie zu verallgemeinern."),
      skills: ["comprehension", "grammar-awareness", "application"], difficulty: "foundation-4",
      activityTypes: ["multiple-choice", "matching", "fill-blank"], grammarRuleIds: ["RULE-POSSESSION-001"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-026", moduleId: "GG-MOD-07", order: 2, conceptId: "GG-C-026", legacyUnitIndex: 25,
      canDo: i18n("Podrá comprender relaciones espaciales básicas dentro de expresiones completas ya trabajadas.", "Can understand basic spatial relationships in previously practised complete expressions.", "Poderá compreender relações espaciais básicas em expressões completas já trabalhadas.", "Pourra comprendre des relations spatiales de base dans des expressions complètes déjà travaillées.", "Potrà comprendere relazioni spaziali di base in espressioni complete già esercitate.", "Kann grundlegende räumliche Beziehungen in bereits geübten vollständigen Ausdrücken verstehen."),
      skills: ["listening", "comprehension", "application"], difficulty: "foundation-4",
      activityTypes: ["listening", "matching", "order-sentence", "scenario"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-027", moduleId: "GG-MOD-07", order: 3, conceptId: "GG-C-027", legacyUnitIndex: 26,
      canDo: i18n("Podrá identificar referentes y pluralidad en ejemplos completos previamente enseñados.", "Can identify referents and plurality in previously taught complete examples.", "Poderá identificar referentes e pluralidade em exemplos completos previamente ensinados.", "Pourra identifier les référents et la pluralité dans des exemples complets déjà enseignés.", "Potrà identificare referenti e pluralità in esempi completi già insegnati.", "Kann Bezugsgrößen und Pluralität in bereits vermittelten vollständigen Beispielen erkennen."),
      skills: ["comprehension", "grammar-awareness", "application"], difficulty: "foundation-4",
      activityTypes: ["multiple-choice", "matching", "fill-blank"], knowledgeStatus: "reviewRequired"
    }),
    objective({
      id: "GG-LO-028", moduleId: "GG-MOD-07", order: 4, conceptId: "GG-C-028", legacyUnitIndex: 27,
      canDo: i18n("Podrá conectar ideas conocidas y sostener un intercambio breve con apoyo de modelos validados.", "Can connect familiar ideas and sustain a short exchange with support from validated models.", "Poderá conectar ideias conhecidas e manter uma interação breve com apoio de modelos validados.", "Pourra relier des idées connues et soutenir un bref échange à l’aide de modèles validés.", "Potrà collegare idee note e sostenere un breve scambio con il supporto di modelli validati.", "Kann bekannte Ideen verbinden und mit Unterstützung validierter Modelle ein kurzes Gespräch führen."),
      skills: ["listening", "construction", "speaking", "application", "interaction"], difficulty: "foundation-4",
      activityTypes: ["listening", "order-sentence", "writing", "speaking", "scenario"], knowledgeStatus: "reviewRequired"
    })
  );

  const route = {
    id: "GG-ROUTE-001",
    courseId: "general",
    languageBeingLearned: "gug-PY",
    title: i18n("Ruta de Guaraní General", "General Guaraní Path", "Rota de Guarani Geral", "Parcours de guarani général", "Percorso di guaraní generale", "Lernweg Allgemeines Guaraní"),
    learningModel: "competency-route",
    progressUnit: "learningObjective",
    fixedLessonCount: null,
    practicePolicy: {
      activityCount: "variable",
      selection: "objective-and-skill",
      masteryDecisionImplemented: false,
      fallback: "existing-validated-activity"
    },
    pedagogicalCycleIds: pedagogicalCycle.map(phase => phase.id),
    moduleIds: modules.map(module => module.id)
  };

  const activityData = window.KUAA_GENERAL_ACTIVITY_DATA || { activities: [] };
  const moduleById = new Map(modules.map(module => [module.id, module]));
  const conceptById = new Map(concepts.map(concept => [concept.id, concept]));
  const objectiveById = new Map(learningObjectives.map(item => [item.id, item]));
  const objectiveByLegacyUnit = new Map(learningObjectives.map(item => [item.legacyContentRefs[0].legacyUnitIndex, item]));
  const activityById = new Map((activityData.activities || []).map(activity => [activity.id, activity]));

  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const language = requested => LANGUAGES.includes(requested) ? requested : "es";
  const localize = (value, requestedLanguage = "es") => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) return value;
    return value[language(requestedLanguage)] ?? value.es ?? Object.values(value)[0] ?? "";
  };
  const getModule = id => copy(moduleById.get(id) || null);
  const getConcept = id => copy(conceptById.get(id) || null);
  const getLearningObjective = id => copy(objectiveById.get(id) || null);
  const getLearningObjectiveForLegacyUnit = legacyUnitIndex => copy(objectiveByLegacyUnit.get(Number(legacyUnitIndex)) || null);
  const getActivitiesForLearningObjective = id => copy((activityData.activities || []).filter(activity => activity.learningObjectiveId === id));
  const getInstitutionalObjectiveDescriptor = (id, requestedLanguage = "es") => {
    const item = objectiveById.get(id);
    if (!item) return null;
    return {
      learningObjectiveId: item.id,
      moduleId: item.moduleId,
      canDo: localize(item.canDo, requestedLanguage),
      skills: [...item.skills],
      conceptIds: [...item.conceptIds],
      evidenceFields: {
        completed: null,
        skillEvidence: [],
        reinforcementNeeded: null
      },
      masteryCalculated: false
    };
  };

  const audit = () => ({
    version: VERSION,
    courseId: route.courseId,
    modules: modules.length,
    learningObjectives: learningObjectives.length,
    concepts: concepts.length,
    dynamicActivitiesLinked: activityById.size,
    progressUnit: route.progressUnit,
    fixedLessonCount: route.fixedLessonCount,
    activityCountPolicy: route.practicePolicy.activityCount,
    masteryCalculated: route.practicePolicy.masteryDecisionImplemented,
    interfaceLanguages: [...LANGUAGES],
    firebaseChanged: false,
    artificialIntelligenceConnected: false,
    otherCoursesChanged: false
  });

  const deepFreeze = value => {
    if (!value || (typeof value !== "object" && typeof value !== "function") || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };

  window.NALVI_GUARANI_GENERAL_CURRICULUM = deepFreeze({
    version: VERSION,
    languages: LANGUAGES,
    route,
    pedagogicalCycle,
    modules,
    learningObjectives,
    concepts,
    localize,
    getModule,
    getConcept,
    getLearningObjective,
    getLearningObjectiveForLegacyUnit,
    getActivitiesForLearningObjective,
    getInstitutionalObjectiveDescriptor,
    audit
  });
})();
