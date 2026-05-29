use thiserror::Error;

#[derive(Debug, Error)]
pub enum ShellError {
    #[error("failed to spawn sidecar: {0}")]
    SpawnSidecar(String),

    #[error("sidecar did not announce its port within {0:?}")]
    SidecarStartupTimeout(std::time::Duration),

    #[error("sidecar emitted invalid DM_PORT line: {0:?}")]
    InvalidDmPortLine(String),
}

impl serde::Serialize for ShellError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
