import { useQuery } from '@tanstack/react-query';
import { get } from './api';

const lookup = <T = any>(key: string, url: string) => useQuery<T[]>({ queryKey: [key], queryFn: () => get(url), staleTime: 60_000 });
export const useFrentes = () => lookup('frentes', '/frentes');
export const useStatus = () => lookup('status', '/status');
export const useConfidencialidades = () => lookup('confidencialidades', '/confidencialidades');
export const useTiposMov = () => lookup('tipos-mov', '/tipos-movimentacao');
export const usePessoas = () => lookup('pessoas', '/users/pessoas');
export const useTiposDoc = () => lookup('tipos-documento', '/tipos-documento');
export const useTiposOcorrencia = () => lookup('tipos-ocorrencia', '/tipos-ocorrencia');
