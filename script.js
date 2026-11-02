const QUESTION_DURATION_SECONDS = 10;
const START_BUTTON_LABEL = "Commencer le quiz";
const STOP_BUTTON_LABEL = "Arrêter et retourner au menu";

const REGION_CONFIGS = {
  africa: { regionKey: "africa", label: "Afrique", description: "Testez vos connaissances sur les pays d'Afrique !" },
  americas: { regionKey: "americas", label: "Amérique", description: "Testez vos connaissances sur les pays d'Amérique !" },
  asia: { regionKey: "asia", label: "Asie", description: "Testez vos connaissances sur les pays d'Asie !" },
  europe: { regionKey: "europe", label: "Europe", description: "Testez vos connaissances sur les pays d'Europe !" },
  oceania: { regionKey: "oceania", label: "Océanie", description: "Testez vos connaissances sur les pays d'Océanie !" },
  world: { regionKey: null, label: "Monde entier", description: "Testez vos connaissances sur les pays du monde entier !" }
};

const countriesCache = new Map();

let allCountriesForCurrentRegion = [];
let questionIsLocked = false;
let currentCorrectCode = "";
let currentCorrectCountry = null;
let timerInterval = null;
let progressFrame = null;

function clearTimers() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (progressFrame) {
    cancelAnimationFrame(progressFrame);
    progressFrame = null;
  }
}

function countryName(country) {
  return country.translations?.fra?.common || country.name?.common || "Nom inconnu";
}

function pickThreeCountries(countries) {
  const used = new Set();
  const picked = [];

  while (picked.length < 3) {
    const index = Math.floor(Math.random() * countries.length);
    if (used.has(index)) continue;
    used.add(index);
    picked.push(countries[index]);
  }

  return picked;
}

/**
 * Charge les pays depuis la base de données locale (indépendante du réseau et des dépréciations d'API).
 */
async function loadCountries(regionKey) {
  const cacheKey = regionKey || "world";
  if (countriesCache.has(cacheKey)) {
    return countriesCache.get(cacheKey);
  }

  let source = [];

  // 1. Priorité aux données locales injectées via countries-data.js (fonctionne en local direct file://)
  if (Array.isArray(window.COUNTRIES_DATA) && window.COUNTRIES_DATA.length > 0) {
    source = window.COUNTRIES_DATA;
  } else {
    // 2. Repli via le fichier JSON local si disponible
    try {
      const response = await fetch("countries.json");
      if (response.ok) {
        source = await response.json();
      }
    } catch {
      // Ignoré en cas d'ouverture directe sans serveur
    }
  }

  // Filtrage par région si une région spécifique est demandée
  let filtered = source;
  if (regionKey && regionKey !== "world") {
    filtered = source.filter(
      (c) => c.region && c.region.toLowerCase() === regionKey.toLowerCase()
    );
  }

  // Vérification de la validité des données
  const cleanCountries = filtered.filter((country) => {
    return Boolean(country.cca3) && Boolean(country.flags?.svg || country.flags?.png);
  });

  if (cleanCountries.length < 3) {
    throw new Error("Pas assez de données pour jouer dans cette région.");
  }

  countriesCache.set(cacheKey, cleanCountries);
  return cleanCountries;
}

function lockQuestion(feedbackText, list) {
  if (questionIsLocked) return;

  questionIsLocked = true;
  clearTimers();

  const answerButtons = list.querySelectorAll('[data-answer="true"]');
  answerButtons.forEach((button) => {
    button.disabled = true;
    button.classList.add("is-disabled");
    if (button.dataset.countryCode === currentCorrectCode) {
      button.classList.add("is-correct");
    } else {
      button.classList.add("is-incorrect");
    }
  });

  const feedback = list.querySelector(".quiz-feedback");
  if (feedback) feedback.textContent = feedbackText;
}

function showQuestion(list) {
  clearTimers();
  questionIsLocked = false;
  list.innerHTML = "";

  const choices = pickThreeCountries(allCountriesForCurrentRegion);
  const correctIndex = Math.floor(Math.random() * choices.length);
  currentCorrectCountry = choices[correctIndex];
  currentCorrectCode = currentCorrectCountry.cca3;

  const answerOrder = [...choices];
  for (let i = answerOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [answerOrder[i], answerOrder[j]] = [answerOrder[j], answerOrder[i]];
  }

  const timerItem = document.createElement("li");
  timerItem.className = "quiz-timer";
  const timerLabel = document.createElement("div");
  timerLabel.className = "quiz-timer-label";
  timerLabel.textContent = "Temps restant : " + QUESTION_DURATION_SECONDS + " s";
  const progress = document.createElement("div");
  progress.className = "quiz-progress";
  const progressFill = document.createElement("div");
  progressFill.className = "quiz-progress-fill";
  progress.appendChild(progressFill);
  timerItem.appendChild(timerLabel);
  timerItem.appendChild(progress);
  list.appendChild(timerItem);

  const flagItem = document.createElement("li");
  flagItem.className = "quiz-flag-item";
  const flagImg = document.createElement("img");
  flagImg.className = "quiz-flag-image";
  flagImg.src = currentCorrectCountry.flags?.svg || currentCorrectCountry.flags?.png || "";
  flagImg.alt = currentCorrectCountry.flags?.alt || "Drapeau à deviner";
  flagItem.appendChild(flagImg);
  list.appendChild(flagItem);

  const feedbackItem = document.createElement("li");
  feedbackItem.className = "quiz-feedback";
  feedbackItem.textContent = "Quel pays correspond à ce drapeau ?";
  list.appendChild(feedbackItem);

  answerOrder.forEach((country) => {
    const answerItem = document.createElement("li");
    answerItem.className = "quiz-answer-item";

    const answerButton = document.createElement("button");
    answerButton.type = "button";
    answerButton.className = "quiz-answer-button";
    answerButton.dataset.answer = "true";
    answerButton.dataset.countryCode = country.cca3;
    answerButton.textContent = countryName(country);

    answerItem.appendChild(answerButton);
    list.appendChild(answerItem);
  });

  const nextItem = document.createElement("li");
  nextItem.className = "quiz-next-item";
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "quiz-next-button";
  nextButton.textContent = "Question suivante";
  nextButton.dataset.nextQuestion = "true";
  nextItem.appendChild(nextButton);
  list.appendChild(nextItem);

  let secondsLeft = QUESTION_DURATION_SECONDS;
  const animationStart = performance.now();
  const animationDuration = QUESTION_DURATION_SECONDS * 1000;

  function animate(now) {
    if (questionIsLocked) return;
    const elapsed = Math.min(now - animationStart, animationDuration);
    progressFill.style.width = (elapsed / animationDuration) * 100 + "%";
    if (elapsed < animationDuration) {
      progressFrame = requestAnimationFrame(animate);
    }
  }

  progressFrame = requestAnimationFrame(animate);

  timerInterval = setInterval(() => {
    if (questionIsLocked) return;

    secondsLeft -= 1;
    timerLabel.textContent = "Temps restant : " + secondsLeft + " s";
    if (secondsLeft <= 5) timerItem.classList.add("is-warning");

    if (secondsLeft <= 0) {
      lockQuestion(
        "Temps écoulé ! La bonne réponse était : " + countryName(currentCorrectCountry),
        list
      );
    }
  }, 1000);
}

function initQuizPage() {
  const startButton = document.getElementById("startQuiz");
  const list = document.getElementById("countryList");
  if (!startButton || !list) return;

  const params = new URLSearchParams(window.location.search);
  const regionSlug = params.get("region") || "world";
  const region = REGION_CONFIGS[regionSlug] || REGION_CONFIGS.world;

  const title = document.getElementById("quizTitle");
  const subtitle = document.getElementById("quizSubtitle");
  if (title) title.textContent = "Bienvenue au Country Quiz - " + region.label;
  if (subtitle) subtitle.textContent = region.description;
  document.title = "Country Quiz - " + region.label;

  const activeNavLink = document.querySelector('[data-region-link="' + regionSlug + '"]');
  if (activeNavLink) activeNavLink.setAttribute("aria-current", "page");

  startButton.dataset.quizRunning = "false";
  startButton.textContent = START_BUTTON_LABEL;

  startButton.addEventListener("click", async () => {
    if (startButton.dataset.quizRunning === "true") {
      clearTimers();
      list.innerHTML = "";
      startButton.dataset.quizRunning = "false";
      startButton.textContent = START_BUTTON_LABEL;
      window.location.href = "index.html";
      return;
    }

    startButton.disabled = true;
    startButton.dataset.quizRunning = "true";
    startButton.textContent = STOP_BUTTON_LABEL;
    list.innerHTML = '<li class="quiz-feedback">Chargement des pays...</li>';

    try {
      allCountriesForCurrentRegion = await loadCountries(region.regionKey);
      startButton.disabled = false;
      showQuestion(list);
    } catch (error) {
      startButton.disabled = false;
      startButton.dataset.quizRunning = "false";
      startButton.textContent = START_BUTTON_LABEL;
      list.innerHTML = "";
      const errorItem = document.createElement("li");
      errorItem.className = "quiz-feedback";
      errorItem.textContent = error.message || "Une erreur est survenue.";
      list.appendChild(errorItem);
    }
  });

  list.addEventListener("click", (event) => {
    const answerButton = event.target.closest('[data-answer="true"]');
    if (answerButton && !questionIsLocked) {
      const isCorrect = answerButton.dataset.countryCode === currentCorrectCode;
      lockQuestion(
        isCorrect
          ? "Bonne réponse !"
          : "Mauvaise réponse. La bonne réponse était : " + countryName(currentCorrectCountry),
        list
      );
      return;
    }

    const nextButton = event.target.closest('[data-next-question="true"]');
    if (nextButton && allCountriesForCurrentRegion.length >= 3) {
      showQuestion(list);
    }
  });
}

initQuizPage();
