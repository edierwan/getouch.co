import { redirect } from 'next/navigation';

// Canonical Object Storage console moved to /service-endpoints/object-storage
// (2026-04-29). This redirect preserves old bookmarks.
export default function LegacyObjectStorageRedirect() {
  redirect('/admin/service-endpoints/object-storage');
}
