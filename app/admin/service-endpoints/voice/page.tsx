import { VoiceServiceEndpointConsole } from './VoiceServiceEndpointConsole';

export const dynamic = 'force-dynamic';

export default function VoiceServiceEndpointPage() {
  return (
    <div className="portal-body">
      <VoiceServiceEndpointConsole />
    </div>
  );
}