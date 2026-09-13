// Edge Function admin — équivalent Supabase de functions/index.js (Firebase Cloud Function
// changeUserPassword), étendu à createUserAccount (tâche #20). Copie de référence versionnée
// dans le repo ; le fichier réellement exécuté vit sur la VPS sous
// ~/projmaster-infra/volumes/functions/main/index.ts (monté dans le conteneur
// supabase-edge-functions en mode --main-service, cf. docker-compose.yml du template Supabase :
// tout le trafic vers /functions/v1/* arrive ici quel que soit le chemin, donc pas besoin de
// router sur l'URL — on distingue les deux actions via `action` dans le corps JSON).
//
// Sécurité : contrairement à la Cloud Function Firebase (qui ne vérifie que "authentifié"), on
// vérifie ici explicitement que l'appelant a le rôle admin/manager dans public.users avant
// d'utiliser la clé service_role — cette clé contourne toute RLS, elle ne doit jamais agir sur la
// seule foi d'un JWT valide.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error('UNCAUGHT', e instanceof Error ? e.stack : e);
    return json({ error: 'internal_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) return json({ error: 'unauthenticated' }, 401);

  // Client "appelant" : vérifie le JWT auprès de GoTrue et identifie qui fait la requête.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerAuth?.user) return json({ error: 'unauthenticated' }, 401);

  // Client admin : contourne RLS (clé service_role) — uniquement utilisé APRÈS avoir vérifié
  // que l'appelant est bien admin/manager, jamais avant.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerRow, error: callerRowErr } = await admin
    .from('users')
    .select('role')
    .eq('id', callerAuth.user.id)
    .maybeSingle();
  if (callerRowErr || !callerRow) return json({ error: 'unauthenticated' }, 401);

  const callerRole = callerRow.role as string;
  const callerHasFullAccess = callerRole === 'admin' || callerRole === 'manager';
  if (!callerHasFullAccess) return json({ error: 'forbidden' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { action } = body;

  // ── createUserAccount ────────────────────────────────────────────
  if (action === 'createUserAccount') {
    const { email, password, prenom, nom, role, collaborateur_id, projets_autorises } = body as {
      email?: string; password?: string; prenom?: string; nom?: string; role?: string;
      collaborateur_id?: string; projets_autorises?: string[];
    };
    if (!email || !password || !prenom || !nom || !role) {
      return json({ error: 'invalid_argument', message: 'Champs requis manquants.' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'invalid_argument', message: 'Le mot de passe doit faire au moins 6 caractères.' }, 400);
    }
    // Un Manager ne peut pas créer de compte Admin — même règle que côté Firestore rules
    // (isManager() && request.resource.data.role != "admin") et ConsoleAdmin.jsx (allowedRoles).
    if (role === 'admin' && callerRole !== 'admin') {
      return json({ error: 'forbidden', message: 'Seul un Admin peut créer un compte Admin.' }, 403);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr || !created?.user) {
      const alreadyExists = /already.*registered|already.*exists/i.test(createErr?.message || '');
      return json({
        error: alreadyExists ? 'email_already_in_use' : 'create_failed',
        message: alreadyExists ? 'Cet email est déjà utilisé.' : (createErr?.message || 'Échec de la création.'),
      }, alreadyExists ? 409 : 500);
    }

    const uid = created.user.id;
    const { error: insertErr } = await admin.from('users').insert({
      id: uid,
      email,
      nom,
      prenom,
      role,
      collaborateur_id: collaborateur_id || null,
      projets_autorises: projets_autorises || [],
      actif: true,
      doit_changer_mdp: true,
    });
    if (insertErr) {
      // La fiche Auth existe mais pas la fiche users : on nettoie pour ne pas laisser un compte
      // orphelin auquel personne ne peut se connecter proprement (même souci que le cas Firebase
      // "Jamil Fadile" rencontré plus tôt sur ce projet).
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return json({ error: 'create_failed', message: insertErr.message }, 500);
    }

    return json({ uid });
  }

  // ── changeUserPassword ───────────────────────────────────────────
  if (action === 'changeUserPassword') {
    const { uid, newPassword } = body as { uid?: string; newPassword?: string };
    if (!uid || !newPassword) {
      return json({ error: 'invalid_argument', message: 'uid et newPassword sont requis.' }, 400);
    }
    if (newPassword.length < 6) {
      return json({ error: 'invalid_argument', message: 'Le mot de passe doit faire au moins 6 caractères.' }, 400);
    }

    const { data: targetRow } = await admin.from('users').select('role').eq('id', uid).maybeSingle();
    if (targetRow?.role === 'admin' && callerRole !== 'admin') {
      return json({ error: 'forbidden', message: 'Seul un Admin peut réinitialiser le mot de passe d\'un Admin.' }, 403);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(uid, { password: newPassword });
    if (updateErr) return json({ error: 'update_failed', message: updateErr.message }, 500);

    await admin.from('users').update({ doit_changer_mdp: true }).eq('id', uid);
    return json({ success: true });
  }

  return json({ error: 'unknown_action' }, 400);
}
