import { redirect } from 'next/navigation';

// Canonical Object Storage console moved into the unified Databases page
// (Storage tab) on 2026-05-02. This redirect preserves old bookmarks.
export default function LegacyObjectStorageRedirect() {
  redirect('/admin/infra/databases?tab=storage');
}
