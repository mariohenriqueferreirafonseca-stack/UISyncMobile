// Camada mínima de autenticação local.
// O backend valida usuário/senha; aqui a gente só persiste a sessão e aplica regras de setor.
import { readStorage, storageKeys, writeStorage } from '@/services/sync/storage';

export type AuthSession = {
  matricula: string;
  nome: string;
  setor: string;
  unidade?: string | null;
  tipoUsuario?: string | null;
};

const GLOBAL_ACCESS_SECTOR = '0000';

export async function getAuthSession() {
  return readStorage<AuthSession | null>(storageKeys.authSession, null);
}

export async function saveAuthSession(session: AuthSession) {
  await writeStorage(storageKeys.authSession, session);
}

export async function clearAuthSession() {
  await writeStorage<AuthSession | null>(storageKeys.authSession, null);
}

export function userHasSectorAccess(
  session: AuthSession | null,
  allowedSectors: string[],
) {
  // O setor 0000 funciona como acesso global a todos os formulários.
  if (!session) {
    return false;
  }

  return (
    session.setor === GLOBAL_ACCESS_SECTOR ||
    allowedSectors.includes(session.setor)
  );
}
