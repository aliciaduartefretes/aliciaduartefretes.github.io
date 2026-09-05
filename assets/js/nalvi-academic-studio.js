/* NALVI Academic Studio · self-service classrooms and lightweight teaching tools. */
(function(){
  "use strict";

  const VERSION="NALVI-ACADEMIC-STUDIO-8";
  const INTENT_KEY="nalviAcademicIntent.v1";
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const cleanLines=(value,maximum=60)=>[...new Set(String(value||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean))].slice(0,maximum);
  const normalizeClassCode=value=>String(value||"").trim().toUpperCase().replace(/\s+/g,"").replace(/^GCA(?=[A-Z0-9]{6}$)/,"GCA-").slice(0,10);
  const normalizeLivePin=value=>String(value||"").replace(/\D/g,"").slice(0,6);
  const courseLabel=value=>({general:"Guaraní general",police:"Guaraní para Policía",medicine:"Guaraní para Medicina",kids:"Jugar"})[value]||"Guaraní";
  const COPY={
    es:{
      managementNav:"Gestión",
      management:"Gestión académica",publicTag:"GESTIÓN ACADÉMICA",publicTitle:"Tu aula, en un solo lugar",publicIntro:"Crea una clase o entra con el código de tu profesor.",teacherTag:"DOCENTES",teacherTitle:"Crea y organiza tus clases",teacherBody:"Comparte un código, asigna actividades, usa la ruleta y revisa el avance de cada alumno.",workspaceLabel:"Nombre de tu espacio",signIn:"Entrar con Google",openPanel:"Abrir mi panel",createSpace:"Crear mi espacio docente",studentTag:"ESTUDIANTES",studentTitle:"Entra a tu clase",studentBody:"Usa el código de tu profesor. Después verás tus clases, tareas y progreso.",classCode:"Código de la clase",join:"Unirme",viewLearning:"Ver mis clases y mi progreso →",liveStarted:"¿La actividad ya comenzó?",livePin:"PIN de 6 números",enterLive:"Entrar en vivo",myClasses:"Mis clases",myClassesBody:"Clases, tareas y progreso vinculados a tu cuenta.",openLearning:"Abrir mi aprendizaje",defaultClass:"Clase de guaraní",defaultWorkspace:"Aula de guaraní",
      toolsTab:"Ruleta y preguntas",toolsTitle:"Ruleta y preguntas",toolsBody:"Prepara actividades de texto para proyectar o compartir en clase.",createLive:"Crear actividad con PIN →",wheelTag:"RULETA",wheelTitle:"Ruleta sin repeticiones",wheelBody:"Carga nombres, palabras, frases o preguntas, una por línea. Cada resultado sale una sola vez.",title:"Título",wheelDefault:"Ruleta de la clase",options:"Opciones",saveWheel:"Guardar ruleta",reset:"Reiniciar opciones",spin:"Girar →",emptyWheel:"Ruleta vacía",addTwo:"Agrega al menos dos opciones.",questionsTag:"PREGUNTAS",questionsTitle:"Banco de preguntas",questionsBody:"Escribe una pregunta y su respuesta por línea, separadas por |.",questionsDefault:"Preguntas de la clase",questionsInput:"Preguntas y respuestas",saveQuestions:"Guardar preguntas",savedTitle:"Actividades guardadas",savedBody:"Puedes volver a abrirlas, editarlas o eliminarlas.",reload:"Actualizar",noSaved:"Todavía no hay actividades guardadas.",edit:"Editar",remove:"Eliminar",wheelType:"🎡 Ruleta",questionsType:"🎓 Preguntas",itemOne:"elemento",itemMany:"elementos",loadingActivities:"Cargando actividades…",loadError:"No pudimos cargar las actividades.",completeFields:"Completa el título y el contenido.",questionFormat:"Cada línea debe tener: Pregunta | Respuesta",saving:"Guardando…",saved:"Actividad guardada.",saveError:"No se pudo guardar. Revisa la conexión.",resetDone:"Opciones reiniciadas.",addOne:"Agrega al menos una opción.",spinning:"Girando…",result:"Salió: {item}",removedResult:"{item} fue retirado. Quedan {count}.",finalResult:"{item} fue la última opción. Reinicia la ruleta para volver a jugar.",confirmRemove:"¿Eliminar “{title}”?",
      adminTag:"ADMINISTRACIÓN NALVI",teacherPanelTag:"MI ESPACIO DOCENTE",adminTitle:"Panel de administración",teacherPanelTitle:"Gestión académica",adminIntro:"Consulta todos los alumnos inscritos y administra instituciones, clases y profesores.",teacherPanelIntro:"Tus clases, actividades y alumnos organizados de forma sencilla.",security:"Cada clase y su progreso están protegidos por la cuenta y el código de acceso.",createClass:"Crear una clase",createClassBody:"Ponle un nombre y comparte el código. No necesitas agregar alumnos uno por uno.",studentEmails:"Correos de alumnos (opcional)",
      tabs:{summary:["🏠","Inicio","Alumnos y progreso"],adminSummary:["🛡️","Todos los alumnos","Consulta las inscripciones"],groups:["👥","Clases","Códigos y alumnos"],assignments:["📝","Tareas","Asigna lecciones"],assessments:["📈","Progreso","Resultados y evaluaciones"],live:["🎯","Actividad con PIN","Práctica en vivo"],tools:["🎡","Ruleta y preguntas","Herramientas de clase"],certificates:["🏅","Certificados","Solicitudes y emisiones"],institution:["🏫","Mi espacio","Profesores y responsables"],adminInstitution:["🏫","Instituciones","Responsables y profesores"],leads:["📨","Solicitudes","Contactos institucionales"]}
    },
    en:{
      managementNav:"Academic",
      management:"Academic management",publicTag:"ACADEMIC MANAGEMENT",publicTitle:"Your classroom, all in one place",publicIntro:"Create a class or enter with the code from your teacher.",teacherTag:"TEACHERS",teacherTitle:"Create and organize your classes",teacherBody:"Share a code, assign activities, use the wheel, and review each learner’s progress.",workspaceLabel:"Workspace name",signIn:"Sign in with Google",openPanel:"Open my dashboard",createSpace:"Create my teaching space",studentTag:"LEARNERS",studentTitle:"Join your class",studentBody:"Use the code from your teacher. Then you will see your classes, assignments, and progress.",classCode:"Class code",join:"Join",viewLearning:"View my classes and progress →",liveStarted:"Has the activity started?",livePin:"6-digit PIN",enterLive:"Join live",myClasses:"My classes",myClassesBody:"Classes, assignments, and progress linked to your account.",openLearning:"Open my learning",defaultClass:"Guaraní class",defaultWorkspace:"Guaraní classroom",
      toolsTab:"Wheel and questions",toolsTitle:"Wheel and questions",toolsBody:"Prepare text activities to project or share in class.",createLive:"Create activity with PIN →",wheelTag:"WHEEL",wheelTitle:"No-repeat wheel",wheelBody:"Add names, words, phrases, or questions, one per line. Each result appears only once.",title:"Title",wheelDefault:"Class wheel",options:"Options",saveWheel:"Save wheel",reset:"Reset options",spin:"Spin →",emptyWheel:"Empty wheel",addTwo:"Add at least two options.",questionsTag:"QUESTIONS",questionsTitle:"Question bank",questionsBody:"Write one question and answer per line, separated by |.",questionsDefault:"Class questions",questionsInput:"Questions and answers",saveQuestions:"Save questions",savedTitle:"Saved activities",savedBody:"Open, edit, or delete them at any time.",reload:"Refresh",noSaved:"There are no saved activities yet.",edit:"Edit",remove:"Delete",wheelType:"🎡 Wheel",questionsType:"🎓 Questions",itemOne:"item",itemMany:"items",loadingActivities:"Loading activities…",loadError:"We could not load the activities.",completeFields:"Complete the title and content.",questionFormat:"Each line must contain: Question | Answer",saving:"Saving…",saved:"Activity saved.",saveError:"Could not save. Check your connection.",resetDone:"Options reset.",addOne:"Add at least one option.",spinning:"Spinning…",result:"Result: {item}",removedResult:"{item} was removed. {count} remain.",finalResult:"{item} was the last option. Reset the wheel to play again.",confirmRemove:"Delete “{title}”?",
      adminTag:"NALVI ADMINISTRATION",teacherPanelTag:"MY TEACHING SPACE",adminTitle:"Administration dashboard",teacherPanelTitle:"Academic management",adminIntro:"Review all enrolled learners and manage institutions, classes, and teachers.",teacherPanelIntro:"Your classes, activities, and learners in one simple workspace.",security:"Each class and its progress are protected by the account and access code.",createClass:"Create a class",createClassBody:"Give it a name and share its code. You do not need to add learners one by one.",studentEmails:"Learner emails (optional)",
      tabs:{summary:["🏠","Overview","Learners and progress"],adminSummary:["🛡️","All learners","Review enrollments"],groups:["👥","Classes","Codes and learners"],assignments:["📝","Assignments","Assign lessons"],assessments:["📈","Progress","Results and assessments"],live:["🎯","PIN activity","Live practice"],tools:["🎡","Wheel and questions","Classroom tools"],certificates:["🏅","Certificates","Requests and issuance"],institution:["🏫","My workspace","Teachers and managers"],adminInstitution:["🏫","Institutions","Managers and teachers"],leads:["📨","Requests","Institutional contacts"]}
    },
    pt:{
      managementNav:"Gestão",
      management:"Gestão acadêmica",publicTag:"GESTÃO ACADÊMICA",publicTitle:"Sua sala de aula em um só lugar",publicIntro:"Crie uma turma ou entre com o código do professor.",teacherTag:"PROFESSORES",teacherTitle:"Crie e organize suas turmas",teacherBody:"Compartilhe um código, atribua atividades, use a roleta e acompanhe cada aluno.",workspaceLabel:"Nome do seu espaço",signIn:"Entrar com o Google",openPanel:"Abrir meu painel",createSpace:"Criar meu espaço docente",studentTag:"ALUNOS",studentTitle:"Entre na sua turma",studentBody:"Use o código do professor. Depois você verá turmas, tarefas e progresso.",classCode:"Código da turma",join:"Entrar",viewLearning:"Ver minhas turmas e meu progresso →",liveStarted:"A atividade já começou?",livePin:"PIN de 6 números",enterLive:"Entrar ao vivo",myClasses:"Minhas turmas",myClassesBody:"Turmas, tarefas e progresso vinculados à sua conta.",openLearning:"Abrir minha aprendizagem",defaultClass:"Turma de guarani",defaultWorkspace:"Sala de guarani",
      toolsTab:"Roleta e perguntas",toolsTitle:"Roleta e perguntas",toolsBody:"Prepare atividades de texto para projetar ou compartilhar em aula.",createLive:"Criar atividade com PIN →",wheelTag:"ROLETA",wheelTitle:"Roleta sem repetições",wheelBody:"Adicione nomes, palavras, frases ou perguntas, uma por linha. Cada resultado aparece uma só vez.",title:"Título",wheelDefault:"Roleta da turma",options:"Opções",saveWheel:"Salvar roleta",reset:"Reiniciar opções",spin:"Girar →",emptyWheel:"Roleta vazia",addTwo:"Adicione pelo menos duas opções.",questionsTag:"PERGUNTAS",questionsTitle:"Banco de perguntas",questionsBody:"Escreva uma pergunta e sua resposta por linha, separadas por |.",questionsDefault:"Perguntas da turma",questionsInput:"Perguntas e respostas",saveQuestions:"Salvar perguntas",savedTitle:"Atividades salvas",savedBody:"Você pode abrir, editar ou excluir quando quiser.",reload:"Atualizar",noSaved:"Ainda não há atividades salvas.",edit:"Editar",remove:"Excluir",wheelType:"🎡 Roleta",questionsType:"🎓 Perguntas",itemOne:"item",itemMany:"itens",loadingActivities:"Carregando atividades…",loadError:"Não foi possível carregar as atividades.",completeFields:"Preencha o título e o conteúdo.",questionFormat:"Cada linha deve conter: Pergunta | Resposta",saving:"Salvando…",saved:"Atividade salva.",saveError:"Não foi possível salvar. Verifique a conexão.",resetDone:"Opções reiniciadas.",addOne:"Adicione pelo menos uma opção.",spinning:"Girando…",result:"Resultado: {item}",removedResult:"{item} foi retirado. Restam {count}.",finalResult:"{item} foi a última opção. Reinicie a roleta para jogar novamente.",confirmRemove:"Excluir “{title}”?",
      adminTag:"ADMINISTRAÇÃO NALVI",teacherPanelTag:"MEU ESPAÇO DOCENTE",adminTitle:"Painel de administração",teacherPanelTitle:"Gestão acadêmica",adminIntro:"Consulte todos os alunos inscritos e gerencie instituições, turmas e professores.",teacherPanelIntro:"Suas turmas, atividades e alunos em um espaço simples.",security:"Cada turma e seu progresso são protegidos pela conta e pelo código de acesso.",createClass:"Criar uma turma",createClassBody:"Dê um nome e compartilhe o código. Não é preciso adicionar alunos um por um.",studentEmails:"E-mails dos alunos (opcional)",
      tabs:{summary:["🏠","Início","Alunos e progresso"],adminSummary:["🛡️","Todos os alunos","Consulte as inscrições"],groups:["👥","Turmas","Códigos e alunos"],assignments:["📝","Tarefas","Atribua lições"],assessments:["📈","Progresso","Resultados e avaliações"],live:["🎯","Atividade com PIN","Prática ao vivo"],tools:["🎡","Roleta e perguntas","Ferramentas de aula"],certificates:["🏅","Certificados","Solicitações e emissões"],institution:["🏫","Meu espaço","Professores e responsáveis"],adminInstitution:["🏫","Instituições","Responsáveis e professores"],leads:["📨","Solicitações","Contatos institucionais"]}
    },
    fr:{
      managementNav:"Gestion",
      management:"Gestion académique",publicTag:"GESTION ACADÉMIQUE",publicTitle:"Votre classe, au même endroit",publicIntro:"Créez une classe ou saisissez le code de votre professeur.",teacherTag:"PROFESSEURS",teacherTitle:"Créez et organisez vos classes",teacherBody:"Partagez un code, attribuez des activités, utilisez la roue et suivez chaque élève.",workspaceLabel:"Nom de votre espace",signIn:"Se connecter avec Google",openPanel:"Ouvrir mon tableau de bord",createSpace:"Créer mon espace enseignant",studentTag:"ÉLÈVES",studentTitle:"Rejoignez votre classe",studentBody:"Utilisez le code du professeur. Vous verrez ensuite vos classes, devoirs et progrès.",classCode:"Code de la classe",join:"Rejoindre",viewLearning:"Voir mes classes et mes progrès →",liveStarted:"L’activité a-t-elle commencé ?",livePin:"PIN à 6 chiffres",enterLive:"Rejoindre en direct",myClasses:"Mes classes",myClassesBody:"Classes, devoirs et progrès liés à votre compte.",openLearning:"Ouvrir mon apprentissage",defaultClass:"Classe de guarani",defaultWorkspace:"Classe de guarani",
      toolsTab:"Roue et questions",toolsTitle:"Roue et questions",toolsBody:"Préparez des activités textuelles à projeter ou partager en classe.",createLive:"Créer une activité avec PIN →",wheelTag:"ROUE",wheelTitle:"Roue sans répétition",wheelBody:"Ajoutez des noms, mots, phrases ou questions, un élément par ligne. Chaque résultat ne sort qu’une fois.",title:"Titre",wheelDefault:"Roue de la classe",options:"Options",saveWheel:"Enregistrer la roue",reset:"Réinitialiser",spin:"Tourner →",emptyWheel:"Roue vide",addTwo:"Ajoutez au moins deux options.",questionsTag:"QUESTIONS",questionsTitle:"Banque de questions",questionsBody:"Écrivez une question et sa réponse par ligne, séparées par |.",questionsDefault:"Questions de la classe",questionsInput:"Questions et réponses",saveQuestions:"Enregistrer les questions",savedTitle:"Activités enregistrées",savedBody:"Vous pouvez les ouvrir, modifier ou supprimer.",reload:"Actualiser",noSaved:"Aucune activité enregistrée pour le moment.",edit:"Modifier",remove:"Supprimer",wheelType:"🎡 Roue",questionsType:"🎓 Questions",itemOne:"élément",itemMany:"éléments",loadingActivities:"Chargement des activités…",loadError:"Impossible de charger les activités.",completeFields:"Complétez le titre et le contenu.",questionFormat:"Chaque ligne doit contenir : Question | Réponse",saving:"Enregistrement…",saved:"Activité enregistrée.",saveError:"Impossible d’enregistrer. Vérifiez la connexion.",resetDone:"Options réinitialisées.",addOne:"Ajoutez au moins une option.",spinning:"La roue tourne…",result:"Résultat : {item}",removedResult:"{item} a été retiré. Il en reste {count}.",finalResult:"{item} était la dernière option. Réinitialisez la roue pour rejouer.",confirmRemove:"Supprimer « {title} » ?",
      adminTag:"ADMINISTRATION NALVI",teacherPanelTag:"MON ESPACE ENSEIGNANT",adminTitle:"Tableau de bord",teacherPanelTitle:"Gestion académique",adminIntro:"Consultez tous les élèves inscrits et gérez les institutions, classes et professeurs.",teacherPanelIntro:"Vos classes, activités et élèves dans un espace simple.",security:"Chaque classe et sa progression sont protégées par le compte et le code d’accès.",createClass:"Créer une classe",createClassBody:"Donnez-lui un nom et partagez le code. Il n’est pas nécessaire d’ajouter les élèves un par un.",studentEmails:"E-mails des élèves (facultatif)",
      tabs:{summary:["🏠","Accueil","Élèves et progrès"],adminSummary:["🛡️","Tous les élèves","Consulter les inscriptions"],groups:["👥","Classes","Codes et élèves"],assignments:["📝","Devoirs","Attribuer des leçons"],assessments:["📈","Progrès","Résultats et évaluations"],live:["🎯","Activité avec PIN","Pratique en direct"],tools:["🎡","Roue et questions","Outils de classe"],certificates:["🏅","Certificats","Demandes et délivrance"],institution:["🏫","Mon espace","Professeurs et responsables"],adminInstitution:["🏫","Institutions","Responsables et professeurs"],leads:["📨","Demandes","Contacts institutionnels"]}
    },
    it:{
      managementNav:"Gestione",
      management:"Gestione accademica",publicTag:"GESTIONE ACCADEMICA",publicTitle:"La tua classe in un unico posto",publicIntro:"Crea una classe o inserisci il codice del tuo insegnante.",teacherTag:"INSEGNANTI",teacherTitle:"Crea e organizza le tue classi",teacherBody:"Condividi un codice, assegna attività, usa la ruota e controlla i progressi di ogni studente.",workspaceLabel:"Nome del tuo spazio",signIn:"Accedi con Google",openPanel:"Apri il mio pannello",createSpace:"Crea il mio spazio docente",studentTag:"STUDENTI",studentTitle:"Entra nella tua classe",studentBody:"Usa il codice dell’insegnante. Poi vedrai classi, compiti e progressi.",classCode:"Codice della classe",join:"Entra",viewLearning:"Vedi le mie classi e i progressi →",liveStarted:"L’attività è già iniziata?",livePin:"PIN di 6 cifre",enterLive:"Entra dal vivo",myClasses:"Le mie classi",myClassesBody:"Classi, compiti e progressi collegati al tuo account.",openLearning:"Apri il mio apprendimento",defaultClass:"Classe di guaraní",defaultWorkspace:"Aula di guaraní",
      toolsTab:"Ruota e domande",toolsTitle:"Ruota e domande",toolsBody:"Prepara attività testuali da proiettare o condividere in classe.",createLive:"Crea attività con PIN →",wheelTag:"RUOTA",wheelTitle:"Ruota senza ripetizioni",wheelBody:"Aggiungi nomi, parole, frasi o domande, una per riga. Ogni risultato appare una sola volta.",title:"Titolo",wheelDefault:"Ruota della classe",options:"Opzioni",saveWheel:"Salva ruota",reset:"Ripristina opzioni",spin:"Gira →",emptyWheel:"Ruota vuota",addTwo:"Aggiungi almeno due opzioni.",questionsTag:"DOMANDE",questionsTitle:"Banca delle domande",questionsBody:"Scrivi una domanda e la risposta per riga, separate da |.",questionsDefault:"Domande della classe",questionsInput:"Domande e risposte",saveQuestions:"Salva domande",savedTitle:"Attività salvate",savedBody:"Puoi riaprirle, modificarle o eliminarle.",reload:"Aggiorna",noSaved:"Non ci sono ancora attività salvate.",edit:"Modifica",remove:"Elimina",wheelType:"🎡 Ruota",questionsType:"🎓 Domande",itemOne:"elemento",itemMany:"elementi",loadingActivities:"Caricamento delle attività…",loadError:"Impossibile caricare le attività.",completeFields:"Completa il titolo e il contenuto.",questionFormat:"Ogni riga deve contenere: Domanda | Risposta",saving:"Salvataggio…",saved:"Attività salvata.",saveError:"Impossibile salvare. Controlla la connessione.",resetDone:"Opzioni ripristinate.",addOne:"Aggiungi almeno un’opzione.",spinning:"La ruota gira…",result:"Risultato: {item}",removedResult:"{item} è stato rimosso. Ne restano {count}.",finalResult:"{item} era l’ultima opzione. Ripristina la ruota per giocare ancora.",confirmRemove:"Eliminare “{title}”?",
      adminTag:"AMMINISTRAZIONE NALVI",teacherPanelTag:"IL MIO SPAZIO DOCENTE",adminTitle:"Pannello di amministrazione",teacherPanelTitle:"Gestione accademica",adminIntro:"Consulta tutti gli studenti iscritti e gestisci istituzioni, classi e insegnanti.",teacherPanelIntro:"Classi, attività e studenti in un unico spazio semplice.",security:"Ogni classe e i suoi progressi sono protetti dall’account e dal codice di accesso.",createClass:"Crea una classe",createClassBody:"Assegna un nome e condividi il codice. Non devi aggiungere gli studenti uno per uno.",studentEmails:"E-mail degli studenti (facoltative)",
      tabs:{summary:["🏠","Home","Studenti e progressi"],adminSummary:["🛡️","Tutti gli studenti","Controlla le iscrizioni"],groups:["👥","Classi","Codici e studenti"],assignments:["📝","Compiti","Assegna lezioni"],assessments:["📈","Progressi","Risultati e valutazioni"],live:["🎯","Attività con PIN","Pratica dal vivo"],tools:["🎡","Ruota e domande","Strumenti per la classe"],certificates:["🏅","Certificati","Richieste e rilascio"],institution:["🏫","Il mio spazio","Insegnanti e responsabili"],adminInstitution:["🏫","Istituzioni","Responsabili e insegnanti"],leads:["📨","Richieste","Contatti istituzionali"]}
    },
    de:{
      managementNav:"Verwaltung",
      management:"Akademische Verwaltung",publicTag:"AKADEMISCHE VERWALTUNG",publicTitle:"Dein Klassenraum an einem Ort",publicIntro:"Erstelle eine Klasse oder gib den Code deiner Lehrkraft ein.",teacherTag:"LEHRKRÄFTE",teacherTitle:"Klassen erstellen und organisieren",teacherBody:"Teile einen Code, weise Aktivitäten zu, nutze das Glücksrad und prüfe den Lernfortschritt.",workspaceLabel:"Name deines Bereichs",signIn:"Mit Google anmelden",openPanel:"Dashboard öffnen",createSpace:"Lehrbereich erstellen",studentTag:"LERNENDE",studentTitle:"Deiner Klasse beitreten",studentBody:"Nutze den Code deiner Lehrkraft. Danach siehst du Klassen, Aufgaben und Fortschritt.",classCode:"Klassencode",join:"Beitreten",viewLearning:"Meine Klassen und Fortschritte →",liveStarted:"Hat die Aktivität schon begonnen?",livePin:"6-stellige PIN",enterLive:"Live beitreten",myClasses:"Meine Klassen",myClassesBody:"Klassen, Aufgaben und Fortschritt deines Kontos.",openLearning:"Lernbereich öffnen",defaultClass:"Guaraní-Klasse",defaultWorkspace:"Guaraní-Klassenraum",
      toolsTab:"Glücksrad und Fragen",toolsTitle:"Glücksrad und Fragen",toolsBody:"Bereite Textaktivitäten zum Projizieren oder Teilen im Unterricht vor.",createLive:"Aktivität mit PIN erstellen →",wheelTag:"GLÜCKSRAD",wheelTitle:"Glücksrad ohne Wiederholungen",wheelBody:"Füge Namen, Wörter, Sätze oder Fragen zeilenweise hinzu. Jedes Ergebnis erscheint nur einmal.",title:"Titel",wheelDefault:"Klassen-Glücksrad",options:"Optionen",saveWheel:"Glücksrad speichern",reset:"Optionen zurücksetzen",spin:"Drehen →",emptyWheel:"Leeres Glücksrad",addTwo:"Füge mindestens zwei Optionen hinzu.",questionsTag:"FRAGEN",questionsTitle:"Fragensammlung",questionsBody:"Schreibe pro Zeile eine Frage und Antwort, getrennt durch |.",questionsDefault:"Fragen der Klasse",questionsInput:"Fragen und Antworten",saveQuestions:"Fragen speichern",savedTitle:"Gespeicherte Aktivitäten",savedBody:"Du kannst sie öffnen, bearbeiten oder löschen.",reload:"Aktualisieren",noSaved:"Noch keine Aktivitäten gespeichert.",edit:"Bearbeiten",remove:"Löschen",wheelType:"🎡 Glücksrad",questionsType:"🎓 Fragen",itemOne:"Element",itemMany:"Elemente",loadingActivities:"Aktivitäten werden geladen…",loadError:"Die Aktivitäten konnten nicht geladen werden.",completeFields:"Fülle Titel und Inhalt aus.",questionFormat:"Jede Zeile muss enthalten: Frage | Antwort",saving:"Wird gespeichert…",saved:"Aktivität gespeichert.",saveError:"Speichern nicht möglich. Prüfe die Verbindung.",resetDone:"Optionen zurückgesetzt.",addOne:"Füge mindestens eine Option hinzu.",spinning:"Das Rad dreht sich…",result:"Ergebnis: {item}",removedResult:"{item} wurde entfernt. {count} verbleiben.",finalResult:"{item} war die letzte Option. Setze das Rad zurück, um erneut zu spielen.",confirmRemove:"„{title}“ löschen?",
      adminTag:"NALVI-VERWALTUNG",teacherPanelTag:"MEIN LEHRBEREICH",adminTitle:"Verwaltungsübersicht",teacherPanelTitle:"Akademische Verwaltung",adminIntro:"Prüfe alle eingeschriebenen Lernenden und verwalte Institutionen, Klassen und Lehrkräfte.",teacherPanelIntro:"Klassen, Aktivitäten und Lernende übersichtlich an einem Ort.",security:"Jede Klasse und ihr Fortschritt sind durch Konto und Zugangscode geschützt.",createClass:"Klasse erstellen",createClassBody:"Gib ihr einen Namen und teile den Code. Lernende müssen nicht einzeln hinzugefügt werden.",studentEmails:"E-Mails der Lernenden (optional)",
      tabs:{summary:["🏠","Übersicht","Lernende und Fortschritt"],adminSummary:["🛡️","Alle Lernenden","Einschreibungen prüfen"],groups:["👥","Klassen","Codes und Lernende"],assignments:["📝","Aufgaben","Lektionen zuweisen"],assessments:["📈","Fortschritt","Ergebnisse und Tests"],live:["🎯","PIN-Aktivität","Live-Übung"],tools:["🎡","Glücksrad und Fragen","Werkzeuge für den Unterricht"],certificates:["🏅","Zertifikate","Anträge und Ausstellung"],institution:["🏫","Mein Bereich","Lehrkräfte und Verwaltung"],adminInstitution:["🏫","Institutionen","Verantwortliche und Lehrkräfte"],leads:["📨","Anfragen","Institutionelle Kontakte"]}
    }
  };
  const LIBRARY_COPY={
    es:{tab:["📚","Biblioteca docente","Contenido y creador"],title:"Biblioteca docente",body:"Usa el contenido de NALVI o prepara una actividad con tu propio material.",nalviTitle:"Contenido NALVI",nalviBody:"Cursos, diccionario con audio y práctica auditiva listos para consultar en clase.",catalog:"Cursos y lecciones",catalogBody:"Guaraní general y rutas especializadas organizadas por objetivos.",dictionary:"Diccionario con audio",dictionaryBody:"Vocabulario consultable con pronunciaciones humanas disponibles.",listening:"Práctica auditiva",listeningBody:"Actividades construidas con las 99 grabaciones humanas autorizadas.",open:"Abrir",creatorTag:"CREADOR DOCENTE",creatorTitle:"De tu contenido a una actividad",creatorBody:"Pega una idea por línea usando “término = explicación” o “pregunta | respuesta”. NALVI conserva tus respuestas y crea un borrador para que lo revises.",materialTitle:"Título del material",materialTitleDefault:"Actividad de mi clase",materialContent:"Contenido",materialPlaceholder:"Maitei = Saludo\n¿Mba’éichapa reime? | ¿Cómo estás?",generate:"Crear borrador",format:"Agrega al menos una línea como “término = explicación” o “pregunta | respuesta”.",generated:"Borrador listo: {count} preguntas. Revísalo antes de guardarlo.",ignored:" {count} líneas necesitan el formato indicado.",preview:"Vista previa",useDraft:"Revisar en el banco de preguntas →",draftReady:"Borrador creado desde tu material. Revísalo antes de guardarlo.",questionTemplate:"¿Qué significa «{term}»?"},
    en:{tab:["📚","Teacher library","Content and creator"],title:"Teacher library",body:"Use NALVI content or prepare an activity with your own material.",nalviTitle:"NALVI content",nalviBody:"Courses, the audio dictionary, and listening practice ready for class.",catalog:"Courses and lessons",catalogBody:"General Guaraní and specialized pathways organized by objective.",dictionary:"Audio dictionary",dictionaryBody:"Searchable vocabulary with available human pronunciations.",listening:"Listening practice",listeningBody:"Activities built from 99 authorized human recordings.",open:"Open",creatorTag:"TEACHER CREATOR",creatorTitle:"Turn your content into an activity",creatorBody:"Paste one idea per line using “term = explanation” or “question | answer”. NALVI keeps your answers and creates a draft for your review.",materialTitle:"Material title",materialTitleDefault:"My class activity",materialContent:"Content",materialPlaceholder:"Maitei = Greeting\nWhat does Mba’éichapa reime mean? | How are you?",generate:"Create draft",format:"Add at least one line as “term = explanation” or “question | answer”.",generated:"Draft ready: {count} questions. Review it before saving.",ignored:" {count} lines need the indicated format.",preview:"Preview",useDraft:"Review in the question bank →",draftReady:"Draft created from your material. Review it before saving.",questionTemplate:"What does “{term}” mean?"},
    pt:{tab:["📚","Biblioteca docente","Conteúdo e criador"],title:"Biblioteca docente",body:"Use o conteúdo da NALVI ou prepare uma atividade com seu próprio material.",nalviTitle:"Conteúdo NALVI",nalviBody:"Cursos, dicionário com áudio e prática auditiva prontos para a aula.",catalog:"Cursos e lições",catalogBody:"Guarani geral e trilhas especializadas organizadas por objetivos.",dictionary:"Dicionário com áudio",dictionaryBody:"Vocabulário pesquisável com pronúncias humanas disponíveis.",listening:"Prática auditiva",listeningBody:"Atividades criadas com 99 gravações humanas autorizadas.",open:"Abrir",creatorTag:"CRIADOR DOCENTE",creatorTitle:"Do seu conteúdo para uma atividade",creatorBody:"Cole uma ideia por linha usando “termo = explicação” ou “pergunta | resposta”. A NALVI mantém suas respostas e cria um rascunho para sua revisão.",materialTitle:"Título do material",materialTitleDefault:"Atividade da minha turma",materialContent:"Conteúdo",materialPlaceholder:"Maitei = Saudação\nO que significa Mba’éichapa reime? | Como você está?",generate:"Criar rascunho",format:"Adicione pelo menos uma linha como “termo = explicação” ou “pergunta | resposta”.",generated:"Rascunho pronto: {count} perguntas. Revise antes de salvar.",ignored:" {count} linhas precisam do formato indicado.",preview:"Prévia",useDraft:"Revisar no banco de perguntas →",draftReady:"Rascunho criado a partir do seu material. Revise antes de salvar.",questionTemplate:"O que significa “{term}”?"},
    fr:{tab:["📚","Bibliothèque enseignant","Contenu et créateur"],title:"Bibliothèque enseignant",body:"Utilisez le contenu NALVI ou préparez une activité avec votre propre matériel.",nalviTitle:"Contenu NALVI",nalviBody:"Cours, dictionnaire audio et pratique d’écoute prêts pour la classe.",catalog:"Cours et leçons",catalogBody:"Guarani général et parcours spécialisés organisés par objectifs.",dictionary:"Dictionnaire audio",dictionaryBody:"Vocabulaire consultable avec des prononciations humaines disponibles.",listening:"Pratique d’écoute",listeningBody:"Activités créées à partir de 99 enregistrements humains autorisés.",open:"Ouvrir",creatorTag:"CRÉATEUR ENSEIGNANT",creatorTitle:"Transformez votre contenu en activité",creatorBody:"Collez une idée par ligne au format « terme = explication » ou « question | réponse ». NALVI conserve vos réponses et crée un brouillon à vérifier.",materialTitle:"Titre du matériel",materialTitleDefault:"Activité de ma classe",materialContent:"Contenu",materialPlaceholder:"Maitei = Salutation\nQue signifie Mba’éichapa reime ? | Comment vas-tu ?",generate:"Créer le brouillon",format:"Ajoutez au moins une ligne au format « terme = explication » ou « question | réponse ».",generated:"Brouillon prêt : {count} questions. Vérifiez-le avant de l’enregistrer.",ignored:" {count} lignes doivent respecter le format indiqué.",preview:"Aperçu",useDraft:"Vérifier dans la banque de questions →",draftReady:"Brouillon créé à partir de votre matériel. Vérifiez-le avant de l’enregistrer.",questionTemplate:"Que signifie « {term} » ?"},
    it:{tab:["📚","Biblioteca docente","Contenuti e creatore"],title:"Biblioteca docente",body:"Usa i contenuti NALVI o prepara un’attività con il tuo materiale.",nalviTitle:"Contenuti NALVI",nalviBody:"Corsi, dizionario audio e pratica d’ascolto pronti per la classe.",catalog:"Corsi e lezioni",catalogBody:"Guaraní generale e percorsi specializzati organizzati per obiettivi.",dictionary:"Dizionario audio",dictionaryBody:"Vocabolario consultabile con pronunce umane disponibili.",listening:"Pratica d’ascolto",listeningBody:"Attività create con 99 registrazioni umane autorizzate.",open:"Apri",creatorTag:"CREATORE DOCENTE",creatorTitle:"Dal tuo contenuto a un’attività",creatorBody:"Incolla un’idea per riga usando “termine = spiegazione” o “domanda | risposta”. NALVI conserva le tue risposte e crea una bozza da verificare.",materialTitle:"Titolo del materiale",materialTitleDefault:"Attività della mia classe",materialContent:"Contenuto",materialPlaceholder:"Maitei = Saluto\nCosa significa Mba’éichapa reime? | Come stai?",generate:"Crea bozza",format:"Aggiungi almeno una riga come “termine = spiegazione” o “domanda | risposta”.",generated:"Bozza pronta: {count} domande. Verificala prima di salvarla.",ignored:" {count} righe richiedono il formato indicato.",preview:"Anteprima",useDraft:"Verifica nella banca delle domande →",draftReady:"Bozza creata dal tuo materiale. Verificala prima di salvarla.",questionTemplate:"Cosa significa “{term}”?"},
    de:{tab:["📚","Lehrbibliothek","Inhalte und Ersteller"],title:"Lehrbibliothek",body:"Nutze NALVI-Inhalte oder erstelle eine Aktivität mit deinem eigenen Material.",nalviTitle:"NALVI-Inhalte",nalviBody:"Kurse, Audiowörterbuch und Hörübungen für den Unterricht.",catalog:"Kurse und Lektionen",catalogBody:"Allgemeines Guaraní und spezialisierte Lernwege nach Zielen.",dictionary:"Audiowörterbuch",dictionaryBody:"Durchsuchbarer Wortschatz mit verfügbaren menschlichen Aufnahmen.",listening:"Hörübungen",listeningBody:"Aktivitäten aus 99 autorisierten menschlichen Aufnahmen.",open:"Öffnen",creatorTag:"LEHRKRAFT-ERSTELLER",creatorTitle:"Vom eigenen Inhalt zur Aktivität",creatorBody:"Füge pro Zeile eine Idee als „Begriff = Erklärung“ oder „Frage | Antwort“ ein. NALVI übernimmt deine Antworten und erstellt einen Entwurf zur Prüfung.",materialTitle:"Titel des Materials",materialTitleDefault:"Aktivität meiner Klasse",materialContent:"Inhalt",materialPlaceholder:"Maitei = Begrüßung\nWas bedeutet Mba’éichapa reime? | Wie geht es dir?",generate:"Entwurf erstellen",format:"Füge mindestens eine Zeile als „Begriff = Erklärung“ oder „Frage | Antwort“ hinzu.",generated:"Entwurf fertig: {count} Fragen. Prüfe ihn vor dem Speichern.",ignored:" {count} Zeilen benötigen das angegebene Format.",preview:"Vorschau",useDraft:"In der Fragensammlung prüfen →",draftReady:"Entwurf aus deinem Material erstellt. Prüfe ihn vor dem Speichern.",questionTemplate:"Was bedeutet „{term}“?"}
  };
  const RESOURCE_COPY={
    es:{tab:["🔊","Audios","Buscar y escuchar"],title:"Biblioteca de audio",body:"Busca una palabra en guaraní y escucha su pronunciación.",search:"Buscar una palabra",searchPlaceholder:"Ej.: maitei, jagua, aguyje",loading:"Cargando audios…",prompt:"Escribe para buscar o elige una palabra.",empty:"No encontramos un audio para esa búsqueda.",play:"Escuchar {term}",menu:"Menú docente",collapse:"Ocultar menú",expand:"Mostrar menú",workspaceTitle:"Mi aula",workspaceIntro:"Clases, alumnos y actividades.",startTitle:"Comienza por crear una clase",startBody:"Ponle un nombre y comparte el código con tus alumnos.",createClass:"Crear una clase",today:"Tu aula hoy",classesOne:"1 clase activa",classesMany:"{count} clases activas",studentsOne:"1 alumno inscrito",studentsMany:"{count} alumnos inscritos",tasksOne:"1 tarea asignada",tasksMany:"{count} tareas asignadas",studentsTitle:"Alumnos",studentsBody:"Busca por nombre o correo y revisa su progreso.",export:"Exportar datos"},
    en:{tab:["🔊","Audio","Search and listen"],title:"Audio library",body:"Search for a word in Guaraní and listen to its pronunciation.",search:"Search for a word",searchPlaceholder:"For example: maitei, jagua, aguyje",loading:"Loading audio…",prompt:"Type to search or choose a word.",empty:"We could not find audio for that search.",play:"Listen to {term}",menu:"Teacher menu",collapse:"Hide menu",expand:"Show menu",workspaceTitle:"My classroom",workspaceIntro:"Classes, learners, and activities.",startTitle:"Start by creating a class",startBody:"Give it a name and share the code with your learners.",createClass:"Create a class",today:"Your classroom today",classesOne:"1 active class",classesMany:"{count} active classes",studentsOne:"1 enrolled learner",studentsMany:"{count} enrolled learners",tasksOne:"1 assigned task",tasksMany:"{count} assigned tasks",studentsTitle:"Learners",studentsBody:"Search by name or email and review progress.",export:"Export data"},
    pt:{tab:["🔊","Áudios","Buscar e ouvir"],title:"Biblioteca de áudio",body:"Busque uma palavra em guarani e ouça sua pronúncia.",search:"Buscar uma palavra",searchPlaceholder:"Ex.: maitei, jagua, aguyje",loading:"Carregando áudios…",prompt:"Digite para buscar ou escolha uma palavra.",empty:"Não encontramos áudio para essa busca.",play:"Ouvir {term}",menu:"Menu docente",collapse:"Ocultar menu",expand:"Mostrar menu",workspaceTitle:"Minha sala",workspaceIntro:"Turmas, alunos e atividades.",startTitle:"Comece criando uma turma",startBody:"Dê um nome e compartilhe o código com seus alunos.",createClass:"Criar uma turma",today:"Sua sala hoje",classesOne:"1 turma ativa",classesMany:"{count} turmas ativas",studentsOne:"1 aluno inscrito",studentsMany:"{count} alunos inscritos",tasksOne:"1 tarefa atribuída",tasksMany:"{count} tarefas atribuídas",studentsTitle:"Alunos",studentsBody:"Busque por nome ou e-mail e acompanhe o progresso.",export:"Exportar dados"},
    fr:{tab:["🔊","Audios","Rechercher et écouter"],title:"Bibliothèque audio",body:"Recherchez un mot en guarani et écoutez sa prononciation.",search:"Rechercher un mot",searchPlaceholder:"Ex. : maitei, jagua, aguyje",loading:"Chargement des audios…",prompt:"Saisissez un mot ou choisissez-en un.",empty:"Aucun audio ne correspond à cette recherche.",play:"Écouter {term}",menu:"Menu enseignant",collapse:"Masquer le menu",expand:"Afficher le menu",workspaceTitle:"Ma classe",workspaceIntro:"Classes, élèves et activités.",startTitle:"Commencez par créer une classe",startBody:"Donnez-lui un nom et partagez le code avec vos élèves.",createClass:"Créer une classe",today:"Votre classe aujourd’hui",classesOne:"1 classe active",classesMany:"{count} classes actives",studentsOne:"1 élève inscrit",studentsMany:"{count} élèves inscrits",tasksOne:"1 devoir attribué",tasksMany:"{count} devoirs attribués",studentsTitle:"Élèves",studentsBody:"Recherchez par nom ou e-mail et consultez les progrès.",export:"Exporter les données"},
    it:{tab:["🔊","Audio","Cerca e ascolta"],title:"Biblioteca audio",body:"Cerca una parola in guaraní e ascolta la pronuncia.",search:"Cerca una parola",searchPlaceholder:"Es.: maitei, jagua, aguyje",loading:"Caricamento audio…",prompt:"Scrivi per cercare o scegli una parola.",empty:"Nessun audio corrisponde alla ricerca.",play:"Ascolta {term}",menu:"Menu docente",collapse:"Nascondi menu",expand:"Mostra menu",workspaceTitle:"La mia classe",workspaceIntro:"Classi, studenti e attività.",startTitle:"Inizia creando una classe",startBody:"Assegna un nome e condividi il codice con gli studenti.",createClass:"Crea una classe",today:"La tua classe oggi",classesOne:"1 classe attiva",classesMany:"{count} classi attive",studentsOne:"1 studente iscritto",studentsMany:"{count} studenti iscritti",tasksOne:"1 compito assegnato",tasksMany:"{count} compiti assegnati",studentsTitle:"Studenti",studentsBody:"Cerca per nome o e-mail e controlla i progressi.",export:"Esporta dati"},
    de:{tab:["🔊","Audio","Suchen und anhören"],title:"Audiobibliothek",body:"Suche ein Wort auf Guaraní und höre seine Aussprache.",search:"Wort suchen",searchPlaceholder:"Zum Beispiel: maitei, jagua, aguyje",loading:"Audios werden geladen…",prompt:"Suche oder wähle ein Wort.",empty:"Für diese Suche wurde kein Audio gefunden.",play:"{term} anhören",menu:"Lehrkraft-Menü",collapse:"Menü ausblenden",expand:"Menü anzeigen",workspaceTitle:"Mein Klassenraum",workspaceIntro:"Klassen, Lernende und Aktivitäten.",startTitle:"Erstelle zuerst eine Klasse",startBody:"Gib ihr einen Namen und teile den Code mit den Lernenden.",createClass:"Klasse erstellen",today:"Dein Klassenraum heute",classesOne:"1 aktive Klasse",classesMany:"{count} aktive Klassen",studentsOne:"1 eingeschriebene Person",studentsMany:"{count} eingeschriebene Personen",tasksOne:"1 zugewiesene Aufgabe",tasksMany:"{count} zugewiesene Aufgaben",studentsTitle:"Lernende",studentsBody:"Nach Name oder E-Mail suchen und Fortschritt prüfen.",export:"Daten exportieren"}
  };
  function locale(){const value=String($("#headerLang")?.value||$("#lang")?.value||document.documentElement.lang||"es").toLowerCase().slice(0,2);return COPY[value]?value:"es"}
  function copy(){return COPY[locale()]||COPY.es}
  function libraryCopy(){return{...(LIBRARY_COPY[locale()]||LIBRARY_COPY.es),...(RESOURCE_COPY[locale()]||RESOURCE_COPY.es)}}
  function formatCopy(value,replacements={}){return String(value||"").replace(/\{(\w+)\}/g,(_,key)=>String(replacements[key]??""))}
  let firebase=null;
  let savedActivities=[];
  let studentClasses=[];
  let editing={wheel:"",assessment:""};
  let wheelRotation=0;
  let wheelItems=[];
  let wheelOriginalItems=[];
  let wheelSpinning=false;
  let pendingQuestionDraft=null;
  let teacherAudioItems=[];
  let lastJoinedClassCode="";
  let restoringIntent=false;

  function currentUser(){return firebase?.auth?.currentUser||window.GCA_FIREBASE_LIVE?.auth?.currentUser||null}
  function signedIn(){const user=currentUser();return !!user&&!user.isAnonymous}
  function canManage(){return window.GESA_CONTEXT?.canManage===true}
  function institutionId(){return String(window.GESA_CONTEXT?.institutionId||"")}
  function setStatus(selector,message,error=false){const node=$(selector);if(!node)return;node.textContent=message;node.classList.toggle("error",error);node.classList.toggle("ok",!!message&&!error)}
  function waitForFirebase(){if(window.GCA_FIREBASE_LIVE)return Promise.resolve(window.GCA_FIREBASE_LIVE);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("firebase-timeout")),12000);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true})})}
  function waitForGesa(){if(window.GESA?.joinGroupByCode)return Promise.resolve(window.GESA);return new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{attempts+=1;if(window.GESA?.joinGroupByCode){clearInterval(timer);resolve(window.GESA)}else if(attempts>=80){clearInterval(timer);reject(new Error("academic-service-timeout"))}},100)})}
  function rememberIntent(kind,value=""){try{sessionStorage.setItem(INTENT_KEY,JSON.stringify({kind,value,createdAt:Date.now()}))}catch{}}
  function readIntent(){try{const value=JSON.parse(sessionStorage.getItem(INTENT_KEY)||"null");if(!value||Date.now()-Number(value.createdAt||0)>15*60*1000)return null;return value}catch{return null}}
  function clearIntent(){try{sessionStorage.removeItem(INTENT_KEY)}catch{}}
  function requestLogin(kind,value=""){rememberIntent(kind,value);window.show?.("institutions",true);window.courseGoogleLogin?.()}

  function publicHubMarkup(){
    const user=currentUser(),c=copy(),action=!signedIn()?c.signIn:canManage()?c.openPanel:c.createSpace;
    const workspaceName=user?.displayName?`${c.defaultWorkspace} · ${user.displayName}`:c.defaultWorkspace;
    return `<section class="nalvi-academic-entry" id="nalviAcademicEntry"><article class="nalvi-academic-entry-card teacher"><span class="nalvi-academic-entry-icon" aria-hidden="true">🏫</span><div><small>${esc(c.teacherTag)}</small><h3>${esc(c.teacherTitle)}</h3><p>${esc(c.teacherBody)}</p>${signedIn()&&!canManage()?`<label>${esc(c.workspaceLabel)}<input id="nalviAcademicWorkspaceName" maxlength="160" value="${esc(workspaceName)}"></label>`:""}<button class="btn" id="nalviAcademicStart" type="button">${esc(action)} →</button><div class="gesa-form-status" id="nalviAcademicStartStatus" role="status" aria-live="polite"></div></div></article><article class="nalvi-academic-entry-card student"><span class="nalvi-academic-entry-icon" aria-hidden="true">👥</span><div><small>${esc(c.studentTag)}</small><h3>${esc(c.studentTitle)}</h3><p>${esc(c.studentBody)}</p><div class="nalvi-academic-pin-row class-code"><input id="nalviAcademicClassCode" maxlength="10" autocomplete="off" autocapitalize="characters" placeholder="GCA-ABC123" aria-label="${esc(c.classCode)}"><button class="mini-btn" id="nalviAcademicJoinClass" type="button">${esc(c.join)}</button></div><div class="gesa-form-status" id="nalviAcademicClassStatus" role="status" aria-live="polite"></div>${signedIn()?`<button class="nalvi-student-progress-link" id="nalviAcademicOpenLearning" type="button">${esc(c.viewLearning)}</button>`:""}<div class="nalvi-academic-live-entry"><b>${esc(c.liveStarted)}</b><div class="nalvi-academic-pin-row"><input id="nalviAcademicLivePin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="${esc(c.livePin)}" aria-label="${esc(c.livePin)}"><button class="mini-btn" id="nalviAcademicJoinLive" type="button">${esc(c.enterLive)}</button></div><div class="gesa-form-status" id="nalviAcademicJoinStatus" role="status" aria-live="polite"></div></div></div></article></section><section class="nalvi-student-class-section" id="nalviStudentClassSection" hidden><div class="gesa-section-head"><div><h3>${esc(c.myClasses)}</h3><p>${esc(c.myClassesBody)}</p></div><button class="mini-btn" id="nalviAcademicOpenProgress" type="button">${esc(c.openLearning)}</button></div><div class="nalvi-student-class-list" id="nalviStudentClassList"></div></section>`;
  }

  function installPublicHub(){
    const page=$("#institutions");if(!page)return;
    $("#gesaPilotJump",page)?.remove();$("#gesaPilotCard",page)?.remove();
    const hero=$(".gesa-hero",page);
    if(hero){
      const tag=$(".tag",hero),title=$("h2",hero),intro=$("p",hero);
      const c=copy();
      if(tag){tag.removeAttribute("data-gesa");tag.textContent=c.publicTag}
      if(title){title.removeAttribute("data-gesa");title.textContent=c.publicTitle}
      if(intro){intro.removeAttribute("data-gesa");intro.textContent=c.publicIntro}
      $(".gesa-hero-visual",hero)?.remove();
    }
    $$("#institutions .shell > .gesa-grid").forEach(grid=>grid.hidden=true);
    $("#nalviAcademicEntry")?.remove();$("#nalviStudentClassSection")?.remove();hero?.insertAdjacentHTML("afterend",publicHubMarkup());
    $("#nalviAcademicStart")?.addEventListener("click",startAcademicSpace);
    $("#nalviAcademicJoinClass")?.addEventListener("click",joinClassByCode);
    $("#nalviAcademicJoinLive")?.addEventListener("click",joinLiveByPin);
    $("#nalviAcademicOpenLearning")?.addEventListener("click",()=>window.show?.("progressHub",true));
    $("#nalviAcademicOpenProgress")?.addEventListener("click",()=>window.show?.("progressHub",true));
    const sharedCode=normalizeClassCode(new URLSearchParams(location.search).get("grupo")||"");
    if(sharedCode)$("#nalviAcademicClassCode").value=sharedCode;
    $("#nalviAcademicClassCode")?.addEventListener("input",event=>{event.target.value=normalizeClassCode(event.target.value)});
    $("#nalviAcademicClassCode")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();joinClassByCode()}});
    $("#nalviAcademicLivePin")?.addEventListener("input",event=>{event.target.value=normalizeLivePin(event.target.value)});
    $("#nalviAcademicLivePin")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();joinLiveByPin()}});
    loadStudentClasses();
  }

  async function startAcademicSpace(){
    if(!signedIn()){requestLogin("teacher");return}
    if(canManage()){clearIntent();window.show?.("institutional",true);setTimeout(()=>$("#nalviAcademicQuickStart")?.scrollIntoView({behavior:"smooth",block:"start"}),0);return}
    const button=$("#nalviAcademicStart"),user=currentUser(),name=$("#nalviAcademicWorkspaceName")?.value.trim()||`Aula de ${user.displayName||"guaraní"}`;
    if(name.length<2){setStatus("#nalviAcademicStartStatus","Escribe un nombre para tu espacio.",true);return}
    button.disabled=true;setStatus("#nalviAcademicStartStatus","Creando tu espacio…");
    try{
      const id=`self__${user.uid}`,institutionRef=firebase.doc(firebase.db,"institutions",id),membershipRef=firebase.doc(firebase.db,"institutionMembers",`${id}__${user.uid}`),institutionSnapshot=await firebase.getDoc(institutionRef);
      if(!institutionSnapshot.exists())await firebase.setDoc(institutionRef,{name:name.slice(0,160),country:"",active:true,status:"active",ownerUid:user.uid,selfService:true,createdBy:user.uid,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
      const membershipSnapshot=await firebase.getDoc(membershipRef);
      if(!membershipSnapshot.exists())await firebase.setDoc(membershipRef,{institutionId:id,uid:user.uid,claimedUid:user.uid,email:String(user.email||"").trim().toLowerCase(),name:String(user.displayName||name).slice(0,120),role:"institution_manager",active:true,selfService:true,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
      rememberIntent("openDashboard");setStatus("#nalviAcademicStartStatus","Listo. Abriendo tu panel…");setTimeout(()=>location.reload(),350);
    }catch(error){console.error("NALVI_ACADEMIC_SETUP",error);setStatus("#nalviAcademicStartStatus","No se pudo crear. Revisa la conexión y vuelve a intentarlo.",true);button.disabled=false}
  }

  async function joinClassByCode(){
    const code=normalizeClassCode($("#nalviAcademicClassCode")?.value||readIntent()?.value||"");
    if(!/^GCA-[A-Z0-9]{6}$/.test(code)){setStatus("#nalviAcademicClassStatus","Escribe un código como GCA-ABC123.",true);return}
    if(!signedIn()){requestLogin("joinClass",code);return}
    const button=$("#nalviAcademicJoinClass");if(button)button.disabled=true;setStatus("#nalviAcademicClassStatus","Buscando tu clase…");
    try{
      const gesa=await waitForGesa(),joined=await gesa.joinGroupByCode(code,currentUser());
      if(!joined&&lastJoinedClassCode!==code)throw new Error("invalid-class-code");
      clearIntent();setStatus("#nalviAcademicClassStatus","¡Listo! Ya estás dentro de la clase.");await loadStudentClasses();
      setTimeout(()=>$("#nalviStudentClassSection")?.scrollIntoView({behavior:"smooth",block:"start"}),100);
    }catch(error){console.error("NALVI_ACADEMIC_CLASS_JOIN",error);setStatus("#nalviAcademicClassStatus","No encontramos una clase activa con ese código.",true)}
    finally{if(button)button.disabled=false}
  }

  function handleGroupJoined(event){
    const code=normalizeClassCode(event?.detail?.code||"");if(!code)return;
    lastJoinedClassCode=code;const input=$("#nalviAcademicClassCode");if(input)input.value=code;
    const intent=readIntent();if(intent?.kind==="joinClass"&&normalizeClassCode(intent.value)===code)clearIntent();
    setStatus("#nalviAcademicClassStatus",`¡Listo! Te uniste a ${event.detail?.groupName||"la clase"}.`);
    loadStudentClasses();
  }

  function joinLiveByPin(){
    const pin=normalizeLivePin($("#nalviAcademicLivePin")?.value||readIntent()?.value||"");
    if(pin.length!==6){setStatus("#nalviAcademicJoinStatus","Escribe los seis números del PIN.",true);return}
    if(!signedIn()){requestLogin("joinLive",pin);return}
    clearIntent();$("#gca68LiveHome")?.click();
    setTimeout(()=>{$("#gca68OpenJoin")?.click();setTimeout(()=>{const input=$("#gca68Pin");if(input){input.value=pin;input.focus()}},0)},0);
  }

  async function loadStudentClasses(){
    const section=$("#nalviStudentClassSection"),root=$("#nalviStudentClassList");if(!section||!root)return;
    if(!signedIn()){studentClasses=[];section.hidden=true;return}
    try{
      const email=String(currentUser().email||"").trim().toLowerCase();if(!email){section.hidden=true;return}
      const snapshot=await firebase.getDocs(firebase.query(firebase.collection(firebase.db,"enrollments"),firebase.where("studentEmail","==",email)));
      studentClasses=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.active!==false);renderStudentClasses();
    }catch(error){console.info("NALVI_ACADEMIC_STUDENT_CLASSES",error?.code||error);section.hidden=true}
  }

  function renderStudentClasses(){
    const section=$("#nalviStudentClassSection"),root=$("#nalviStudentClassList");if(!section||!root)return;section.hidden=!studentClasses.length;
    const c=copy();
    root.innerHTML=studentClasses.map(item=>`<article class="nalvi-student-class"><span aria-hidden="true">📚</span><div><h4>${esc(item.groupName||c.defaultClass)}</h4><p>${esc(courseLabel(item.courseId))}${item.teacherName?` · ${esc(item.teacherName)}`:""}</p>${item.inviteCode?`<code>${esc(item.inviteCode)}</code>`:""}</div><button class="mini-btn" type="button" data-academic-class-open="${esc(item.groupId||"")}">${esc(c.openLearning)}</button></article>`).join("");
    $$("[data-academic-class-open]",root).forEach(button=>button.addEventListener("click",()=>window.show?.("progressHub",true)));
  }

  function buildQuestionDraft(value,questionTemplate="¿Qué significa «{term}»?"){
    const items=[],rejected=[];
    cleanLines(value,40).forEach(line=>{
      const pipe=line.indexOf("|");
      if(pipe>0&&pipe<line.length-1){
        const question=line.slice(0,pipe).trim(),answer=line.slice(pipe+1).trim();
        if(question&&answer)items.push({question,answer,source:line});else rejected.push(line);
        return;
      }
      const separators=[line.indexOf("="),line.indexOf(":")].filter(index=>index>0&&index<line.length-1).sort((a,b)=>a-b),separator=separators[0];
      if(separator===undefined){rejected.push(line);return}
      const term=line.slice(0,separator).trim(),answer=line.slice(separator+1).trim();
      if(!term||!answer){rejected.push(line);return}
      items.push({question:formatCopy(questionTemplate,{term}),answer,source:line});
    });
    return{items,rejected,content:items.map(item=>`${item.question} | ${item.answer}`).join("\n")};
  }

  function libraryMarkup(){
    const c=libraryCopy();
    return `<section class="gesa-pane hide nalvi-teacher-library" data-gesa-pane="library"><div class="gesa-section-head"><div><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div></div><article class="gesa-card nalvi-audio-library"><label class="nalvi-audio-library-search">${esc(c.search)}<input id="nalviTeacherAudioSearch" type="search" autocomplete="off" placeholder="${esc(c.searchPlaceholder)}"></label><p class="nalvi-audio-library-status" id="nalviTeacherAudioStatus" role="status" aria-live="polite">${esc(c.loading)}</p><div class="nalvi-audio-library-results" id="nalviTeacherAudioResults"></div></article></section>`;
  }

  function materialCreatorMarkup(){
    const c=libraryCopy();
    return `<article class="gesa-card nalvi-material-creator" data-material-locale="${locale()}"><span class="gesa-status active">${esc(c.creatorTag)}</span><h3>${esc(c.creatorTitle)}</h3><p>${esc(c.creatorBody)}</p><form class="gesa-form" id="nalviMaterialCreator"><label>${esc(c.materialTitle)}<input name="title" maxlength="120" required value="${esc(c.materialTitleDefault)}"></label><label>${esc(c.materialContent)}<textarea name="content" maxlength="8000" required placeholder="${esc(c.materialPlaceholder)}"></textarea></label><button class="btn" type="submit">${esc(c.generate)}</button><div class="gesa-form-status" id="nalviMaterialStatus" role="status" aria-live="polite"></div></form><div class="nalvi-material-preview" id="nalviMaterialPreview" hidden><h4>${esc(c.preview)}</h4><ol></ol><button class="mini-btn" id="nalviUseQuestionDraft" type="button">${esc(c.useDraft)}</button></div></article>`;
  }

  function normalizeAudioSearch(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").trim()}

  function audioLibraryButton(recording){
    const c=libraryCopy(),states={es:["Cargando audio","Pausar audio","Reiniciar audio","Audio no disponible"],en:["Loading audio","Pause audio","Restart audio","Audio unavailable"],pt:["Carregando áudio","Pausar áudio","Reiniciar áudio","Áudio indisponível"],fr:["Chargement de l’audio","Mettre en pause","Recommencer","Audio indisponible"],it:["Caricamento audio","Metti in pausa","Riavvia audio","Audio non disponibile"],de:["Audio wird geladen","Audio pausieren","Audio neu starten","Audio nicht verfügbar"]}[locale()]||["Cargando audio","Pausar audio","Reiniciar audio","Audio no disponible"],ready=formatCopy(c.play,{term:recording.audioText});
    return `<button class="nalvi-teacher-audio-play" type="button" data-teacher-audio-id="${esc(recording.audioId)}" data-audio-state="ready" data-audio-label-loading="${esc(states[0])}" data-audio-label-ready="${esc(ready)}" data-audio-label-playing="${esc(states[1])}" data-audio-label-paused="${esc(states[2])}" data-audio-label-error="${esc(states[3])}" aria-label="${esc(ready)}" aria-pressed="false"><span data-audio-icon aria-hidden="true">🔊</span></button>`;
  }

  function renderTeacherAudioLibrary(value=""){
    const root=$("#nalviTeacherAudioResults"),status=$("#nalviTeacherAudioStatus"),c=libraryCopy();if(!root||!status)return;
    const query=normalizeAudioSearch(value),matches=teacherAudioItems.filter(item=>normalizeAudioSearch(item.audioText).includes(query)),visible=(query?matches:teacherAudioItems).slice(0,24);
    status.textContent=query&&!matches.length?c.empty:c.prompt;
    root.innerHTML=visible.map(item=>`<article class="nalvi-audio-library-item"><b lang="gn">${esc(item.audioText)}</b>${audioLibraryButton(item)}</article>`).join("");
  }

  async function loadTeacherAudioLibrary(){
    const status=$("#nalviTeacherAudioStatus"),root=$("#nalviTeacherAudioResults"),c=libraryCopy();if(!status||!root)return;
    status.textContent=c.loading;root.innerHTML="";
    try{const registry=window.NALVI_RECORDED_AUDIO,ready=registry?.ready?.then?await registry.ready:null;if(!ready?.ok||typeof registry.list!=="function")throw new Error("audio-library-unavailable");teacherAudioItems=registry.list().filter(item=>item?.audioAuthorized===true&&item?.humanRecorded===true&&item?.audioText).sort((a,b)=>a.audioText.localeCompare(b.audioText,"gn"));renderTeacherAudioLibrary($("#nalviTeacherAudioSearch")?.value||"")}catch{teacherAudioItems=[];status.textContent=c.empty}
  }

  function generateQuestionDraft(event){
    event.preventDefault();const form=event.currentTarget,c=libraryCopy(),fd=new FormData(form),title=String(fd.get("title")||"").trim(),draft=buildQuestionDraft(fd.get("content"),c.questionTemplate),preview=$("#nalviMaterialPreview"),list=$("ol",preview);
    pendingQuestionDraft=draft.items.length?{title:(title||c.materialTitleDefault).slice(0,120),content:draft.content,items:draft.items}:null;
    if(!pendingQuestionDraft){if(preview)preview.hidden=true;setStatus("#nalviMaterialStatus",c.format,true);return}
    if(list)list.innerHTML=draft.items.map(item=>`<li><b>${esc(item.question)}</b><span>${esc(item.answer)}</span></li>`).join("");
    if(preview)preview.hidden=false;
    setStatus("#nalviMaterialStatus",`${formatCopy(c.generated,{count:draft.items.length})}${draft.rejected.length?formatCopy(c.ignored,{count:draft.rejected.length}):""}`);
  }

  function useQuestionDraft(){
    if(!pendingQuestionDraft)return;const c=libraryCopy();openTool("tools");const form=$("#nalviAssessmentBuilder");if(!form)return;
    form.elements.title.value=pendingQuestionDraft.title;form.elements.content.value=pendingQuestionDraft.content;editing.assessment="";setStatus("#nalviAssessmentBuilderStatus",c.draftReady);form.scrollIntoView({behavior:"smooth",block:"center"});form.elements.title.focus();
  }

  function installLibraryActions(management){
    const form=$("#nalviMaterialCreator",management),draft=$("#nalviUseQuestionDraft",management),search=$("#nalviTeacherAudioSearch",management),results=$("#nalviTeacherAudioResults",management);
    if(form&&!form.dataset.nalviBound){form.dataset.nalviBound="true";form.addEventListener("submit",generateQuestionDraft)}
    if(draft&&!draft.dataset.nalviBound){draft.dataset.nalviBound="true";draft.addEventListener("click",useQuestionDraft)}
    if(search&&!search.dataset.nalviBound){search.dataset.nalviBound="true";search.addEventListener("input",event=>{window.NALVI_RECORDED_AUDIO?.stop?.();renderTeacherAudioLibrary(event.target.value)})}
    if(results&&!results.dataset.nalviBound){results.dataset.nalviBound="true";results.addEventListener("click",event=>{const button=event.target.closest?.("[data-teacher-audio-id]");if(button)window.NALVI_RECORDED_AUDIO?.play?.(button.dataset.teacherAudioId,button)})}
    loadTeacherAudioLibrary();
  }

  function localizeLibrary(management){
    const pane=$("[data-gesa-pane='library']",management);if(!pane)return;
    const replacement=document.createElement("template");replacement.innerHTML=libraryMarkup();const localized=replacement.content.firstElementChild;if(!localized)return;
    pane.replaceWith(localized);installLibraryActions(management);
  }

  function toolsMarkup(){
    const c=copy();
    return `<section class="gesa-pane hide nalvi-academic-tools" data-gesa-pane="tools"><div class="gesa-section-head"><div><h3>${esc(c.toolsTitle)}</h3><p>${esc(c.toolsBody)}</p></div><button class="mini-btn" id="nalviOpenLiveFromTools" type="button">${esc(c.createLive)}</button></div>${materialCreatorMarkup()}<div class="nalvi-academic-tools-grid"><article class="gesa-card nalvi-wheel-card"><span class="gesa-status active">${esc(c.wheelTag)}</span><h3>${esc(c.wheelTitle)}</h3><p>${esc(c.wheelBody)}</p><form class="gesa-form" id="nalviWheelForm"><label>${esc(c.title)}<input name="title" maxlength="120" required value="${esc(c.wheelDefault)}"></label><label>${esc(c.options)}<textarea name="content" maxlength="8000" required placeholder="Mba’éichapa reime?&#10;Che réra…&#10;Moõgua nde?"></textarea></label><div class="gesa-inline-actions"><button class="mini-btn" type="submit">${esc(c.saveWheel)}</button><button class="mini-btn" id="nalviResetWheel" type="button" disabled>${esc(c.reset)}</button><button class="btn" id="nalviSpinWheel" type="button">${esc(c.spin)}</button></div><div class="gesa-form-status" id="nalviWheelStatus" role="status" aria-live="polite"></div></form><div class="nalvi-wheel-stage"><div class="nalvi-wheel" id="nalviWheel" role="img" aria-label="${esc(c.emptyWheel)}"><span class="nalvi-wheel-empty">Ñ</span></div><div class="nalvi-wheel-pointer" aria-hidden="true">▼</div><strong id="nalviWheelResult" role="status" aria-live="polite">${esc(c.addTwo)}</strong><small id="nalviWheelRemaining">0</small></div></article><article class="gesa-card"><span class="gesa-status active">${esc(c.questionsTag)}</span><h3>${esc(c.questionsTitle)}</h3><p>${esc(c.questionsBody)}</p><form class="gesa-form" id="nalviAssessmentBuilder"><label>${esc(c.title)}<input name="title" maxlength="120" required value="${esc(c.questionsDefault)}"></label><label>${esc(c.questionsInput)}<textarea name="content" maxlength="8000" required placeholder="¿Qué significa Maitei? | Saludo&#10;¿Cómo dices nos vemos? | Jajoechata"></textarea></label><button class="btn" type="submit">${esc(c.saveQuestions)}</button><div class="gesa-form-status" id="nalviAssessmentBuilderStatus"></div></form></article></div><div class="gesa-section-head"><div><h3>${esc(c.savedTitle)}</h3><p>${esc(c.savedBody)}</p></div><button class="mini-btn" id="nalviReloadActivities" type="button">↻ ${esc(c.reload)}</button></div><div class="gesa-list" id="nalviAcademicSaved"><div class="gesa-state">${esc(c.noSaved)}</div></div></section>`
  }

  function localizeTools(management){
    const c=copy(),pane=$("[data-gesa-pane='tools']",management);if(!pane)return;
    const material=$(".nalvi-material-creator",pane);if(material&&material.dataset.materialLocale!==locale()){const template=document.createElement("template");template.innerHTML=materialCreatorMarkup();material.replaceWith(template.content.firstElementChild);installLibraryActions(management)}
    const setLabel=(label,value)=>{if(!label)return;const node=[...label.childNodes].find(item=>item.nodeType===3);if(node)node.nodeValue=value;else label.insertBefore(document.createTextNode(value),label.firstChild)};
    const sectionHeads=$$(":scope > .gesa-section-head",pane),cards=$$(".nalvi-academic-tools-grid > .gesa-card",pane),wheelCard=cards[0],questionCard=cards[1],wheelLabels=$$("#nalviWheelForm > label",pane),questionLabels=$$("#nalviAssessmentBuilder > label",pane);
    if(sectionHeads[0]){$("h3",sectionHeads[0]).textContent=c.toolsTitle;$("p",sectionHeads[0]).textContent=c.toolsBody;$("button",sectionHeads[0]).textContent=c.createLive}
    if(wheelCard){$(".gesa-status",wheelCard).textContent=c.wheelTag;$("h3",wheelCard).textContent=c.wheelTitle;$("p",wheelCard).textContent=c.wheelBody;setLabel(wheelLabels[0],c.title);setLabel(wheelLabels[1],c.options);const buttons=$$("#nalviWheelForm button",wheelCard);if(buttons[0])buttons[0].textContent=c.saveWheel;if(buttons[1])buttons[1].textContent=c.reset;if(buttons[2])buttons[2].textContent=c.spin}
    if(questionCard){$(".gesa-status",questionCard).textContent=c.questionsTag;$("h3",questionCard).textContent=c.questionsTitle;$("p",questionCard).textContent=c.questionsBody;setLabel(questionLabels[0],c.title);setLabel(questionLabels[1],c.questionsInput);const button=$("#nalviAssessmentBuilder button",questionCard);if(button)button.textContent=c.saveQuestions}
    if(sectionHeads[1]){$("h3",sectionHeads[1]).textContent=c.savedTitle;$("p",sectionHeads[1]).textContent=c.savedBody;$("button",sectionHeads[1]).textContent=`↻ ${c.reload}`}
    const wheelTitle=$("#nalviWheelForm input[name='title']",pane),questionTitle=$("#nalviAssessmentBuilder input[name='title']",pane),wheelDefaults=new Set(Object.values(COPY).map(item=>item.wheelDefault)),questionDefaults=new Set(Object.values(COPY).map(item=>item.questionsDefault)),result=$("#nalviWheelResult",pane),emptyResults=new Set(Object.values(COPY).map(item=>item.addTwo));
    if(wheelTitle&&wheelDefaults.has(wheelTitle.value))wheelTitle.value=c.wheelDefault;
    if(questionTitle&&questionDefaults.has(questionTitle.value))questionTitle.value=c.questionsDefault;
    if(result&&emptyResults.has(result.textContent))result.textContent=c.addTwo;
    renderWheel();
  }

  function installTools(){
    const management=$("#institutional[data-gesa-installed='true']");if(!management||!canManage())return;
    if($("[data-gesa-tab='tools']",management)){localizeTools(management);localizeLibrary(management);return}
    const liveTab=$("[data-gesa-tab='live']",management),library=libraryCopy();liveTab?.insertAdjacentHTML("beforebegin",`<button class="gesa-tab" data-gesa-tab="library">📚 ${esc(library.tab[1])}</button>`);liveTab?.insertAdjacentHTML("afterend",`<button class="gesa-tab" data-gesa-tab="tools">🎡 ${esc(copy().toolsTab)}</button>`);
    const certificates=$("[data-gesa-pane='certificates']",management);certificates?.insertAdjacentHTML("beforebegin",libraryMarkup()+toolsMarkup());
    $("[data-gesa-tab='library']",management)?.addEventListener("click",()=>openTool("library"));
    $("[data-gesa-tab='tools']",management)?.addEventListener("click",()=>openTool("tools"));
    $("#nalviWheelForm",management)?.addEventListener("submit",event=>saveActivity(event,"wheel"));
    $("#nalviAssessmentBuilder",management)?.addEventListener("submit",event=>saveActivity(event,"assessment"));
    $("#nalviSpinWheel",management)?.addEventListener("click",spinWheel);
    $("#nalviResetWheel",management)?.addEventListener("click",resetWheel);
    $("#nalviWheelForm textarea[name='content']",management)?.addEventListener("input",event=>prepareWheel(event.target.value,true));
    $("#nalviReloadActivities",management)?.addEventListener("click",loadActivities);
    $("#nalviOpenLiveFromTools",management)?.addEventListener("click",()=>openTool("live"));
    $("#nalviAcademicSaved",management)?.addEventListener("click",handleSavedAction);
    installLibraryActions(management);
    localizeTools(management);
    renderWheel();
  }

  function decorateAcademicNavigation(management,admin){
    const c=copy(),tabs=$(".gesa-tabs",management);if(!tabs)return;
    tabs.classList.add("nalvi-academic-nav");
    $$("[data-gesa-tab]",tabs).forEach(button=>{
      const name=button.dataset.gesaTab,key=name==="summary"&&admin?"adminSummary":name==="institution"&&admin?"adminInstitution":name,activityLabels={es:"Crear actividades",en:"Create activities",pt:"Criar atividades",fr:"Créer des activités",it:"Crea attività",de:"Aktivitäten erstellen"},entry=key==="library"?libraryCopy().tab:key==="tools"?["✏️",activityLabels[locale()]||activityLabels.es,c.tabs.tools?.[2]||""]:c.tabs[key];if(!entry)return;
      button.innerHTML=`<span class="nalvi-academic-nav-icon" aria-hidden="true">${entry[0]}</span><span class="nalvi-academic-nav-copy"><b>${esc(entry[1])}</b><small>${esc(entry[2])}</small></span>`;
      button.setAttribute("aria-label",entry[1]);
    });
  }

  function toggleAcademicMenu(management,force){
    const button=$("#nalviAcademicMenuToggle",management),c=libraryCopy(),collapsed=typeof force==="boolean"?force:!management.classList.contains("nalvi-nav-collapsed");
    management.classList.toggle("nalvi-nav-collapsed",collapsed);if(button){button.setAttribute("aria-expanded",String(!collapsed));button.setAttribute("aria-label",collapsed?c.expand:c.collapse);$("span",button).textContent=collapsed?c.expand:c.menu}
    try{localStorage.setItem("nalviAcademicMenuCollapsed",collapsed?"1":"0")}catch{}
  }

  function installWorkspaceLayout(management){
    management.classList.add("nalvi-academic-dashboard");const shell=$(".shell.gesa-management",management),tabs=$(".gesa-tabs",management);if(!shell||!tabs)return;
    let workspace=$(".nalvi-academic-workspace",shell);if(!workspace){workspace=document.createElement("div");workspace.className="nalvi-academic-workspace";tabs.before(workspace);const state=$("#gesaAcademicState",shell);workspace.append(tabs,...(state?[state]:[]),...$$("[data-gesa-pane]",shell))}
    if(!$("#nalviAcademicMenuToggle",tabs)){tabs.insertAdjacentHTML("afterbegin",`<button class="nalvi-academic-menu-toggle" id="nalviAcademicMenuToggle" type="button" aria-expanded="true"><b aria-hidden="true">☰</b><span>${esc(libraryCopy().menu)}</span></button>`);$("#nalviAcademicMenuToggle",tabs).addEventListener("click",()=>toggleAcademicMenu(management))}
    const reload=$("#gesaReloadAcademic",management);if(reload&&reload.parentElement!==tabs){reload.classList.add("nalvi-academic-refresh");tabs.append(reload)}if(reload)reload.textContent=`↻ ${copy().reload}`;
    if(!tabs.dataset.nalviVerticalKeys){tabs.dataset.nalviVerticalKeys="true";tabs.addEventListener("keydown",event=>{if(!["ArrowUp","ArrowDown"].includes(event.key))return;const items=$$("[data-gesa-tab]:not([hidden])",tabs),current=items.indexOf(document.activeElement);if(current<0)return;event.preventDefault();const next=(current+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;items[next].focus();items[next].click()})}
    let collapsed=false;try{collapsed=localStorage.getItem("nalviAcademicMenuCollapsed")==="1"}catch{}toggleAcademicMenu(management,collapsed);
  }

  function metricText(count,one,many){return count===1?one:formatCopy(many,{count})}

  function refreshTeacherSummary(){
    const root=$("#nalviTeacherSummary"),kpis=$("#gesaAcademicKpis");if(!root||!kpis)return;const values=$$(":scope > .gesa-kpi b",kpis).map(node=>Number(node.textContent)||0),students=values[0]||0,groups=values[1]||0,tasks=values[2]||0,c=libraryCopy();
    if(!groups){root.innerHTML=`<article class="nalvi-teacher-first-step"><span aria-hidden="true">👥</span><div><small>${esc(c.today)}</small><h3>${esc(c.startTitle)}</h3><p>${esc(c.startBody)}</p></div><button class="btn" type="button" data-summary-go="groups">${esc(c.createClass)} →</button></article>`}
    else root.innerHTML=`<div class="nalvi-summary-heading"><h3>${esc(c.today)}</h3><button class="mini-btn" type="button" data-summary-go="groups">+ ${esc(c.createClass)}</button></div><div class="nalvi-summary-metrics"><button type="button" data-summary-go="groups"><span aria-hidden="true">👥</span><b>${esc(metricText(groups,c.classesOne,c.classesMany))}</b></button><button type="button" data-summary-students><span aria-hidden="true">🧑‍🎓</span><b>${esc(metricText(students,c.studentsOne,c.studentsMany))}</b></button><button type="button" data-summary-go="assignments"><span aria-hidden="true">📝</span><b>${esc(metricText(tasks,c.tasksOne,c.tasksMany))}</b></button></div>`;
    root.querySelectorAll("[data-summary-go]").forEach(button=>button.addEventListener("click",()=>openTool(button.dataset.summaryGo)));root.querySelector("[data-summary-students]")?.addEventListener("click",()=>$("#nalviStudentData")?.scrollIntoView({behavior:"smooth",block:"start"}));
    const data=$("#nalviStudentData");if(data)data.hidden=students===0;
  }

  function installTeacherSummary(management){
    const pane=$("[data-gesa-pane='summary']",management),kpis=$("#gesaAcademicKpis",pane);if(!pane||!kpis)return;
    if(!$("#nalviTeacherSummary",pane))kpis.insertAdjacentHTML("beforebegin",'<section id="nalviTeacherSummary" class="nalvi-teacher-summary" aria-live="polite"></section>');
    if(!$("#nalviStudentData",pane)){const toolbar=kpis.nextElementSibling,table=toolbar?.nextElementSibling,wrapper=document.createElement("section");wrapper.id="nalviStudentData";wrapper.className="nalvi-student-data";wrapper.innerHTML=`<div class="gesa-section-head"><div><h3>${esc(libraryCopy().studentsTitle)}</h3><p>${esc(libraryCopy().studentsBody)}</p></div></div>`;toolbar?.before(wrapper);if(toolbar)wrapper.append(toolbar);if(table)wrapper.append(table);const actions=$(".gesa-inline-actions",toolbar);if(actions){const details=document.createElement("details");details.className="nalvi-export-menu";details.innerHTML=`<summary>${esc(libraryCopy().export)}</summary>`;actions.before(details);details.append(actions)}}
    const data=$("#nalviStudentData",pane),resource=libraryCopy(),heading=$(".gesa-section-head h3",data),description=$(".gesa-section-head p",data),exportLabel=$(".nalvi-export-menu > summary",data);if(heading)heading.textContent=resource.studentsTitle;if(description)description.textContent=resource.studentsBody;if(exportLabel)exportLabel.textContent=resource.export;
    kpis.hidden=true;if(!kpis._nalviSummaryObserver&&typeof MutationObserver==="function"){kpis._nalviSummaryObserver=new MutationObserver(refreshTeacherSummary);kpis._nalviSummaryObserver.observe(kpis,{childList:true,subtree:true,characterData:true})}refreshTeacherSummary();
  }

  function installDashboard(){
    const management=$("#institutional[data-gesa-installed='true']");if(!management||!canManage())return;
    const admin=window.GESA_CONTEXT?.role==="platform_admin",c=copy(),resource=libraryCopy();
    const hero=$(".staff-hero",management);
    if(hero){const tag=$(".tag",hero),title=$("h2",hero),intro=$("p",hero);if(tag)tag.textContent=`${admin?"🛡️":"🏫"} ${admin?c.adminTag:c.teacherPanelTag}`;if(title)title.textContent=admin?c.adminTitle:resource.workspaceTitle;if(intro)intro.textContent=admin?c.adminIntro:resource.workspaceIntro}
    $("#nalviAcademicQuickStart",management)?.remove();
    const security=$(".gesa-note.security",management);if(security)security.textContent=`🔐 ${c.security}`;
    decorateAcademicNavigation(management,admin);
    installWorkspaceLayout(management);installTeacherSummary(management);
    const groupPane=$("[data-gesa-pane='groups']",management),groupHeading=$(".gesa-card h3",groupPane),groupIntro=$(".gesa-card p",groupPane),studentField=$("textarea[name='studentEmails']",groupPane)?.closest("label");
    if(groupHeading)groupHeading.textContent=c.createClass;
    if(groupIntro)groupIntro.textContent=c.createClassBody;
    if(studentField?.firstChild)studentField.firstChild.textContent=c.studentEmails;
  }

  function openTool(name){
    const management=$("#institutional[data-gesa-installed='true']");if(!management)return;
    $$("[data-gesa-tab]",management).forEach(button=>button.classList.toggle("active",button.dataset.gesaTab===name));
    $$("[data-gesa-pane]",management).forEach(pane=>pane.classList.toggle("hide",pane.dataset.gesaPane!==name));
    if(name==="tools")loadActivities();
    setTimeout(()=>$("[data-gesa-pane='"+name+"']",management)?.scrollIntoView({behavior:"smooth",block:"start"}),0);
  }

  async function loadActivities(){
    const root=$("#nalviAcademicSaved"),id=institutionId(),c=copy();if(!root||!id)return;
    root.innerHTML=`<div class="gesa-state"><div><div class="spinner"></div>${esc(c.loadingActivities)}</div></div>`;
    try{const snapshot=await firebase.getDocs(firebase.query(firebase.collection(firebase.db,"academicActivities"),firebase.where("institutionId","==",id)));savedActivities=snapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(a.title).localeCompare(String(b.title)));renderActivities()}catch(error){console.error("NALVI_ACADEMIC_LOAD",error);root.innerHTML=`<div class="gesa-state error">${esc(c.loadError)}</div>`}
  }

  function renderActivities(){const root=$("#nalviAcademicSaved"),c=copy();if(!root)return;root.innerHTML=savedActivities.length?savedActivities.map(item=>{const count=cleanLines(item.content).length;return`<article class="gesa-list-item"><div><span class="gesa-status active">${esc(item.activityType==="wheel"?c.wheelType:c.questionsType)}</span><h4>${esc(item.title)}</h4><small>${count} ${esc(count===1?c.itemOne:c.itemMany)}</small></div><div class="actions"><button class="mini-btn" data-academic-edit="${esc(item.id)}">${esc(c.edit)}</button><button class="mini-btn" data-academic-delete="${esc(item.id)}">${esc(c.remove)}</button></div></article>`}).join(""):`<div class="gesa-state">${esc(c.noSaved)}</div>`}

  async function saveActivity(event,type){
    event.preventDefault();const c=copy(),form=event.currentTarget,button=event.submitter,fd=new FormData(form),title=String(fd.get("title")||"").trim(),content=cleanLines(fd.get("content"),type==="wheel"?60:40).join("\n"),status=type==="wheel"?"#nalviWheelStatus":"#nalviAssessmentBuilderStatus";
    if(title.length<2||!content){setStatus(status,c.completeFields,true);return}
    if(type==="wheel"&&cleanLines(content).length<2){setStatus(status,c.addTwo,true);return}
    if(type==="assessment"&&cleanLines(content,40).some(line=>!line.includes("|"))){setStatus(status,c.questionFormat,true);return}
    button.disabled=true;setStatus(status,c.saving);
    try{const payload={institutionId:institutionId(),ownerUid:currentUser().uid,activityType:type,title:title.slice(0,120),content,updatedAt:firebase.serverTimestamp()},id=editing[type];if(id){await firebase.setDoc(firebase.doc(firebase.db,"academicActivities",id),payload,{merge:true});editing[type]=""}else await firebase.addDoc(firebase.collection(firebase.db,"academicActivities"),{...payload,createdAt:firebase.serverTimestamp()});form.reset();if(type==="wheel"){wheelItems=[];wheelOriginalItems=[];renderWheel()}setStatus(status,c.saved);await loadActivities()}catch(error){console.error("NALVI_ACADEMIC_SAVE",error);setStatus(status,c.saveError,true)}finally{button.disabled=false}
  }

  function handleSavedAction(event){const id=event.target.dataset.academicEdit||event.target.dataset.academicDelete;if(!id)return;const item=savedActivities.find(row=>row.id===id);if(!item)return;if(event.target.dataset.academicEdit){const form=item.activityType==="wheel"?$("#nalviWheelForm"):$("#nalviAssessmentBuilder");if(!form)return;form.elements.title.value=item.title;form.elements.content.value=item.content;if(item.activityType==="wheel")prepareWheel(item.content,true);editing[item.activityType]=item.id;form.scrollIntoView({behavior:"smooth",block:"center"});form.elements.title.focus();return}if(!confirm(formatCopy(copy().confirmRemove,{title:item.title})))return;event.target.disabled=true;firebase.deleteDoc(firebase.doc(firebase.db,"academicActivities",id)).then(loadActivities).catch(error=>{console.error(error);event.target.disabled=false})}

  function randomUnit(){return window.crypto?.getRandomValues?window.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296:Math.random()}
  function drawWithoutReplacement(items,randomValue=randomUnit()){
    const available=[...items];if(!available.length)return{selected:"",remaining:[],index:-1};
    const safeRandom=Math.min(.999999999,Math.max(0,Number(randomValue)||0)),index=Math.floor(safeRandom*available.length),selected=available[index];
    return{selected,index,remaining:available.filter((_,itemIndex)=>itemIndex!==index)};
  }
  function wheelBackground(count){
    const colors=["#6949cc","#16866f","#e76578","#e4a92e","#3d79cf","#8a5bc8","#1d9aa6","#d75f9d"];
    if(!count)return"linear-gradient(145deg,#6d56ba,#1a8a70)";
    return`conic-gradient(${Array.from({length:count},(_,index)=>`${colors[index%colors.length]} ${index/count*100}% ${(index+1)/count*100}%`).join(",")})`;
  }
  function wheelLabelLayout(count,index,rotation=wheelRotation){
    const angle=(index+.5)*360/Math.max(1,count),radians=angle*Math.PI/180,radius=count<=4?31:count<=8?33:36;
    return{x:(50+Math.sin(radians)*radius).toFixed(3),y:(50-Math.cos(radians)*radius).toFixed(3),counter:-(Number(rotation)||0)%360,width:count<=4?94:count<=6?76:count<=10?58:count<=16?44:32,font:count<=4?11.5:count<=6?10:count<=10?8.5:count<=16?7:5.5};
  }
  function remainingText(count){
    const language=locale(),labels={es:["opción disponible","opciones disponibles"],en:["option available","options available"],pt:["opção disponível","opções disponíveis"],fr:["option disponible","options disponibles"],it:["opzione disponibile","opzioni disponibili"],de:["Option verfügbar","Optionen verfügbar"]}[language]||["opción disponible","opciones disponibles"];
    return`${count} ${labels[count===1?0:1]}`;
  }
  function renderWheel(items=wheelItems){
    const wheel=$("#nalviWheel"),remaining=$("#nalviWheelRemaining"),spin=$("#nalviSpinWheel");if(!wheel)return;
    const count=items.length;wheel.style.background=wheelBackground(count);
    wheel.innerHTML=count?items.map((item,index)=>{const layout=wheelLabelLayout(count,index);return `<span class="nalvi-wheel-label" style="--wheel-label-x:${layout.x}%;--wheel-label-y:${layout.y}%;--wheel-counter-angle:${layout.counter}deg;--wheel-label-width:${layout.width}px;--wheel-label-size:${layout.font}px"><b>${esc(item.slice(0,34))}</b></span>`}).join(""):'<span class="nalvi-wheel-empty">Ñ</span>';
    wheel.setAttribute("aria-label",count?`${copy().wheelTitle}: ${items.join(", ")}`:copy().emptyWheel);
    if(remaining)remaining.textContent=remainingText(count);
    if(spin)spin.disabled=wheelSpinning||count<1;
  }
  function prepareWheel(value,rememberOriginal=false){wheelItems=cleanLines(value);if(rememberOriginal)wheelOriginalItems=[...wheelItems];const reset=$("#nalviResetWheel");if(reset)reset.disabled=!wheelOriginalItems.length||wheelItems.length===wheelOriginalItems.length;renderWheel()}
  function resetWheel(){
    if(wheelSpinning||!wheelOriginalItems.length)return;wheelItems=[...wheelOriginalItems];const form=$("#nalviWheelForm");if(form)form.elements.content.value=wheelItems.join("\n");const result=$("#nalviWheelResult");if(result)result.textContent=copy().resetDone;const reset=$("#nalviResetWheel");if(reset)reset.disabled=true;setStatus("#nalviWheelStatus","");renderWheel();
  }
  function spinWheel(){
    if(wheelSpinning)return;const form=$("#nalviWheelForm"),typed=cleanLines(form?.elements.content.value);if(!wheelItems.length||typed.join("\n")!==wheelItems.join("\n"))prepareWheel(form?.elements.content.value,true);
    const c=copy();if(!wheelItems.length){setStatus("#nalviWheelStatus",c.addOne,true);return}
    const draw=drawWithoutReplacement(wheelItems),wheel=$("#nalviWheel"),result=$("#nalviWheelResult"),count=wheelItems.length,target=360-(draw.index+.5)*(360/count),base=Math.ceil(wheelRotation/360)*360;
    wheelSpinning=true;wheelRotation=base+1440+target;if(wheel)wheel.style.transform=`rotate(${wheelRotation}deg)`;if(result)result.textContent=c.spinning;setStatus("#nalviWheelStatus","");renderWheel();
    setTimeout(()=>{wheelSpinning=false;wheelItems=draw.remaining;if(form)form.elements.content.value=wheelItems.join("\n");if(result)result.textContent=formatCopy(c.result,{item:draw.selected});const reset=$("#nalviResetWheel");if(reset)reset.disabled=false;renderWheel();setStatus("#nalviWheelStatus",formatCopy(wheelItems.length?c.removedResult:c.finalResult,{item:draw.selected,count:wheelItems.length}))},1250);
  }

  async function restorePendingIntent(source){
    const intent=readIntent();if(!intent||restoringIntent||!signedIn())return;restoringIntent=true;
    try{
      window.show?.("institutions",true);
      if(intent.kind==="joinClass"){const input=$("#nalviAcademicClassCode");if(input)input.value=normalizeClassCode(intent.value);await joinClassByCode()}
      else if(intent.kind==="joinLive"){const input=$("#nalviAcademicLivePin");if(input)input.value=normalizeLivePin(intent.value);joinLiveByPin()}
      else if(intent.kind==="openDashboard"&&canManage()){clearIntent();window.show?.("institutional",true)}
      else if(intent.kind==="teacher"&&source==="role"){if(canManage()){clearIntent();window.show?.("institutional",true)}else await startAcademicSpace()}
    }finally{restoringIntent=false}
  }

  function refresh(){installPublicHub();installTools();installDashboard();const nav=$(".bottom-nav [data-institution-entry] i");if(nav)nav.textContent=copy().managementNav}
  async function init(){
    try{
      firebase=await waitForFirebase();refresh();
      window.addEventListener("nalvi:auth-known",()=>setTimeout(()=>{refresh();restorePendingIntent("auth")},100));
      window.addEventListener("nalvi:role-known",()=>setTimeout(()=>{refresh();restorePendingIntent("role")},100));
      window.addEventListener("nalvi:group-joined",handleGroupJoined);
      document.addEventListener("change",event=>{if(event.target.matches?.("#headerLang,#lang"))setTimeout(refresh,0)},true);
      for(let attempt=0;attempt<40&&!$("#institutional[data-gesa-installed='true']");attempt++)await new Promise(resolve=>setTimeout(resolve,100));
      installTools();installDashboard();restorePendingIntent("role");
      document.documentElement.dataset.nalviAcademicStudio=VERSION;
      window.dispatchEvent(new CustomEvent("nalvi:academic-studio-ready",{detail:{version:VERSION}}));
    }catch(error){console.error("NALVI_ACADEMIC_STUDIO_INIT",error)}
  }

  window.NALVI_ACADEMIC_STUDIO={VERSION,refresh,loadActivities,loadStudentClasses,normalizeClassCode,normalizeLivePin,drawWithoutReplacement,wheelBackground,wheelLabelLayout,buildQuestionDraft};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
