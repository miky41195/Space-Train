//! Più finestre nello stesso processo.
//!
//! Una seconda copia dell'app non potrebbe usare la rete locale (porte già
//! occupate) e romperebbe l'istanza singola. Le finestre in più invece
//! vivono qui dentro e condividono tutto: si aprono con Ctrl+N o con «Apri
//! in una nuova finestra».

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

#[derive(Default)]
pub struct Finestre {
    /// L'etichetta dell'ultima finestra che ha avuto il fuoco.
    ultima: Mutex<Option<String>>,
    prossima: AtomicU32,
}

/// L'ultima finestra usata, o una qualsiasi ancora aperta.
pub fn ultima(app: &tauri::AppHandle) -> WebviewWindow {
    let etichetta = app
        .state::<Finestre>()
        .ultima
        .lock()
        .ok()
        .and_then(|u| u.clone());
    etichetta
        .and_then(|e| app.get_webview_window(&e))
        .or_else(|| app.get_webview_window("main"))
        .or_else(|| app.webview_windows().into_values().next())
        .expect("l'app ha sempre almeno una finestra finché è in esecuzione")
}

/// Tiene traccia del fuoco e dimentica le finestre chiuse.
pub fn evento(w: &tauri::Window, evento: &WindowEvent) {
    let app = w.app_handle();
    match evento {
        // L'editor dei temi non è una finestra dell'esploratore: non deve
        // ricevere cartelle da aprire né avvisi della rete.
        WindowEvent::Focused(true) if w.label() != EDITOR_TEMI => {
            if let Ok(mut u) = app.state::<Finestre>().ultima.lock() {
                *u = Some(w.label().to_string());
            }
        }
        WindowEvent::Destroyed if w.label() == EDITOR_TEMI => {
            // Comunque si chiuda (anche con Alt+F4), chi l'ha aperto toglie
            // l'anteprima.
            let _ = app.emit(EDITOR_TEMI, serde_json::json!({ "tipo": "chiudi" }));
        }
        WindowEvent::Destroyed => {
            app.state::<crate::osserva::Osservatore>().dimentica(w.label());
        }
        _ => {}
    }
}

/// Apre una nuova finestra. Il percorso arriva alla pagina con uno script
/// d'avvio, prima di qualsiasi altro codice: così la finestra nasce già
/// sulla cartella giusta invece di partire da C: e poi spostarsi.
pub fn nuova(app: &tauri::AppHandle, path: Option<String>) -> Result<String, String> {
    let stato = app.state::<Finestre>();
    let n = stato.prossima.fetch_add(2, Ordering::Relaxed) + 2;
    let etichetta = format!("finestra-{}", n);

    let apri = serde_json::to_string(&path).map_err(|e| e.to_string())?;
    let script = format!("window.__SPACE_TRAIN_APRI = {};", apri);

    // Un po' spostata rispetto all'ultima, come fa Windows, perché non la
    // copra esattamente.
    let (x, y) = ultima(app)
        .outer_position()
        .map(|p| {
            let scala = ultima(app).scale_factor().unwrap_or(1.0);
            (p.x as f64 / scala + 32.0, p.y as f64 / scala + 32.0)
        })
        .unwrap_or((120.0, 120.0));

    WebviewWindowBuilder::new(app, &etichetta, WebviewUrl::App("index.html".into()))
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
    Ok(etichetta)
}

/// L'etichetta della finestra dell'editor dei temi, e il nome dei suoi eventi.
pub const EDITOR_TEMI: &str = "editor-temi";

/// Apre l'editor dei temi in una finestra sua, sopra quella che l'ha chiesto.
/// Se è già aperto lo porta davanti. La pagina sa chi avvisare dallo
/// script d'avvio: l'anteprima dal vivo va solo a quella finestra.
pub fn editor_temi(app: &tauri::AppHandle, da: &WebviewWindow) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(EDITOR_TEMI) {
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let script = format!(
        "window.__SPACE_TRAIN_EDITOR = {};",
        serde_json::to_string(da.label()).map_err(|e| e.to_string())?
    );
    WebviewWindowBuilder::new(app, EDITOR_TEMI, WebviewUrl::App("index.html".into()))
        .title("Editor dei temi")
        .inner_size(640.0, 760.0)
        .min_inner_size(460.0, 360.0)
        .center()
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        // Di proprietà della finestra dell'app: le resta sempre sopra, ma si
        // sposta liberamente su tutto lo schermo.
        .parent(da)
        .map_err(|e| e.to_string())?
        .initialization_script(&script)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

