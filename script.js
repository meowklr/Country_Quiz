const QUESTION_DURATION_SECONDS = 10;
const BUTTON_REGION_MAP = {
  startQuizAfrique: "africa",
  startQuizAmerique: "americas",
  startQuizAsie: "asia",
  startQuizEurope: "europe",
  startQuizOceanie: "oceania",
  startQuiz: null
};

const countriesCache = new Map();
let activeTimerInterval = null;
let activeProgressAnimationFrame = null;

// Recupere les pays d'une region (ou du monde) et met le resultat en cache.
async function fetchCountries(region) {
  const cacheKey = region || "world";
  // Evite de rappeler l'API a chaque nouvelle question pour la meme region.
  if (countriesCache.has(cacheKey)) {
    return countriesCache.get(cacheKey);
  }

  const baseUrl = region
    ? "https://restcountries.com/v3.1/region/" + encodeURIComponent(region)
    : "https://restcountries.com/v3.1/all";
  const url = baseUrl + "?fields=cca3,name,translations,flags";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Impossible de charger les pays");
  }

  const countries = await response.json();
  countriesCache.set(cacheKey, countries);
  return countries;
}

// Retourne le nom du pays en francais avec fallback si la traduction manque.
function getCountryNameFr(country) {
  return country.translations?.fra?.common || country.name?.common || "Nom inconnu";
}

// Genere un entier aleatoire entre 0 et maxExclusive - 1.
function getRandomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

// Tire un sous-ensemble aleatoire de pays sans doublons.
function pickRandomCountries(countries, count) {
  if (countries.length <= count) {
    return [...countries];
  }

  // Tire des indexes uniques pour garantir des choix distincts.
  const usedIndexes = new Set();
  const picks = [];
  while (picks.length < count) {
    const idx = getRandomInt(countries.length);
    if (usedIndexes.has(idx)) continue;
    usedIndexes.add(idx);
    picks.push(countries[idx]);
  }
  return picks;
}

// Melange un tableau en place avec l'algorithme Fisher-Yates.
function shuffleInPlace(array) {
  // Fisher-Yates: melange uniforme en place.
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = getRandomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Arrete le timer actif pour eviter plusieurs comptes a rebours en meme temps.
function clearActiveTimer() {
  // Important pour ne jamais avoir plusieurs timers en parallele.
  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
  if (activeProgressAnimationFrame) {
    cancelAnimationFrame(activeProgressAnimationFrame);
    activeProgressAnimationFrame = null;
  }
}

// Construit l'etat d'une nouvelle question (choix, bonne reponse, references UI).
function createQuestionState(countries, list) {
  const choices = pickRandomCountries(countries, 3);
  const correctCountry = choices[getRandomInt(choices.length)];

  return {
    countries,
    list,
    choices,
    correctCountry,
    correctCode: correctCountry.cca3,
    questionLocked: false,
    answerButtons: [],
    timerItem: null,
    timerLabel: null,
    progressFill: null,
    feedbackItem: null
  };
}

// Cree et affiche la ligne du timer dans la liste du quiz.
function renderTimerItem(list) {
  const timerItem = document.createElement("li");
  timerItem.className = "quiz-timer";

  const timerLabel = document.createElement("div");
  timerLabel.className = "quiz-timer-label";

  const progressTrack = document.createElement("div");
  progressTrack.className = "quiz-progress";

  const progressFill = document.createElement("div");
  progressFill.className = "quiz-progress-fill";

  progressTrack.appendChild(progressFill);
  timerItem.appendChild(timerLabel);
  timerItem.appendChild(progressTrack);
  list.appendChild(timerItem);
  return {
    timerItem,
    timerLabel,
    progressFill
  };
}

// Affiche le drapeau de la bonne reponse pour la question en cours.
function renderFlagItem(list, country) {
  const flagItem = document.createElement("li");
  flagItem.className = "quiz-flag-item";

  const flagImg = document.createElement("img");
  flagImg.className = "quiz-flag-image";
  flagImg.src = country.flags?.svg || country.flags?.png || "";
  flagImg.alt = country.flags?.alt || "Drapeau a deviner";

  flagItem.appendChild(flagImg);
  list.appendChild(flagItem);
}

// Cree la ligne de feedback qui affiche la question puis le resultat.
function renderFeedbackItem(list) {
  const feedbackItem = document.createElement("li");
  feedbackItem.className = "quiz-feedback";
  feedbackItem.textContent = "Quel pays correspond a ce drapeau ?";
  list.appendChild(feedbackItem);
  return feedbackItem;
}

// Revele la correction, colore les boutons et verrouille la question.
function revealAnswers(state, feedbackText) {
  if (state.questionLocked) return;
  state.questionLocked = true;
  clearActiveTimer();

  state.answerButtons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("is-disabled");
    if (btn.dataset.countryCode === state.correctCode) {
      btn.classList.add("is-correct");
    } else {
      btn.classList.add("is-incorrect");
    }
  });

  state.feedbackItem.textContent = feedbackText;
}

// Cree les boutons de propositions et branche la verification au clic.
function renderAnswerItems(state) {
  const shuffledChoices = shuffleInPlace([...state.choices]);

  shuffledChoices.forEach((country) => {
    const item = document.createElement("li");
    item.className = "quiz-answer-item";

    const answerButton = document.createElement("button");
    answerButton.type = "button";
    answerButton.className = "quiz-answer-button";
    answerButton.textContent = getCountryNameFr(country);
    answerButton.dataset.answer = "true";
    answerButton.dataset.countryCode = country.cca3;

    answerButton.addEventListener("click", () => {
      if (state.questionLocked) return;
      const isCorrect = country.cca3 === state.correctCode;
      revealAnswers(state, isCorrect ? "Bonne réponse !" : "Mauvaise réponse.");
    });

    state.answerButtons.push(answerButton);
    item.appendChild(answerButton);
    state.list.appendChild(item);
  });
}

// Affiche le bouton pour passer a la question suivante.
function renderNextButton(state) {
  const nextItem = document.createElement("li");
  nextItem.className = "quiz-next-item";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "quiz-next-button";
  nextButton.textContent = "Question suivante";
  nextButton.addEventListener("click", () => {
    clearActiveTimer();
    renderQuestion(state.countries, state.list);
  });

  nextItem.appendChild(nextButton);
  state.list.appendChild(nextItem);
}

// Lance le compte a rebours et force la correction quand le temps est ecoule.
function startQuestionTimer(state) {
  let timeLeft = QUESTION_DURATION_SECONDS;
  state.timerLabel.textContent = "Temps restant : " + timeLeft + " s";
  state.progressFill.style.width = "0%";

  const totalDurationMs = QUESTION_DURATION_SECONDS * 1000;
  const animationStart = performance.now();

  function animateProgress(now) {
    const elapsed = Math.min(now - animationStart, totalDurationMs);
    const progressPercent = (elapsed / totalDurationMs) * 100;
    state.progressFill.style.width = progressPercent + "%";

    if (elapsed < totalDurationMs && !state.questionLocked) {
      activeProgressAnimationFrame = requestAnimationFrame(animateProgress);
    }
  }

  activeProgressAnimationFrame = requestAnimationFrame(animateProgress);

  activeTimerInterval = setInterval(() => {
    timeLeft -= 1;
    state.timerLabel.textContent = "Temps restant : " + timeLeft + " s";

    if (timeLeft <= 5) {
      state.timerItem.classList.add("is-warning");
    }

    if (timeLeft <= 0) {
      revealAnswers(
        state,
        "Temps ecoule ! La bonne reponse etait : " + getCountryNameFr(state.correctCountry)
      );
    }
  }, 1000);
}

// Ordonne le rendu complet d'une question (timer, drapeau, reponses, navigation).
function renderQuestion(countries, list) {
  clearActiveTimer();
  list.innerHTML = "";

  const state = createQuestionState(countries, list);
  const timerElements = renderTimerItem(list);
  state.timerItem = timerElements.timerItem;
  state.timerLabel = timerElements.timerLabel;
  state.progressFill = timerElements.progressFill;
  renderFlagItem(list, state.correctCountry);
  state.feedbackItem = renderFeedbackItem(list);
  renderAnswerItems(state);
  renderNextButton(state);
  startQuestionTimer(state);
}

// Demarre le quiz pour la region demandee et affiche la premiere question.
async function startQuiz(region) {
  try {
    const list = document.getElementById("countryList");
    if (!list) {
      throw new Error("Element #countryList introuvable dans la page");
    }

    const countries = await fetchCountries(region);
    renderQuestion(countries, list);
  } catch (e) {
    console.error(e.message);
  }
}

// Branche tous les boutons de pages aux regions correspondantes au chargement.
document.addEventListener("DOMContentLoaded", () => {
  Object.entries(BUTTON_REGION_MAP).forEach(([buttonId, region]) => {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.addEventListener("click", () => startQuiz(region));
  });
});
