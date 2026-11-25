pub mod friends;
pub mod startup;
mod actions;
pub mod backup;
pub mod app_windows;
pub mod fs;
pub mod ipc;
pub mod lan;
pub mod watcher;
#[cfg(windows)]
pub mod registry;
pub mod shell;
pub mod transfer;
pub mod vault;
pub mod server;
pub mod terminal;
pub mod versions;
pub mod visits;
pub mod phone;
pub mod index;

/// System-wide hotkey that brings the window back to the front.
///
/// Not `Ctrl+Alt+E`: on Windows AltGr is Ctrl+Alt, so that hotkey swallowed
/// AltGr+E (é, €) everywhere and popped the app up instead of typing.
/// A combination with the Win key never produces a character.
const SHORTCUT: &str = "super+shift+e";

/// Registers [`SHORTCUT`] to bring the window to the front.
///
/// A failure is not fatal and must not be: the shortcut is already
/// taken if another copy of the app is running or if another
/// program took it. Declaring it in the builder instead aborted
/// startup, that is a file manager that does not open because of a convenience.
fn register_shortcut(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let outcome = app.global_shortcut().on_shortcut(SHORTCUT, |app, _, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }
        let w = app_windows::last(app);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    });

    if let Err(e) = outcome {
        eprintln!("Global shortcut unavailable, the app starts anyway: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, as the plugin asks: a second copy started by Windows
        // (double click on a folder) hands the path to the one already open
        // and closes, instead of opening another window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            let args: Vec<String> = argv.into_iter().skip(1).collect();
            // It goes to the last window used, as a new tab: with several
            // windows open it would be odd to see it appear in all of them.
            let recipient = app_windows::last(app);
            if let Some(dest) = startup::destination(&args) {
                let _ = app.emit(
                    "open-path",
                    serde_json::json!({ "window": recipient.label(), "dest": dest }),
                );
            }
            let _ = recipient.show();
            let _ = recipient.unminimize();
            let _ = recipient.set_focus();
        }))
        .manage(transfer::Operations::default())
        .manage(app_windows::AppWindows::default())
        .on_window_event(app_windows::on_event)
        .manage(watcher::FolderWatcher::default())
        .manage(std::sync::Arc::new(vault::Vaults::default()))
        .plugin(tauri_plugin_opener::init())
        // Updates from the GitHub releases, signed: the frontend checks at
        // startup and restarts the app after the installation.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            register_shortcut(app.handle());
            // Files opened from a vault last at most until the next start.
            let _ = std::fs::remove_dir_all(std::env::temp_dir().join("space-train-cassaforte"));
            // Without the Windows Shell the folder picker comes from the
            // desktop (GTK or the portal), through the dialog plugin.
            #[cfg(not(windows))]
            app.handle().plugin(tauri_plugin_dialog::init())?;
            // Whoever had chosen Space Train as the default finds it again
            // even after an update: off the window's thread, the registry
            // can be slow.
            // Only in release builds: in development the registry would end
            // up pointing to the test executable.
            #[cfg(all(windows, not(debug_assertions)))]
            std::thread::spawn(|| {
                if let (Ok(exe), Ok(classes)) = (std::env::current_exe(), registry::user_classes()) {
                    if let Ok(true) = registry::realign(&classes, &exe.to_string_lossy()) {
                        registry::notify_shell();
                    }
                }
            });
            // The lan starts with the app: announcements and server stay
            // listening until the user makes this PC invisible.
            let data = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("space-train"));
            let lan = lan::Lan::start(app.handle().clone(), data.clone());
            let servers = std::sync::Arc::new(server::Servers::load(data.join("server.json")));
            server::install(servers.clone());
            server::schedule_backups(app.handle().clone(), servers.clone());
            std::sync::Arc::new(versions::Versions::load(data.join("versions"))).install();
            visits::install(data.join("visits"));
            index::install(data.join("index"));
            app.manage(servers);
            // Friends use the same shared folder and the same name as the
            // lan, but travel over the internet, encrypted.
            app.manage(friends::Friends::start(
                tauri::async_runtime::handle().inner().clone(),
                data,
                lan.clone(),
                lan::app_notifier(app.handle().clone()),
            ));
            app.manage(lan);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::list_dir,
            ipc::open_entry,
            ipc::folder_size,
            ipc::cleanup_round,
            ipc::cleanup_scan,
            ipc::programs_list,
            ipc::program_uninstall,
            ipc::program_remove_leftovers,
            ipc::text_read,
            ipc::text_write,
            ipc::terminal_open,
            actions::action_lines,
            actions::action_run,
            ipc::terminal_write,
            ipc::terminal_resize,
            ipc::terminal_close,
            ipc::cleanup_recycle_leftovers,
            ipc::size_turn,
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
            ipc::pick_folder,
            ipc::new_file_types,
            ipc::create_new_file,
            ipc::initial_path,
            ipc::new_window,
            ipc::open_theme_editor,
            ipc::save_theme_image,
            ipc::read_theme_image,
            ipc::lan_status,
            ipc::lan_configure,
            ipc::lan_peers,
            ipc::lan_respond,
            ipc::lan_open,
            ipc::lan_cancel_receive,
            ipc::lan_prepare_drag,
            ipc::friends_status,
            ipc::friends_add,
            ipc::friends_accept,
            ipc::friends_remove,
            ipc::friends_share,
            ipc::friends_qr,
            ipc::friends_backup,
            ipc::friends_backup_now,
            ipc::friends_answer_backup,
            transfer::lan_send,
            transfer::lan_download,
            transfer::search,
            transfer::find_duplicates,
            transfer::compare_folders,
            transfer::file_checksum,
            transfer::pause_transfer,
            transfer::archive_list,
            transfer::archive_extract,
            transfer::archive_open_item,
            transfer::image_rotate,
            shell::media::media_props,
            crate::fs::git::git_status,
            vault::vault_create,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_is_open,
            vault::vault_list,
            vault::vault_add,
            vault::vault_extract,
            vault::vault_open_item,
            vault::vault_delete,
            server::server_list,
            server::server_put,
            server::server_remove,
            server::server_trust,
            server::server_password,
            server::server_test,
            transfer::server_backup,
            visits::folder_visit,
            phone::phone_start,
            index::index_search,
            index::index_status,
            phone::phone_stop,
            phone::phone_keep,
            phone::phone_discard,
            visits::folder_visits_forget,
            versions::versions_list,
            versions::version_extract,
            versions::version_restore,
            versions::versions_overview,
            versions::versions_protect,
            versions::versions_limits,
            transfer::image_convert,
            ipc::entries_for,
            ipc::shortcut_free,
            transfer::compress,
            transfer::extract,
            transfer::delete_items,
        ])
        .run(tauri::generate_context!())
        .expect("error while starting the application");
}

#[cfg(test)]
mod tests {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    #[test]
    fn the_hotkey_uses_win_not_altgr() {
        let s: Shortcut = super::SHORTCUT.parse().unwrap();
        assert_eq!(s, Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyE));
        // AltGr is Ctrl+Alt on Windows: a hotkey on it eats typed characters.
        assert!(!s.mods.contains(Modifiers::CONTROL | Modifiers::ALT));
    }
}
