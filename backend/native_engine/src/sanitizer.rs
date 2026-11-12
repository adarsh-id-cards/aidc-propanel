//! Text Sanitization and Natural Sorting Engine

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Strips characters outside Latin-1 Helvetica printable range (0x20-0xFF)
/// and removes control characters.
pub fn sanitize_text_for_storage(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }

    let mut result = String::with_capacity(input.len());
    let mut last_was_space = false;

    for c in input.chars() {
        // Drop C0/C1 control codes except space
        if (c < '\u{0020}' && c != '\t' && c != '\n') || (c >= '\u{007F}' && c <= '\u{009F}') {
            continue;
        }

        // Map tab/newline to single space
        if c == '\t' || c == '\n' || c == '\r' || c == '\u{000B}' || c == '\u{000C}' {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
            continue;
        }

        // Keep Latin-1 printable characters
        if (c >= '\u{0020}' && c <= '\u{007E}') || (c >= '\u{00A0}' && c <= '\u{00FF}') {
            if c == ' ' {
                if !last_was_space {
                    result.push(' ');
                    last_was_space = true;
                }
            } else {
                result.push(c);
                last_was_space = false;
            }
        }
    }

    result.trim().to_string()
}

/// Natural alphanumerical token comparison for sorting classes/sections
pub fn natural_sort_key(s: &str) -> Vec<(bool, String, i64)> {
    let mut chunks = Vec::new();
    let mut current_text = String::new();
    let mut current_digits = String::new();

    for c in s.chars() {
        if c.is_ascii_digit() {
            if !current_text.is_empty() {
                chunks.push((false, current_text.to_lowercase(), 0));
                current_text.clear();
            }
            current_digits.push(c);
        } else {
            if !current_digits.is_empty() {
                let num = current_digits.parse::<i64>().unwrap_or(0);
                chunks.push((true, String::new(), num));
                current_digits.clear();
            }
            current_text.push(c);
        }
    }

    if !current_text.is_empty() {
        chunks.push((false, current_text.to_lowercase(), 0));
    }
    if !current_digits.is_empty() {
        let num = current_digits.parse::<i64>().unwrap_or(0);
        chunks.push((true, String::new(), num));
    }

    chunks
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DuplicateScannerResult {
    pub duplicate_card_ids: Vec<i64>,
    pub duplicate_count: usize,
}

/// Real-time in-memory duplicate detector across card fields
pub fn detect_duplicates(
    records: &[serde_json::Value],
    key_fields: &[String],
) -> DuplicateScannerResult {
    let mut seen_signatures = HashSet::new();
    let mut duplicate_indices = Vec::new();

    for (idx, card) in records.iter().enumerate() {
        let mut sig_parts = Vec::new();
        if let Some(obj) = card.as_object() {
            for k in key_fields {
                let val_str = obj
                    .get(k)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_lowercase();
                if !val_str.is_empty() {
                    sig_parts.push(val_str);
                }
            }
        }

        if !sig_parts.is_empty() {
            let signature = sig_parts.join("::");
            if !seen_signatures.insert(signature) {
                duplicate_indices.push(idx as i64);
            }
        }
    }

    DuplicateScannerResult {
        duplicate_count: duplicate_indices.len(),
        duplicate_card_ids: duplicate_indices,
    }
}
