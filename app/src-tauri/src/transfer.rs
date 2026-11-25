use crate::fs::copy::{self, CopyOutcome, ConflictPolicy};
use crate::fs::error::FsError;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

/// How often at most the frontend is notified. Copying a thousand small
/// files would otherwise produce a thousand IPC messages a second, which
/// cost more than the copy itself.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(80);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub transferred: u64,
    pub total: u64,
}

/// Running operations, to be able to cancel them from another command.
///
/// It is the only state the backend keeps between one call and the next.
/// It concerns execution, not navigation: the rule "Rust is stateless"
/// exists to keep the tabs' state out, and it still holds there.
#[derive(Default)]
pub struct Operations(Mutex<HashMap<u64, Arc<AtomicBool>>>);

impl Operations {
    pub(crate) fn register(&self, id: u64) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.0.lock() {
            map.insert(id, flag.clone());
        }
        flag
    }

    pub(crate) fn forget(&self, id: u64) {
        if let Ok(mut map) = self.0.lock() {
            if let Some(flag) = map.remove(&id) {
                crate::fs::pause::forget(&flag);
            }
        }
    }

    /// Pauses or resumes a running job. False if the id is unknown.
    fn pause(&self, id: u64, paused: bool) -> bool {
        match self.0.lock() {
            Ok(map) => match map.get(&id) {
                Some(flag) => {
                    crate::fs::pause::set(flag, paused);
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }

    fn cancel(&self, id: u64) -> bool {
        match self.0.lock() {
            Ok(map) => match map.get(&id) {
                Some(flag) => {
                    flag.store(true, Ordering::Relaxed);
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }
}

/// Copies or moves `sources` into `dest`.
///
/// The work runs on a dedicated thread: the filesystem is blocking and
/// would hold the event loop still, freezing the window for the whole duration.
#[tauri::command]
pub async fn transfer(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    sources: Vec<String>,
    dest: String,
    mode: String,
    policy: ConflictPolicy,
    on_progress: Channel<Progress>,
) -> Result<CopyOutcome, FsError> {
    let cancel = state.register(op_id);
    let is_move = mode == "move";

    let work = tauri::async_runtime::spawn_blocking(move || {
        let total = copy::total_bytes(&sources);
        let _ = on_progress.send(Progress {
            transferred: 0,
            total,
        });

        let mut last = Instant::now();
        let mut progress = |done: u64| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                let _ = on_progress.send(Progress {
                    transferred: done,
                    total,
                });
            }
        };

        // Into a server: an upload. Moving copies there (the originals stay): a
        // network failure halfway must not lose anything.
        let outcome = if crate::server::is_server(&dest) {
            crate::server::servers().and_then(|s| {
                let pairs = s.upload(&sources, &dest, &cancel, &mut |done, _| progress(done))?;
                Ok(copy::CopyOutcome { copied: pairs.len() as u64, skipped: 0, cancelled: false, pairs })
            })
        } else if is_move {
            copy::move_all(&sources, &dest, policy, &cancel, &mut progress)
        } else {
            copy::copy_all(&sources, &dest, policy, &cancel, &mut progress)
        };

        // Last tick always sent: without it, the bar would stay stuck at the
        // last useful sample instead of closing at full scale.
        if outcome.is_ok() {
            let _ = on_progress.send(Progress {
                transferred: total,
                total,
            });
        }

        outcome
    })
    .await;

    state.forget(op_id);

    match work {
        Ok(outcome) => outcome,
        Err(e) => Err(FsError::Io {
            message: format!("Operazione interrotta: {}", e),
        }),
    }
}

/// Names already present at the destination. The frontend calls it before
/// `transfer` to know whether it must ask the user for a policy.
#[tauri::command]
pub fn scan_conflicts(sources: Vec<String>, dest: String) -> Vec<String> {
    copy::scan_conflicts(&sources, &dest)
}

/// Searches the subfolders of `root`, delivering the results in batches.
/// Cancelled with `cancel_transfer` passing the same `op_id`.
#[tauri::command]
pub async fn search(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    root: String,
    criteria: crate::fs::search::SearchCriteria,
    on_results: Channel<Vec<crate::fs::entry::Entry>>,
) -> Result<usize, FsError> {
    let cancel = state.register(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || {
        crate::fs::search::search(&root, &criteria, &cancel, &mut |batch| {
            let _ = on_results.send(batch);
        })
    })
    .await;
    state.forget(op_id);
    work.map_err(|e| FsError::Io {
        message: format!("Ricerca interrotta: {}", e),
    })
}

/// Groups of identical files under `root`, delivered as they are proven.
/// Cancelled with `cancel_transfer` and the same `op_id`, like a search.
#[tauri::command]
pub async fn find_duplicates(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    root: String,
    hidden: bool,
    on_event: Channel<crate::fs::duplicates::DuplicateEvent>,
) -> Result<usize, FsError> {
    let cancel = state.register(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || {
        crate::fs::duplicates::find(&root, hidden, &cancel, &mut |ev| {
            let _ = on_event.send(ev);
        })
    })
    .await;
    state.forget(op_id);
    work.map_err(|e| FsError::Io {
        message: format!("Ricerca dei duplicati interrotta: {}", e),
    })
}

/// Checksum of one file (hex), `None` if cancelled with `cancel_transfer` and the same `op_id`.
#[tauri::command]
pub async fn file_checksum(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    path: String,
    algorithm: crate::fs::checksum::Algorithm,
) -> Result<Option<String>, FsError> {
    let cancel = state.register(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || crate::fs::checksum::checksum(&path, algorithm, &cancel)).await;
    state.forget(op_id);
    work.map_err(|e| FsError::Io { message: format!("Calcolo interrotto: {}", e) })?
}

/// Compares two folder trees. Cancelled with `cancel_transfer` and the same `op_id`.
#[tauri::command]
pub async fn compare_folders(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    here: String,
    there: String,
    content: bool,
    hidden: bool,
) -> Result<crate::fs::compare::Comparison, FsError> {
    let cancel = state.register(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || {
        let opts = crate::fs::compare::Options { content, hidden };
        crate::fs::compare::compare(&here, &there, &opts, &cancel)
    })
    .await;
    state.forget(op_id);
    work.map_err(|e| FsError::Io { message: format!("Confronto interrotto: {}", e) })?
}

/// Runs a long archive job with a progress bar and cancellation.
async fn with_progress<T: Send + 'static>(
    state: &Operations,
    op_id: u64,
    compute_total: impl FnOnce() -> u64 + Send + 'static,
    on_progress: Channel<Progress>,
    work: impl FnOnce(&AtomicBool, &mut dyn FnMut(u64)) -> Result<T, FsError>
        + Send
        + 'static,
) -> Result<T, FsError> {
    let cancel = state.register(op_id);
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let total = compute_total();
        let _ = on_progress.send(Progress { transferred: 0, total });
        let mut last = Instant::now();
        let mut progress = |done: u64| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                let _ = on_progress.send(Progress { transferred: done, total });
            }
        };
        let r = work(&cancel, &mut progress);
        let _ = on_progress.send(Progress { transferred: total, total });
        r
    })
    .await;
    state.forget(op_id);
    outcome.map_err(|e| FsError::Io {
        message: format!("Operazione interrotta: {}", e),
    })?
}

/// Compresses into a new ZIP inside `dest`. Returns the archive's path.
#[tauri::command]
pub async fn compress(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    sources: Vec<String>,
    dest: String,
    on_progress: Channel<Progress>,
) -> Result<String, FsError> {
    let for_size = sources.clone();
    with_progress(
        &state,
        op_id,
        move || copy::total_bytes(&for_size),
        on_progress,
        move |cancel, advance| crate::fs::archives::compress(&sources, &dest, cancel, advance),
    )
    .await
}

/// Extracts the archive into a new folder next to it. Returns the folder.
#[tauri::command]
pub async fn extract(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    archive: String,
    password: Option<String>,
    on_progress: Channel<Progress>,
) -> Result<String, FsError> {
    let for_size = (archive.clone(), password.clone());
    with_progress(
        &state,
        op_id,
        move || crate::fs::archive_formats::unpacked_size(&for_size.0, for_size.1.as_deref()),
        on_progress,
        move |cancel, advance| match crate::fs::archive_formats::format_of(&archive) {
            Some(crate::fs::archive_formats::Format::Zip) | None => crate::fs::archives::extract(&archive, password.as_deref(), cancel, advance),
            Some(_) => crate::fs::archive_formats::extract_beside(&archive, password.as_deref(), cancel, advance),
        },
    )
    .await
}

/// Every item inside an archive (any format Space Train reads).
#[tauri::command]
pub async fn archive_list(archive: String, password: Option<String>) -> Result<Vec<crate::fs::archive_formats::ArchiveItem>, FsError> {
    tauri::async_runtime::spawn_blocking(move || crate::fs::archive_formats::list(&archive, password.as_deref()))
        .await
        .map_err(|e| FsError::Io { message: e.to_string() })?
}

/// Extracts chosen items of an archive into `dest`, with progress. Folders bring their contents.
#[tauri::command]
pub async fn archive_extract(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    archive: String,
    items: Vec<String>,
    dest: String,
    password: Option<String>,
    on_progress: Channel<Progress>,
) -> Result<(), FsError> {
    let for_size = (archive.clone(), items.clone(), password.clone());
    with_progress(
        &state,
        op_id,
        move || {
            let (a, chosen, password) = for_size;
            crate::fs::archive_formats::list(&a, password.as_deref())
                .map(|v| {
                    v.iter()
                        .filter(|i| chosen.iter().any(|c| i.path == *c || i.path.starts_with(&format!("{c}/"))))
                        .map(|i| i.size)
                        .sum()
                })
                .unwrap_or(0)
        },
        on_progress,
        move |cancel, progress| {
            crate::fs::archive_formats::extract(&archive, std::path::Path::new(&dest), Some(&items), password.as_deref(), cancel, progress)
        },
    )
    .await
}

/// Extracts one file of an archive into a temporary folder (one per archive)
/// and returns its path, so it can be opened like any file.
#[tauri::command]
pub async fn archive_open_item(archive: String, item: String, password: Option<String>) -> Result<String, FsError> {
    tauri::async_runtime::spawn_blocking(move || {
        let key = blake3::hash(archive.to_lowercase().as_bytes()).to_hex();
        let dir = std::env::temp_dir().join("space-train-archivi").join(&key.as_str()[..16]);
        let flag = AtomicBool::new(false);
        crate::fs::archive_formats::extract(&archive, &dir, Some(std::slice::from_ref(&item)), password.as_deref(), &flag, &mut |_| {})?;
        let name = item.rsplit('/').next().unwrap_or(&item);
        Ok(crate::fs::paths::display(&dir.join(name)))
    })
    .await
    .map_err(|e| FsError::Io { message: e.to_string() })?
}

/// Rotates images a quarter turn, rewriting each file.
#[tauri::command]
pub async fn image_rotate(paths: Vec<String>, clockwise: bool) -> Result<(), FsError> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().try_for_each(|p| crate::fs::images::rotate(p, clockwise))
    })
    .await
    .map_err(|e| FsError::Io { message: e.to_string() })?
}

/// Converts and resizes images into new files beside them. Progress counts files.
#[tauri::command]
pub async fn image_convert(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    paths: Vec<String>,
    target: crate::fs::images::Target,
    max_side: Option<u32>,
    quality: u8,
    tag: String,
    on_progress: Channel<Progress>,
) -> Result<Vec<String>, FsError> {
    let total = paths.len() as u64;
    with_progress(&state, op_id, move || total, on_progress, move |cancel, progress| {
        crate::fs::images::convert(&paths, target, max_side, quality, &tag, cancel, progress)
    })
    .await
}

/// What a deletion with progress removes.
#[derive(serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum DeleteMode {
    /// To the Trash: recoverable.
    Trash,
    /// From disk, skipping the Trash.
    Permanent,
    /// Selected items already in the Trash, for good.
    FromTrash,
    /// Everything in the Trash.
    EmptyTrash,
}

/// Deletes with a progress bar counted in items. Can be cancelled between
/// items; an item that refuses is reported and skipped, never stops the rest.
/// Returns the paths actually removed, so the frontend undoes only
/// those. The user's confirmation happens in the frontend, before this.
#[tauri::command]
pub async fn delete_items(
    state: tauri::State<'_, Operations>,
    op_id: u64,
    mode: DeleteMode,
    paths: Vec<String>,
    on_progress: Channel<Progress>,
) -> Result<crate::fs::delete::Deleted, FsError> {
    use crate::fs::delete;
    let for_count = paths.clone();
    with_progress(
        &state,
        op_id,
        move || match mode {
            DeleteMode::Trash => for_count.len() as u64,
            DeleteMode::Permanent => delete::count_all(&for_count),
            DeleteMode::FromTrash => delete::count_in_trash(Some(&for_count)),
            DeleteMode::EmptyTrash => delete::count_in_trash(None),
        },
        on_progress,
        move |cancel, advance| match mode {
            DeleteMode::Trash => delete::trash(&paths, cancel, advance),
            DeleteMode::Permanent => delete::delete_from_disk(&paths, cancel, advance),
            DeleteMode::FromTrash => delete::delete_from_trash(Some(&paths), cancel, advance),
            DeleteMode::EmptyTrash => delete::delete_from_trash(None, cancel, advance),
        },
    )
    .await
}

/// Sends local files to another PC on the lan. Waits for its consent.
#[tauri::command]
pub async fn lan_send(
    state: tauri::State<'_, Operations>,
    lan: tauri::State<'_, Arc<crate::lan::Lan>>,
    friends: tauri::State<'_, Arc<crate::friends::Friends>>,
    op_id: u64,
    peer: String,
    paths: Vec<String>,
    on_progress: Channel<Progress>,
) -> Result<(), FsError> {
    let cancel = state.register(op_id);
    let lan = lan.inner().clone();
    let friends = friends.inner().clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let mut last = Instant::now();
        let mut advance = |done, total| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                let _ = on_progress.send(Progress { transferred: done, total });
            }
        };
        // A friend arrives as `@code`, a PC on the lan with its id.
        match peer.strip_prefix(crate::friends::SEND_PREFIX) {
            Some(friend) => friends.send(friend, &paths, &cancel, &mut advance),
            None => crate::lan::send(&lan, &peer, &paths, &cancel, &mut advance),
        }
    })
    .await;
    state.forget(op_id);
    outcome.map_err(|e| FsError::Io { message: format!("Invio interrotto: {}", e) })?
}

/// Copies items from another PC's shared folder into `dest`.
#[tauri::command]
pub async fn lan_download(
    state: tauri::State<'_, Operations>,
    lan: tauri::State<'_, Arc<crate::lan::Lan>>,
    friends: tauri::State<'_, Arc<crate::friends::Friends>>,
    op_id: u64,
    sources: Vec<String>,
    dest: String,
    on_progress: Channel<Progress>,
) -> Result<CopyOutcome, FsError> {
    let cancel = state.register(op_id);
    let lan = lan.inner().clone();
    let friends = friends.inner().clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let mut last = Instant::now();
        let mut report = |done: u64, total: u64| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                let _ = on_progress.send(Progress { transferred: done, total });
            }
        };
        let pairs = if crate::server::is_server(&dest) {
            relay_to_server(&lan, &friends, &sources, &dest, op_id, &cancel, &mut report)?
        } else {
            crate::ipc::download_remote(&lan, &friends, &sources, &dest, &cancel, &mut report)?
        };
        Ok::<_, FsError>(CopyOutcome { copied: pairs.len() as u64, skipped: 0, cancelled: false, pairs })
    })
    .await;
    state.forget(op_id);
    outcome.map_err(|e| FsError::Io { message: format!("Copia interrotta: {}", e) })?
}

/// From a server, another PC or a friend into a server: the items pass
/// through a temporary folder on this PC, downloaded and then uploaded.
/// The bar counts both halves.
fn relay_to_server(
    lan: &crate::lan::Lan,
    friends: &crate::friends::Friends,
    sources: &[String],
    dest: &str,
    op_id: u64,
    cancel: &AtomicBool,
    report: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    let tmp = std::env::temp_dir().join(format!("space-train-relay-{}-{op_id}", std::process::id()));
    std::fs::create_dir_all(&tmp).map_err(|e| crate::fs::error::from_io(&e))?;
    let res = (|| {
        let mut whole = 0u64;
        let got = crate::ipc::download_remote(lan, friends, sources, &tmp.to_string_lossy(), cancel, &mut |d, t| {
            whole = t;
            report(d, t * 2);
        })?;
        let local: Vec<String> = got.iter().map(|p| p[1].clone()).collect();
        let sent = crate::server::servers()?.upload(&local, dest, cancel, &mut |d, _| report(whole + d, whole * 2))?;
        Ok(got.iter().zip(sent).map(|(g, s)| [g[0].clone(), s[1].clone()]).collect())
    })();
    let _ = std::fs::remove_dir_all(&tmp);
    res
}

/// «Back up now» for a server, with the bar.
#[tauri::command]
pub async fn server_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, Operations>,
    op_id: u64,
    id: String,
    on_progress: Channel<Progress>,
) -> Result<String, FsError> {
    let cancel = state.register(op_id);
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let mut last = Instant::now();
        let r = crate::server::servers()?.back_up(&id, &cancel, &mut |done, total| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                let _ = on_progress.send(Progress { transferred: done, total });
            }
        });
        crate::server::backup_done(&app);
        r
    })
    .await;
    state.forget(op_id);
    outcome.map_err(|e| FsError::Io { message: format!("Backup interrotto: {}", e) })?
}

#[tauri::command]
pub fn cancel_transfer(state: tauri::State<'_, Operations>, op_id: u64) -> bool {
    state.cancel(op_id)
}

/// Pauses (or resumes) a job between one item and the next.
#[tauri::command]
pub fn pause_transfer(state: tauri::State<'_, Operations>, op_id: u64, paused: bool) -> bool {
    state.pause(op_id, paused)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelling_raises_the_operation_flag() {
        let ops = Operations::default();
        let flag = ops.register(7);

        assert!(ops.cancel(7));
        assert!(flag.load(Ordering::Relaxed));
    }

    #[test]
    fn cancelling_an_unknown_id_says_no() {
        let ops = Operations::default();
        assert!(!ops.cancel(99));
    }

    #[test]
    fn after_forget_the_operation_is_no_longer_cancellable() {
        let ops = Operations::default();
        ops.register(3);
        ops.forget(3);

        assert!(!ops.cancel(3));
    }
}
