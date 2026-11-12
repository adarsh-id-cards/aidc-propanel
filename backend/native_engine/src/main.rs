use cardflow_engine::batch_ingestion::{extract_docx_embedded_photos, parse_excel_fast};
use cardflow_engine::pdf_grid::{generate_pdf_grid, PdfGridManifest};
use cardflow_engine::sanitizer::{detect_duplicates, sanitize_text_for_storage};
use cardflow_engine::zip_packer::{pack_zip_parallel, ZipBatchManifest};
use std::env;
use std::fs;
use std::io::{self, Read};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: cardflow_engine <subcommand> [args...]");
        eprintln!("Subcommands: zip, ingest-excel, ingest-docx, pdf-grid, sanitize, duplicates, version");
        std::process::exit(1);
    }

    let command = &args[1];
    match command.as_str() {
        "version" => {
            println!("CardFlow Native Acceleration Engine v1.0.0 (Rust 2021)");
        }
        "zip" => {
            // Read manifest JSON from file or stdin
            let manifest_str = if args.len() >= 3 {
                fs::read_to_string(&args[2]).unwrap_or_default()
            } else {
                let mut buffer = String::new();
                let _ = io::stdin().read_to_string(&mut buffer);
                buffer
            };

            match serde_json::from_str::<ZipBatchManifest>(&manifest_str) {
                Ok(manifest) => {
                    let result = pack_zip_parallel(manifest);
                    println!("{}", serde_json::to_string(&result).unwrap());
                }
                Err(e) => {
                    eprintln!("{{\"success\": false, \"error\": \"Invalid JSON manifest: {}\"}}", e);
                    std::process::exit(1);
                }
            }
        }
        "ingest-excel" => {
            if args.len() < 3 {
                eprintln!("{{\"success\": false, \"error\": \"Missing file path argument\"}}");
                std::process::exit(1);
            }
            let file_path = &args[2];
            let result = parse_excel_fast(file_path);
            println!("{}", serde_json::to_string(&result).unwrap());
        }
        "ingest-docx" => {
            if args.len() < 4 {
                eprintln!("{{\"success\": false, \"error\": \"Usage: ingest-docx <docx_path> <output_dir>\"}}");
                std::process::exit(1);
            }
            let docx_path = &args[2];
            let output_dir = &args[3];
            let result = extract_docx_embedded_photos(docx_path, output_dir);
            println!("{}", serde_json::to_string(&result).unwrap());
        }
        "pdf-grid" => {
            let manifest_str = if args.len() >= 3 {
                fs::read_to_string(&args[2]).unwrap_or_default()
            } else {
                let mut buffer = String::new();
                let _ = io::stdin().read_to_string(&mut buffer);
                buffer
            };

            match serde_json::from_str::<PdfGridManifest>(&manifest_str) {
                Ok(manifest) => {
                    let result = generate_pdf_grid(manifest);
                    println!("{}", serde_json::to_string(&result).unwrap());
                }
                Err(e) => {
                    eprintln!("{{\"success\": false, \"error\": \"Invalid JSON manifest: {}\"}}", e);
                    std::process::exit(1);
                }
            }
        }
        "sanitize" => {
            if args.len() >= 3 {
                println!("{}", sanitize_text_for_storage(&args[2]));
            } else {
                let mut buffer = String::new();
                let _ = io::stdin().read_to_string(&mut buffer);
                println!("{}", sanitize_text_for_storage(&buffer));
            }
        }
        "duplicates" => {
            let mut buffer = String::new();
            let _ = io::stdin().read_to_string(&mut buffer);
            if let Ok(records) = serde_json::from_str::<Vec<serde_json::Value>>(&buffer) {
                let key_fields = if args.len() >= 3 {
                    args[2..].to_vec()
                } else {
                    vec!["name".to_string(), "roll_no".to_string()]
                };
                let result = detect_duplicates(&records, &key_fields);
                println!("{}", serde_json::to_string(&result).unwrap());
            }
        }
        _ => {
            eprintln!("Unknown command: {}", command);
            std::process::exit(1);
        }
    }
}
