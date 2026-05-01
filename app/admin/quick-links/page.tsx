import { QUICK_LINK_GROUPS } from '../data';
import { Breadcrumb, PageIntro, QuickLinkGroups } from '../ui';

export default function QuickLinksPage() {
  return (
    <div className="portal-body">
      <Breadcrumb category="Access & Security" page="Quick Links" />
      <PageIntro title="Quick Links" subtitle="Direct access to the main getouch.co services and operator tools." />
      <QuickLinkGroups groups={QUICK_LINK_GROUPS} />
    </div>
  );
}