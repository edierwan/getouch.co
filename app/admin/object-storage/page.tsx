import { redirect } from 'next/navigation';

// Canonical Object Storage console moved to /infrastructure/object-storage
// (2026-04-29). This redirect preserves old bookmarks.
export default function LegacyObjectStorageRedirect() {
  redirect('/admin/infrastructure/object-storage');
}
