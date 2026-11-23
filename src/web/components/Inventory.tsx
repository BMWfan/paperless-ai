import { useState } from 'react';
import type { InventoryCategory, InventoryCounts, InventoryPage } from '@shared/api';
import { get } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Button, Card, Modal } from './ui';

const categories = {
  tags: 'Without tags',
  correspondent: 'Without a correspondent',
  documentType: 'Without a document type',
} satisfies Record<InventoryCategory, string>;

function InventoryDocuments({ category, onClose }: { category: InventoryCategory; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => get<InventoryPage>(`/api/inventory/documents?category=${category}&page=${page}`, signal), [category, page]);
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / 25));
  return (
    <Modal open onClose={onClose} title={categories[category]}>
      {list.loading ? <p role="status">Loading documents…</p> : list.error ? (
        <p role="alert">Documents unavailable. {list.error}</p>
      ) : (
        <>
          {list.data?.documents.length ? (
            <ul className="divide-y divide-border">
              {list.data.documents.map((document) => (
                <li key={document.id} className="py-2">
                  <a href={document.url} target="_blank" rel="noreferrer" className="hover:underline">{document.title || `#${document.id}`}</a>
                </li>
              ))}
            </ul>
          ) : <p>No matching documents on this page.</p>}
          {(page > 1 || pages > 1) && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page}</span>
              <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function Inventory() {
  const counts = useAsync((signal) => get<InventoryCounts>('/api/inventory', signal));
  const [category, setCategory] = useState<InventoryCategory | null>(null);
  const displayCount = (count: number | null | undefined) => count == null ? 'Unavailable' : formatNumber(count);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Document inventory</h2>
        <Button size="sm" loading={counts.loading} onClick={counts.reload}>Refresh</Button>
      </div>
      {counts.loading ? <p role="status">Loading counts…</p> : counts.error ? (
        <p role="alert">Inventory unavailable. {counts.error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="p-2">
            <div className="text-sm text-muted">Total documents</div>
            <strong>{displayCount(counts.data?.total)}</strong>
          </div>
          {(Object.keys(categories) as InventoryCategory[]).map((key) => (
            <button key={key} type="button" disabled={counts.data?.[key] == null} onClick={() => setCategory(key)}
              className="rounded-md border border-border p-2 text-left enabled:hover:underline">
              <span className="block text-sm text-muted">{categories[key]}</span>
              <strong>{displayCount(counts.data?.[key])}</strong>
            </button>
          ))}
        </div>
      )}
      {category && <InventoryDocuments key={category} category={category} onClose={() => setCategory(null)} />}
    </Card>
  );
}
