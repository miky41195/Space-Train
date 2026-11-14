//! Automatic refresh: notifies the frontend when the content of a folder
//! open in a tab changes, even by the hand of other programs.
//!
//! Filesystem events arrive in bursts (copying a hundred files
//! produces hundreds): they pile up and one notice per folder is sent
//! only after a moment of quiet.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

const SETTLE: Duration = Duration::from_millis(250);

pub const EVENT: &str = "folder-changed";

#[derive(Default)]
pub struct FolderWatcher {
    state: Mutex<Option<State>>,
}

struct State {
    watcher: RecommendedWatcher,
    /// Lowercase key → path as the frontend sent it.
    watched: HashMap<String, PathBuf>,
    /// The folders open in each window's tabs.
    per_window: HashMap<String, Vec<String>>,
}

/// All the folders to watch: the union of every window's ones, without the
/// virtual locations (This PC, Recycle Bin, Network), which do not exist on
/// disk.
fn union(per_window: &HashMap<String, Vec<String>>) -> HashMap<String, PathBuf> {
    per_window
        .values()
        .flatten()
        .filter(|c| !c.starts_with("::") && !crate::shell::network::is_server(c))
        .map(|c| (key(Path::new(c)), PathBuf::from(c)))
        .collect()
}

fn key(p: &Path) -> String {
    crate::fs::paths::display(p)
        .trim_end_matches('\\')
        .to_lowercase()
}

impl FolderWatcher {
    /// The folders open now in the window `window`. Those of all windows
    /// are watched: one that changes tab must not turn off the automatic
    /// refresh of the others.
    pub fn set(
        &self,
        app: &tauri::AppHandle,
        window: &str,
        folders: &[String],
    ) -> Result<(), String> {
        let mut guard = self.state.lock().map_err(|e| e.to_string())?;

        if guard.is_none() {
            *guard = Some(State {
                watcher: create_watcher(app.clone())?,
                watched: HashMap::new(),
                per_window: HashMap::new(),
            });
        }
        let state = guard.as_mut().expect("just created");
        state.per_window.insert(window.to_string(), folders.to_vec());
        Self::sync(state);
        Ok(())
    }

    /// A closed window stops counting.
    pub fn forget(&self, window: &str) {
        if let Ok(mut g) = self.state.lock() {
            if let Some(state) = g.as_mut() {
                state.per_window.remove(window);
                Self::sync(state);
            }
        }
    }

    fn sync(state: &mut State) {
        let wanted = union(&state.per_window);

        let to_remove: Vec<String> = state
            .watched
            .keys()
            .filter(|k| !wanted.contains_key(*k))
            .cloned()
            .collect();
        for k in to_remove {
            if let Some(p) = state.watched.remove(&k) {
                let _ = state.watcher.unwatch(&p);
            }
        }

        for (k, p) in wanted {
            if state.watched.contains_key(&k) {
                continue;
            }
            // A folder that vanishes or cannot be watched must not prevent
            // watching the others.
            if state.watcher.watch(&p, RecursiveMode::NonRecursive).is_ok() {
                state.watched.insert(k, p);
            }
        }
    }
}

fn create_watcher(app: tauri::AppHandle) -> Result<RecommendedWatcher, String> {
    let (tx, rx) = channel::<PathBuf>();
    start_dispatcher(app, rx);

    let tx: Mutex<Sender<PathBuf>> = Mutex::new(tx);
    notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let Ok(event) = event else { return };
        if let Ok(tx) = tx.lock() {
            for p in event.paths {
                // A change to an item concerns the folder that contains it;
                // the path itself is sent too in case it is precisely a
                // watched folder (renamed, deleted).
                if let Some(g) = p.parent() {
                    let _ = tx.send(g.to_path_buf());
                }
                let _ = tx.send(p);
            }
        }
    })
    .map_err(|e| e.to_string())
}

fn start_dispatcher(app: tauri::AppHandle, rx: std::sync::mpsc::Receiver<PathBuf>) {
    std::thread::Builder::new()
        .name("folder-watcher".into())
        .spawn(move || {
            let mut pending: HashSet<String> = HashSet::new();
            loop {
                match rx.recv_timeout(SETTLE) {
                    Ok(p) => {
                        pending.insert(crate::fs::paths::display(&p));
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        for p in pending.drain() {
                            let _ = app.emit(EVENT, p);
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        })
        .expect("watcher thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folders_of_all_windows_are_watched() {
        let mut m = HashMap::new();
        m.insert("main".to_string(), vec![r"C:\Uno".to_string(), "::pc".to_string()]);
        m.insert("window-2".to_string(), vec![r"C:\Due".to_string(), r"c:\uno\".to_string()]);
        let mut keys: Vec<String> = union(&m).into_keys().collect();
        keys.sort();
        // «Uno» open in two windows is watched once; This PC is not.
        assert_eq!(keys, vec![r"c:\due".to_string(), r"c:\uno".to_string()]);
    }

    #[test]
    fn the_key_ignores_case_and_trailing_slash() {
        assert_eq!(key(Path::new(r"C:\Dati\")), key(Path::new(r"c:\dati")));
    }
}
