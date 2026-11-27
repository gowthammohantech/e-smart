// Keeps a console window from opening next to the app on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::DialogExt;

/// Asks where to save a file (the template, the list of rows to fix) and writes it there.
/// Returns the path it was saved to, or nothing when the person cancelled.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, data: Vec<u8>) -> Result<Option<String>, String> {
    let extension = std::path::Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("xlsx")
        .to_string();
    let picked = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter("Excel workbook", &[extension.as_str()])
        .blocking_save_file();
    let Some(path) = picked else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file])
        .run(tauri::generate_context!())
        .expect("error while running the Elixir Books Smart Migrator");
}
