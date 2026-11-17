//! Logic without a window: files, the language marker, repo names and window placement.
use dice_roller_lib::{fits, marker_language, read_text, valid_repo, write_atomic, WinState};
use std::path::PathBuf;

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("diceroller-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn atomic_write_replaces_and_leaves_no_temp_file() {
    let d = scratch("atomic");
    let f = d.join("config.json");
    write_atomic(&f, "{\"a\":1}").unwrap();
    write_atomic(&f, "{\"a\":2}").unwrap();
    assert_eq!(read_text(&f).unwrap(), "{\"a\":2}");
    assert!(!d.join("config.json.tmp").exists());
}

#[test]
fn reads_files_with_a_byte_order_mark() {
    let d = scratch("bom");
    let f = d.join("config.json");
    std::fs::write(&f, b"\xEF\xBB\xBF{\"language\":\"ru\"}").unwrap();
    assert_eq!(read_text(&f).unwrap(), "{\"language\":\"ru\"}");
    assert!(read_text(&d.join("missing.json")).is_none());
}

#[test]
fn language_marker() {
    let d = scratch("marker");
    assert_eq!(marker_language(&d), None);
    std::fs::write(d.join(".nimvoro.json"), "\u{feff}{\"language\":\"uk\"}").unwrap();
    assert_eq!(marker_language(&d).as_deref(), Some("uk"));
    std::fs::write(d.join(".nimvoro.json"), "{\"language\":\"de\"}").unwrap();
    assert_eq!(marker_language(&d), None);
    std::fs::write(d.join(".nimvoro.json"), "not json").unwrap();
    assert_eq!(marker_language(&d), None);
}

#[test]
fn repo_names() {
    assert!(valid_repo("GrigoryyKach/dice-roller"));
    assert!(!valid_repo("GrigoryyKach"));
    assert!(!valid_repo("a/b/c"));
    assert!(!valid_repo("a/b c"));
    assert!(!valid_repo("../x"));
    assert!(!valid_repo("a/"));
}

#[test]
fn window_is_restored_only_onto_a_connected_monitor() {
    let one = [(0, 0, 1920u32, 1080u32)];
    let two = [(0, 0, 1920u32, 1080u32), (1920, 0, 1920u32, 1080u32)];
    let on_second = WinState { x: 2200, y: 100, w: 1280, h: 800, maximized: false };
    assert!(fits(&on_second, &two));
    // The second monitor was unplugged: do not restore off-screen.
    assert!(!fits(&on_second, &one));
    let ok = WinState { x: 100, y: 80, w: 1280, h: 800, maximized: false };
    assert!(fits(&ok, &one));
    let tiny = WinState { x: 0, y: 0, w: 10, h: 10, maximized: false };
    assert!(!fits(&tiny, &one));
    let above = WinState { x: 100, y: -300, w: 1280, h: 800, maximized: false };
    assert!(!fits(&above, &one));
}
