import { EvolutionConsole } from '../../whatsapp-services/evolution/EvolutionConsole';

export const dynamic = 'force-dynamic';

export default function ServiceEndpointEvolutionPage() {
  return (
    <div className="portal-body">
      <EvolutionConsole />
    </div>
  );
}