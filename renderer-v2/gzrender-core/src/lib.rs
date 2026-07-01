//! GZSTATE v1 binary loader — section layout synced with doom-wad-core / gzstate_dump.cpp

pub const GZSTATE_MAGIC: u32 = 0x5453_5A47; // 'GZST'
pub const GZSTATE_VERSION: u32 = 1;
pub const HEADER_SIZE: usize = 64;

pub const SECTION_VERTICES: u32 = 2;
pub const SECTION_SECTORS: u32 = 3;
pub const SECTION_LINEDEFS: u32 = 5;
pub const SECTION_SEGS: u32 = 6;
pub const SECTION_MAP_REJECT: u32 = 22;
pub const SECTION_MAP_BLOCKMAP: u32 = 23;

#[derive(Debug, Clone)]
pub struct GzHeader {
    pub map_name: String,
    pub section_count: u32,
}

#[derive(Debug, Clone)]
pub struct SectionEntry {
    pub id: u32,
    pub offset: u32,
    pub size: u32,
    pub crc32: u32,
}

#[derive(Debug, Clone, Default)]
pub struct GzDrawStats {
    pub vertex_count: u32,
    pub sector_count: u32,
    pub linedef_count: u32,
    pub seg_count: u32,
    pub section_count: u32,
    pub has_map_reject: bool,
    pub has_map_blockmap: bool,
}

#[derive(Debug)]
pub struct GzDocument {
    pub header: GzHeader,
    pub sections: Vec<SectionEntry>,
    pub stats: GzDrawStats,
    pub bytes: Vec<u8>,
}

pub fn read_gzstate(data: &[u8]) -> Result<GzDocument, &'static str> {
    if data.len() < HEADER_SIZE {
        return Err("buffer too small");
    }
    let magic = u32::from_le_bytes(data[0..4].try_into().unwrap());
    if magic != GZSTATE_MAGIC {
        return Err("bad magic");
    }
    let version = u32::from_le_bytes(data[4..8].try_into().unwrap());
    if version != GZSTATE_VERSION {
        return Err("unsupported version");
    }
    let section_count = u32::from_le_bytes(data[16..20].try_into().unwrap());
    let map_name = read_fixed_ascii(&data[24..56]);
    let mut sections = Vec::with_capacity(section_count as usize);
    let mut off = HEADER_SIZE;
    for _ in 0..section_count {
        if off + 16 > data.len() {
            return Err("truncated section directory");
        }
        sections.push(SectionEntry {
            id: u32::from_le_bytes(data[off..off + 4].try_into().unwrap()),
            offset: u32::from_le_bytes(data[off + 4..off + 8].try_into().unwrap()),
            size: u32::from_le_bytes(data[off + 8..off + 12].try_into().unwrap()),
            crc32: u32::from_le_bytes(data[off + 12..off + 16].try_into().unwrap()),
        });
        off += 16;
    }

    let mut stats = GzDrawStats {
        section_count,
        ..Default::default()
    };
    for entry in &sections {
        let count = section_element_count(data, entry);
        match entry.id {
            SECTION_VERTICES => stats.vertex_count = count,
            SECTION_SECTORS => stats.sector_count = count,
            SECTION_LINEDEFS => stats.linedef_count = count,
            SECTION_SEGS => stats.seg_count = count,
            SECTION_MAP_REJECT => stats.has_map_reject = entry.size > 4,
            SECTION_MAP_BLOCKMAP => stats.has_map_blockmap = entry.size > 4,
            _ => {}
        }
    }

    Ok(GzDocument {
        header: GzHeader {
            map_name,
            section_count,
        },
        sections,
        stats,
        bytes: data.to_vec(),
    })
}

fn section_element_count(data: &[u8], entry: &SectionEntry) -> u32 {
    if entry.size < 4 {
        return 0;
    }
    let off = entry.offset as usize;
    if off + 4 > data.len() {
        return 0;
    }
    u32::from_le_bytes(data[off..off + 4].try_into().unwrap())
}

fn read_fixed_ascii(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn reads_e1m1_fixture_if_present() {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../../artifacts/gzrender-v2/corpus/DOOM/E1M1/gzdoom.gzstate");
        if !p.exists() {
            return;
        }
        let data = fs::read(p).unwrap();
        let doc = read_gzstate(&data).unwrap();
        assert_eq!(doc.header.map_name, "E1M1");
        assert!(doc.sections.len() >= 20);
        assert!(doc.stats.vertex_count > 0);
        assert!(doc.stats.sector_count > 0);
    }
}
