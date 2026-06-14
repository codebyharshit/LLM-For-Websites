import { logger } from "@supportrag/shared";
import type { IngestHandlers } from "@supportrag/core";

/**
 * Ingest job handlers. Stubs at T1.1 (log + resolve); the crawler (T1.3), parsers
 * (T1.4), and embed/upsert orchestration (T1.7) replace these bodies in later tasks.
 */
export function makeHandlers(): IngestHandlers {
  return {
    async crawl_url(data) {
      logger.info({ sourceId: data.sourceId, url: data.url }, "crawl_url received (stub)");
    },
    async crawl_sitemap(data) {
      logger.info({ sourceId: data.sourceId, url: data.url }, "crawl_sitemap received (stub)");
    },
    async parse_file(data) {
      logger.info({ sourceId: data.sourceId, filename: data.filename }, "parse_file received (stub)");
    },
    async parse_text(data) {
      logger.info({ sourceId: data.sourceId }, "parse_text received (stub)");
    },
  };
}
