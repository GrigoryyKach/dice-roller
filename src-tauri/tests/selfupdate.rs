//! Unit tests of the shared self-update module (`src/selfupdate.rs`, byte-identical in every NIMVORO tool).
//! `lib` has `test = false`, so the module is compiled into this test binary by path.
#![allow(dead_code)]

#[path = "../src/selfupdate.rs"]
mod selfupdate;
