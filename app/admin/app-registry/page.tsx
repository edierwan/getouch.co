import { APP_REGISTRY_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function AppRegistryPage() {
  return (
    <div className="portal-body">
      <PageIntro title="App Registry" subtitle="Primary applications and operator-managed surfaces running on getouch.co." />
      <ServicePanel title="APPLICATIONS" rows={APP_REGISTRY_ROWS} />
    </div>
  );
}
