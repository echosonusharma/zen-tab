
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

    let w = format!("ZenTab: {}!", name);
    log(&w);
    w
}
