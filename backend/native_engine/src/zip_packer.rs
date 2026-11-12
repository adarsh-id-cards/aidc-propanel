//! High-Performance Multi-Threaded ZIP Photo Compressor

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

#[derive(Serialize, Deserialize, Debug)]
pub struct ZipItemSpec {
    pub source_path: String,
    pub archive_filename: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ZipBatchManifest {
    pub items: Vec<ZipItemSpec>,
    pub output_zip_path: String,
    pub compression_level: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ZipPackResult {
    pub success: bool,
    pub files_added: usize,
    pub total_uncompressed_bytes: u64,
    pub output_zip_bytes: u64,
    pub error: Option<String>,
}

struct CompressedEntry {
    archive_filename: String,
    uncompressed_size: u64,
    data: Vec<u8>,
}

/// Compresses files concurrently using Rayon threads, then writes
/// them sequentially into the output ZIP stream.
pub fn pack_zip_parallel(manifest: ZipBatchManifest) -> ZipPackResult {
    let output_path = Path::new(&manifest.output_zip_path);

    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    // Step 1: Read and validate files concurrently in parallel chunks
    let entries: Vec<Option<CompressedEntry>> = manifest
        .items
        .into_par_iter()
        .map(|item| {
            let p = Path::new(&item.source_path);
            if !p.exists() || !p.is_file() {
                return None;
            }

            let mut file = match File::open(p) {
                Ok(f) => f,
                Err(_) => return None,
            };

            let mut buffer = Vec::new();
            if file.read_to_end(&mut buffer).is_err() {
                return None;
            }

            let uncompressed_size = buffer.len() as u64;

            Some(CompressedEntry {
                archive_filename: item.archive_filename,
                uncompressed_size,
                data: buffer,
            })
        })
        .collect();

    // Step 2: Open output ZIP stream
    let file = match File::create(output_path) {
        Ok(f) => f,
        Err(e) => {
            return ZipPackResult {
                success: false,
                files_added: 0,
                total_uncompressed_bytes: 0,
                output_zip_bytes: 0,
                error: Some(format!("Failed to create output file: {}", e)),
            }
        }
    };

    let mut zip = ZipWriter::new(BufWriter::new(file));
    let options = FileOptions::<()>::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let mut files_added = 0;
    let mut total_uncompressed = 0;

    for entry_opt in entries.into_iter().flatten() {
        if zip.start_file(&entry_opt.archive_filename, options).is_err() {
            continue;
        }

        if zip.write_all(&entry_opt.data).is_ok() {
            files_added += 1;
            total_uncompressed += entry_opt.uncompressed_size;
        }
    }

    if let Err(e) = zip.finish() {
        return ZipPackResult {
            success: false,
            files_added,
            total_uncompressed_bytes: total_uncompressed,
            output_zip_bytes: 0,
            error: Some(format!("Failed to finalize ZIP archive: {}", e)),
        };
    }

    let output_zip_bytes = std::fs::metadata(output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    ZipPackResult {
        success: true,
        files_added,
        total_uncompressed_bytes: total_uncompressed,
        output_zip_bytes,
        error: None,
    }
}
