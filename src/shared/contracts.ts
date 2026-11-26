/** Read-only contract metadata; no model or server imports in browser code. */
export const CONTRACT_ROLES = ['number', 'party', 'start', 'end', 'cancelBy'] as const;
export type ContractRole = (typeof CONTRACT_ROLES)[number];
export const CONTRACT_LABELS: Record<ContractRole, string> = {
  number: 'Contract number', party: 'Party', start: 'Start date', end: 'End date', cancelBy: 'Cancel by',
};
export const contractRoleTypes = (role: ContractRole): string[] => role === 'number' || role === 'party' ? ['string', 'longtext'] : ['date'];
export interface ContractBinding { id: number; name: string; type: 'string' | 'longtext' | 'date' }
export interface ContractConfig {
  sourceUrl: string;
  documentTypes: { id: number; name: string }[];
  fields: Record<ContractRole, ContractBinding | null>;
}
export interface ContractCell {
  state: 'value' | 'not-mapped' | 'missing' | 'definition-changed' | 'invalid' | 'ambiguous';
  value: string | null;
  truncated?: boolean;
}
export interface ContractSettingsView {
  config: ContractConfig;
  snapshotDigest: string;
  documentTypes: { id: number; name: string }[];
  fields: { id: number; name: string; data_type: string }[];
}
export interface ContractPage {
  configured: boolean;
  count: number | null;
  page: number;
  warnings: string[];
  calendarEnabled: boolean;
  documents: { id: number; title: string; url: string; fields: Record<ContractRole, ContractCell> }[];
}
