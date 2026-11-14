//! More windows in the same process.
//!
//! A second copy of the app could not use the lan (ports already
//! taken) and would break the single instance. The extra windows instead
//! live in here and share everything: they open with Ctrl+N or with «Apri
//! in una nuova finestra».

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

#[derive(Default)]
pub struct AppWindows {
    /// The label of the last window that had the focus.
    last: Mutex<Option<String>>,
    next: AtomicU32,
}

/// The last window used, or any one still open.
pub fn last(app: &tauri::AppHandle) -> WebviewWindow {
    let label = app
        .state::<AppWindows>()
        .last
        .lock()
        .ok()
        .and_then(|u| u.clone());
    label
        .and_then(|e| app.get_webview_window(&e))
        .or_else(|| app.get_webview_window("main"))
        .or_else(|| app.webview_windows().into_values().next())
        .expect("the app always has at least one window while running")
}

/// Keeps track of the focus and forgets the closed windows.
pub fn on_event(w: &tauri::Window, event: &WindowEvent) {
    let app = w.app_handle();
    match event {
        // The theme editor is not an explorer window: it must not receive
        // folders to open or network notices.
        WindowEvent::Focused(true) if w.label() != THEME_EDITOR => {
            if let Ok(mut u) = app.state::<AppWindows>().last.lock() {
                *u = Some(w.label().to_string());
            }
        }
        WindowEvent::Destroyed if w.label() == THEME_EDITOR => {
            // However it gets closed (even with Alt+F4), whoever opened it
            // removes the preview.
            let _ = app.emit(THEME_EDITOR, serde_json::json!({ "kind": "close" }));
        }
        WindowEvent::Destroyed => {
            app.state::<crate::watcher::FolderWatcher>().forget(w.label());
        }
        _ => {}
    }
}

/// Opens a new window. The path reaches the page with an initialization
/// script, before any other code: that way the window is born already on
/// the right folder instead of starting from C: and then moving.
pub fn new(app: &tauri::AppHandle, path: Option<String>) -> Result<String, String> {
    let state = app.state::<AppWindows>();
    let n = state.next.fetch_add(2, Ordering::Relaxed) + 2;
    let label = format!("window-{}", n);

    let open = serde_json::to_string(&path).map_err(|e| e.to_string())?;
    let script = format!("window.__SPACE_TRAIN_OPEN = {};", open);

    // Offset a little from the last one, as Windows does, so it does not
    // cover it exactly.
    let (x, y) = last(app)
        .outer_position()
        .map(|p| {
            let scale = last(app).scale_factor().unwrap_or(1.0);
            (p.x as f64 / scale + 32.0, p.y as f64 / scale + 32.0)
        })
        .unwrap_or((120.0, 120.0));

    WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("Space Train")
        .inner_size(1100.0, 700.0)
        .min_inner_size(640.0, 400.0)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .initialization_script(&script)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(label)
}

/// The label of the theme editor's window, and the name of its events.
pub const THEME_EDITOR: &str = "theme-editor";

/// Opens the theme editor in a window of its own, above the one that asked for it.
/// If it is already open it brings it to the front. The page knows whom to notify
/// from the initialization script: the live preview goes only to that window.
pub fn theme_editor(app: &tauri::AppHandle, from: &WebviewWindow) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(THEME_EDITOR) {
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let script = format!(
        "window.__SPACE_TRAIN_EDITOR = {};",
        serde_json::to_string(from.label()).map_err(|e| e.to_string())?
    );
    WebviewWindowBuilder::new(app, THEME_EDITOR, WebviewUrl::App("index.html".into()))
        .title("Editor dei temi")
        .inner_size(640.0, 760.0)
        .min_inner_size(460.0, 360.0)
        .center()
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        // Owned by the app's window: it always stays above it, but moves
        // freely over the whole screen.
        .parent(from)
        .map_err(|e| e.to_string())?
        .initialization_script(&script)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

