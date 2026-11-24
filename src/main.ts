import { invoke, isTauri } from "@tauri-apps/api/core";

type Note = { id: string; title: string; body: string; updatedAt: number };

const titleInput = document.querySelector<HTMLInputElement>("#note-title")!;
const noteBody = document.querySelector<HTMLTextAreaElement>("#note-body")!;
const wordCount = document.querySelector<HTMLElement>("#word-count")!;
const breadcrumbTitle = document.querySelector<HTMLElement>("#breadcrumb-title")!;
const newNoteButton = document.querySelector<HTMLButtonElement>("#new-note")!;
const saveNoteButton = document.querySelector<HTMLButtonElement>("#save-note")!;
const notesList = document.querySelector<HTMLElement>("#notes-list")!;
const notesPlaceholder = document.querySelector<HTMLElement>("#notes-placeholder")!;
const draftStatus = document.querySelector<HTMLElement>("#draft-status")!;

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
  draftStatus.textContent = isTauri() ? "Salvamento pendente" : "Abra o aplicativo desktop para salvar";
  updateEditorStatus();
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  if (isTauri()) saveTimer = window.setTimeout(() => { void flushChanges(); }, 700);
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
  saveNoteButton.disabled = true;
  const title = titleInput.value;
  const body = noteBody.value;
  draftStatus.textContent = "Salvando...";
  try {
    const saved = await invoke<Note>("save_note", { id: currentId, title, body });
    currentId = saved.id;
    dirty = titleInput.value !== title || noteBody.value !== body;
    draftStatus.textContent = dirty ? "Salvamento pendente" : "Página salva";
    try {
      await refreshNotes();
    } catch (error) {
      draftStatus.textContent = `Página salva, mas a lista não pôde atualizar: ${String(error)}`;
    }
    return true;
  } catch (error) {
    draftStatus.textContent = `Erro ao salvar: ${String(error)}`;
    return false;
  } finally {
    saveNoteButton.disabled = false;
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
  while (dirty) {
    if (!(await saveNote())) return false;
  }
  return true;
}

titleInput.addEventListener("input", markDirty);
noteBody.addEventListener("input", markDirty);
saveNoteButton.addEventListener("click", () => { void flushChanges(); });
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
  draftStatus.textContent = "Nova página";
  updateEditorStatus();
  renderNotes();
  titleInput.focus();
});

updateEditorStatus();
if (isTauri()) {
  refreshNotes().catch((error) => {
    draftStatus.textContent = `Erro ao carregar páginas: ${String(error)}`;
  });
} else {
  saveNoteButton.disabled = true;
  draftStatus.textContent = "Abra o aplicativo desktop para salvar";
}
