import { redirect } from 'next/navigation';

// Canonical Object Storage console moved to /infra/object-storage
// (2026-04-29). This redirect preserves old bookmarks.
export default function LegacyObjectStorageRedirect() {
  redirect('/admin/infra/object-storage');
}
