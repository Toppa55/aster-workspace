declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_ENCRYPTION_KEY?: string;
    APP_ACCESS_PASSWORD?: string;
    SESSION_SECRET?: string;
  }
}
