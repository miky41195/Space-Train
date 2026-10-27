pub mod amici;
pub mod avvio;
pub mod finestre;
pub mod fs;
pub mod ipc;
pub mod lan;
pub mod osserva;
pub mod registry;
pub mod shell;
pub mod transfer;

/// Registra `Ctrl+Alt+E` per riportare la finestra in primo piano.
///
/// Un fallimento non è fatale e non deve esserlo: la scorciatoia è già
/// occupata se un'altra copia dell'app è in esecuzione o se un altro
/// programma se l'è presa. Dichiararla nel builder faceva invece abortire
/// l'avvio, cioè un file manager che non si apre per via di una comodità.
fn registra_scorciatoia(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let esito = app.global_shortcut().on_shortcut("ctrl+alt+e", |app, _, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }
        let w = finestre::ultima(app);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    });

    if let Err(e) = esito {
        eprintln!("Scorciatoia globale non disponibile, l'app parte comunque: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Per primo, come chiede il plugin: una seconda copia avviata da
        // Windows (doppio clic su una cartella) consegna il percorso a quella
        // già aperta e si chiude, invece di aprire un'altra finestra.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            let argomenti: Vec<String> = argv.into_iter().skip(1).collect();
            // Arriva all'ultima finestra usata, come scheda nuova: con più
            // finestre aperte sarebbe strano vederla comparire in tutte.
            let destinataria = finestre::ultima(app);
            if let Some(dest) = avvio::destinazione(&argomenti) {
                let _ = app.emit(
                    "apri-percorso",
                    serde_json::json!({ "finestra": destinataria.label(), "dest": dest }),
                );
            }
            let _ = destinataria.show();
            let _ = destinataria.unminimize();
            let _ = destinataria.set_focus();
        }))
        .manage(transfer::Operazioni::default())
        .manage(finestre::Finestre::default())
        .on_window_event(finestre::evento)
        .manage(osserva::Osservatore::default())
        .plugin(tauri_plugin_opener::init())
        // Aggiornamenti dalle release di GitHub, firmati: il frontend
        // controlla all'avvio e riavvia l'app dopo l'installazione.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            registra_scorciatoia(app.handle());
            // Chi aveva scelto Space Train come predefinito lo ritrova anche
            // dopo un aggiornamento: fuori dal thread della finestra, il
            // registro può essere lento.
            // Solo nelle build di release: in sviluppo il registro finirebbe
            // a puntare all'eseguibile di prova.
            #[cfg(not(debug_assertions))]
            std::thread::spawn(|| {
                if let (Ok(exe), Ok(classi)) = (std::env::current_exe(), registry::classi_utente()) {
                    if let Ok(true) = registry::riallinea(&classi, &exe.to_string_lossy()) {
                        registry::avvisa_shell();
                    }
                }
            });
            // La rete locale parte con l'app: annunci e server restano in
            // ascolto finché l'utente non rende invisibile questo PC.
            let dati = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("space-train"));
            let lan = lan::Lan::avvia(app.handle().clone(), dati.clone());
            // Gli amici usano la stessa cartella condivisa e lo stesso nome
            // della rete locale, ma viaggiano su internet, cifrati.
            app.manage(amici::Amici::avvia(
                tauri::async_runtime::handle().inner().clone(),
                dati,
                lan.clone(),
                lan::avvisi_app(app.handle().clone()),
            ));
            app.manage(lan);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::list_dir,
            ipc::open_entry,
            ipc::navigate,
            ipc::drives,
            ipc::known_folders,
            ipc::reveal_in_explorer,
            ipc::open_terminal,
            ipc::create_folder,
            ipc::rename_entry,
            ipc::move_to_trash,
            ipc::icon_for_extension,
            ipc::thumbnail,
            transfer::transfer,
            transfer::scan_conflicts,
            transfer::cancel_transfer,
            ipc::set_as_default,
            ipc::restore_windows_explorer,
            ipc::is_default,
            ipc::delete_permanently,
            ipc::trash_restore,
            ipc::trash_purge,
            ipc::trash_empty,
            ipc::trash_restore_originals,
            ipc::text_preview,
            ipc::resolve_path,
            ipc::clipboard_write,
            ipc::clipboard_read,
            ipc::clipboard_clear,
            ipc::watch_dirs,
            ipc::key_modifiers,
            ipc::start_drag,
            ipc::show_shell_menu,
            ipc::show_properties,
            ipc::open_with,
            ipc::run_as_admin,
            ipc::new_file_types,
            ipc::create_new_file,
            ipc::initial_path,
            ipc::new_window,
            ipc::save_theme_image,
            ipc::read_theme_image,
            ipc::lan_stato,
            ipc::lan_imposta,
            ipc::lan_pari,
            ipc::lan_rispondi,
            ipc::lan_apri,
            ipc::lan_annulla_ricezione,
            ipc::lan_prepara_trascina,
            ipc::amici_stato,
            ipc::amici_aggiungi,
            ipc::amici_accetta,
            ipc::amici_rimuovi,
            ipc::amici_condividi,
            ipc::amici_qr,
            transfer::lan_invia,
            transfer::lan_scarica,
            transfer::search,
            transfer::compress,
            transfer::extract,
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio dell'applicazione");
}
