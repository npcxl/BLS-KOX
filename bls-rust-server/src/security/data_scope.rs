use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
pub enum DataScopeType {
    ALL,
    CUSTOM,
    TENANT,
    DEPT_AND_CHILDREN,
    DEPT,
    SELF,
}

impl Default for DataScopeType {
    fn default() -> Self {
        Self::TENANT
    }
}

#[derive(Debug, Clone)]
pub struct DataScopeColumnMapping {
    pub self_field: Option<String>,
    pub user_field: Option<String>,
    pub dept_field: Option<String>,
}

pub fn resolve_max_scope(scopes: &[DataScopeType]) -> DataScopeType {
    fn priority(s: DataScopeType) -> u8 {
        match s {
            DataScopeType::ALL => 0,
            DataScopeType::CUSTOM => 1,
            DataScopeType::TENANT => 2,
            DataScopeType::DEPT_AND_CHILDREN => 3,
            DataScopeType::DEPT => 4,
            DataScopeType::SELF => 5,
        }
    }
    scopes
        .iter()
        .copied()
        .min_by_key(|s| priority(*s))
        .unwrap_or(DataScopeType::SELF)
}
