# Space Train

A file manager for Windows 10 and 11, built with Tauri (Rust) and Svelte. It can
replace File Explorer as the default way to open folders, and it updates itself.

## Install

1. Open the [Releases](https://github.com/miky41195/Space-Train/releases/latest) page.
2. Download `Space.Train_<version>_x64-setup.exe` and run it. No administrator
   rights are needed: it installs for the current user only.

Installed copies check for a new version when they start. When one is found it
downloads in the background and a bar offers **Restart and update**.

## What it does

- Tabs and multiple windows, back/forward/up, an editable address bar.
- Details, list, tiles, content and icon views, with Ctrl+wheel zoom.
- Real Windows icons and thumbnails, including the own icons of programs,
  shortcuts and customized folders.
- Copy, move, rename, Recycle Bin, ZIP compress/extract, undo with Ctrl+Z.
- Search in subfolders, by name or content.
- Favorites per folder, pinned folders in the sidebar, folder colors.
- Start page, folders that always open at startup, restoring the last session.
- The Windows context menu ("More Windows options"), Open with, Properties,
  open a terminal in a folder.
- Optional: open folders with Space Train instead of File Explorer.
- Local network sharing between PCs running Space Train.
- Color themes and "world" themes with characters, plus a theme editor.

The interface is in Italian or English, following the Windows language.

## Development

Requirements: Node.js 20, Rust (stable), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```sh
cd app
npm install
npm run tauri dev     # run the app
npx vitest run        # frontend tests
cd src-tauri && cargo test --lib   # backend tests
```

## Releasing a new version

```sh
cd app
npm run rilascia -- 0.2.0
```

The script sets the version in `package.json`, `tauri.conf.json` and
`Cargo.toml`, commits, tags `v0.2.0` and pushes. GitHub Actions then builds the
installer and publishes the release.

Updates are signed. The private key lives outside the repository (on the
maintainer's PC and in the `TAURI_SIGNING_PRIVATE_KEY` repository secret); the
public key is in `app/src-tauri/tauri.conf.json`. Without the private key no
installed copy will accept new updates, so keep a backup of it.

### Files in a release

| File | Who uses it |
| --- | --- |
| `Space.Train_<version>_x64-setup.exe` | People installing the app for the first time. |
| `Space.Train_<version>_x64-setup.exe.sig` | The signature of the installer. The app checks it before installing an update, so a tampered file is refused. |
| `latest.json` | Read by installed copies at startup: it says which version is the newest, where to download it and its signature. |

The `.sig` and `latest.json` files are not meant to be downloaded by hand.

## License

MIT
