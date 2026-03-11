import {
  clampLevel,
  deleteWord,
  getAllWords,
  getWordById,
  importWords,
  saveWord,
} from "./db.js";

const state = {
  words: [],
  currentView: "list",
  editingId: null,
  search: "",
  filterStatus: "all",
  sortBy: "createdAt-desc",
  storageMessage: "Everything is stored in IndexedDB on this device.",
  review: {
    words: [],
    currentIndex: 0,
    revealed: false,
    unrememberedOnly: false,
  },
};

const elements = {
  views: {
    list: document.getElementById("view-list"),
    form: document.getElementById("view-form"),
    review: document.getElementById("view-review"),
  },
  tabButtons: [...document.querySelectorAll(".tabbar-button")],
  addWordButton: document.getElementById("addWordButton"),
  openReviewButton: document.getElementById("openReviewButton"),
  closeReviewButton: document.getElementById("closeReviewButton"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  wordForm: document.getElementById("wordForm"),
  wordId: document.getElementById("wordId"),
  chineseInput: document.getElementById("chineseInput"),
  germanInput: document.getElementById("germanInput"),
  noteInput: document.getElementById("noteInput"),
  rememberedInput: document.getElementById("rememberedInput"),
  levelInput: document.getElementById("levelInput"),
  levelValue: document.getElementById("levelValue"),
  formError: document.getElementById("formError"),
  resetFormButton: document.getElementById("resetFormButton"),
  searchInput: document.getElementById("searchInput"),
  filterStatus: document.getElementById("filterStatus"),
  sortBy: document.getElementById("sortBy"),
  storageStatus: document.getElementById("storageStatus"),
  wordList: document.getElementById("wordList"),
  emptyState: document.getElementById("emptyState"),
  wordItemTemplate: document.getElementById("wordItemTemplate"),
  statTotal: document.getElementById("statTotal"),
  statRemembered: document.getElementById("statRemembered"),
  statUnremembered: document.getElementById("statUnremembered"),
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  reviewUnrememberedOnly: document.getElementById("reviewUnrememberedOnly"),
  shuffleReviewButton: document.getElementById("shuffleReviewButton"),
  flashcardButton: document.getElementById("flashcardButton"),
  flashcardLabel: document.getElementById("flashcardLabel"),
  flashcardPrimary: document.getElementById("flashcardPrimary"),
  flashcardSecondary: document.getElementById("flashcardSecondary"),
  reviewMeta: document.getElementById("reviewMeta"),
  reviewProgressText: document.getElementById("reviewProgressText"),
  reviewProgressFill: document.getElementById("reviewProgressFill"),
  revealButton: document.getElementById("revealButton"),
  nextReviewButton: document.getElementById("nextReviewButton"),
  reviewDontKnowButton: document.getElementById("reviewDontKnowButton"),
  reviewMediumButton: document.getElementById("reviewMediumButton"),
  reviewKnowButton: document.getElementById("reviewKnowButton"),
  themeToggle: document.getElementById("themeToggle"),
};

function formatDate(iso) {
  if (!iso) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function showMessage(message) {
  state.storageMessage = message;
  elements.storageStatus.textContent = message;
}

function setView(viewName) {
  state.currentView = viewName;

  Object.entries(elements.views).forEach(([name, view]) => {
    view.classList.toggle("view-active", name === viewName);
  });

  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  if (viewName === "review") {
    buildReviewDeck();
  }
}

function sortWords(words) {
  const list = [...words];

  list.sort((a, b) => {
    switch (state.sortBy) {
      case "createdAt-asc":
        return new Date(a.createdAt) - new Date(b.createdAt);
      case "level-desc":
        return b.level - a.level || new Date(b.createdAt) - new Date(a.createdAt);
      case "level-asc":
        return a.level - b.level || new Date(b.createdAt) - new Date(a.createdAt);
      case "createdAt-desc":
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  return list;
}

function getVisibleWords() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.words.filter((word) => {
    const matchesStatus =
      state.filterStatus === "all" ||
      (state.filterStatus === "remembered" && word.remembered) ||
      (state.filterStatus === "not-remembered" && !word.remembered);

    const matchesSearch =
      !query ||
      word.chinese.toLowerCase().includes(query) ||
      word.german.toLowerCase().includes(query) ||
      word.note.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  return sortWords(filtered);
}

function renderStats() {
  const total = state.words.length;
  const remembered = state.words.filter((word) => word.remembered).length;
  const unremembered = total - remembered;

  elements.statTotal.textContent = String(total);
  elements.statRemembered.textContent = String(remembered);
  elements.statUnremembered.textContent = String(unremembered);
}

function renderWordList() {
  const visibleWords = getVisibleWords();
  elements.wordList.innerHTML = "";

  elements.emptyState.classList.toggle("hidden", visibleWords.length !== 0);

  visibleWords.forEach((word) => {
    const fragment = elements.wordItemTemplate.content.cloneNode(true);
    fragment.querySelector(".word-german").textContent = word.german;
    fragment.querySelector(".word-chinese").textContent = word.chinese;
    fragment.querySelector(".word-note").textContent = word.note || "No note";
    fragment.querySelector(".word-level").textContent = `Level ${word.level}`;

    const rememberedNode = fragment.querySelector(".word-remembered");
    rememberedNode.textContent = word.remembered ? "Remembered" : "Still learning";
    rememberedNode.classList.toggle("remembered-pill", word.remembered);

    fragment.querySelector(".word-updated").textContent = `Updated ${formatDate(word.updatedAt)}`;
    fragment.querySelector(".word-edit-button").addEventListener("click", () => openEditForm(word.id));
    fragment.querySelector(".word-delete-button").addEventListener("click", () => handleDeleteWord(word.id));
    elements.wordList.appendChild(fragment);
  });

  renderStats();
  elements.storageStatus.textContent = state.storageMessage;
}

function resetForm() {
  state.editingId = null;
  elements.wordForm.reset();
  elements.wordId.value = "";
  elements.levelInput.value = "3";
  elements.levelValue.textContent = "3";
  elements.formError.textContent = "";
  elements.rememberedInput.checked = false;
}

async function openEditForm(id) {
  const word = await getWordById(id);
  if (!word) {
    showMessage("That word could not be loaded.");
    return;
  }

  state.editingId = id;
  elements.wordId.value = word.id;
  elements.chineseInput.value = word.chinese;
  elements.germanInput.value = word.german;
  elements.noteInput.value = word.note;
  elements.rememberedInput.checked = word.remembered;
  elements.levelInput.value = String(word.level);
  elements.levelValue.textContent = String(word.level);
  elements.formError.textContent = "";
  setView("form");
}

async function loadWords() {
  state.words = await getAllWords();
  renderWordList();
  if (state.currentView === "review") {
    buildReviewDeck();
  }
}

async function handleSaveWord(event) {
  event.preventDefault();
  const chinese = elements.chineseInput.value.trim();
  const german = elements.germanInput.value.trim();

  if (!chinese || !german) {
    elements.formError.textContent = "Chinese and German are required.";
    return;
  }

  const payload = {
    id: elements.wordId.value || undefined,
    chinese,
    german,
    note: elements.noteInput.value,
    remembered: elements.rememberedInput.checked,
    level: clampLevel(elements.levelInput.value),
  };

  try {
    await saveWord(payload);
    showMessage(payload.id ? "Word updated locally." : "Word added locally.");
    resetForm();
    await loadWords();
    setView("list");
  } catch (error) {
    console.error(error);
    elements.formError.textContent = "Saving failed on this device. Please try again.";
    showMessage("Saving failed. Check browser storage support on this phone.");
  }
}

async function handleDeleteWord(id) {
  const word = state.words.find((item) => item.id === id);
  if (!word) {
    return;
  }

  const confirmed = window.confirm(`Delete "${word.german}"? This only affects local device data.`);
  if (!confirmed) {
    return;
  }

  await deleteWord(id);
  showMessage("Word deleted.");
  await loadWords();
}

function buildReviewDeck(randomize = false) {
  let words = [...state.words];

  if (state.review.unrememberedOnly) {
    words = words.filter((word) => !word.remembered);
  }

  if (randomize) {
    words.sort(() => Math.random() - 0.5);
  } else {
    words = sortWords(words);
  }

  state.review.words = words;
  state.review.currentIndex = 0;
  state.review.revealed = false;
  renderReviewCard();
}

function getCurrentReviewWord() {
  return state.review.words[state.review.currentIndex] || null;
}

function renderReviewCard() {
  const word = getCurrentReviewWord();
  const total = state.review.words.length;
  const currentNumber = total === 0 ? 0 : state.review.currentIndex + 1;
  const progress = total === 0 ? 0 : (currentNumber / total) * 100;

  elements.reviewProgressText.textContent = `${currentNumber} / ${total}`;
  elements.reviewProgressFill.style.width = `${progress}%`;

  if (!word) {
    elements.flashcardLabel.textContent = "Chinese";
    elements.flashcardPrimary.textContent = "No word available";
    elements.flashcardSecondary.textContent = state.review.unrememberedOnly
      ? "There are no unremembered words right now."
      : "Add vocabulary and open review again.";
    elements.reviewMeta.textContent = "";
    return;
  }

  const revealed = state.review.revealed;
  elements.flashcardLabel.textContent = revealed ? "German" : "Chinese";
  elements.flashcardPrimary.textContent = revealed ? word.german : word.chinese;
  elements.flashcardSecondary.textContent = revealed
    ? word.note || `Chinese: ${word.chinese}`
    : "Tap the card to reveal the translation.";
  elements.reviewMeta.textContent = `Level ${word.level} • ${word.remembered ? "Remembered" : "Still learning"}`;
}

function advanceReview() {
  if (state.review.words.length === 0) {
    renderReviewCard();
    return;
  }

  state.review.currentIndex = (state.review.currentIndex + 1) % state.review.words.length;
  state.review.revealed = false;
  renderReviewCard();
}

async function updateWordFromReview(nextState) {
  const current = getCurrentReviewWord();
  if (!current) {
    return;
  }

  await saveWord({
    ...current,
    level: nextState.level,
    remembered: nextState.remembered,
  });

  showMessage(`Updated "${current.german}" from review.`);
  await loadWords();
  buildReviewDeck(true);
}

async function handleExport() {
  const words = await getAllWords();
  const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `xwordbook-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showMessage("Exported JSON backup.");
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const importedCount = await importWords(data);
    showMessage(`Imported ${importedCount} words.`);
    await loadWords();
  } catch (error) {
    console.error(error);
    showMessage("Import failed. Please use a JSON export from XWordbook.");
  } finally {
    event.target.value = "";
  }
}

function restoreTheme() {
  const theme = localStorage.getItem("xwordbook-theme");
  if (theme === "light") {
    document.documentElement.style.colorScheme = "light";
    document.documentElement.dataset.theme = "light";
  } else if (theme === "dark") {
    document.documentElement.style.colorScheme = "dark";
    document.documentElement.dataset.theme = "dark";
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  localStorage.setItem("xwordbook-theme", next);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    showMessage("App works without a service worker in this browser.");
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
    showMessage("Ready for offline use after the first load.");
  } catch (error) {
    console.error(error);
    showMessage("Service worker registration failed. The app still stores data locally.");
  }
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view === "form") {
        resetForm();
      }
      setView(view);
    });
  });

  elements.addWordButton.addEventListener("click", () => {
    resetForm();
    setView("form");
  });
  elements.openReviewButton.addEventListener("click", () => setView("review"));
  elements.closeReviewButton.addEventListener("click", () => setView("list"));
  elements.cancelEditButton.addEventListener("click", () => setView("list"));
  elements.wordForm.addEventListener("submit", handleSaveWord);
  elements.resetFormButton.addEventListener("click", resetForm);
  elements.levelInput.addEventListener("input", () => {
    elements.levelValue.textContent = elements.levelInput.value;
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderWordList();
  });
  elements.filterStatus.addEventListener("change", (event) => {
    state.filterStatus = event.target.value;
    renderWordList();
  });
  elements.sortBy.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    renderWordList();
  });
  elements.exportButton.addEventListener("click", handleExport);
  elements.importInput.addEventListener("change", handleImport);
  elements.reviewUnrememberedOnly.addEventListener("change", (event) => {
    state.review.unrememberedOnly = event.target.checked;
    buildReviewDeck();
  });
  elements.shuffleReviewButton.addEventListener("click", () => buildReviewDeck(true));
  elements.flashcardButton.addEventListener("click", () => {
    state.review.revealed = !state.review.revealed;
    renderReviewCard();
  });
  elements.revealButton.addEventListener("click", () => {
    state.review.revealed = !state.review.revealed;
    renderReviewCard();
  });
  elements.nextReviewButton.addEventListener("click", advanceReview);
  elements.reviewDontKnowButton.addEventListener("click", async () => {
    const current = getCurrentReviewWord();
    if (!current) {
      return;
    }
    await updateWordFromReview({
      level: 1,
      remembered: false,
    });
  });
  elements.reviewMediumButton.addEventListener("click", async () => {
    const current = getCurrentReviewWord();
    if (!current) {
      return;
    }
    const nextLevel = clampLevel(Math.round((current.level + 3) / 2));
    await updateWordFromReview({
      level: nextLevel,
      remembered: nextLevel >= 4,
    });
  });
  elements.reviewKnowButton.addEventListener("click", async () => {
    const current = getCurrentReviewWord();
    if (!current) {
      return;
    }
    await updateWordFromReview({
      level: clampLevel(current.level + 1),
      remembered: true,
    });
  });
  elements.themeToggle.addEventListener("click", toggleTheme);
}

async function init() {
  restoreTheme();
  bindEvents();
  await loadWords();
  await registerServiceWorker();
}

init().catch((error) => {
  console.error(error);
  showMessage("The app failed to initialize. IndexedDB may be unavailable.");
});
