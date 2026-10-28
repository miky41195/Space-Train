use crate::fs::error::FsError;
use crate::fs::listing::{list_dir as fs_list_dir, Listing};
use crate::fs::paths;
use crate::fs::sort::SortSpec;
use crate::shell::drives::{list_drives, Drive};
use crate::shell::known::{list_known_folders, KnownFolder};
use crate::shell::open;

/// Esegue un lavoro bloccante su un thread del pool invece che su quello
/// della finestra.
///
/// I comandi sincroni di Tauri girano sul thread della finestra. Leggere un
/// disco lento, una condivisione che non risponde o la Rete lo terrebbe
/// fermo, e WNet in particolare fa partire un ciclo di messaggi annidato
/// che, dentro l'event loop, chiudeva l'app al clic su «Rete».
async fn fuori_dalla_finestra<T: Send + 'static>(
    lavoro: impl FnOnce() -> Result<T, FsError> + Send + 'static,
) -> Result<T, FsError> {
    tauri::async_runtime::spawn_blocking(lavoro)
        .await
        .map_err(|e| FsError::Io {
            message: format!("Operazione interrotta: {}", e),
        })?
}

#[tauri::command]
pub async fn list_dir(
    lan: tauri::State<'_, std::sync::Arc<crate::lan::Lan>>,
    amici: tauri::State<'_, std::sync::Arc<crate::amici::Amici>>,
    path: String,
    sort: SortSpec,
    show_hidden: bool,
) -> Result<Listing, FsError> {
    let lan = lan.inner().clone();
    let amici = amici.inner().clone();
    fuori_dalla_finestra(move || {
        // Rete locale e amici hanno bisogno dello stato dei loro servizi:
        // li si gestisce qui, il resto passa da `elenca`.
        if path == crate::amici::RADICE {
            return Ok(Listing { path, entries: amici.voci() });
        }
        if crate::amici::dividi(&path).is_some() {
            let mut entries = amici.elenca(&path)?;
            crate::fs::sort::sort_entries(&mut entries, &sort);
            return Ok(Listing { path, entries });
        }
        if path == crate::lan::RADICE {
            return Ok(Listing { path, entries: crate::lan::voci_pari(&lan) });
        }
        if path.starts_with(&format!("{}\\", crate::lan::RADICE)) {
            let mut entries = crate::lan::elenca_remoto(&lan, &path)?;
            crate::fs::sort::sort_entries(&mut entries, &sort);
            return Ok(Listing { path, entries });
        }
        elenca(path, sort, show_hidden)
    })
    .await
}

/// Elenca una cartella, o una delle posizioni che non esistono sul disco:
/// Questo PC, la Rete, un server di rete, il Cestino.
pub fn elenca(path: String, sort: SortSpec, show_hidden: bool) -> Result<Listing, FsError> {
    let virtuale = |mut entries: Vec<crate::fs::entry::Entry>, ordina: bool| {
        if ordina {
            crate::fs::sort::sort_entries(&mut entries, &sort);
        }
        Ok(Listing { path: path.clone(), entries })
    };
    match path.as_str() {
        "::pc" => virtuale(crate::shell::drives::come_voci(), false),
        crate::shell::rete::RADICE => virtuale(crate::shell::rete::computer()?, true),
        crate::fs::cestino::RADICE => virtuale(crate::fs::cestino::elenca()?, false),
        p if crate::shell::rete::e_server(p) => {
            virtuale(crate::shell::rete::condivisioni(p)?, true)
        }
        _ => fs_list_dir(&path, &sort, show_hidden),
    }
}

#[tauri::command]
pub fn open_entry(path: String) -> Result<(), FsError> {
    open::open_default(&path)
}

/// Risolve un path derivato. Il frontend non calcola mai path da sé.
#[tauri::command]
pub fn navigate(path: String, direction: String) -> Result<String, FsError> {
    match direction.as_str() {
        "up" => {
            if let Some(g) = crate::lan::genitore(&path).or_else(|| crate::amici::genitore(&path)) {
                return Ok(g);
            }
            if path.starts_with("::") {
                return Err(FsError::NotFound);
            }
            if let Some(g) = crate::shell::rete::genitore(&path) {
                return Ok(g);
            }
            match paths::parent_of(&path) {
                Some(p) => Ok(p),
                // Sopra la radice di un disco c'è Questo PC, come in Esplora.
                None if path.len() <= 3 && path.chars().nth(1) == Some(':') => {
                    Ok("::pc".to_string())
                }
                None => Err(FsError::NotFound),
            }
        }
        _ => Err(FsError::Io {
            message: format!("direzione sconosciuta: {}", direction),
        }),
    }
}

/// Lo spazio libero di un'unità di rete scollegata può far attendere
/// secondi: anche questo fuori dalla finestra.
#[tauri::command]
pub async fn drives() -> Result<Vec<Drive>, FsError> {
    fuori_dalla_finestra(|| Ok(list_drives())).await
}

#[tauri::command]
pub fn known_folders() -> Vec<KnownFolder> {
    list_known_folders()
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), FsError> {
    open::reveal(&path)
}

/// Apre un terminale nella cartella indicata.
#[tauri::command]
pub async fn open_terminal(path: String) -> Result<(), FsError> {
    fuori_dalla_finestra(move || open::terminale(&path)).await
}

use crate::shell::icons;

/// Icona di sistema per un'estensione. Risolta sul nome, senza leggere file:
/// il frontend la chiede una volta per tipo e la riusa.
///
/// `async` come le miniature: sincrono girava sul thread della finestra,
/// che restava fermo finché la Shell non rispondeva.
#[tauri::command]
pub async fn icon_for_extension(ext: String, is_dir: bool, large: bool) -> Result<Option<String>, FsError> {
    fuori_dalla_finestra(move || Ok(icons::icon_for_extension(&ext, is_dir, large))).await
}

/// Miniatura reale del file. Costa una lettura: da chiedere solo per ciò
/// che è visibile a schermo.
///
/// Fuori dalla finestra: un video o un PDF lento da decodificare, chiesto
/// mentre si aprivano cartelle una dopo l'altra, bloccava l'intera app.
#[tauri::command]
pub async fn thumbnail(path: String, size: u32) -> Result<Option<String>, FsError> {
    fuori_dalla_finestra(move || Ok(icons::thumbnail(&path, size))).await
}

use crate::fs::ops;

#[tauri::command]
pub fn create_folder(parent: String, name: String) -> Result<String, FsError> {
    ops::create_folder(&parent, &name)
}

#[tauri::command]
pub fn rename_entry(path: String, name: String) -> Result<String, FsError> {
    ops::rename(&path, &name)
}

/// Sposta nel Cestino: gli elementi restano recuperabili da Windows.
/// La conferma dell'utente avviene nel frontend, prima di arrivare qui.
#[tauri::command]
pub async fn move_to_trash(paths: Vec<String>) -> Result<(), FsError> {
    fuori_dalla_finestra(move || ops::move_to_trash(&paths)).await
}

use crate::registry;

fn exe_path() -> Result<String, FsError> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| crate::fs::error::from_io(&e))
}

fn cartella_backup(app: &tauri::AppHandle) -> Result<std::path::PathBuf, FsError> {
    use tauri::Manager;
    app.path()
        .app_local_data_dir()
        .map(|d| d.join("registry-backup"))
        .map_err(|e| FsError::Io { message: e.to_string() })
}

/// Opt-in esplicito: chiamato solo dal pulsante nelle impostazioni, mai
/// automaticamente all'avvio. Salva com'era il registro prima di scrivere.
/// Ritorna il file del backup.
#[tauri::command]
pub async fn set_as_default(app: tauri::AppHandle) -> Result<String, FsError> {
    let exe = exe_path()?;
    let dir = cartella_backup(&app)?;
    fuori_dalla_finestra(move || {
        let classi = registry::classi_utente()?;
        let file = registry::salva_backup(&dir, &registry::fotografa(&classi))?;
        registry::applica(&classi, &exe)?;
        registry::avvisa_shell();
        Ok(file.to_string_lossy().into_owned())
    })
    .await
}

#[tauri::command]
pub async fn restore_windows_explorer(app: tauri::AppHandle) -> Result<(), FsError> {
    let dir = cartella_backup(&app)?;
    fuori_dalla_finestra(move || {
        let classi = registry::classi_utente()?;
        registry::ripristina(&classi, &registry::leggi_backup(&dir))?;
        registry::elimina_backup(&dir);
        registry::avvisa_shell();
        Ok(())
    })
    .await
}

/// Fuori dalla finestra anche questo: con `reg.exe` impiegava secondi e,
/// sincrono, congelava l'avvio dell'app finché non rispondeva.
#[tauri::command]
pub async fn is_default() -> Result<bool, FsError> {
    let exe = exe_path()?;
    fuori_dalla_finestra(move || Ok(registry::e_predefinito(&registry::classi_utente()?, &exe))).await
}

/// Elimina senza Cestino. La conferma esplicita sta nel frontend.
#[tauri::command]
pub async fn delete_permanently(paths: Vec<String>) -> Result<(), FsError> {
    fuori_dalla_finestra(move || ops::delete_permanently(&paths)).await
}

#[tauri::command]
pub async fn trash_restore(paths: Vec<String>) -> Result<(), FsError> {
    fuori_dalla_finestra(move || crate::fs::cestino::ripristina(&paths)).await
}

#[tauri::command]
pub async fn trash_purge(paths: Vec<String>) -> Result<(), FsError> {
    fuori_dalla_finestra(move || crate::fs::cestino::elimina(&paths)).await
}

#[tauri::command]
pub async fn trash_empty() -> Result<(), FsError> {
    fuori_dalla_finestra(crate::fs::cestino::svuota).await
}

/// Annulla un «Sposta nel Cestino»: rimette gli elementi dov'erano.
#[tauri::command]
pub async fn trash_restore_originals(paths: Vec<String>) -> Result<(), FsError> {
    fuori_dalla_finestra(move || crate::fs::cestino::ripristina_originali(&paths)).await
}

/// Testo per il pannello d'anteprima. `None` = file binario.
#[tauri::command]
pub async fn text_preview(path: String) -> Result<Option<String>, FsError> {
    fuori_dalla_finestra(move || ops::text_preview(&path, 256 * 1024)).await
}

#[tauri::command]
pub async fn resolve_path(input: String) -> Result<ops::Destinazione, FsError> {
    fuori_dalla_finestra(move || ops::resolve_input(&input)).await
}

use crate::shell::appunti::{self, ContenutoAppunti};

#[tauri::command]
pub fn clipboard_write(paths: Vec<String>, cut: bool) -> Result<(), FsError> {
    appunti::scrivi(&paths, cut)
}

#[tauri::command]
pub fn clipboard_read() -> Option<ContenutoAppunti> {
    appunti::leggi()
}

#[tauri::command]
pub fn clipboard_clear() -> Result<(), FsError> {
    appunti::svuota()
}

/// Fuori dalla finestra: smettere di osservare una cartella aspetta che
/// Windows chiuda la sua lettura in corso, e a ogni cambio di cartella
/// quell'attesa fermava la finestra.
#[tauri::command]
pub async fn watch_dirs(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    paths: Vec<String>,
) -> Result<(), FsError> {
    let finestra = window.label().to_string();
    fuori_dalla_finestra(move || {
        use tauri::Manager;
        app.state::<crate::osserva::Osservatore>()
            .imposta(&app, &finestra, &paths)
            .map_err(|message| FsError::Io { message })
    })
    .await
}

#[tauri::command]
pub fn key_modifiers() -> crate::shell::nativo::Modificatori {
    crate::shell::nativo::modificatori()
}

#[cfg(windows)]
mod finestra {
    use super::*;
    use crate::shell::nativo;
    use windows::Win32::Foundation::HWND;

    /// Esegue `f` sul thread della finestra e ne attende il risultato.
    ///
    /// Menu, trascinamento e dialoghi della Shell vivono nella coda dei
    /// messaggi della finestra: chiamati da un thread del pool non si
    /// vedrebbero o si bloccherebbero. Il comando che chiama è `async`,
    /// quindi il thread della finestra è libero di eseguirli.
    async fn sul_thread_finestra<T: Send + 'static>(
        window: &tauri::WebviewWindow,
        f: impl FnOnce(HWND) -> Result<T, FsError> + Send + 'static,
    ) -> Result<T, FsError> {
        let errore = |e: String| FsError::Io { message: e };
        let raw = window.hwnd().map_err(|e| errore(e.to_string()))?.0 as isize;
        let (invia, ricevi) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let _ = invia.send(f(HWND(raw as *mut _)));
            })
            .map_err(|e| errore(e.to_string()))?;
        tauri::async_runtime::spawn_blocking(move || ricevi.recv())
            .await
            .map_err(|e| errore(e.to_string()))?
            .map_err(|e| errore(e.to_string()))?
    }

    /// Da coordinate CSS dentro la finestra a pixel dello schermo.
    fn sullo_schermo(window: &tauri::WebviewWindow, x: f64, y: f64) -> (i32, i32) {
        let scala = window.scale_factor().unwrap_or(1.0);
        let origine = window.inner_position().map(|p| (p.x, p.y)).unwrap_or((0, 0));
        (
            origine.0 + (x * scala).round() as i32,
            origine.1 + (y * scala).round() as i32,
        )
    }

    #[tauri::command]
    pub async fn start_drag(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<String, FsError> {
        sul_thread_finestra(&window, move |h| nativo::trascina(h, &paths)).await
    }

    #[tauri::command]
    pub async fn show_shell_menu(
        window: tauri::WebviewWindow,
        paths: Vec<String>,
        folder: String,
        x: f64,
        y: f64,
    ) -> Result<nativo::EsitoMenu, FsError> {
        let (sx, sy) = sullo_schermo(&window, x, y);
        sul_thread_finestra(&window, move |h| nativo::menu_di_sistema(h, &paths, &folder, sx, sy)).await
    }

    #[tauri::command]
    pub async fn show_properties(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), FsError> {
        sul_thread_finestra(&window, move |h| nativo::proprieta(h, &paths)).await
    }

    #[tauri::command]
    pub async fn open_with(window: tauri::WebviewWindow, path: String) -> Result<(), FsError> {
        sul_thread_finestra(&window, move |h| nativo::apri_con(h, &path)).await
    }

    #[tauri::command]
    pub async fn run_as_admin(window: tauri::WebviewWindow, path: String) -> Result<(), FsError> {
        sul_thread_finestra(&window, move |h| nativo::come_amministratore(h, &path)).await
    }
}

#[cfg(windows)]
pub use finestra::*;

/// I tipi di file del menu «Nuovo», come li offre Windows.
#[tauri::command]
pub async fn new_file_types() -> Result<Vec<crate::shell::nuovo::TipoNuovo>, FsError> {
    fuori_dalla_finestra(|| Ok(crate::shell::nuovo::elenca())).await
}

/// Crea un file nuovo del tipo `ext` dentro `parent`. Ritorna il path.
#[tauri::command]
pub async fn create_new_file(parent: String, ext: String) -> Result<String, FsError> {
    fuori_dalla_finestra(move || crate::shell::nuovo::crea(&parent, &ext)).await
}

use crate::lan::Lan;
use std::sync::Arc;

#[tauri::command]
pub fn lan_stato(lan: tauri::State<'_, Arc<Lan>>) -> crate::lan::Stato {
    lan.stato()
}

/// Visibilità, cartella condivisa e cartella dei ricevuti.
#[tauri::command]
pub fn lan_imposta(lan: tauri::State<'_, Arc<Lan>>, config: crate::lan::Config) -> crate::lan::Stato {
    lan.imposta(config);
    lan.stato()
}

#[tauri::command]
pub fn lan_pari(lan: tauri::State<'_, Arc<Lan>>) -> Vec<crate::lan::Pari> {
    lan.pari()
}

/// Accetta o rifiuta file in arrivo da un altro PC.
#[tauri::command]
pub fn lan_rispondi(lan: tauri::State<'_, Arc<Lan>>, id: u64, accetta: bool) {
    lan.rispondi(id, accetta);
}

/// Ferma da questo lato una ricezione in corso da un altro PC.
#[tauri::command]
pub fn lan_annulla_ricezione(lan: tauri::State<'_, Arc<Lan>>, id: u64) -> bool {
    lan.annulla_ricezione(id)
}

use crate::amici::Amici;

/// Scarica elementi condivisi da un altro PC, in rete locale o da un amico:
/// lo dice il path.
pub fn scarica_remoto(
    lan: &Lan,
    amici: &Amici,
    sorgenti: &[String],
    dest: &str,
    annulla: &std::sync::atomic::AtomicBool,
    avanzamento: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    if sorgenti.first().is_some_and(|p| crate::amici::dividi(p).is_some()) {
        amici.scarica(sorgenti, dest, annulla, avanzamento)
    } else {
        crate::lan::scarica(lan, sorgenti, dest, annulla, avanzamento)
    }
}

/// Apre un file della cartella condivisa da un altro PC: lo scarica in una
/// cartella temporanea e lo apre da lì.
///
/// I programmi no: scaricare dalla rete e avviare subito è proprio ciò che
/// fanno i virus, e l'antivirus finirebbe per sospettare di Space Train.
/// Si copiano sul PC e si aprono da lì, con i controlli di Windows.
#[tauri::command]
pub async fn lan_apri(
    lan: tauri::State<'_, Arc<Lan>>,
    amici: tauri::State<'_, Arc<Amici>>,
    path: String,
) -> Result<(), FsError> {
    if crate::fs::provenienza::e_programma(&path) {
        return Err(FsError::Io {
            message: "È un programma: per sicurezza non si avvia direttamente da un altro PC. Copialo sul tuo PC e aprilo da lì.".into(),
        });
    }
    let lan = lan.inner().clone();
    let amici = amici.inner().clone();
    fuori_dalla_finestra(move || {
        let temp = std::env::temp_dir().join("SpaceTrain-rete");
        let coppie = scarica_remoto(
            &lan,
            &amici,
            &[path],
            &temp.to_string_lossy(),
            &std::sync::atomic::AtomicBool::new(false),
            &mut |_, _| {},
        )?;
        let locale = coppie.first().map(|c| c[1].clone()).ok_or(FsError::NotFound)?;
        open::open_default(&locale)
    })
    .await
}

#[tauri::command]
pub fn amici_stato(amici: tauri::State<'_, Arc<Amici>>) -> crate::amici::StatoAmici {
    amici.stato()
}

/// Aggiunge un amico dal suo codice personale e gli chiede l'amicizia.
#[tauri::command]
pub async fn amici_aggiungi(amici: tauri::State<'_, Arc<Amici>>, codice: String) -> Result<(), FsError> {
    let amici = amici.inner().clone();
    fuori_dalla_finestra(move || amici.aggiungi(&codice)).await
}

/// Accetta la richiesta d'amicizia di `id`.
#[tauri::command]
pub async fn amici_accetta(amici: tauri::State<'_, Arc<Amici>>, id: String) -> Result<(), FsError> {
    let amici = amici.inner().clone();
    fuori_dalla_finestra(move || amici.accetta(&id)).await
}

/// Toglie un amico, o rifiuta la sua richiesta.
#[tauri::command]
pub async fn amici_rimuovi(amici: tauri::State<'_, Arc<Amici>>, id: String) -> Result<(), FsError> {
    let amici = amici.inner().clone();
    fuori_dalla_finestra(move || amici.rimuovi(&id)).await
}

/// Lascia o toglie a un amico la cartella condivisa.
#[tauri::command]
pub fn amici_condividi(amici: tauri::State<'_, Arc<Amici>>, id: String, si: bool) -> crate::amici::StatoAmici {
    amici.condividi(&id, si);
    amici.stato()
}

/// Il QR code del nostro codice personale, in SVG.
#[tauri::command]
pub fn amici_qr(amici: tauri::State<'_, Arc<Amici>>) -> Result<String, FsError> {
    crate::amici::qr(&amici.stato().codice)
}

/// Scarica in una cartella temporanea gli elementi della cartella condivisa
/// da un altro PC, e ritorna i loro path sul disco.
///
/// Serve a trascinarli fuori dall'app, sul desktop o in Esplora: Windows
/// accetta solo file veri, e un path `::lan\…` per lui non esiste
/// («Elemento non raggiungibile»). Le cartelle temporanee vecchie di un
/// giorno si buttano via a ogni nuovo trascinamento.
#[tauri::command]
pub async fn lan_prepara_trascina(
    lan: tauri::State<'_, Arc<Lan>>,
    amici: tauri::State<'_, Arc<Amici>>,
    paths: Vec<String>,
) -> Result<Vec<String>, FsError> {
    let lan = lan.inner().clone();
    let amici = amici.inner().clone();
    fuori_dalla_finestra(move || {
        let base = std::env::temp_dir().join("SpaceTrain-trascina");
        if let Ok(vecchie) = std::fs::read_dir(&base) {
            for v in vecchie.filter_map(|v| v.ok()) {
                let scaduta = v
                    .metadata()
                    .and_then(|m| m.modified())
                    .map(|t| t.elapsed().map(|d| d.as_secs() > 24 * 3600).unwrap_or(false))
                    .unwrap_or(false);
                if scaduta {
                    let _ = std::fs::remove_dir_all(v.path());
                }
            }
        }
        let istante = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = base.join(istante.to_string());
        std::fs::create_dir_all(&dir).map_err(|e| crate::fs::error::from_io(&e))?;
        let coppie = scarica_remoto(
            &lan,
            &amici,
            &paths,
            &dir.to_string_lossy(),
            &std::sync::atomic::AtomicBool::new(false),
            &mut |_, _| {},
        )?;
        Ok(coppie.into_iter().map(|c| c[1].clone()).collect())
    })
    .await
}

/// La cartella con cui Windows ha avviato l'app, se gliene ha passata una.
#[tauri::command]
pub async fn initial_path() -> Result<Option<ops::Destinazione>, FsError> {
    let argomenti: Vec<String> = std::env::args().skip(1).collect();
    fuori_dalla_finestra(move || Ok(crate::avvio::destinazione(&argomenti))).await
}

/// Apre un'altra finestra dell'app, nello stesso processo, sulla cartella
/// indicata. Le finestre condividono rete locale, osservatore e preferenze.
///
/// Deve essere `async`: un comando sincrono gira sul thread della finestra,
/// e lì WebView2 non riesce a completare la creazione della nuova — che
/// restava ferma su una pagina bianca.
#[tauri::command]
pub async fn new_window(app: tauri::AppHandle, path: Option<String>) -> Result<String, FsError> {
    crate::finestre::nuova(&app, path).map_err(|message| FsError::Io { message })
}

/// Salva un'immagine scelta nell'editor dei temi nella cartella dati
/// dell'app, così il tema continua a funzionare anche se l'originale
/// viene spostato o cancellato. Ritorna il percorso salvato.
#[tauri::command]
pub async fn save_theme_image(app: tauri::AppHandle, nome: String, dati: String) -> Result<String, FsError> {
    use base64::Engine;
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| FsError::Io { message: e.to_string() })?
        .join("temi-immagini");
    fuori_dalla_finestra(move || {
        let byte = base64::engine::general_purpose::STANDARD
            .decode(dati.as_bytes())
            .map_err(|e| FsError::Io { message: format!("Immagine non valida: {}", e) })?;
        std::fs::create_dir_all(&dir).map_err(|e| crate::fs::error::from_io(&e))?;
        // Solo il nome, ripulito: niente cartelle o caratteri vietati.
        let pulito: String = std::path::Path::new(&nome)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "immagine.png".into())
            .chars()
            .map(|c| if r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
            .collect();
        let finale = crate::fs::copy::unique_name(&dir, &pulito);
        let path = dir.join(finale);
        std::fs::write(&path, byte).map_err(|e| crate::fs::error::from_io(&e))?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
}

/// Rilegge in base64 un'immagine salvata da `save_theme_image`, per
/// elaborarla nella WebView (togliere lo sfondo). Un'immagine caricata dal
/// disco con l'indirizzo dell'asset protocol non si può leggere pixel per
/// pixel: i byte devono arrivare da qui. Solo dalla cartella dei temi.
#[tauri::command]
pub async fn read_theme_image(app: tauri::AppHandle, path: String) -> Result<String, FsError> {
    use base64::Engine;
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| FsError::Io { message: e.to_string() })?
        .join("temi-immagini");
    fuori_dalla_finestra(move || {
        let vero = std::fs::canonicalize(&path).map_err(|e| crate::fs::error::from_io(&e))?;
        let cartella = std::fs::canonicalize(&dir).map_err(|e| crate::fs::error::from_io(&e))?;
        if !vero.starts_with(&cartella) {
            return Err(FsError::Io { message: "Immagine fuori dalla cartella dei temi".into() });
        }
        let byte = std::fs::read(&vero).map_err(|e| crate::fs::error::from_io(&e))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(byte))
    })
    .await
}
