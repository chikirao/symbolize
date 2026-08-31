/// <reference types="vite/client" />

declare global {
  interface Window {
    __bootFinish?: () => void
  }
}

export {}
