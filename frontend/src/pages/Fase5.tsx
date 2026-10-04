import { PageHeader } from '../components/ui';
import { DocumentosPanel } from '../components/Documents';
import { OcorrenciasPanel } from '../components/Occurrences';

export const DocumentosPage = () => (<><PageHeader title="Documentos" subtitle="Todos os documentos que você pode consultar. Para enviar, abra o projeto e use a aba Documentos." /><DocumentosPanel global /></>);
export const OcorrenciasPage = () => (<><PageHeader title="Ocorrências" subtitle="Riscos, impedimentos e atrasos registrados. Para registrar, abra o projeto e use a aba Ocorrências." /><OcorrenciasPanel /></>);
