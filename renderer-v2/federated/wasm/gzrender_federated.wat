;; Federated GZRender WASM host — validates GZSTATE magic, stores map stats for JS/WebGL backend.
;; Full render crates (Rust) replace this module when wasm-pack is available in CI.

(module
  (memory (export "memory") 64)

  (global $vertex_count (mut i32) (i32.const 0))
  (global $sector_count (mut i32) (i32.const 0))
  (global $loaded (mut i32) (i32.const 0))

  (func (export "init") (result i32)
    (i32.const 1))

  (func (export "validate_gzstate") (param $ptr i32) (param $len i32) (result i32)
    (if (result i32)
      (i32.lt_u (local.get $len) (i32.const 8))
      (then (i32.const 0))
      (else
        (i32.and
          (i32.eq (i32.load (local.get $ptr)) (i32.const 0x54535a47))
          (i32.eq (i32.load offset=4 (local.get $ptr)) (i32.const 1))))))

  (func (export "set_counts") (param $vertices i32) (param $sectors i32)
    (global.set $vertex_count (local.get $vertices))
    (global.set $sector_count (local.get $sectors))
    (global.set $loaded (i32.const 1)))

  (func (export "clear_state")
    (global.set $vertex_count (i32.const 0))
    (global.set $sector_count (i32.const 0))
    (global.set $loaded (i32.const 0)))

  (func (export "get_vertex_count") (result i32) (global.get $vertex_count))
  (func (export "get_sector_count") (result i32) (global.get $sector_count))
  (func (export "is_loaded") (result i32) (global.get $loaded))
  (func (export "tick") (result i32) (global.get $loaded))
)
