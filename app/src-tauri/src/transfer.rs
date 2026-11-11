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
            if let Some(flag) = mappa.remove(&id) {
                crate::fs::pausa::dimentica(&flag);
            }
        }
    }

    /// Pauses or resumes a running job. False if the id is unknown.
    fn pausa(&self, id: u64, in_pausa: bool) -> bool {
        match self.0.lock() {
            Ok(mappa) => match mappa.get(&id) {
                Some(flag) => {
                    crate::fs::pausa::imposta(flag, in_pausa);
                    true
                }
                None => false,
            },
            Err(_) => false,
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

/// Groups of identical files under `root`, delivered as they are proven.
/// Cancelled with `cancel_transfer` and the same `op_id`, like a search.
#[tauri::command]
pub async fn find_duplicates(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    root: String,
    hidden: bool,
    on_event: Channel<crate::fs::duplicates::DuplicateEvent>,
) -> Result<usize, FsError> {
    let cancel = state.registra(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || {
        crate::fs::duplicates::find(&root, hidden, &cancel, &mut |ev| {
            let _ = on_event.send(ev);
        })
    })
    .await;
    state.dimentica(op_id);
    work.map_err(|e| FsError::Io {
        message: format!("Ricerca dei duplicati interrotta: {}", e),
    })
}

/// Checksum of one file (hex), `None` if cancelled with `cancel_transfer` and the same `op_id`.
#[tauri::command]
pub async fn file_checksum(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    path: String,
    algorithm: crate::fs::checksum::Algorithm,
) -> Result<Option<String>, FsError> {
    let cancel = state.registra(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || crate::fs::checksum::checksum(&path, algorithm, &cancel)).await;
    state.dimentica(op_id);
    work.map_err(|e| FsError::Io { message: format!("Calcolo interrotto: {}", e) })?
}

/// Compares two folder trees. Cancelled with `cancel_transfer` and the same `op_id`.
#[tauri::command]
pub async fn compare_folders(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    here: String,
    there: String,
    content: bool,
    hidden: bool,
) -> Result<crate::fs::compare::Comparison, FsError> {
    let cancel = state.registra(op_id);
    let work = tauri::async_runtime::spawn_blocking(move || {
        let opts = crate::fs::compare::Options { content, hidden };
        crate::fs::compare::compare(&here, &there, &opts, &cancel)
    })
    .await;
    state.dimentica(op_id);
    work.map_err(|e| FsError::Io { message: format!("Confronto interrotto: {}", e) })?
}

/// Esegue un lavoro lungo su archivi con barra d'avanzamento e annullamento.
async fn con_avanzamento<T: Send + 'static>(
    state: &Operazioni,
    op_id: u64,
    totale: impl FnOnce() -> u64 + Send + 'static,
    on_progress: Channel<Progresso>,
    lavoro: impl FnOnce(&AtomicBool, &mut dyn FnMut(u64)) -> Result<T, FsError>
        + Send
        + 'static,
) -> Result<T, FsError> {
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
        move || crate::fs::archive_formats::unpacked_size(&per_peso),
        on_progress,
        move |annulla, avanza| match crate::fs::archive_formats::format_of(&archive) {
            Some(crate::fs::archive_formats::Format::Zip) | None => crate::fs::archivi::estrai(&archive, annulla, avanza),
            Some(_) => crate::fs::archive_formats::extract_beside(&archive, annulla, avanza),
        },
    )
    .await
}

/// Every item inside an archive (any format Space Train reads).
#[tauri::command]
pub async fn archive_list(archive: String) -> Result<Vec<crate::fs::archive_formats::ArchiveItem>, FsError> {
    tauri::async_runtime::spawn_blocking(move || crate::fs::archive_formats::list(&archive))
        .await
        .map_err(|e| FsError::Io { message: e.to_string() })?
}

/// Extracts chosen items of an archive into `dest`, with progress. Folders bring their contents.
#[tauri::command]
pub async fn archive_extract(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    archive: String,
    items: Vec<String>,
    dest: String,
    on_progress: Channel<Progresso>,
) -> Result<(), FsError> {
    let for_size = (archive.clone(), items.clone());
    con_avanzamento(
        &state,
        op_id,
        move || {
            let (a, chosen) = for_size;
            crate::fs::archive_formats::list(&a)
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
            crate::fs::archive_formats::extract(&archive, std::path::Path::new(&dest), Some(&items), cancel, progress)
        },
    )
    .await
}

/// Rotates images a quarter turn, rewriting each file.
#[tauri::command]
pub async fn image_rotate(paths: Vec<String>, clockwise: bool) -> Result<(), FsError> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().try_for_each(|p| crate::fs::immagini::rotate(p, clockwise))
    })
    .await
    .map_err(|e| FsError::Io { message: e.to_string() })?
}

/// Converts and resizes images into new files beside them. Progress counts files.
#[tauri::command]
pub async fn image_convert(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    paths: Vec<String>,
    target: crate::fs::immagini::Target,
    max_side: Option<u32>,
    quality: u8,
    on_progress: Channel<Progresso>,
) -> Result<Vec<String>, FsError> {
    let total = paths.len() as u64;
    con_avanzamento(&state, op_id, move || total, on_progress, move |cancel, progress| {
        crate::fs::immagini::convert(&paths, target, max_side, quality, cancel, progress)
    })
    .await
}

/// What a deletion with progress removes.
#[derive(serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum ModoElimina {
    /// To the Trash: recoverable.
    Cestino,
    /// From disk, skipping the Trash.
    Disco,
    /// Selected items already in the Trash, for good.
    DalCestino,
    /// Everything in the Trash.
    Svuota,
}

/// Deletes with a progress bar counted in items. Can be cancelled between
/// items: returns the paths actually removed, so the frontend undoes only
/// those. The user's confirmation happens in the frontend, before this.
#[tauri::command]
pub async fn delete_items(
    state: tauri::State<'_, Operazioni>,
    op_id: u64,
    mode: ModoElimina,
    paths: Vec<String>,
    on_progress: Channel<Progresso>,
) -> Result<Vec<String>, FsError> {
    use crate::fs::elimina;
    let per_conto = paths.clone();
    con_avanzamento(
        &state,
        op_id,
        move || match mode {
            ModoElimina::Cestino => per_conto.len() as u64,
            ModoElimina::Disco => elimina::conta_tutti(&per_conto),
            ModoElimina::DalCestino => elimina::conta_nel_cestino(Some(&per_conto)),
            ModoElimina::Svuota => elimina::conta_nel_cestino(None),
        },
        on_progress,
        move |annulla, avanza| match mode {
            ModoElimina::Cestino => elimina::cestina(&paths, annulla, avanza),
            ModoElimina::Disco => elimina::elimina_disco(&paths, annulla, avanza),
            ModoElimina::DalCestino => elimina::elimina_dal_cestino(Some(&paths), annulla, avanza),
            ModoElimina::Svuota => elimina::elimina_dal_cestino(None, annulla, avanza),
        },
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

/// Pauses (or resumes) a job between one item and the next.
#[tauri::command]
pub fn pause_transfer(state: tauri::State<'_, Operazioni>, op_id: u64, paused: bool) -> bool {
    state.pausa(op_id, paused)
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
