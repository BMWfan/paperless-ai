/** Fork-owned Learning v2 adapter. The reviewed SQLite algorithms remain isolated CommonJS modules. */
import { createRequire } from 'node:module';
import type { Db } from '../db/database.js';
import type { PaperlessDocument } from '../paperless/types.js';
const require = createRequire(import.meta.url);
export interface LearningSettings {
  mode: 'manual' | 'automatic' | 'hybrid' | 'disabled';
  enabled: boolean;
  intervalMs: number;
  stabilizationMs: number;
}
export type Metadata = Record<string, unknown>;
export interface LearningEvent {
  id: number;
  document_id: number;
  status: string;
  source: string;
  metadata: Metadata;
  changes: Record<string, unknown>;
  content_preview: string;
}
export interface LearningStore {
  database: Db;
  settings(): LearningSettings;
  configure(value: Partial<LearningSettings>): LearningSettings;
  observe(document: Partial<PaperlessDocument> & { id: number }, source?: string, options?: { actor?: string; stabilizationMs?: number; expectedRevision?: number }): { eventId?: number; pendingReview?: boolean; skipped?: boolean };
  review(id: number, decision: 'confirmed' | 'rejected' | 'deleted', actor?: string): boolean;
  examples(includeStale?: boolean): Array<{ document_id: number; metadata: Metadata; content_preview: string }>;
  legacyExamples(): Array<{ document_id: number; metadata: Metadata; content_preview: string }>;
  hasLegacyExample(id: number): boolean;
  legacyPage(limit?: number, offset?: number): { examples: Array<{ document_id: number; metadata: Metadata; content_preview: string }>; total: number; hasMore: boolean };
  protectedMetadata(id: number): Metadata | null;
  fieldCorrections(): unknown[];
  prediction(id: number, metadata: unknown): void;
  snapshotRevision(id: number): number;
  snapshotRevisions(): Map<number, number>;
  needsContent(document: PaperlessDocument): boolean;
  event(id: number): { document_id: number; status: string } | null;
  list(status?: string, query?: string, limit?: number, offset?: number): LearningEvent[];
  page(status?: string, query?: string, limit?: number, offset?: number): { events: LearningEvent[]; total: number; hasMore: boolean };
  history(documentId?: number, limit?: number, offset?: number): unknown[];
  summary(): Record<string, number>;
  revokeLegacy(id: number, actor?: string): boolean;
  close(): void;
}
const legacy = require('./legacy/learningStore.cjs') as { openLearningStore(path: string, options?: { database: Db }): LearningStore };
export const openLearningStore = legacy.openLearningStore;
