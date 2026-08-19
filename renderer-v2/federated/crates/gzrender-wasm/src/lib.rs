use gzrender_core::{read_gzstate, GzDocument};
use wasm_bindgen::prelude::*;

static mut DOC: Option<GzDocument> = None;

fn doc_mut() -> &'static mut GzDocument {
    // SAFETY: federated host is single-threaded in the browser main thread.
    unsafe {
        DOC.as_mut()
            .expect("GZSTATE not loaded — call validate_gzstate first")
    }
}

#[wasm_bindgen]
pub fn init() -> u32 {
    1
}

#[wasm_bindgen]
pub fn clear_state() {
    unsafe {
        DOC = None;
    }
}

#[wasm_bindgen]
pub fn validate_gzstate(ptr: u32, len: u32) -> u32 {
    let memory = wasm_bindgen::memory();
    let memory_view = js_sys::Uint8Array::new(&memory);
    let view = memory_view.subarray(ptr, ptr + len);
    let mut bytes = vec![0u8; len as usize];
    view.copy_to(&mut bytes);
    match read_gzstate(&bytes) {
        Ok(doc) => {
            if doc.stats.vertex_count == 0 || doc.stats.sector_count == 0 {
                return 0;
            }
            unsafe {
                DOC = Some(doc);
            }
            1
        }
        Err(_) => 0,
    }
}

#[wasm_bindgen]
pub fn get_vertex_count() -> u32 {
    if unsafe { DOC.is_none() } {
        return 0;
    }
    doc_mut().stats.vertex_count
}

#[wasm_bindgen]
pub fn get_sector_count() -> u32 {
    if unsafe { DOC.is_none() } {
        return 0;
    }
    doc_mut().stats.sector_count
}

#[wasm_bindgen]
pub fn get_linedef_count() -> u32 {
    if unsafe { DOC.is_none() } {
        return 0;
    }
    doc_mut().stats.linedef_count
}

#[wasm_bindgen]
pub fn get_seg_count() -> u32 {
    if unsafe { DOC.is_none() } {
        return 0;
    }
    doc_mut().stats.seg_count
}

#[wasm_bindgen]
pub fn get_section_count() -> u32 {
    if unsafe { DOC.is_none() } {
        return 0;
    }
    doc_mut().stats.section_count
}

#[wasm_bindgen]
pub fn is_loaded() -> u32 {
    if unsafe { DOC.is_some() } {
        1
    } else {
        0
    }
}

#[wasm_bindgen]
pub fn has_full_gzstate_parse() -> u32 {
    1
}

#[wasm_bindgen]
pub fn tick() -> u32 {
    is_loaded()
}
