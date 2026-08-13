use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct PageParams {
    #[serde(default = "default_page_num")]
    pub page_num: u64,
    #[serde(default = "default_page_size")]
    pub page_size: u64,
    pub keyword: Option<String>,
}

fn default_page_num() -> u64 {
    1
}
fn default_page_size() -> u64 {
    10
}

impl PageParams {
    pub fn offset(&self) -> u64 {
        (self.page_num.max(1) - 1) * self.limit()
    }

    pub fn limit(&self) -> u64 {
        self.page_size.clamp(1, 100)
    }
}
