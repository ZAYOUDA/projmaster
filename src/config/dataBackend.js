// Bascule de backend data — LOCAL UNIQUEMENT. VITE_DATA_BACKEND n'est jamais défini sur Vercel
// (voir Settings → Environment Variables du projet), donc la prod tourne toujours sur Firebase
// quoi qu'il arrive ici. Ne définir VITE_DATA_BACKEND=supabase que dans .env.local, pour tester
// l'app contre le stack Supabase self-hosted (VPS OVH) sans jamais toucher à Firebase/prod.
export const DATA_BACKEND = import.meta.env.VITE_DATA_BACKEND === 'supabase' ? 'supabase' : 'firebase';
