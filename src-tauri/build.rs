fn main() {
    gnu_skip_default_manifest();
    tauri_build::build();
    tests_get_manifest();
}

/// tauri-build embeds the Windows manifest (Common Controls v6) into binaries only.
/// Without it the test exe does not start (STATUS_ENTRYPOINT_NOT_FOUND), so the same resource is handed to the tests.
fn tests_get_manifest() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    for name in ["resource.lib", "libresource.a"] {
        let p = out.join(name);
        if p.exists() {
            println!("cargo:rustc-link-arg-tests={}", p.display());
        }
    }
}

/// The GNU toolchain (MinGW) adds its own manifest (`default-manifest.o`) to the exe, and it conflicts with the Tauri one:
/// the linker keeps only one, Common Controls v6 is lost and the exe does not start (STATUS_ENTRYPOINT_NOT_FOUND).
/// GCC links that file only if it finds it on the search path, so an empty object with the same name is placed
/// first through `-B`. On MSVC (CI and releases) this code does nothing.
fn gnu_skip_default_manifest() {
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("gnu") || std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("no-default-manifest");
    let _ = std::fs::create_dir_all(&out);
    let src = out.join("empty.c");
    let obj = out.join("default-manifest.o");
    std::fs::write(&src, "/* empty: replaces default-manifest.o from MinGW */\n").unwrap();
    let ok = std::process::Command::new("gcc").arg("-c").arg(&src).arg("-o").arg(&obj).status().is_ok_and(|s| s.success());
    if ok {
        println!("cargo:rustc-link-arg=-B{}", out.display());
    } else {
        println!("cargo:warning=gcc not found: MinGW will add its own manifest and the exe may not start");
    }
}
