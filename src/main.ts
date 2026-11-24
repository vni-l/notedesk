import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Note = { id: string; title: string; body: string; updatedAt: number };

const titleInput = document.querySelector<HTMLInputElement>("#note-title")!;
const noteBody = document.querySelector<HTMLTextAreaElement>("#note-body")!;
const wordCount = document.querySelector<HTMLElement>("#word-count")!;
const breadcrumbTitle = document.querySelector<HTMLElement>("#breadcrumb-title")!;
const newNoteButton = document.querySelector<HTMLButtonElement>("#new-note")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settings-button")!;
const themeMenu = document.querySelector<HTMLElement>("#theme-menu")!;
const notesList = document.querySelector<HTMLElement>("#notes-list")!;
const notesPlaceholder = document.querySelector<HTMLElement>("#notes-placeholder")!;
const draftStatus = document.querySelector<HTMLElement>("#draft-status")!;
const notesLocationPath = document.querySelector<HTMLElement>("#notes-location-path")!;
const brandIcon = document.querySelector<HTMLImageElement>("#brand-icon")!;
const lightIcon = new URL("./assets/notedesk-light.png", import.meta.url).href;
const darkIcon = new URL("./assets/notedesk-dark.png", import.meta.url).href;

let notes: Note[] = [];
let currentId: string | null = null;
let dirty = false;
let saveTimer: number | undefined;
let pendingSave: Promise<boolean> | null = null;

function updateEditorStatus(): void {
  const content = noteBody.value;
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  breadcrumbTitle.textContent = titleInput.value.trim() || "Nova página";
  wordCount.textContent = `${words} ${words === 1 ? "palavra" : "palavras"} · ${content.length} caracteres`;
}

function renderNotes(): void {
  notesList.replaceChildren();
  notesPlaceholder.hidden = notes.length > 0;
  for (const note of notes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-list-item";
    button.textContent = note.title.trim() || "Sem título";
    button.setAttribute("aria-current", note.id === currentId ? "true" : "false");
    button.addEventListener("click", async () => {
      if (note.id === currentId || !(await flushChanges())) return;
      currentId = note.id;
      titleInput.value = note.title;
      noteBody.value = note.body;
      dirty = false;
      draftStatus.textContent = "Página salva";
      updateEditorStatus();
      renderNotes();
    });
    notesList.append(button);
  }
}

function markDirty(): void {
  dirty = true;
  draftStatus.textContent = isTauri() ? "Salvando automaticamente..." : "Prévia web sem salvamento";
  updateEditorStatus();
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  if (isTauri()) saveTimer = window.setTimeout(() => { void flushChanges(); }, 500);
}

async function refreshNotes(): Promise<void> {
  notes = await invoke<Note[]>("list_notes");
  renderNotes();
}

async function saveNote(): Promise<boolean> {
  if (!isTauri()) return false;
  if (pendingSave) return pendingSave;
  pendingSave = persistNote();
  try {
    return await pendingSave;
  } finally {
    pendingSave = null;
  }
}

async function persistNote(): Promise<boolean> {
  const title = titleInput.value;
  const body = noteBody.value;
  draftStatus.textContent = "Salvando...";
  try {
    const saved = await invoke<Note>("save_note", { id: currentId, title, body });
    currentId = saved.id;
    dirty = titleInput.value !== title || noteBody.value !== body;
    draftStatus.textContent = dirty ? "Salvando automaticamente..." : "salvamento automático";
    try {
      await refreshNotes();
    } catch (error) {
      draftStatus.textContent = `Página salva, mas a lista não pôde atualizar: ${String(error)}`;
    }
    return true;
  } catch (error) {
    draftStatus.textContent = `Erro ao salvar: ${String(error)}`;
    return false;
  }
}

async function flushChanges(): Promise<boolean> {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!isTauri() && dirty) {
    if (!window.confirm("Esta prévia não salva páginas. Descartar as alterações?")) return false;
    dirty = false;
    return true;
  }
  if (pendingSave && !(await pendingSave)) return false;
  while (dirty) {
    if (!(await saveNote())) return false;
  }
  return true;
}

titleInput.addEventListener("input", markDirty);
noteBody.addEventListener("input", markDirty);
titleInput.addEventListener("blur", () => { if (dirty) void flushChanges(); });
noteBody.addEventListener("blur", () => { if (dirty) void flushChanges(); });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void flushChanges();
  }
});
newNoteButton.addEventListener("click", async () => {
  if (!(await flushChanges())) return;
  currentId = null;
  titleInput.value = "";
  noteBody.value = "";
  dirty = false;
  draftStatus.textContent = "salvamento automático";
  updateEditorStatus();
  renderNotes();
  titleInput.focus();
});

updateEditorStatus();
function setTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  brandIcon.src = theme === "dark" ? darkIcon : lightIcon;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content", theme === "dark" ? "#1c1e1b" : "#f8f8f5",
  );
  for (const button of themeMenu.querySelectorAll<HTMLButtonElement>("[data-theme-choice]")) {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
  }
  try { localStorage.setItem("notedesk-theme", theme); } catch { /* armazenamento indisponível */ }
}

let storedTheme: string | null = null;
try { storedTheme = localStorage.getItem("notedesk-theme"); } catch { /* armazenamento indisponível */ }
setTheme(storedTheme === "dark" ? "dark" : "light");
document.documentElement.dataset.themeReady = "true";
settingsButton.addEventListener("click", () => {
  themeMenu.hidden = !themeMenu.hidden;
  settingsButton.setAttribute("aria-expanded", String(!themeMenu.hidden));
});
themeMenu.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    setTheme(button.dataset.themeChoice === "dark" ? "dark" : "light");
    themeMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.focus();
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    themeMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  }
});

if (isTauri()) {
  invoke<string>("notes_location").then((path) => {
    notesLocationPath.textContent = path;
    notesLocationPath.title = path;
  }).catch((error) => {
    notesLocationPath.textContent = `local indisponível: ${String(error)}`;
  });
  refreshNotes().catch((error) => {
    draftStatus.textContent = `Erro ao carregar páginas: ${String(error)}`;
  });
  getCurrentWindow().onCloseRequested(async (event) => {
    if (!(await flushChanges())) event.preventDefault();
  }).catch((error) => {
    draftStatus.textContent = `Erro ao preparar salvamento: ${String(error)}`;
  });
} else {
  notesLocationPath.textContent = "disponível no aplicativo desktop";
  draftStatus.textContent = "salvamento automático";
}
