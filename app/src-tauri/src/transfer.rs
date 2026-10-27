use crate::fs::copy::{self, Esito, Politica};
use crate::fs::error::FsError;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

/// Ogni quanto al massimo si notifica il frontend. Copiare mille file
/// piccoli produrrebbe altrimenti mille messaggi IPC al secondo, che costano
/// più della copia stessa.
const INTERVALLO_AVANZAMENTO: Duration = Duration::from_millis(80);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progresso {
    pub transferred: u64,
    pub total: u64,
}

/// Operazioni in corso, per poterle annullare da un altro comando.
///
/// È l'unico stato che il backend conserva fra una chiamata e l'altra.
/// Riguarda l'esecuzione, non la navigazione: la regola "Rust è stateless"
/// nasce per tenere fuori lo stato dei tab, e resta valida lì.
#[derive(Default)]
pub struct Operazioni(Mutex<HashMap<u64, Arc<AtomicBool>>>);

impl Operazioni {
    pub(crate) fn registra(&self, id: u64) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut mappa) = self.0.lock() {
            mappa.insert(id, flag.clone());
        }
        flag
    }

    pub(crate) fn dimentica(&self, id: u64) {
        if let Ok(mut mappa) = self.0.lock() {
            mappa.remove(&id);
        }
    }

    fn annulla(&self, id: u64) -> bool {
        match self.0.lock() {
            Ok(mappa) => match mappa.get(&id) {
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

/// Copia o sposta `sources` dentro `dest`.
///
/// Il lavoro gira su un thread dedicato: il filesystem è bloccante e
/// terrebbe fermo l'event loop, congelando la finestra per tutta la durata.
#[tauri::command]
pub async fn transfer(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    sources: Vec<String>,
    dest: String,
    mode: String,
    policy: Politica,
    on_progress: Channel<Progresso>,
) -> Result<Esito, FsError> {
    let annulla = state.registra(op_id);
    let sposta = mode == "move";

    let lavoro = tauri::async_runtime::spawn_blocking(move || {
        let total = copy::total_bytes(&sources);
        let _ = on_progress.send(Progresso {
            transferred: 0,
            total,
        });

        let mut ultimo = Instant::now();
        let mut avanzamento = |fatti: u64| {
            if ultimo.elapsed() >= INTERVALLO_AVANZAMENTO {
                ultimo = Instant::now();
                let _ = on_progress.send(Progresso {
                    transferred: fatti,
                    total,
                });
            }
        };

        let esito = if sposta {
            copy::move_all(&sources, &dest, policy, &annulla, &mut avanzamento)
        } else {
            copy::copy_all(&sources, &dest, policy, &annulla, &mut avanzamento)
        };

        // Ultimo colpo sempre inviato: senza, la barra resterebbe ferma
        // all'ultimo campione utile invece di chiudere a fondo scala.
        if esito.is_ok() {
            let _ = on_progress.send(Progresso {
                transferred: total,
                total,
            });
        }

        esito
    })
    .await;

    state.dimentica(op_id);

    match lavoro {
        Ok(esito) => esito,
        Err(e) => Err(FsError::Io {
            message: format!("Operazione interrotta: {}", e),
        }),
    }
}

/// Nomi già presenti a destinazione. Il frontend lo chiama prima di
/// `transfer` per sapere se deve chiedere una politica all'utente.
#[tauri::command]
pub fn scan_conflicts(sources: Vec<String>, dest: String) -> Vec<String> {
    copy::scan_conflicts(&sources, &dest)
}

/// Cerca nelle sottocartelle di `root`, consegnando i risultati a lotti.
/// Si annulla con `cancel_transfer` passando lo stesso `op_id`.
#[tauri::command]
pub async fn search(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    root: String,
    criteri: crate::fs::cerca::Criteri,
    on_results: Channel<Vec<crate::fs::entry::Entry>>,
) -> Result<usize, FsError> {
    let annulla = state.registra(op_id);
    let lavoro = tauri::async_runtime::spawn_blocking(move || {
        crate::fs::cerca::cerca(&root, &criteri, &annulla, &mut |lotto| {
            let _ = on_results.send(lotto);
        })
    })
    .await;
    state.dimentica(op_id);
    lavoro.map_err(|e| FsError::Io {
        message: format!("Ricerca interrotta: {}", e),
    })
}

/// Esegue un lavoro lungo su archivi con barra d'avanzamento e annullamento.
async fn con_avanzamento(
    state: &Operazioni,
    op_id: u64,
    totale: impl FnOnce() -> u64 + Send + 'static,
    on_progress: Channel<Progresso>,
    lavoro: impl FnOnce(&AtomicBool, &mut dyn FnMut(u64)) -> Result<String, FsError>
        + Send
        + 'static,
) -> Result<String, FsError> {
    let annulla = state.registra(op_id);
    let esito = tauri::async_runtime::spawn_blocking(move || {
        let total = totale();
        let _ = on_progress.send(Progresso { transferred: 0, total });
        let mut ultimo = Instant::now();
        let mut avanzamento = |fatti: u64| {
            if ultimo.elapsed() >= INTERVALLO_AVANZAMENTO {
                ultimo = Instant::now();
                let _ = on_progress.send(Progresso { transferred: fatti, total });
            }
        };
        let r = lavoro(&annulla, &mut avanzamento);
        let _ = on_progress.send(Progresso { transferred: total, total });
        r
    })
    .await;
    state.dimentica(op_id);
    esito.map_err(|e| FsError::Io {
        message: format!("Operazione interrotta: {}", e),
    })?
}

/// Comprime in un nuovo ZIP dentro `dest`. Ritorna il path dell'archivio.
#[tauri::command]
pub async fn compress(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    sources: Vec<String>,
    dest: String,
    on_progress: Channel<Progresso>,
) -> Result<String, FsError> {
    let per_peso = sources.clone();
    con_avanzamento(
        &state,
        op_id,
        move || copy::total_bytes(&per_peso),
        on_progress,
        move |annulla, avanza| crate::fs::archivi::comprimi(&sources, &dest, annulla, avanza),
    )
    .await
}

/// Estrae l'archivio in una cartella nuova accanto. Ritorna la cartella.
#[tauri::command]
pub async fn extract(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    archive: String,
    on_progress: Channel<Progresso>,
) -> Result<String, FsError> {
    let per_peso = archive.clone();
    con_avanzamento(
        &state,
        op_id,
        move || crate::fs::archivi::peso_archivio(&per_peso),
        on_progress,
        move |annulla, avanza| crate::fs::archivi::estrai(&archive, annulla, avanza),
    )
    .await
}

/// Invia file locali a un altro PC della rete locale. Attende il suo consenso.
#[tauri::command]
pub async fn lan_invia(
    state: tauri::State<'_, Operazioni>,
    lan: tauri::State<'_, Arc<crate::lan::Lan>>,
    amici: tauri::State<'_, Arc<crate::amici::Amici>>,
    op_id: u64,
    peer: String,
    paths: Vec<String>,
    on_progress: Channel<Progresso>,
) -> Result<(), FsError> {
    let annulla = state.registra(op_id);
    let lan = lan.inner().clone();
    let amici = amici.inner().clone();
    let esito = tauri::async_runtime::spawn_blocking(move || {
        let mut ultimo = Instant::now();
        let mut avanza = |fatti, total| {
            if ultimo.elapsed() >= INTERVALLO_AVANZAMENTO {
                ultimo = Instant::now();
                let _ = on_progress.send(Progresso { transferred: fatti, total });
            }
        };
        // Un amico arriva come `@codice`, un PC della rete locale col suo id.
        match peer.strip_prefix(crate::amici::PREFISSO_INVIO) {
            Some(amico) => amici.invia(amico, &paths, &annulla, &mut avanza),
            None => crate::lan::invia(&lan, &peer, &paths, &annulla, &mut avanza),
        }
    })
    .await;
    state.dimentica(op_id);
    esito.map_err(|e| FsError::Io { message: format!("Invio interrotto: {}", e) })?
}

/// Copia elementi dalla cartella condivisa di un altro PC dentro `dest`.
#[tauri::command]
pub async fn lan_scarica(
    state: tauri::State<'_, Operazioni>,
    lan: tauri::State<'_, Arc<crate::lan::Lan>>,
    amici: tauri::State<'_, Arc<crate::amici::Amici>>,
    op_id: u64,
    sources: Vec<String>,
    dest: String,
    on_progress: Channel<Progresso>,
) -> Result<Esito, FsError> {
    let annulla = state.registra(op_id);
    let lan = lan.inner().clone();
    let amici = amici.inner().clone();
    let esito = tauri::async_runtime::spawn_blocking(move || {
        let mut ultimo = Instant::now();
        let coppie = crate::ipc::scarica_remoto(&lan, &amici, &sources, &dest, &annulla, &mut |fatti, total| {
            if ultimo.elapsed() >= INTERVALLO_AVANZAMENTO {
                ultimo = Instant::now();
                let _ = on_progress.send(Progresso { transferred: fatti, total });
            }
        })?;
        Ok::<_, FsError>(Esito { copiati: coppie.len() as u64, saltati: 0, annullato: false, coppie })
    })
    .await;
    state.dimentica(op_id);
    esito.map_err(|e| FsError::Io { message: format!("Copia interrotta: {}", e) })?
}

#[tauri::command]
pub fn cancel_transfer(state: tauri::State<'_, Operazioni>, op_id: u64) -> bool {
    state.annulla(op_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn annullare_alza_la_bandiera_dell_operazione() {
        let ops = Operazioni::default();
        let flag = ops.registra(7);

        assert!(ops.annulla(7));
        assert!(flag.load(Ordering::Relaxed));
    }

    #[test]
    fn annullare_un_id_sconosciuto_dice_di_no() {
        let ops = Operazioni::default();
        assert!(!ops.annulla(99));
    }

    #[test]
    fn dopo_dimentica_l_operazione_non_e_piu_annullabile() {
        let ops = Operazioni::default();
        ops.registra(3);
        ops.dimentica(3);

        assert!(!ops.annulla(3));
    }
}
