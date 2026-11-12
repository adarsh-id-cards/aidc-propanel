//! High-Precision Vector PDF Grid Layout Engine

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct PdfCardData {
    pub id: i64,
    pub fields: HashMap<String, String>,
    pub photo_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PdfGridManifest {
    pub title: String,
    pub organisation_name: String,
    pub table_name: String,
    pub columns: Vec<String>,
    pub cards: Vec<PdfCardData>,
    pub output_pdf_path: String,
    pub cards_per_page: usize,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PdfGenerationResult {
    pub success: bool,
    pub pages_rendered: usize,
    pub total_cards: usize,
    pub output_pdf_path: String,
    pub error: Option<String>,
}

/// Generates a valid standard vector PDF file layout with 6 cards per page.
pub fn generate_pdf_grid(manifest: PdfGridManifest) -> PdfGenerationResult {
    let output_path = Path::new(&manifest.output_pdf_path);
    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    let cards_per_page = if manifest.cards_per_page > 0 {
        manifest.cards_per_page
    } else {
        6
    };
    let total_cards = manifest.cards.len();
    let total_pages = if total_cards == 0 {
        1
    } else {
        (total_cards + cards_per_page - 1) / cards_per_page
    };

    let mut pdf_content = Vec::new();

    // Standard PDF 1.4 Header
    pdf_content.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    let mut object_offsets = Vec::new();

    // Object 1: Catalog
    object_offsets.push(pdf_content.len());
    pdf_content.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    // Object 2: Pages
    object_offsets.push(pdf_content.len());
    let mut kids_refs = String::new();
    for p in 0..total_pages {
        kids_refs.push_str(&format!("{} 0 R ", 3 + p * 2));
    }
    let pages_obj = format!(
        "2 0 obj\n<< /Type /Pages /Kids [ {}] /Count {} >>\nendobj\n",
        kids_refs, total_pages
    );
    pdf_content.extend_from_slice(pages_obj.as_bytes());

    // Render each page
    for p in 0..total_pages {
        let page_obj_id = 3 + p * 2;
        let content_obj_id = 4 + p * 2;

        // Page Object (Landscape A4: 841.89 x 595.28 pt)
        object_offsets.push(pdf_content.len());
        let page_obj = format!(
            "{} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Contents {} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n",
            page_obj_id, content_obj_id
        );
        pdf_content.extend_from_slice(page_obj.as_bytes());

        // Content Stream Object
        let start_idx = p * cards_per_page;
        let end_idx = std::cmp::min(start_idx + cards_per_page, total_cards);
        let page_cards = if start_idx < total_cards {
            &manifest.cards[start_idx..end_idx]
        } else {
            &[]
        };

        let mut stream_data = String::new();
        // Header
        stream_data.push_str("BT\n/F1 16 Tf\n40 560 Td\n");
        stream_data.push_str(&format!("({}) Tj\n", escape_pdf_str(&manifest.organisation_name)));
        stream_data.push_str("/F2 11 Tf\n0 -20 Td\n");
        stream_data.push_str(&format!(
            "({} — Page {} of {}) Tj\nET\n",
            escape_pdf_str(&manifest.table_name),
            p + 1,
            total_pages
        ));

        // Draw Table Outer Border & Grid Lines
        stream_data.push_str("0.5 w\n0 0 0 RG\n");
        stream_data.push_str("40 60 761.89 460 re\nS\n");

        // Card items
        let mut y_pos = 480.0;
        for (row_num, card) in page_cards.iter().enumerate() {
            let row_y = y_pos - (row_num as f64 * 70.0);
            stream_data.push_str(&format!("40 {} 761.89 70 re\nS\n", row_y - 65.0));

            stream_data.push_str(&format!(
                "BT\n/F1 10 Tf\n50 {} Td\n(#{}) Tj\nET\n",
                row_y - 20.0,
                card.id
            ));

            let mut x_offset = 120.0;
            for col in &manifest.columns {
                if let Some(val) = card.fields.get(col) {
                    if !val.is_empty() {
                        stream_data.push_str(&format!(
                            "BT\n/F2 9 Tf\n{} {} Td\n({}: {}) Tj\nET\n",
                            x_offset,
                            row_y - 20.0,
                            escape_pdf_str(col),
                            escape_pdf_str(val)
                        ));
                        x_offset += 140.0;
                        if x_offset > 700.0 {
                            break;
                        }
                    }
                }
            }
        }

        let stream_bytes = stream_data.as_bytes();
        object_offsets.push(pdf_content.len());
        let stream_obj = format!(
            "{} 0 obj\n<< /Length {} >>\nstream\n{}\nendstream\nendobj\n",
            content_obj_id,
            stream_bytes.len(),
            stream_data
        );
        pdf_content.extend_from_slice(stream_obj.as_bytes());
    }

    // Cross-Reference Table (xref)
    let xref_offset = pdf_content.len();
    let total_objs = object_offsets.len() + 1;
    pdf_content.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", total_objs).as_bytes());

    for offset in &object_offsets {
        pdf_content.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }

    // Trailer
    let trailer = format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
        total_objs, xref_offset
    );
    pdf_content.extend_from_slice(trailer.as_bytes());

    let mut file = match File::create(output_path) {
        Ok(f) => f,
        Err(e) => {
            return PdfGenerationResult {
                success: false,
                pages_rendered: 0,
                total_cards,
                output_pdf_path: manifest.output_pdf_path,
                error: Some(format!("Failed to write output PDF file: {}", e)),
            }
        }
    };

    if let Err(e) = file.write_all(&pdf_content) {
        return PdfGenerationResult {
            success: false,
            pages_rendered: 0,
            total_cards,
            output_pdf_path: manifest.output_pdf_path,
            error: Some(format!("Failed to flush PDF bytes: {}", e)),
        };
    }

    PdfGenerationResult {
        success: true,
        pages_rendered: total_pages,
        total_cards,
        output_pdf_path: manifest.output_pdf_path,
        error: None,
    }
}

fn escape_pdf_str(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}
