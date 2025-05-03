
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
}


#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    // Set up better panic messages when debugging
    console_error_panic_hook::set_once();

    let w = format!("Hello, {}!", name);
    log(&w);
    w
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}