//! Più finestre nello stesso processo.
//!
//! Una seconda copia dell'app non potrebbe usare la rete locale (porte già
//! occupate) e romperebbe l'istanza singola. Le finestre in più invece
//! vivono qui dentro e condividono tutto: si aprono con Ctrl+N o con «Apri
//! in una nuova finestra».

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

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
        WindowEvent::Focused(true) => {
            if let Ok(mut u) = app.state::<Finestre>().ultima.lock() {
                *u = Some(w.label().to_string());
            }
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
