import { ObjectStorageConsole } from './ObjectStorageConsole';

export const dynamic = 'force-dynamic';

export default function ObjectStorageServiceEndpointPage() {
  return (
    <div className="portal-body">
      <ObjectStorageConsole />
    </div>
  );
}
