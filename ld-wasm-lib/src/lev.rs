use wasm_bindgen::prelude::*;

// https://en.wikipedia.org/wiki/Wagner%E2%80%93Fischer_algorithm
#[wasm_bindgen]
pub fn ld(a: &str, b: &str) -> u32 {
    let a_str: &str = a.trim();
    let b_str: &str = b.trim();

    let a_len: usize = a_str.chars().count();
    let b_len: usize = b_str.chars().count();

    if a_len == 0 {
        return b_len as u32;
    }
    if b_len == 0 {
        return a_len as u32;
    }

    let a_chars: Vec<char> = a_str.chars().collect();
    let b_chars: Vec<char> = b_str.chars().collect();

    let mut matrix: Vec<Vec<u32>> = vec![vec![0u32; a_len + 1]; b_len + 1];

    for i in 0..=b_len {
        matrix[i][0] = i as u32;
    }
    for j in 0..=a_len {
        matrix[0][j] = j as u32;
    }

    for i in 1..=b_len {
        for j in 1..=a_len {
            let cost: u32 = if b_chars[i - 1] == a_chars[j - 1] {
                0
            } else {
                1
            };

            matrix[i][j] = *[
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            ]
            .iter()
            .min()
            .unwrap();
        }
    }

    matrix[b_len][a_len]
}
