use url::Url;
use wasm_bindgen::prelude::*;
mod lev;

static STOP_WORDS: &'static [&'static str] = &[
    "a",
    "about",
    "above",
    "after",
    "again",
    "against",
    "all",
    "am",
    "an",
    "and",
    "any",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "being",
    "below",
    "between",
    "both",
    "but",
    "by",
    "could",
    "did",
    "do",
    "does",
    "doing",
    "down",
    "during",
    "each",
    "few",
    "for",
    "from",
    "further",
    "had",
    "has",
    "have",
    "having",
    "he",
    "her",
    "here",
    "hers",
    "herself",
    "him",
    "himself",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "itself",
    "me",
    "more",
    "most",
    "my",
    "myself",
    "no",
    "nor",
    "not",
    "of",
    "off",
    "on",
    "once",
    "only",
    "or",
    "other",
    "our",
    "ours",
    "ourselves",
    "out",
    "over",
    "own",
    "same",
    "she",
    "should",
    "so",
    "some",
    "such",
    "than",
    "that",
    "the",
    "their",
    "theirs",
    "them",
    "themselves",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "to",
    "too",
    "under",
    "until",
    "up",
    "very",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "who",
    "whom",
    "why",
    "will",
    "with",
    "you",
    "your",
    "yours",
    "yourself",
    "yourselves",
];

static IGNORE_WORDS: &'static [&'static str] = &["www"];

#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub unsafe fn log(s: &str);
}

#[wasm_bindgen]
pub fn init_wasm(name: &str) {
    // log rust panics in browser console
    console_error_panic_hook::set_once();

    let w = format!("ZenTab: {}!", name);
    unsafe {
        log(&w);
    };
}

fn clean_text(str: &String) -> Vec<String> {
    str.split_whitespace()
        .filter(|x: &&str| x.chars().count() > 1 && !STOP_WORDS.contains(x))
        .map(|s| s.to_string())
        .collect()
}

#[wasm_bindgen]
pub fn generate_keyword_for_tab(title: Option<String>, url: Option<String>) -> Vec<String> {
    let mut data: Vec<String> = Vec::new();

    if title.is_none() || url.is_none() {
        return data;
    }

    let title: &String = title.as_ref().unwrap();
    let url: &str = url.as_ref().map(|s| s.as_str()).unwrap();

    let by_title = clean_text(title);

    let parsed_url: Url = Url::parse(url).unwrap();
    let c_url: Url = parsed_url.clone();
    let url_host_name: String = c_url
        .host_str()
        .unwrap_or("")
        .split(".")
        .next()
        .unwrap_or("")
        .to_string();
    let url_path: Vec<String> = c_url
        .path()
        .split("/")
        .filter(|x| x.chars().count() > 1 && !STOP_WORDS.contains(x) && !IGNORE_WORDS.contains(x))
        .map(|s| s.to_string())
        .collect();

    data.extend(by_title);
    data.push(url_host_name);
    data.extend(url_path);

    for s in data.iter_mut() {
        *s = s.to_lowercase();
    }

    // uniq
    data.sort();
    data.dedup();

    data
}
