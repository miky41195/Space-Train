//! Pausing a running job between one file and the next.
//!
//! Every long job already checks its cancel flag between items. Those checks
//! go through [`fermo`], which also waits while the job is paused. The pause
//! flag is found from the cancel flag's address, so no job signature changes.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

fn registro() -> &'static Mutex<HashMap<usize, Arc<AtomicBool>>> {
    static R: OnceLock<Mutex<HashMap<usize, Arc<AtomicBool>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

fn chiave(cancel: &AtomicBool) -> usize {
    cancel as *const AtomicBool as usize
}

/// Pauses or resumes the job whose cancel flag is `cancel`.
pub fn imposta(cancel: &AtomicBool, in_pausa: bool) {
    if let Ok(mut r) = registro().lock() {
        r.entry(chiave(cancel)).or_default().store(in_pausa, Ordering::Relaxed);
    }
}

/// The job is over: its flag address may be reused by another job.
pub fn dimentica(cancel: &AtomicBool) {
    if let Ok(mut r) = registro().lock() {
        r.remove(&chiave(cancel));
    }
}

/// Waits while the job is paused, then says whether it was cancelled.
pub fn fermo(cancel: &AtomicBool) -> bool {
    loop {
        if cancel.load(Ordering::Relaxed) {
            return true;
        }
        let in_pausa = registro()
            .lock()
            .ok()
            .and_then(|r| r.get(&chiave(cancel)).map(|f| f.load(Ordering::Relaxed)))
            .unwrap_or(false);
        if !in_pausa {
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
        imposta(&cancel, true);
        let c = cancel.clone();
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            imposta(&c, false);
        });
        let start = Instant::now();
        assert!(!fermo(&cancel));
        assert!(start.elapsed() >= Duration::from_millis(200));
        t.join().unwrap();

        imposta(&cancel, true);
        cancel.store(true, Ordering::Relaxed);
        assert!(fermo(&cancel));
        dimentica(&cancel);
    }
}
