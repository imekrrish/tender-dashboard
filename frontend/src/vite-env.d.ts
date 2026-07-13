/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://your-backend.up.railway.app (no trailing /api). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
