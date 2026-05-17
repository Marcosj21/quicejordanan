// pages/api/admin-login.js
// Esta ruta corre en el SERVIDOR de Vercel.
// ADMIN_PASSWORD nunca llega al navegador.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { password } = req.body

  if (!password) {
    return res.status(400).json({ error: 'Password required' })
  }

  // La contraseña vive en Vercel env vars, nunca en el código
  const correct = process.env.ADMIN_PASSWORD

  if (!correct) {
    console.error('ADMIN_PASSWORD env var not set')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  if (password !== correct) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  // Generar token de sesión simple (firmado con timestamp)
  const token = Buffer.from(
    JSON.stringify({ ts: Date.now(), role: 'admin' })
  ).toString('base64')

  return res.status(200).json({ token })
}