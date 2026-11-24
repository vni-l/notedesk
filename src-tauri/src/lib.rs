use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::Path,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: String,
    title: String,
    body: String,
    updated_at: u64,
}

fn notes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("notes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn legacy_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .with_file_name("com.local.bloco-de-notas")
        .join("notes"))
}

fn markdown(note: &Note) -> String {
    format!(
        "# {}\n\n{}",
        note.title.replace(['\r', '\n'], " "),
        note.body
    )
}

fn parse_markdown(id: String, content: &str, updated_at: u64) -> Note {
    let (heading, rest) = content.split_once('\n').unwrap_or((content, ""));
    Note {
        id,
        title: heading
            .trim_end_matches('\r')
            .strip_prefix("# ")
            .unwrap_or(heading)
            .to_string(),
        body: rest.strip_prefix('\n').unwrap_or(rest).to_string(),
        updated_at,
    }
}

fn load_directory(
    dir: &Path,
    notes: &mut HashMap<String, Note>,
    extension: &str,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != extension) {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or("Nome de página inválido")?
            .to_string();
        if !valid_id(&id) {
            continue;
        }
        let note = if extension == "md" {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .map_err(|e| e.to_string())?;
            let updated_at = modified
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis() as u64;
            parse_markdown(id, &content, updated_at)
        } else {
            serde_json::from_slice::<Note>(&fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?
        };
        notes.insert(note.id.clone(), note);
    }
    Ok(())
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn write_page(path: &Path, content: &str) -> Result<(), String> {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temp = path.with_extension(format!("{}-{suffix}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn list_notes(app: tauri::AppHandle) -> Result<Vec<Note>, String> {
    let mut by_id = HashMap::new();
    load_directory(&legacy_dir(&app)?, &mut by_id, "json")?;
    let dir = notes_dir(&app)?;
    load_directory(&dir, &mut by_id, "json")?;
    load_directory(&dir, &mut by_id, "md")?;
    let mut notes: Vec<_> = by_id.into_values().collect();
    notes.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(notes)
}

#[tauri::command]
fn save_note(
    app: tauri::AppHandle,
    id: Option<String>,
    title: String,
    body: String,
) -> Result<Note, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let id = match id {
        Some(id) if valid_id(&id) => id,
        Some(_) => return Err("Identificador de página inválido".into()),
        None => format!("{:x}-{:x}", now.as_nanos(), std::process::id()),
    };
    let note = Note {
        id: id.clone(),
        title: title.trim().to_string(),
        body,
        updated_at: now.as_millis() as u64,
    };
    let path = notes_dir(&app)?.join(format!("{id}.md"));
    write_page(&path, &markdown(&note))?;
    Ok(note)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_notes, save_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_round_trip_preserves_page() {
        let note = Note {
            id: "abc-123".into(),
            title: "Página".into(),
            body: "primeira linha\n\nsegunda linha".into(),
            updated_at: 10,
        };
        let loaded = parse_markdown(note.id.clone(), &markdown(&note), note.updated_at);
        assert_eq!(loaded.title, note.title);
        assert_eq!(loaded.body, note.body);
    }

    #[test]
    fn page_write_replaces_complete_file() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!(
                "page-write-test-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&dir).unwrap();
        let page = dir.join("example.md");
        write_page(&page, "# Primeira\n\nconteúdo antigo").unwrap();
        write_page(&page, "# Segunda\n\nnovo").unwrap();
        assert_eq!(fs::read_to_string(&page).unwrap(), "# Segunda\n\nnovo");
        fs::remove_dir_all(dir).unwrap();
    }
}
