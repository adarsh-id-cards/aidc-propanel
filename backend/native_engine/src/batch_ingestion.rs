//! Ultra-Fast Excel and Word (.docx) Ingestion Parser

use calamine::{open_workbook_auto, DataType, Reader};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

use crate::sanitizer::sanitize_text_for_storage;

#[derive(Serialize, Deserialize, Debug)]
pub struct IngestedCardRow {
    pub row_number: usize,
    pub fields: HashMap<String, String>,
    pub photo_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct IngestionResult {
    pub success: bool,
    pub headers: Vec<String>,
    pub rows: Vec<IngestedCardRow>,
    pub total_rows: usize,
    pub error: Option<String>,
}

/// Parses an Excel spreadsheet (.xlsx, .xls, .xlsb) in zero-copy mode.
pub fn parse_excel_fast(file_path: &str) -> IngestionResult {
    let path = Path::new(file_path);
    if !path.exists() {
        return IngestionResult {
            success: false,
            headers: Vec::new(),
            rows: Vec::new(),
            total_rows: 0,
            error: Some(format!("File does not exist: {}", file_path)),
        };
    }

    let mut workbook = match open_workbook_auto(path) {
        Ok(wb) => wb,
        Err(e) => {
            return IngestionResult {
                success: false,
                headers: Vec::new(),
                rows: Vec::new(),
                total_rows: 0,
                error: Some(format!("Failed to open workbook: {}", e)),
            }
        }
    };

    let sheet_names = workbook.sheet_names();
    if sheet_names.is_empty() {
        return IngestionResult {
            success: false,
            headers: Vec::new(),
            rows: Vec::new(),
            total_rows: 0,
            error: Some("Workbook contains no sheets".to_string()),
        };
    }

    let first_sheet_name = sheet_names[0].clone();
    let range = match workbook.worksheet_range(&first_sheet_name) {
        Ok(r) => r,
        Err(e) => {
            return IngestionResult {
                success: false,
                headers: Vec::new(),
                rows: Vec::new(),
                total_rows: 0,
                error: Some(format!("Failed to read worksheet range: {}", e)),
            }
        }
    };

    let mut rows_iter = range.rows();
    let header_row = match rows_iter.next() {
        Some(h) => h,
        None => {
            return IngestionResult {
                success: true,
                headers: Vec::new(),
                rows: Vec::new(),
                total_rows: 0,
                error: None,
            }
        }
    };

    let headers: Vec<String> = header_row
        .iter()
        .map(|cell| sanitize_text_for_storage(&cell.to_string()))
        .collect();

    let mut parsed_rows = Vec::new();
    let mut row_idx = 1;

    for row in rows_iter {
        row_idx += 1;
        let mut fields = HashMap::new();
        let mut photo_name = None;
        let mut has_data = false;

        for (col_idx, cell) in row.iter().enumerate() {
            if col_idx < headers.len() {
                let header = &headers[col_idx];
                if header.is_empty() {
                    continue;
                }

                let val_str = match cell {
                    DataType::Empty => String::new(),
                    DataType::String(s) => sanitize_text_for_storage(s),
                    DataType::Float(f) => {
                        if f.fract() == 0.0 {
                            format!("{:.0}", f)
                        } else {
                            format!("{}", f)
                        }
                    }
                    DataType::Int(i) => format!("{}", i),
                    DataType::Bool(b) => format!("{}", b),
                    DataType::DateTime(d) => format!("{}", d),
                    DataType::Error(_) => String::new(),
                    _ => sanitize_text_for_storage(&cell.to_string()),
                };

                if !val_str.is_empty() {
                    has_data = true;
                    let lower_h = header.to_lowercase();
                    if lower_h == "photo"
                        || lower_h == "image"
                        || lower_h == "picture"
                        || lower_h == "student_photo"
                    {
                        photo_name = Some(val_str.clone());
                    }
                    fields.insert(header.clone(), val_str);
                }
            }
        }

        if has_data {
            parsed_rows.push(IngestedCardRow {
                row_number: row_idx,
                fields,
                photo_name,
            });
        }
    }

    let total = parsed_rows.len();
    IngestionResult {
        success: true,
        headers,
        rows: parsed_rows,
        total_rows: total,
        error: None,
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DocxImageExtractionResult {
    pub success: bool,
    pub extracted_images: Vec<String>,
    pub count: usize,
    pub error: Option<String>,
}

/// Extracts embedded drawings and images from a Word .docx archive
pub fn extract_docx_embedded_photos(docx_path: &str, output_media_dir: &str) -> DocxImageExtractionResult {
    let file = match File::open(docx_path) {
        Ok(f) => f,
        Err(e) => {
            return DocxImageExtractionResult {
                success: false,
                extracted_images: Vec::new(),
                count: 0,
                error: Some(format!("Failed to open .docx file: {}", e)),
            }
        }
    };

    let mut archive = match zip::ZipArchive::new(BufReader::new(file)) {
        Ok(a) => a,
        Err(e) => {
            return DocxImageExtractionResult {
                success: false,
                extracted_images: Vec::new(),
                count: 0,
                error: Some(format!("Invalid zip / docx format: {}", e)),
            }
        }
    };

    let out_dir = Path::new(output_media_dir);
    if !out_dir.exists() {
        let _ = std::fs::create_dir_all(out_dir);
    }

    let mut extracted = Vec::new();

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let name = file.name().to_string();
        if name.starts_with("word/media/") {
            let filename = match Path::new(&name).file_name() {
                Some(f) => f.to_string_lossy().to_string(),
                None => continue,
            };

            let target_path = out_dir.join(&filename);
            let mut out_file = match File::create(&target_path) {
                Ok(f) => f,
                Err(_) => continue,
            };

            if std::io::copy(&mut file, &mut out_file).is_ok() {
                extracted.push(filename);
            }
        }
    }

    let count = extracted.len();
    DocxImageExtractionResult {
        success: true,
        extracted_images: extracted,
        count,
        error: None,
    }
}
