import {
  deleteWord,
  getAllWords,
  getWordById,
  importWords,
  saveWord,
} from "./db.js";

const CATEGORY_CONFIG = {
  "needs-review": {
    label: "Needs review",
    level: 1,
    remembered: false,
    sortWeight: 1,
  },
  learning: {
    label: "Learning",
    level: 3,
    remembered: false,
    sortWeight: 2,
  },
  confident: {
    label: "Confident",
    level: 5,
    remembered: true,
    sortWeight: 3,
  },
};

const CATEGORY_ORDER = ["needs-review", "learning", "confident"];

const state = {
  words: [],
  currentView: "list",
  editingId: null,
  search: "",
  filterStatus: "all",
  sortBy: "createdAt-desc",
  listDisplayLanguage: "german",
  storageMessage: "",
  expandedWordId: null,
  review: {
    words: [],
    currentIndex: 0,
    revealed: false,
    selectedCategories: [...CATEGORY_ORDER],
  },
};

const elements = {
  views: {
    list: document.getElementById("view-list"),
    form: document.getElementById("view-form"),
    review: document.getElementById("view-review"),
    tools: document.getElementById("view-tools"),
  },
  tabButtons: [...document.querySelectorAll(".tabbar-button")],
  listDisplayButtons: [...document.querySelectorAll(".display-toggle-button")],
  closeReviewButton: document.getElementById("closeReviewButton"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  wordForm: document.getElementById("wordForm"),
  wordId: document.getElementById("wordId"),
  chineseInput: document.getElementById("chineseInput"),
  germanInput: document.getElementById("germanInput"),
  noteInput: document.getElementById("noteInput"),
  categoryInput: document.getElementById("categoryInput"),
  formError: document.getElementById("formError"),
  resetFormButton: document.getElementById("resetFormButton"),
  searchInput: document.getElementById("searchInput"),
  filterStatus: document.getElementById("filterStatus"),
  sortBy: document.getElementById("sortBy"),
  wordList: document.getElementById("wordList"),
  emptyState: document.getElementById("emptyState"),
  wordItemTemplate: document.getElementById("wordItemTemplate"),
  exportButton: document.getElementById("exportButton"),
  importInput: document.getElementById("importInput"),
  reviewCategoryButtons: [...document.querySelectorAll("[data-review-category]")],
  shuffleReviewButton: document.getElementById("shuffleReviewButton"),
  flashcardButton: document.getElementById("flashcardButton"),
  flashcardLabel: document.getElementById("flashcardLabel"),
  flashcardPrimary: document.getElementById("flashcardPrimary"),
  flashcardSecondary: document.getElementById("flashcardSecondary"),
  reviewMeta: document.getElementById("reviewMeta"),
  reviewStepText: document.getElementById("reviewStepText"),
  reviewRemainingText: document.getElementById("reviewRemainingText"),
  reviewProgressText: document.getElementById("reviewProgressText"),
  reviewProgressFill: document.getElementById("reviewProgressFill"),
  reviewAnswerActions: document.getElementById("reviewAnswerActions"),
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
}

function clearMessage() {
  state.storageMessage = "";
}

function getWordCategory(word) {
  if (word.level <= 1) {
    return "needs-review";
  }

  if (word.level >= 5) {
    return "confident";
  }

  return "learning";
}

function getCategoryLabel(category) {
  return CATEGORY_CONFIG[category]?.label || "Learning";
}

function getCategoryPayload(category) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.learning;
}

function getSelectedReviewCategories() {
  return new Set(state.review.selectedCategories);
}

function isCategorySelected(category) {
  return getSelectedReviewCategories().has(category);
}

function renderReviewCategoryButtons() {
  elements.reviewCategoryButtons.forEach((button) => {
    const isActive = isCategorySelected(button.dataset.reviewCategory);
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setListDisplayLanguage(language) {
  state.listDisplayLanguage = language;
  localStorage.setItem("xwordbook-list-display-language", language);
  elements.listDisplayButtons.forEach((button) => {
    const isActive = button.dataset.displayLanguage === language;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  renderWordList();
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
      case "category-desc":
        return CATEGORY_CONFIG[getWordCategory(b)].sortWeight - CATEGORY_CONFIG[getWordCategory(a)].sortWeight || new Date(b.createdAt) - new Date(a.createdAt);
      case "category-asc":
        return CATEGORY_CONFIG[getWordCategory(a)].sortWeight - CATEGORY_CONFIG[getWordCategory(b)].sortWeight || new Date(b.createdAt) - new Date(a.createdAt);
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
    const category = getWordCategory(word);
    const matchesStatus =
      state.filterStatus === "all" ||
      state.filterStatus === category;

    const matchesSearch =
      !query ||
      word.chinese.toLowerCase().includes(query) ||
      word.german.toLowerCase().includes(query) ||
      word.note.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  return sortWords(filtered);
}

function createWordCard(word) {
  const fragment = elements.wordItemTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".word-card");
  const summaryButton = fragment.querySelector(".word-summary-button");
  const details = fragment.querySelector(".word-details");
  const expanded = state.expandedWordId === word.id;
  const chineseInput = fragment.querySelector(".word-chinese-input");
  const germanInput = fragment.querySelector(".word-german-input");
  const noteInput = fragment.querySelector(".word-note-input");
  const rememberedNode = fragment.querySelector(".word-remembered");
  const moveActions = fragment.querySelector(".word-move-actions");

  article.classList.toggle("word-card-expanded", expanded);
  summaryButton.setAttribute("aria-expanded", String(expanded));
  details.classList.toggle("hidden", !expanded);

  const category = getWordCategory(word);
  fragment.querySelector(".word-german").textContent =
    state.listDisplayLanguage === "chinese" ? word.chinese : word.german;
  chineseInput.value = word.chinese;
  germanInput.value = word.german;
  noteInput.value = word.note || "";
  fragment.querySelector(".word-level").textContent = getCategoryLabel(category);
  rememberedNode.textContent = getCategoryLabel(category);
  rememberedNode.classList.toggle("remembered-pill", category === "confident");
  fragment.querySelector(".word-updated").textContent = `Updated ${formatDate(word.updatedAt)}`;
  fragment.querySelector(".word-summary-button").addEventListener("click", () => {
    state.expandedWordId = state.expandedWordId === word.id ? null : word.id;
    renderWordList();
  });

  const saveInlineChanges = async () => {
    const nextChinese = chineseInput.value.trim();
    const nextGerman = germanInput.value.trim();
    const nextNote = noteInput.value.trim();

    if (!nextChinese || !nextGerman) {
      chineseInput.value = word.chinese;
      germanInput.value = word.german;
      noteInput.value = word.note || "";
      return;
    }

    if (
      nextChinese === word.chinese &&
      nextGerman === word.german &&
      nextNote === (word.note || "")
    ) {
      return;
    }

    await saveWord({
      ...word,
      chinese: nextChinese,
      german: nextGerman,
      note: nextNote,
    });

    await loadWords();
  };

  chineseInput.addEventListener("blur", saveInlineChanges);
  germanInput.addEventListener("blur", saveInlineChanges);
  noteInput.addEventListener("blur", saveInlineChanges);

  CATEGORY_ORDER.filter((nextCategory) => nextCategory !== category).forEach((nextCategory) => {
    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.className = "secondary-button word-move-button";
    moveButton.textContent = `Move to ${getCategoryLabel(nextCategory)}`;
    moveButton.addEventListener("click", async () => {
      await saveWord({
        ...word,
        ...getCategoryPayload(nextCategory),
      });
      await loadWords();
    });
    moveActions.appendChild(moveButton);
  });

  fragment.querySelector(".word-edit-button").addEventListener("click", () => openEditForm(word.id));
  fragment.querySelector(".word-delete-button").addEventListener("click", () => handleDeleteWord(word.id));

  return fragment;
}

function renderWordList() {
  const visibleWords = getVisibleWords();
  elements.wordList.innerHTML = "";

  elements.emptyState.classList.toggle("hidden", visibleWords.length !== 0);

  if (visibleWords.length > 0) {
    const groups = {
      "needs-review": [],
      learning: [],
      confident: [],
    };

    visibleWords.forEach((word) => {
      groups[getWordCategory(word)].push(word);
    });

    const columns = [
      {
        key: "needs-review",
        title: "Needs review",
        description: "Needs work",
        emptyText: "Nothing urgent here.",
      },
      {
        key: "learning",
        title: "Learning",
        description: "Still forming",
        emptyText: "No active learning words.",
      },
      {
        key: "confident",
        title: "Confident",
        description: "Feels solid",
        emptyText: "No mastered words yet.",
      },
    ];

    columns.forEach((column) => {
      const section = document.createElement("section");
      section.className = `word-column word-column-${column.key}`;

      const header = document.createElement("header");
      header.className = "word-column-header";
      header.innerHTML = `
        <div>
          <h3>${column.title}</h3>
          <p>${column.description}</p>
        </div>
        <span class="word-column-count">${groups[column.key].length}</span>
      `;
      section.appendChild(header);

      const stack = document.createElement("div");
      stack.className = "word-column-stack";

      if (groups[column.key].length === 0) {
        const empty = document.createElement("p");
        empty.className = "word-column-empty";
        empty.textContent = column.emptyText;
        stack.appendChild(empty);
      } else {
        groups[column.key].forEach((word) => {
          stack.appendChild(createWordCard(word));
        });
      }

      section.appendChild(stack);
      elements.wordList.appendChild(section);
    });
  }
}

function resetForm() {
  state.editingId = null;
  elements.wordForm.reset();
  elements.wordId.value = "";
  elements.categoryInput.value = "learning";
  elements.formError.textContent = "";
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
  elements.categoryInput.value = getWordCategory(word);
  elements.formError.textContent = "";
  setView("form");
}

async function loadWords() {
  state.words = await getAllWords();
  renderWordList();
  if (state.currentView === "review" && state.review.words.length === 0) {
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
    ...CATEGORY_CONFIG[elements.categoryInput.value || "learning"],
  };

  try {
    await saveWord(payload);
    clearMessage();
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
  clearMessage();
  await loadWords();
}

function buildReviewDeck(randomize = false) {
  let words = [...state.words];

  words = words.filter((word) => isCategorySelected(getWordCategory(word)));

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

function refreshReviewDeck(preferredWordId = null) {
  const reviewWordIds = state.review.words.map((word) => word.id);
  const latestWords = new Map(state.words.map((word) => [word.id, word]));

  let words = reviewWordIds.map((id) => latestWords.get(id)).filter(Boolean);

  words = words.filter((word) => isCategorySelected(getWordCategory(word)));

  const existingIds = new Set(words.map((word) => word.id));
  const missingWords = state.words.filter((word) => {
    if (existingIds.has(word.id)) {
      return false;
    }

    return isCategorySelected(getWordCategory(word));
  });

  state.review.words = [...words, ...sortWords(missingWords)];

  if (preferredWordId) {
    const nextIndex = state.review.words.findIndex((word) => word.id === preferredWordId);
    state.review.currentIndex = nextIndex >= 0 ? nextIndex : 0;
  } else if (state.review.currentIndex >= state.review.words.length) {
    state.review.currentIndex = 0;
  }

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
  const remaining = total === 0 ? 0 : Math.max(0, total - currentNumber);

  elements.reviewProgressText.textContent = `${currentNumber} / ${total}`;
  elements.reviewProgressFill.style.width = `${progress}%`;
  elements.reviewRemainingText.textContent = `${remaining} left`;

  if (!word) {
    elements.flashcardLabel.textContent = "Chinese";
    elements.flashcardPrimary.textContent = "No word available";
    elements.flashcardSecondary.textContent = state.review.selectedCategories.length === CATEGORY_ORDER.length
      ? "Add vocabulary and open review again."
      : `There are no words in ${state.review.selectedCategories.map(getCategoryLabel).join(", ")} right now.`;
    elements.reviewMeta.textContent = "";
    elements.reviewStepText.textContent = "Nothing to review right now.";
    elements.reviewAnswerActions.classList.add("hidden");
    elements.revealButton.textContent = "Show answer";
    elements.revealButton.disabled = true;
    elements.nextReviewButton.textContent = "Next word";
    elements.nextReviewButton.disabled = true;
    return;
  }

  const revealed = state.review.revealed;
  elements.reviewAnswerActions.classList.toggle("hidden", !revealed);
  elements.revealButton.disabled = false;
  elements.nextReviewButton.disabled = false;
  elements.flashcardLabel.textContent = revealed ? "German" : "Chinese";
  elements.flashcardPrimary.textContent = revealed ? word.german : word.chinese;
  elements.flashcardSecondary.textContent = revealed
    ? word.note || `Chinese: ${word.chinese}`
    : "Pause and try to recall the German word before revealing.";
  elements.reviewMeta.textContent = getCategoryLabel(getWordCategory(word));
  elements.reviewStepText.textContent = revealed ? "How well did you know it?" : "Think first, then reveal.";
  elements.revealButton.textContent = revealed ? "Hide answer" : "Show answer";
  elements.nextReviewButton.textContent = revealed ? "Next word" : "Skip for now";
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

  const nextWordId = state.review.words.length > 1
    ? state.review.words[(state.review.currentIndex + 1) % state.review.words.length].id
    : null;

  await saveWord({
    ...current,
    level: nextState.level,
    remembered: nextState.remembered,
  });

  clearMessage();
  await loadWords();
  refreshReviewDeck(nextWordId);
}

async function handleExport() {
  try {
    const words = await getAllWords();
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `xwordbook-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    clearMessage();
  } catch (error) {
    console.error(error);
    showMessage("Export failed.");
  }
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
    if (importedCount === 0) {
      showMessage("No valid words found in that file.");
    } else {
      clearMessage();
    }
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

function restorePreferences() {
  const listDisplayLanguage = localStorage.getItem("xwordbook-list-display-language");
  if (listDisplayLanguage === "chinese" || listDisplayLanguage === "german") {
    state.listDisplayLanguage = listDisplayLanguage;
  }

  const reviewCategories = localStorage.getItem("xwordbook-review-categories");
  if (reviewCategories) {
    const parsed = reviewCategories
      .split(",")
      .map((category) => category.trim())
      .filter((category) => CATEGORY_ORDER.includes(category));

    if (parsed.length > 0) {
      state.review.selectedCategories = [...new Set(parsed)];
    }
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
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
    clearMessage();
  } catch (error) {
    console.error(error);
    clearMessage();
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

  elements.listDisplayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setListDisplayLanguage(button.dataset.displayLanguage);
    });
  });

  elements.closeReviewButton.addEventListener("click", () => setView("list"));
  elements.cancelEditButton.addEventListener("click", () => setView("list"));
  elements.wordForm.addEventListener("submit", handleSaveWord);
  elements.resetFormButton.addEventListener("click", resetForm);
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
  elements.reviewCategoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.reviewCategory;
      const selected = new Set(state.review.selectedCategories);

      if (selected.has(category)) {
        if (selected.size === 1) {
          return;
        }
        selected.delete(category);
      } else {
        selected.add(category);
      }

      state.review.selectedCategories = CATEGORY_ORDER.filter((value) => selected.has(value));
      localStorage.setItem("xwordbook-review-categories", state.review.selectedCategories.join(","));
      renderReviewCategoryButtons();
      buildReviewDeck();
    });
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
      ...CATEGORY_CONFIG["needs-review"],
    });
  });
  elements.reviewMediumButton.addEventListener("click", async () => {
    const current = getCurrentReviewWord();
    if (!current) {
      return;
    }
    await updateWordFromReview({
      ...CATEGORY_CONFIG.learning,
    });
  });
  elements.reviewKnowButton.addEventListener("click", async () => {
    const current = getCurrentReviewWord();
    if (!current) {
      return;
    }
    await updateWordFromReview({
      ...CATEGORY_CONFIG.confident,
    });
  });
  elements.themeToggle.addEventListener("click", toggleTheme);
}

async function init() {
  restoreTheme();
  restorePreferences();
  bindEvents();
  setListDisplayLanguage(state.listDisplayLanguage);
  renderReviewCategoryButtons();
  await loadWords();
  await registerServiceWorker();
}

init().catch((error) => {
  console.error(error);
  showMessage("The app failed to initialize. IndexedDB may be unavailable.");
});
