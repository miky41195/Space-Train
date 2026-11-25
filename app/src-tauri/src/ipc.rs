use crate::fs::error::FsError;
use crate::fs::listing::{list_dir as fs_list_dir, Listing};
use crate::fs::paths;
use crate::fs::sort::SortSpec;
use crate::shell::drives::{list_drives, Drive};
use crate::shell::known::{list_known_folders, KnownFolder};
use crate::shell::open;

/// Runs a blocking job on a pool thread instead of the window's
/// thread.
///
/// Tauri's synchronous commands run on the window's thread. Reading a
/// slow disk, a share that does not answer or the Network would hold it
/// still, and WNet in particular starts a nested message loop
/// that, inside the event loop, closed the app on a click on «Rete».
async fn off_window<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, FsError> + Send + 'static,
) -> Result<T, FsError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| FsError::Io {
            message: format!("Operazione interrotta: {}", e),
        })?
}

/// Whether a key combination is free system-wide. Windows refuses to register
/// a hotkey another program already holds, so a short register/unregister
/// tells. `None` = the text is not a valid combination.
#[tauri::command]
pub fn shortcut_free(app: tauri::AppHandle, accelerator: String) -> Option<bool> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let shortcut: Shortcut = accelerator.parse().ok()?;
    let gs = app.global_shortcut();
    // Our own global hotkey is not «another program».
    if gs.is_registered(shortcut) {
        return Some(true);
    }
    match gs.register(shortcut) {
        Ok(()) => {
            let _ = gs.unregister(shortcut);
            Some(true)
        }
        Err(_) => Some(false),
    }
}

/// Entries for paths gathered from anywhere (colour labels); paths that no longer exist are left out.
#[tauri::command]
pub async fn entries_for(paths: Vec<String>) -> Result<Vec<crate::fs::entry::Entry>, FsError> {
    off_window(move || {
        Ok(paths
            .iter()
            .filter_map(|p| crate::fs::entry::entry_from_path(std::path::Path::new(p)))
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn list_dir(
    lan: tauri::State<'_, std::sync::Arc<crate::lan::Lan>>,
    friends: tauri::State<'_, std::sync::Arc<crate::friends::Friends>>,
    path: String,
    sort: SortSpec,
    show_hidden: bool,
) -> Result<Listing, FsError> {
    let lan = lan.inner().clone();
    let friends = friends.inner().clone();
    off_window(move || {
        // Lan and friends need the state of their services: they are
        // handled here, the rest goes through `list`.
        if path == crate::server::ROOT {
            return Ok(Listing { path, entries: crate::server::servers()?.entries() });
        }
        if crate::server::is_server(&path) {
            let mut entries = crate::server::servers()?.list(&path)?;
            if !show_hidden {
                entries.retain(|e| !e.hidden);
            }
            crate::fs::sort::sort_entries(&mut entries, &sort);
            return Ok(Listing { path, entries });
        }
        if path == crate::friends::ROOT {
            return Ok(Listing { path, entries: friends.items() });
        }
        if crate::friends::split(&path).is_some() {
            let mut entries = friends.list(&path)?;
            crate::fs::sort::sort_entries(&mut entries, &sort);
            return Ok(Listing { path, entries });
        }
        if path == crate::lan::ROOT {
            return Ok(Listing { path, entries: crate::lan::peer_entries(&lan) });
        }
        if path.starts_with(&format!("{}\\", crate::lan::ROOT)) {
            let mut entries = crate::lan::list_remote(&lan, &path)?;
            crate::fs::sort::sort_entries(&mut entries, &sort);
            return Ok(Listing { path, entries });
        }
        list(path, sort, show_hidden)
    })
    .await
}

/// Lists a folder, or one of the locations that do not exist on disk:
/// This PC, the Network, a network server, the Recycle Bin.
pub fn list(path: String, sort: SortSpec, show_hidden: bool) -> Result<Listing, FsError> {
    let virtual_listing = |mut entries: Vec<crate::fs::entry::Entry>, sorted: bool| {
        if sorted {
            crate::fs::sort::sort_entries(&mut entries, &sort);
        }
        Ok(Listing { path: path.clone(), entries })
    };
    match path.as_str() {
        "::pc" => virtual_listing(crate::shell::drives::as_items(), false),
        crate::shell::network::ROOT => virtual_listing(crate::shell::network::computer()?, true),
        crate::fs::trash::ROOT => virtual_listing(crate::fs::trash::list()?, false),
        p if crate::shell::network::is_server(p) => {
            virtual_listing(crate::shell::network::shares(p)?, true)
        }
        _ => fs_list_dir(&path, &sort, show_hidden),
    }
}

/// The size of a local folder, summing its whole tree.
/// `None` if meanwhile another turn started (the listing changed
/// folder): the result would no longer be useful.
#[tauri::command]
pub async fn folder_size(path: String, turn: u64) -> Result<Option<u64>, FsError> {
    off_window(move || Ok(crate::fs::dir_size::size(std::path::Path::new(&path), turn))).await
}

/// Starts a turn of computations and stops those of the previous turn.
#[tauri::command]
pub fn size_turn(turn: u64) {
    crate::fs::dir_size::new_turn(turn);
}

/// Starts a new cleanup scan; scans of the previous one stop.
#[tauri::command]
pub fn cleanup_round(round: u64) {
    crate::fs::cleanup::new_round(round);
}

/// What one cleanup category holds on `drive`; `None` if a newer scan started.
#[tauri::command]
pub async fn cleanup_scan(
    category: crate::fs::cleanup::Category,
    drive: String,
    roots: Vec<String>,
    round: u64,
) -> Result<Option<Vec<crate::fs::cleanup::Candidate>>, FsError> {
    off_window(move || Ok(crate::fs::cleanup::scan(category, &drive, &roots, round))).await
}

/// The biggest programs installed on `drive`.
#[tauri::command]
pub async fn programs_list(drive: String) -> Result<Vec<crate::shell::programs::Program>, FsError> {
    off_window(move || Ok(crate::shell::programs::list(&drive, 12))).await
}

/// Starts a program's official uninstaller.
#[tauri::command]
pub async fn program_uninstall(id: String) -> Result<(), FsError> {
    off_window(move || crate::shell::programs::uninstall(&id)).await
}

/// A text file whole, for quick editing.
#[tauri::command]
pub async fn text_read(path: String) -> Result<crate::fs::text_file::TextFile, FsError> {
    off_window(move || crate::fs::text_file::read(&path)).await
}

/// Saves an edited text file; refused if it changed on disk meanwhile, unless `force`.
#[tauri::command]
pub async fn text_write(path: String, text: String, crlf: bool, bom: bool, expected: u64, force: bool) -> Result<u64, FsError> {
    off_window(move || crate::fs::text_file::write(&path, &text, crlf, bom, expected, force)).await
}

/// Starts a shell in `cwd`; its output arrives on `events`.
#[tauri::command]
pub fn terminal_open(
    cwd: String,
    cols: u16,
    rows: u16,
    run: Option<String>,
    events: tauri::ipc::Channel<crate::terminal::TerminalEvent>,
) -> Result<u32, FsError> {
    crate::terminal::open(&cwd, cols, rows, run, events)
}

#[tauri::command]
pub fn terminal_write(id: u32, data: String) -> Result<(), FsError> {
    crate::terminal::write(id, &data)
}

#[tauri::command]
pub fn terminal_resize(id: u32, cols: u16, rows: u16) -> Result<(), FsError> {
    crate::terminal::resize(id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(id: u32) {
    crate::terminal::close(id)
}

/// A broken program: install folder to the Recycle Bin, entry out of the list.
#[tauri::command]
pub async fn program_remove_leftovers(window: tauri::WebviewWindow, id: String) -> Result<(), FsError> {
    let owner = owner_of(&window);
    off_window(move || crate::shell::programs::remove_leftovers(&id, owner)).await
}

/// Leftovers of uninstalled programs to the Recycle Bin, as administrator.
#[tauri::command]
pub async fn cleanup_recycle_leftovers(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), FsError> {
    let owner = owner_of(&window);
    off_window(move || crate::shell::programs::recycle_leftovers(&paths, owner)).await
}

/// The native handle of `window`, owner of the UAC prompt (0 = none).
fn owner_of(window: &tauri::WebviewWindow) -> isize {
    #[cfg(windows)]
    return window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    #[cfg(not(windows))]
    {
        let _ = window;
        0
    }
}

#[tauri::command]
pub fn open_entry(path: String) -> Result<(), FsError> {
    open::open_default(&path)
}

/// Resolves a derived path. The frontend never computes paths by itself.
#[tauri::command]
pub fn navigate(path: String, direction: String) -> Result<String, FsError> {
    match direction.as_str() {
        "up" => {
            if let Some(g) = crate::lan::parent_of(&path)
                .or_else(|| crate::friends::parent_of(&path))
                .or_else(|| crate::server::parent_of(&path))
            {
                return Ok(g);
            }
            if path.starts_with("::") {
                return Err(FsError::NotFound);
            }
            if let Some(g) = crate::shell::network::parent_of(&path) {
                return Ok(g);
            }
            match paths::parent_of(&path) {
                Some(p) => Ok(p),
                // Above the root of a drive there is This PC, as in Explorer.
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

/// The free space of a disconnected network drive can take seconds: this
/// too off the window.
#[tauri::command]
pub async fn drives() -> Result<Vec<Drive>, FsError> {
    off_window(|| Ok(list_drives())).await
}

#[tauri::command]
pub fn known_folders() -> Vec<KnownFolder> {
    list_known_folders()
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), FsError> {
    open::reveal(&path)
}

/// Opens a terminal in the given folder.
#[tauri::command]
pub async fn open_terminal(path: String) -> Result<(), FsError> {
    off_window(move || open::terminal(&path)).await
}

use crate::shell::icons;

/// System icon for an extension. Resolved on the name, without reading files:
/// the frontend asks for it once per type and reuses it.
///
/// `async` like the thumbnails: synchronous it ran on the window's thread,
/// which stayed stuck until the Shell answered.
#[tauri::command]
pub async fn icon_for_extension(ext: String, is_dir: bool, large: bool) -> Result<Option<String>, FsError> {
    off_window(move || Ok(icons::icon_for_extension(&ext, is_dir, large))).await
}

/// Real thumbnail of the file. It costs a read: to be asked only for what
/// is visible on screen.
///
/// Off the window thread: a video or a PDF slow to decode, asked for
/// while opening folders one after another, blocked the whole app.
#[tauri::command]
pub async fn thumbnail(path: String, size: u32) -> Result<Option<String>, FsError> {
    off_window(move || Ok(icons::thumbnail(&path, size))).await
}

use crate::fs::ops;

#[tauri::command]
pub async fn create_folder(parent: String, name: String) -> Result<String, FsError> {
    off_window(move || {
        if crate::server::is_server(&parent) {
            return crate::server::servers()?.mkdir(&parent, &name);
        }
        ops::create_folder(&parent, &name)
    })
    .await
}

#[tauri::command]
pub async fn rename_entry(path: String, name: String) -> Result<String, FsError> {
    off_window(move || {
        if crate::server::is_server(&path) {
            return crate::server::servers()?.rename(&path, &name);
        }
        ops::rename(&path, &name)
    })
    .await
}

/// Moves to the Recycle Bin: the items stay recoverable from Windows.
/// The user's confirmation happens in the frontend, before getting here.
#[tauri::command]
pub async fn move_to_trash(paths: Vec<String>) -> Result<(), FsError> {
    off_window(move || ops::move_to_trash(&paths)).await
}

#[cfg(windows)]
pub use default_app::*;

/// «Set as default file manager» lives in the Windows registry: elsewhere
/// the frontend hides it, and the app never claims to be the default.
#[cfg(not(windows))]
mod default_app {
    use super::*;

    #[tauri::command]
    pub async fn set_as_default() -> Result<String, FsError> {
        Err(FsError::Io {
            message: "Funzione disponibile solo su Windows.".to_string(),
        })
    }

    #[tauri::command]
    pub async fn restore_windows_explorer() -> Result<(), FsError> {
        Ok(())
    }

    #[tauri::command]
    pub async fn is_default() -> Result<bool, FsError> {
        Ok(false)
    }
}

#[cfg(not(windows))]
pub use default_app::*;

#[cfg(windows)]
mod default_app {
use super::*;
use crate::registry;

fn exe_path() -> Result<String, FsError> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| crate::fs::error::from_io(&e))
}

fn backup_folder(app: &tauri::AppHandle) -> Result<std::path::PathBuf, FsError> {
    use tauri::Manager;
    app.path()
        .app_local_data_dir()
        .map(|d| d.join("registry-backup"))
        .map_err(|e| FsError::Io { message: e.to_string() })
}

/// Explicit opt-in: called only by the button in the settings, never
/// automatically at startup. Saves how the registry was before writing.
/// Returns the backup file.
#[tauri::command]
pub async fn set_as_default(app: tauri::AppHandle) -> Result<String, FsError> {
    let exe = exe_path()?;
    let dir = backup_folder(&app)?;
    off_window(move || {
        let classes = registry::user_classes()?;
        let file = registry::save_backup(&dir, &registry::snapshot(&classes))?;
        registry::apply(&classes, &exe)?;
        registry::notify_shell();
        Ok(file.to_string_lossy().into_owned())
    })
    .await
}

#[tauri::command]
pub async fn restore_windows_explorer(app: tauri::AppHandle) -> Result<(), FsError> {
    let dir = backup_folder(&app)?;
    off_window(move || {
        let classes = registry::user_classes()?;
        registry::restore(&classes, &registry::read_backup(&dir))?;
        registry::delete_backup(&dir);
        registry::notify_shell();
        Ok(())
    })
    .await
}

/// Off the window too: with `reg.exe` it took seconds and, synchronous, it
/// froze the app's startup until it answered.
#[tauri::command]
pub async fn is_default() -> Result<bool, FsError> {
    let exe = exe_path()?;
    off_window(move || Ok(registry::is_default(&registry::user_classes()?, &exe))).await
}
}

/// Deletes without the Recycle Bin. The explicit confirmation is in the frontend.
#[tauri::command]
pub async fn delete_permanently(paths: Vec<String>) -> Result<(), FsError> {
    off_window(move || {
        if paths.first().is_some_and(|p| crate::server::is_server(p)) {
            return crate::server::servers()?.delete(&paths);
        }
        ops::delete_permanently(&paths)
    })
    .await
}

#[tauri::command]
pub async fn trash_restore(paths: Vec<String>) -> Result<(), FsError> {
    off_window(move || crate::fs::trash::restore(&paths)).await
}

#[tauri::command]
pub async fn trash_purge(paths: Vec<String>) -> Result<(), FsError> {
    off_window(move || crate::fs::trash::delete(&paths)).await
}

#[tauri::command]
pub async fn trash_empty() -> Result<(), FsError> {
    off_window(crate::fs::trash::empty).await
}

/// Undoes a «Sposta nel Cestino»: puts the items back where they were.
#[tauri::command]
pub async fn trash_restore_originals(paths: Vec<String>) -> Result<(), FsError> {
    off_window(move || crate::fs::trash::restore_originals(&paths)).await
}

/// Text for the preview pane. `None` = binary file.
#[tauri::command]
pub async fn text_preview(path: String) -> Result<Option<String>, FsError> {
    off_window(move || ops::text_preview(&path, 256 * 1024)).await
}

#[tauri::command]
pub async fn resolve_path(input: String) -> Result<ops::Destination, FsError> {
    off_window(move || ops::resolve_input(&input)).await
}

use crate::shell::clipboard::{self, ClipboardContent};

#[tauri::command]
pub fn clipboard_write(paths: Vec<String>, cut: bool) -> Result<(), FsError> {
    clipboard::write(&paths, cut)
}

#[tauri::command]
pub fn clipboard_read() -> Option<ClipboardContent> {
    clipboard::read()
}

#[tauri::command]
pub fn clipboard_clear() -> Result<(), FsError> {
    clipboard::empty()
}

/// Off the window: stopping watching a folder waits for Windows to close
/// its read in progress, and at every folder change that wait stopped the
/// window.
#[tauri::command]
pub async fn watch_dirs(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    paths: Vec<String>,
) -> Result<(), FsError> {
    let window_label = window.label().to_string();
    off_window(move || {
        use tauri::Manager;
        app.state::<crate::watcher::FolderWatcher>()
            .set(&app, &window_label, &paths)
            .map_err(|message| FsError::Io { message })
    })
    .await
}

#[tauri::command]
pub fn key_modifiers() -> crate::shell::native::Modifiers {
    crate::shell::native::modifiers()
}

#[cfg(windows)]
mod window_label {
    use super::*;
    use crate::shell::native;
    use windows::Win32::Foundation::HWND;

    /// Runs `f` on the window's thread and waits for its result.
    ///
    /// Menus, dragging and Shell dialogs live in the window's message
    /// queue: called from a pool thread they would not show
    /// or would hang. The calling command is `async`,
    /// so the window's thread is free to run them.
    async fn on_window_thread<T: Send + 'static>(
        window: &tauri::WebviewWindow,
        f: impl FnOnce(HWND) -> Result<T, FsError> + Send + 'static,
    ) -> Result<T, FsError> {
        let error = |e: String| FsError::Io { message: e };
        let raw = window.hwnd().map_err(|e| error(e.to_string()))?.0 as isize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(f(HWND(raw as *mut _)));
            })
            .map_err(|e| error(e.to_string()))?;
        tauri::async_runtime::spawn_blocking(move || rx.recv())
            .await
            .map_err(|e| error(e.to_string()))?
            .map_err(|e| error(e.to_string()))?
    }

    /// From CSS coordinates inside the window to screen pixels.
    fn on_screen(window: &tauri::WebviewWindow, x: f64, y: f64) -> (i32, i32) {
        let scale = window.scale_factor().unwrap_or(1.0);
        let origin = window.inner_position().map(|p| (p.x, p.y)).unwrap_or((0, 0));
        (
            origin.0 + (x * scale).round() as i32,
            origin.1 + (y * scale).round() as i32,
        )
    }

    #[tauri::command]
    pub async fn start_drag(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<String, FsError> {
        on_window_thread(&window, move |h| native::drag(h, &paths)).await
    }

    #[tauri::command]
    pub async fn show_shell_menu(
        window: tauri::WebviewWindow,
        paths: Vec<String>,
        folder: String,
        x: f64,
        y: f64,
    ) -> Result<native::MenuOutcome, FsError> {
        let (sx, sy) = on_screen(&window, x, y);
        on_window_thread(&window, move |h| native::system_menu(h, &paths, &folder, sx, sy)).await
    }

    #[tauri::command]
    pub async fn show_properties(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), FsError> {
        on_window_thread(&window, move |h| native::properties(h, &paths)).await
    }

    #[tauri::command]
    pub async fn open_with(window: tauri::WebviewWindow, path: String) -> Result<(), FsError> {
        on_window_thread(&window, move |h| native::open_with(h, &path)).await
    }

    /// The Windows folder picker. `None` if the user cancels.
    #[tauri::command]
    pub async fn pick_folder(
        window: tauri::WebviewWindow,
        title: String,
        initial: Option<String>,
    ) -> Result<Option<String>, FsError> {
        on_window_thread(&window, move |h| crate::shell::pick::folder(h, &title, initial.as_deref())).await
    }

    #[tauri::command]
    pub async fn run_as_admin(window: tauri::WebviewWindow, path: String) -> Result<(), FsError> {
        on_window_thread(&window, move |h| native::as_admin(h, &path)).await
    }
}

#[cfg(windows)]
pub use window_label::*;

/// Elsewhere there is no Windows Shell: the frontend hides what needs it
/// (system menu, Properties, Open with, run as admin, drag to other apps).
/// These answer anyway, so a stray call fails cleanly instead of hanging.
#[cfg(not(windows))]
mod window_label {
    use super::*;
    use crate::shell::native;

    fn unavailable() -> FsError {
        FsError::Io {
            message: "Funzione disponibile solo su Windows.".to_string(),
        }
    }

    #[tauri::command]
    pub async fn start_drag(_paths: Vec<String>) -> Result<String, FsError> {
        Err(unavailable())
    }

    #[tauri::command]
    pub async fn show_shell_menu(
        _paths: Vec<String>,
        _folder: String,
        _x: f64,
        _y: f64,
    ) -> Result<native::MenuOutcome, FsError> {
        Err(unavailable())
    }

    #[tauri::command]
    pub async fn show_properties(_paths: Vec<String>) -> Result<(), FsError> {
        Err(unavailable())
    }

    #[tauri::command]
    pub async fn open_with(_path: String) -> Result<(), FsError> {
        Err(unavailable())
    }

    /// The desktop's folder picker. `None` if the user cancels.
    #[tauri::command]
    pub async fn pick_folder(
        window: tauri::WebviewWindow,
        title: String,
        initial: Option<String>,
    ) -> Result<Option<String>, FsError> {
        use tauri_plugin_dialog::DialogExt;
        let mut dialog = window.dialog().file().set_title(title).set_parent(&window);
        if let Some(i) = initial.filter(|i| std::path::Path::new(i).is_dir()) {
            dialog = dialog.set_directory(i);
        }
        let (tx, rx) = tokio::sync::oneshot::channel();
        dialog.pick_folder(move |choice| {
            let _ = tx.send(choice);
        });
        let choice = rx.await.ok().flatten();
        Ok(choice
            .and_then(|s| s.into_path().ok())
            .map(|p| p.to_string_lossy().into_owned()))
    }

    #[tauri::command]
    pub async fn run_as_admin(_path: String) -> Result<(), FsError> {
        Err(unavailable())
    }
}

#[cfg(not(windows))]
pub use window_label::*;

/// The file types of the «Nuovo» menu, as Windows offers them.
#[tauri::command]
pub async fn new_file_types() -> Result<Vec<crate::shell::new_file::NewFileType>, FsError> {
    off_window(|| Ok(crate::shell::new_file::list())).await
}

/// Creates a new file of type `ext` inside `parent`. Returns the path.
#[tauri::command]
pub async fn create_new_file(parent: String, ext: String) -> Result<String, FsError> {
    off_window(move || crate::shell::new_file::create(&parent, &ext)).await
}

use crate::lan::Lan;
use std::sync::Arc;

#[tauri::command]
pub fn lan_status(lan: tauri::State<'_, Arc<Lan>>) -> crate::lan::LanStatus {
    lan.status()
}

/// Visibility, shared folder and received folder.
#[tauri::command]
pub fn lan_configure(lan: tauri::State<'_, Arc<Lan>>, config: crate::lan::LanSettings) -> crate::lan::LanStatus {
    lan.set(config.into());
    lan.status()
}

#[tauri::command]
pub fn lan_peers(lan: tauri::State<'_, Arc<Lan>>) -> Vec<crate::lan::Peer> {
    lan.peers()
}

/// Accepts or refuses files arriving from another PC. When accepting you
/// can choose where to save them; otherwise they go to the received folder.
#[tauri::command]
pub fn lan_respond(lan: tauri::State<'_, Arc<Lan>>, id: u64, accept: bool, folder: Option<String>) {
    lan.respond(id, accept, folder);
}

/// Stops from this side a reception in progress from another PC.
#[tauri::command]
pub fn lan_cancel_receive(lan: tauri::State<'_, Arc<Lan>>, id: u64) -> bool {
    lan.cancel_receive(id)
}

use crate::friends::Friends;

/// Downloads items shared by another PC, on the lan or from a friend: the
/// path says which.
pub fn download_remote(
    lan: &Lan,
    friends: &Friends,
    sources: &[String],
    dest: &str,
    cancel: &std::sync::atomic::AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    if sources.first().is_some_and(|p| crate::server::is_server(p)) {
        crate::server::servers()?.download(sources, dest, cancel, progress)
    } else if sources.first().is_some_and(|p| crate::friends::split(p).is_some()) {
        friends.download(sources, dest, cancel, progress)
    } else {
        crate::lan::download(lan, sources, dest, cancel, progress)
    }
}

/// Opens a file of the folder shared by another PC: downloads it into a
/// temporary folder and opens it from there.
///
/// Not programs: downloading from the network and starting right away is exactly what
/// viruses do, and the antivirus would end up suspecting Space Train.
/// They are copied to the PC and opened from there, with Windows' checks.
#[tauri::command]
pub async fn lan_open(
    lan: tauri::State<'_, Arc<Lan>>,
    friends: tauri::State<'_, Arc<Friends>>,
    path: String,
) -> Result<(), FsError> {
    if crate::fs::origin::is_program(&path) {
        return Err(FsError::Io {
            message: "È un programma: per sicurezza non si avvia direttamente da un altro PC. Copialo sul tuo PC e aprilo da lì.".into(),
        });
    }
    let lan = lan.inner().clone();
    let friends = friends.inner().clone();
    off_window(move || {
        let temp = std::env::temp_dir().join("SpaceTrain-rete");
        let pairs = download_remote(
            &lan,
            &friends,
            std::slice::from_ref(&path),
            &temp.to_string_lossy(),
            &std::sync::atomic::AtomicBool::new(false),
            &mut |_, _| {},
        )?;
        let local = crate::fs::origin::file_to_open(&path, &pairs)?;
        if !std::path::Path::new(&local).is_file() {
            return Err(FsError::NotFound);
        }
        open::open_default(&local)
    })
    .await
}

#[tauri::command]
pub fn friends_status(friends: tauri::State<'_, Arc<Friends>>) -> crate::friends::FriendsStatus {
    friends.status()
}

/// Adds a friend from their personal code and asks them for the friendship.
#[tauri::command]
pub async fn friends_add(friends: tauri::State<'_, Arc<Friends>>, code: String) -> Result<(), FsError> {
    let friends = friends.inner().clone();
    off_window(move || friends.add(&code)).await
}

/// Accepts the friend request of `id`.
#[tauri::command]
pub async fn friends_accept(friends: tauri::State<'_, Arc<Friends>>, id: String) -> Result<(), FsError> {
    let friends = friends.inner().clone();
    off_window(move || friends.accept(&id)).await
}

/// Removes a friend, or refuses their request.
#[tauri::command]
pub async fn friends_remove(friends: tauri::State<'_, Arc<Friends>>, id: String) -> Result<(), FsError> {
    let friends = friends.inner().clone();
    off_window(move || friends.remove(&id)).await
}

/// Gives a friend the shared folder, or takes it away.
#[tauri::command]
pub fn friends_share(friends: tauri::State<'_, Arc<Friends>>, id: String, enabled: bool) -> crate::friends::FriendsStatus {
    friends.share(&id, enabled);
    friends.status()
}

/// Starts (with a folder) or stops the daily backup towards a friend.
#[tauri::command]
pub fn friends_backup(friends: tauri::State<'_, Arc<Friends>>, id: String, folder: Option<String>) -> crate::friends::FriendsStatus {
    friends.set_backup(&id, folder);
    friends.status()
}

/// Runs the backup towards a friend now. Returns what was sent.
#[tauri::command]
pub async fn friends_backup_now(friends: tauri::State<'_, Arc<Friends>>, id: String) -> Result<String, FsError> {
    let friends = friends.inner().clone();
    off_window(move || friends.sync(&id)).await
}

/// Yes or no to a friend who wants to keep their backup on this PC.
#[tauri::command]
pub fn friends_answer_backup(
    friends: tauri::State<'_, Arc<Friends>>,
    id: String,
    yes: bool,
    folder: Option<String>,
) -> crate::friends::FriendsStatus {
    friends.answer_backup(&id, yes, folder);
    friends.status()
}

/// The QR code of our personal code, in SVG.
#[tauri::command]
pub fn friends_qr(friends: tauri::State<'_, Arc<Friends>>) -> Result<String, FsError> {
    crate::friends::qr(&friends.status().code)
}

/// Downloads into a temporary folder the items of the folder shared
/// by another PC, and returns their paths on disk.
///
/// Used to drag them out of the app, onto the desktop or into Explorer: Windows
/// accepts only real files, and a `::lan\…` path does not exist for it
/// («Elemento non raggiungibile»). Temporary folders older than a
/// day are thrown away at every new drag.
#[tauri::command]
pub async fn lan_prepare_drag(
    lan: tauri::State<'_, Arc<Lan>>,
    friends: tauri::State<'_, Arc<Friends>>,
    paths: Vec<String>,
) -> Result<Vec<String>, FsError> {
    let lan = lan.inner().clone();
    let friends = friends.inner().clone();
    off_window(move || {
        let base = std::env::temp_dir().join("SpaceTrain-trascina");
        if let Ok(old) = std::fs::read_dir(&base) {
            for v in old.filter_map(|v| v.ok()) {
                let expired = v
                    .metadata()
                    .and_then(|m| m.modified())
                    .map(|t| t.elapsed().map(|d| d.as_secs() > 24 * 3600).unwrap_or(false))
                    .unwrap_or(false);
                if expired {
                    let _ = std::fs::remove_dir_all(v.path());
                }
            }
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = base.join(stamp.to_string());
        std::fs::create_dir_all(&dir).map_err(|e| crate::fs::error::from_io(&e))?;
        let pairs = download_remote(
            &lan,
            &friends,
            &paths,
            &dir.to_string_lossy(),
            &std::sync::atomic::AtomicBool::new(false),
            &mut |_, _| {},
        )?;
        Ok(pairs.into_iter().map(|c| c[1].clone()).collect())
    })
    .await
}

/// The folder Windows started the app with, if it passed one.
#[tauri::command]
pub async fn initial_path() -> Result<Option<ops::Destination>, FsError> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    off_window(move || Ok(crate::startup::destination(&args))).await
}

/// Opens another window of the app, in the same process, on the given
/// folder. The windows share the lan, the watcher and the preferences.
///
/// It must be `async`: a synchronous command runs on the window's thread,
/// and there WebView2 cannot finish creating the new one — which
/// stayed stuck on a blank page.
#[tauri::command]
pub async fn new_window(app: tauri::AppHandle, path: Option<String>) -> Result<String, FsError> {
    crate::app_windows::new(&app, path).map_err(|message| FsError::Io { message })
}

/// Opens the theme editor in a window of its own, which can also move
/// outside the app. Async for the same reason as `new_window`.
#[tauri::command]
pub async fn open_theme_editor(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), FsError> {
    crate::app_windows::theme_editor(&app, &window).map_err(|message| FsError::Io { message })
}

/// Saves an image chosen in the theme editor into the app's data folder, so
/// the theme keeps working even if the original gets moved or deleted.
/// Returns the saved path.
#[tauri::command]
pub async fn save_theme_image(app: tauri::AppHandle, name: String, data: String) -> Result<String, FsError> {
    use base64::Engine;
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| FsError::Io { message: e.to_string() })?
        .join("temi-immagini");
    off_window(move || {
        let byte = base64::engine::general_purpose::STANDARD
            .decode(data.as_bytes())
            .map_err(|e| FsError::Io { message: format!("Immagine non valida: {}", e) })?;
        std::fs::create_dir_all(&dir).map_err(|e| crate::fs::error::from_io(&e))?;
        // Only the name, cleaned up: no folders or forbidden characters.
        let clean: String = std::path::Path::new(&name)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "immagine.png".into())
            .chars()
            .map(|c| if r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
            .collect();
        let final_name = crate::fs::copy::unique_name(&dir, &clean);
        let path = dir.join(final_name);
        std::fs::write(&path, byte).map_err(|e| crate::fs::error::from_io(&e))?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
}

/// Reads back in base64 an image saved by `save_theme_image`, to process it
/// in the WebView (removing the background). An image loaded from disk
/// with the asset protocol address cannot be read pixel by pixel: the bytes
/// must come from here. Only from the themes folder.
#[tauri::command]
pub async fn read_theme_image(app: tauri::AppHandle, path: String) -> Result<String, FsError> {
    use base64::Engine;
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| FsError::Io { message: e.to_string() })?
        .join("temi-immagini");
    off_window(move || {
        let real = std::fs::canonicalize(&path).map_err(|e| crate::fs::error::from_io(&e))?;
        let folder = std::fs::canonicalize(&dir).map_err(|e| crate::fs::error::from_io(&e))?;
        if !real.starts_with(&folder) {
            return Err(FsError::Io { message: "Immagine fuori dalla cartella dei temi".into() });
        }
        let byte = std::fs::read(&real).map_err(|e| crate::fs::error::from_io(&e))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(byte))
    })
    .await
}
