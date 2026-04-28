import { redirect } from 'next/navigation';

/**
 * The old Communication → Messaging menu was removed. WhatsApp/Baileys is now
 * managed under SERVICE ENDPOINTS → Baileys Gateway. Redirect any deep links
 * (and bookmarks) to the new console.
 */
export const dynamic = 'force-dynamic';

export default function MessagingPage() {
  redirect('/admin/service-endpoints/baileys');
}

