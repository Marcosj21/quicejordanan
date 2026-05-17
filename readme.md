══════════════════════════════════════════════════════
  INSTRUCCIONES — SISTEMA QUINCE (Next.js + Vercel)
══════════════════════════════════════════════════════

ESTRUCTURA DEL PROYECTO
──────────────────────────────────────────────────────
quince-nextjs/
├── pages/
│   ├── index.jsx          ← Invitación (la ven todos)
│   ├── admin-quince.jsx   ← Tu panel privado
│   └── api/
│       └── admin-login.js ← Verifica contraseña en servidor
├── lib/
│   └── supabase.js        ← Cliente Supabase (usa env vars)
├── .env.example           ← Plantilla de variables
├── .gitignore             ← .env.local NO sube a GitHub
└── package.json

LAS CREDENCIALES NUNCA VIVEN EN EL CÓDIGO
──────────────────────────────────────────────────────
✓ NEXT_PUBLIC_SUPABASE_URL    → URL de tu proyecto Supabase
✓ NEXT_PUBLIC_SUPABASE_ANON_KEY → Llave anon de Supabase
✓ ADMIN_PASSWORD              → La contraseña del admin
  (esta es PRIVADA — no tiene NEXT_PUBLIC_, el navegador NUNCA la ve)

PASO 1 — SUPABASE
──────────────────────────────────────────────────────
1. https://supabase.com → New Project
2. SQL Editor → New query → ejecuta esto:

CREATE TABLE families (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL,
  family_display text NOT NULL,
  admission_count integer NOT NULL DEFAULT 2,
  members jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_key text NOT NULL,
  family_display text NOT NULL,
  status text NOT NULL CHECK (status IN ('confirmed','declined')),
  message text,
  responded_at timestamptz DEFAULT now()
);
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pub families"  ON families  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pub responses" ON responses FOR ALL USING (true) WITH CHECK (true);

3. Settings → API → copia Project URL y anon key

PASO 2 — GITHUB
──────────────────────────────────────────────────────
1. Crea cuenta en github.com (gratis)
2. New repository → nombre: quince-mariuxi → Create
3. Sube la carpeta quince-nextjs (arrastra los archivos)
   IMPORTANTE: .env.local NO debe subirse (está en .gitignore)

PASO 3 — VERCEL (deploy gratis)
──────────────────────────────────────────────────────
1. https://vercel.com → continúa con GitHub
2. Import → selecciona tu repositorio quince-mariuxi
3. Antes de hacer deploy, ve a:
   Settings → Environment Variables → agrega:

   NEXT_PUBLIC_SUPABASE_URL      = https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
   ADMIN_PASSWORD                = TuContraseñaSegura2026!

4. Click Deploy → en 2 minutos tienes tu URL

TUS URLs FINALES
──────────────────────────────────────────────────────
Invitados:  https://quince-mariuxi.vercel.app/?f=nombre-familia
Tu admin:   https://quince-mariuxi.vercel.app/admin-quince

PARA DESARROLLO LOCAL
──────────────────────────────────────────────────────
1. Copia .env.example → .env.local
2. Llena los valores reales
3. npm install
4. npm run dev
5. Abre http://localhost:3000

SEGURIDAD IMPLEMENTADA
──────────────────────────────────────────────────────
✓ ADMIN_PASSWORD nunca sale del servidor (API route)
✓ Las env vars viven en Vercel, no en el código
✓ .env.local está en .gitignore
✓ noindex/nofollow en admin
✓ Login con bloqueo (5 intentos → 15 min lockout)
✓ Sesión expira en 4 horas
✓ HTTPS automático en Vercel
✓ Supabase RLS activado

══════════════════════════════════════════════════════