use crate::fs::entry::{Entry, EntryKind};
use serde::Deserialize;
use std::cmp::Ordering;

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SortKey {
    Name,
    Size,
    Modified,
    Kind,
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SortSpec {
    pub key: SortKey,
    pub ascending: bool,
}

impl Default for SortSpec {
    fn default() -> Self {
        SortSpec {
            key: SortKey::Name,
            ascending: true,
        }
    }
}

/// Le cartelle precedono sempre i file, in qualsiasi direzione: l'inversione
/// dell'ordine si applica solo dentro ciascun gruppo.
pub fn sort_entries(entries: &mut [Entry], spec: &SortSpec) {
    entries.sort_by(|a, b| {
        let group = rank(a).cmp(&rank(b));
        if group != Ordering::Equal {
            return group;
        }

        let ord = match spec.key {
            SortKey::Name => cmp_name(a, b),
            SortKey::Size => a.size.cmp(&b.size).then_with(|| cmp_name(a, b)),
            SortKey::Modified => a.modified.cmp(&b.modified).then_with(|| cmp_name(a, b)),
            SortKey::Kind => ext_of(&a.name)
                .cmp(&ext_of(&b.name))
                .then_with(|| cmp_name(a, b)),
        };

        if spec.ascending {
            ord
        } else {
            ord.reverse()
        }
    });
}

fn rank(e: &Entry) -> u8 {
    match e.kind {
        EntryKind::Dir => 0,
        _ => 1,
    }
}

fn cmp_name(a: &Entry, b: &Entry) -> Ordering {
    a.name
        .to_lowercase()
        .cmp(&b.name.to_lowercase())
        .then_with(|| a.name.cmp(&b.name))
}

fn ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 => name[i + 1..].to_lowercase(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs::entry::{Entry, EntryKind};

    fn e(name: &str, kind: EntryKind, size: u64, modified: i64) -> Entry {
        Entry {
            name: name.to_string(),
            path: format!(r"C:\{}", name),
            kind,
            size,
            modified: Some(modified),
            hidden: false,
            origine: None,
            libero: None,
            totale: None,
            icona_propria: false,
        }
    }

    #[test]
    fn le_cartelle_vengono_sempre_prima() {
        let mut v = vec![
            e("zeta.txt", EntryKind::File, 1, 1),
            e("alfa", EntryKind::Dir, 0, 1),
        ];
        sort_entries(
            &mut v,
            &SortSpec {
                key: SortKey::Name,
                ascending: true,
            },
        );
        assert_eq!(v[0].name, "alfa");
        assert_eq!(v[1].name, "zeta.txt");
    }

    #[test]
    fn le_cartelle_restano_prima_anche_in_ordine_inverso() {
        let mut v = vec![
            e("zeta.txt", EntryKind::File, 1, 1),
            e("alfa", EntryKind::Dir, 0, 1),
        ];
        sort_entries(
            &mut v,
            &SortSpec {
                key: SortKey::Name,
                ascending: false,
            },
        );
        assert_eq!(v[0].name, "alfa");
        assert_eq!(v[1].name, "zeta.txt");
    }

    #[test]
    fn ordina_per_nome_ignorando_maiuscole() {
        let mut v = vec![
            e("Banana", EntryKind::File, 1, 1),
            e("ananas", EntryKind::File, 1, 1),
        ];
        sort_entries(
            &mut v,
            &SortSpec {
                key: SortKey::Name,
                ascending: true,
            },
        );
        assert_eq!(v[0].name, "ananas");
    }

    #[test]
    fn ordina_per_dimensione_decrescente() {
        let mut v = vec![
            e("piccolo.txt", EntryKind::File, 10, 1),
            e("grande.txt", EntryKind::File, 900, 1),
        ];
        sort_entries(
            &mut v,
            &SortSpec {
                key: SortKey::Size,
                ascending: false,
            },
        );
        assert_eq!(v[0].name, "grande.txt");
    }

    #[test]
    fn ordina_per_data() {
        let mut v = vec![
            e("vecchio.txt", EntryKind::File, 1, 100),
            e("nuovo.txt", EntryKind::File, 1, 900),
        ];
        sort_entries(
            &mut v,
            &SortSpec {
                key: SortKey::Modified,
                ascending: false,
            },
        );
        assert_eq!(v[0].name, "nuovo.txt");
    }
}
