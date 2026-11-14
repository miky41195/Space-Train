//! Pausing a running job between one file and the next.
//!
//! Every long job already checks its cancel flag between items. Those checks
//! go through [`stopped`], which also waits while the job is paused. The pause
//! flag is found from the cancel flag's address, so no job signature changes.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

fn registry() -> &'static Mutex<HashMap<usize, Arc<AtomicBool>>> {
    static R: OnceLock<Mutex<HashMap<usize, Arc<AtomicBool>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

fn key(cancel: &AtomicBool) -> usize {
    cancel as *const AtomicBool as usize
}

/// Pauses or resumes the job whose cancel flag is `cancel`.
pub fn set(cancel: &AtomicBool, paused: bool) {
    if let Ok(mut r) = registry().lock() {
        r.entry(key(cancel)).or_default().store(paused, Ordering::Relaxed);
    }
}

/// The job is over: its flag address may be reused by another job.
pub fn forget(cancel: &AtomicBool) {
    if let Ok(mut r) = registry().lock() {
        r.remove(&key(cancel));
    }
}

/// Waits while the job is paused, then says whether it was cancelled.
pub fn stopped(cancel: &AtomicBool) -> bool {
    loop {
        if cancel.load(Ordering::Relaxed) {
            return true;
        }
        let paused = registry()
            .lock()
            .ok()
            .and_then(|r| r.get(&key(cancel)).map(|f| f.load(Ordering::Relaxed)))
            .unwrap_or(false);
        if !paused {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn a_paused_job_waits_until_resumed_and_cancel_still_wins() {
        let cancel = Arc::new(AtomicBool::new(false));
        set(&cancel, true);
        let c = cancel.clone();
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            set(&c, false);
        });
        let start = Instant::now();
        assert!(!stopped(&cancel));
        assert!(start.elapsed() >= Duration::from_millis(200));
        t.join().unwrap();

        set(&cancel, true);
        cancel.store(true, Ordering::Relaxed);
        assert!(stopped(&cancel));
        forget(&cancel);
    }
}
