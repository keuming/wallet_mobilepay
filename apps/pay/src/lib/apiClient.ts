const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit & { idempotent?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.idempotent) {
    headers['idempotency-key'] = crypto.randomUUID();
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    // § Le payeur est souvent sur une connexion mobile instable — une
    // coupure doit produire un message clair, pas un `TypeError` brut.
    throw new ApiError('Connexion impossible. Vérifie ta connexion internet et réessaie.', 0);
  }
  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(json?.error?.message ?? 'Une erreur est survenue.', response.status);
  }

  // § L'API enveloppe TOUTES ses réponses dans { success, data } (voir
  // ResponseInterceptor côté serveur). Cette app renvoyait l'enveloppe
  // brute au lieu de son contenu : les composants recevaient
  // { success, data } et cherchaient leurs champs à la racine, où ils
  // n'existent pas. C'est ce qui empêchait le nom et le numéro du
  // bénéficiaire de s'afficher, quel que soit le correctif appliqué en
  // amont. Les autres applications (web, business, admin) extraient
  // correctement `data` — seule celle-ci avait été oubliée.
  return (json?.data ?? json) as T;
}
