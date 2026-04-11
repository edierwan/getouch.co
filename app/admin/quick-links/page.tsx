import { QUICK_LINK_GROUPS } from '../data';
import { PageIntro, QuickLinkGroups } from '../ui';

export default function QuickLinksPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Quick Links" subtitle="Direct access to the main getouch.co services and operator tools." />
      <QuickLinkGroups groups={QUICK_LINK_GROUPS} />
    </div>
  );
}