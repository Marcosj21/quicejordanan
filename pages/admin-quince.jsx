import { useState, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 15 * 60 * 1000
const SESSION_MS   = 4  * 60 * 60 * 1000
const MAX_PERSONAS = 6   // máximo de personas por invitación

export default function AdminQuince() {
  const [screen, setScreen]   = useState('loading')
  const [pw, setPw]           = useState('')
  const [error, setError]     = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [lockTimer, setLockTimer]   = useState('')
  const [tab, setTab]         = useState('guests')
  const [families, setFamilies]     = useState([])
  const [responses, setResponses]   = useState([])
  const [messages, setMessages]     = useState([])
  const [fName, setFName]           = useState('')
  const [fCount, setFCount]         = useState(2)
  const [members, setMembers]       = useState(['',''])
  const [createdLink, setCreatedLink] = useState(null)
  const [toast, setToast]     = useState('')

  useEffect(() => {
    const sess = sessionStorage.getItem('_admin_sess')
    const rem  = isLockedOut()
    if (rem) { startLockoutTimer(rem); return }
    if (sess && Date.now() - parseInt(sess) < SESSION_MS) {
      setScreen('admin'); loadAll()
    } else {
      setScreen('login')
    }
  }, [])

  function isLockedOut() {
    try {
      const a = JSON.parse(sessionStorage.getItem('_atm') || '{"n":0,"t":0}')
      if (a.n >= MAX_ATTEMPTS) {
        const rem = LOCKOUT_MS - (Date.now() - a.t)
        if (rem > 0) return rem
        sessionStorage.setItem('_atm', JSON.stringify({n:0,t:0}))
      }
    } catch {}
    return false
  }

  function startLockoutTimer(ms) {
    setScreen('locked')
    const end = Date.now() + ms
    function tick() {
      const rem = end - Date.now()
      if (rem <= 0) { setScreen('login'); return }
      const m = String(Math.floor(rem/60000)).padStart(2,'0')
      const s = String(Math.floor((rem%60000)/1000)).padStart(2,'0')
      setLockTimer(`${m}:${s}`)
      setTimeout(tick, 1000)
    }
    tick()
  }

  async function doLogin() {
    const rem = isLockedOut()
    if (rem) { startLockoutTimer(rem); return }
    setError('')
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      })
      if (res.ok) {
        sessionStorage.setItem('_admin_sess', Date.now().toString())
        sessionStorage.setItem('_atm', JSON.stringify({n:0,t:0}))
        setPw(''); setScreen('admin'); loadAll()
      } else {
        const a = JSON.parse(sessionStorage.getItem('_atm') || '{"n":0,"t":0}')
        a.n++; a.t = Date.now()
        sessionStorage.setItem('_atm', JSON.stringify(a))
        const left = MAX_ATTEMPTS - a.n
        setAttemptsLeft(left)
        setError(left > 0 ? `Contraseña incorrecta. Intentos: ${left}` : '')
        if (a.n >= MAX_ATTEMPTS) startLockoutTimer(LOCKOUT_MS)
        setPw('')
      }
    } catch {
      setError('Error de conexión')
    }
  }

  function doLogout() {
    sessionStorage.removeItem('_admin_sess')
    setScreen('login')
    setFamilies([]); setResponses([])
  }

  async function loadAll() {
    const [{ data: fam }, { data: resp }] = await Promise.all([
      supabase.from('families').select('*').order('created_at', { ascending: false }),
      supabase.from('responses').select('*').order('responded_at', { ascending: false })
    ])
    setFamilies(fam || [])
    setResponses(resp || [])
    const msgs = (resp || []).filter(r => r.status === 'declined' && r.message)
    setMessages(msgs)
  }

  async function deleteFamily(key) {
    if (!confirm('¿Eliminar esta invitación?')) return
    await Promise.all([
      supabase.from('families').delete().eq('key', key),
      supabase.from('responses').delete().eq('family_key', key)
    ])
    showToast('Eliminada ✓'); loadAll()
  }

  // ── Cambiar la cantidad de personas con los botones 1-6 ──
  function setPersonCount(n) {
    setFCount(n)
    // Ajustar el arreglo de nombres: conservar los que ya escribió
    setMembers(prev => Array.from({ length: n }, (_, i) => prev[i] || ''))
  }

  async function createInvitation() {
    if (!fName.trim()) { showToast('Escribe el nombre'); return }
    const mems = members.slice(0, fCount).filter(m => m.trim())
    if (!mems.length) { showToast('Agrega al menos un nombre'); return }
    let key = fName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,30)
    const { data: ex } = await supabase.from('families').select('key').eq('key', key)
    if (ex?.length) key = key + '-' + Date.now().toString().slice(-4)
    const { error } = await supabase.from('families').insert({ key, family_display: fName.trim(), admission_count: mems.length, members: mems })
    if (error) { showToast('Error al guardar'); return }
    const link = `${location.origin}/?f=${encodeURIComponent(key)}`
    setCreatedLink({ link, name: fName.trim(), count: mems.length })
    setFName(''); setPersonCount(2)
    showToast('¡Invitación creada! ✓'); loadAll()
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2800) }

  // ── última respuesta por familia ──
  const respMap = {}
  responses.forEach(r => { if (!respMap[r.family_key]) respMap[r.family_key] = r })

  // ── stats ──
  const totalInvitaciones = families.length
  let totalInvitados = 0, asistiran = 0, noAsistiran = 0, pendientes = 0
  families.forEach(f => {
    const mems = Array.isArray(f.members) ? f.members : JSON.parse(f.members||'[]')
    totalInvitados += mems.length
    const r = respMap[f.key]
    if (!r) { pendientes += mems.length; return }
    const att = r.attendees || {}
    mems.forEach(m => {
      if (att[m] === true) asistiran++
      else if (att[m] === false) noAsistiran++
      else pendientes++
    })
  })

  const inputStyle = { width:'100%', background:'rgba(200,212,220,.06)', border:'1px solid rgba(200,212,220,.18)', borderRadius:4, padding:'10px 12px', color:'#EBF1F6', fontFamily:'"Cormorant Garamond",serif', fontSize:15, outline:'none' }
  const labelStyle = { display:'block', fontFamily:'"Cinzel",serif', fontSize:9, letterSpacing:2, color:'rgba(200,212,220,.5)', marginBottom:6, textTransform:'uppercase' }

  if (screen === 'loading') return null

  if (screen === 'locked') return (
    <div style={{ minHeight:'100vh', background:'#08020E', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:24 }}>
      <Head><title>Admin</title><meta name="robots" content="noindex"/></Head>
      <div>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <p style={{ fontFamily:'"Cinzel",serif', fontSize:15, letterSpacing:4, color:'#EBF1F6', marginBottom:8 }}>ACCESO BLOQUEADO</p>
        <p style={{ fontSize:14, fontStyle:'italic', color:'rgba(200,212,220,.45)', marginBottom:12 }}>Demasiados intentos. Espera para continuar.</p>
        <p style={{ fontFamily:'"Cinzel",serif', fontSize:28, color:'#E08080', letterSpacing:4 }}>{lockTimer}</p>
      </div>
    </div>
  )

  if (screen === 'login') return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse 80% 60% at 50% 0%,#3D0A20 0%,transparent 65%),linear-gradient(160deg,#1A0510 0%,#0A0208 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <Head><title>Admin</title><meta name="robots" content="noindex"/></Head>
      <div style={{ width:'100%', maxWidth:340, background:'rgba(28,8,16,.9)', border:'1px solid rgba(200,212,220,.14)', borderRadius:16, padding:'36px 28px', boxShadow:'0 30px 80px rgba(0,0,0,.7)' }}>
        <p style={{ fontFamily:'"Cinzel",serif', fontSize:14, letterSpacing:4, color:'#EBF1F6', textAlign:'center', marginBottom:6 }}>✦ PANEL ADMIN ✦</p>
        <p style={{ fontSize:13, fontStyle:'italic', color:'rgba(200,212,220,.4)', textAlign:'center', marginBottom:28 }}>Quince de Mariuxi Jordana</p>
        <label style={labelStyle}>Contraseña</label>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()} placeholder="••••••••" style={{...inputStyle, marginBottom:16}}/>
        {error && <p style={{ fontSize:13, color:'#E08080', textAlign:'center', marginBottom:10, fontStyle:'italic' }}>{error}</p>}
        <button onClick={doLogin} style={{ fontFamily:'"Cinzel",serif', fontSize:11, letterSpacing:3, color:'#fff', padding:'14px 24px', border:'none', borderRadius:50, background:'linear-gradient(135deg,#6B1A2A,#420D18)', cursor:'pointer', width:'100%', textTransform:'uppercase' }}>
          ✦ &nbsp;Ingresar
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#08020E', fontFamily:'"Cormorant Garamond",serif', color:'#C8D4DC', paddingBottom:60 }}>
      <Head><title>Admin — Quince</title><meta name="robots" content="noindex"/></Head>

      <div style={{ background:'linear-gradient(90deg,#420D18,#6B1A2A,#420D18)', padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(200,212,220,.15)', position:'sticky', top:0, zIndex:100 }}>
        <div>
          <p style={{ fontFamily:'"Cinzel",serif', fontSize:14, letterSpacing:4, color:'#EBF1F6' }}>✦ ADMIN QUINCE ✦</p>
          <p style={{ fontSize:12, fontStyle:'italic', color:'rgba(200,212,220,.5)' }}>Mariuxi Jordana · 13 Junio 2026</p>
        </div>
        <button onClick={doLogout} style={{ fontFamily:'"Cinzel",serif', fontSize:9, letterSpacing:2, color:'rgba(200,212,220,.45)', background:'transparent', border:'1px solid rgba(200,212,220,.2)', borderRadius:20, padding:'6px 14px', cursor:'pointer', textTransform:'uppercase' }}>Salir</button>
      </div>

      <div style={{ display:'flex', maxWidth:680, margin:'20px auto 0', padding:'0 16px' }}>
        {['guests','create','messages'].map((t,i) => (
          <button key={t} onClick={()=>{ setTab(t); if(t!=='create') loadAll() }} style={{ flex:1, fontFamily:'"Cinzel",serif', fontSize:10, letterSpacing:2, padding:'11px 8px', textAlign:'center', cursor:'pointer', border:'1px solid rgba(200,212,220,.12)', background: tab===t ? 'linear-gradient(135deg,#6B1A2A,#420D18)' : '#1C0810', color: tab===t ? '#EBF1F6' : 'rgba(200,212,220,.4)', borderRadius: i===0?'4px 0 0 4px':i===2?'0 4px 4px 0':'0', textTransform:'uppercase' }}>
            {['Invitados','Crear','Mensajes'][i]}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:680, margin:'20px auto 0', padding:'0 16px' }}>

        {/* GUESTS TAB */}
        {tab === 'guests' && (<>
          <div style={{ background:'linear-gradient(135deg,#2D7A3A,#1A5026)', borderRadius:10, padding:'18px 20px', marginBottom:14, textAlign:'center' }}>
            <p style={{ fontFamily:'"Cinzel",serif', fontSize:10, letterSpacing:2, color:'rgba(255,255,255,.7)', marginBottom:4 }}>PERSONAS QUE ASISTIRÁN</p>
            <p style={{ fontFamily:'"Cinzel",serif', fontSize:44, color:'#fff', lineHeight:1 }}>{asistiran}</p>
            <p style={{ fontSize:12, fontStyle:'italic', color:'rgba(255,255,255,.7)', marginTop:4 }}>👥 Para calcular platos, bocaditos y recuerdos</p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:18 }}>
            {[
              { n: totalInvitaciones, l: 'INVITACIONES (familias)', c: '#EBF1F6' },
              { n: totalInvitados,    l: 'INVITADOS (personas)',   c: '#EBF1F6' },
              { n: noAsistiran,       l: 'NO ASISTIRÁN',           c: '#E08080' },
              { n: pendientes,        l: 'PENDIENTES',             c: '#D4A840' }
            ].map((s,i) => (
              <div key={i} style={{ background:'#1C0810', border:'1px solid rgba(200,212,220,.1)', borderRadius:8, padding:14, textAlign:'center' }}>
                <p style={{ fontFamily:'"Cinzel",serif', fontSize:26, color: s.c, margin:0 }}>{s.n}</p>
                <p style={{ fontSize:9, letterSpacing:1, color:'rgba(200,212,220,.4)', marginTop:3 }}>{s.l}</p>
              </div>
            ))}
          </div>

          {families.length === 0
            ? <p style={{ textAlign:'center', padding:'40px 20px', fontStyle:'italic', color:'rgba(200,212,220,.35)' }}>Sin invitaciones aún. Crea la primera en "Crear".</p>
            : families.map(f => {
                const resp  = respMap[f.key]
                const mems  = Array.isArray(f.members) ? f.members : JSON.parse(f.members||'[]')
                const att   = resp?.attendees || null
                const link  = `${location.origin}/?f=${encodeURIComponent(f.key)}`
                const nYes  = att ? mems.filter(m=>att[m]===true).length : 0
                const answered = !!resp

                const badge = !answered ? { bg:'rgba(180,120,20,.15)', border:'rgba(200,150,30,.25)', color:'#D4A840', txt:'PENDIENTE' }
                            : nYes > 0  ? { bg:'rgba(30,120,50,.25)', border:'rgba(40,180,70,.3)', color:'#70D080', txt:`✓ ${nYes} DE ${mems.length}` }
                            :             { bg:'rgba(180,30,30,.2)',  border:'rgba(220,60,60,.25)', color:'#E08080', txt:'✕ NINGUNO' }
                return (
                  <div key={f.key} style={{ background:'#1C0810', border:'1px solid rgba(200,212,220,.1)', borderRadius:8, padding:'16px 18px', marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                      <div>
                        <p style={{ fontFamily:'"Cinzel",serif', fontSize:13, letterSpacing:2, color:'#EBF1F6' }}>{f.family_display}</p>
                        <p style={{ fontSize:12, color:'rgba(200,212,220,.45)', marginTop:2 }}>{mems.length} persona{mems.length!==1?'s':''}</p>
                      </div>
                      <span style={{ fontFamily:'"Cinzel",serif', fontSize:9, letterSpacing:2, padding:'4px 12px', borderRadius:20, background:badge.bg, border:`1px solid ${badge.border}`, color:badge.color, flexShrink:0 }}>{badge.txt}</span>
                    </div>

                    <div style={{ marginBottom:8 }}>
                      {mems.map((m,i)=>{
                        const st = att ? att[m] : undefined
                        const mark = st===true ? <span style={{color:'#70D080'}}>✓</span>
                                   : st===false ? <span style={{color:'#E08080'}}>✕</span>
                                   : <span style={{color:'rgba(200,212,220,.3)'}}>○</span>
                        return (
                          <p key={i} style={{ fontSize:13, color:'rgba(200,212,220,.65)', padding:'3px 0', display:'flex', gap:8 }}>
                            {mark} {m}
                          </p>
                        )
                      })}
                    </div>

                    {resp && <p style={{ fontSize:11, color:'rgba(200,212,220,.3)', marginBottom:6, fontStyle:'italic' }}>Respondió · {new Date(resp.responded_at).toLocaleString('es-EC')}</p>}
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <div onClick={()=>navigator.clipboard.writeText(link).then(()=>showToast('Copiado ✓'))} style={{ flex:1, fontFamily:'"Cinzel",serif', fontSize:9, color:'rgba(200,212,220,.4)', background:'rgba(200,212,220,.04)', border:'1px solid rgba(200,212,220,.1)', borderRadius:4, padding:'6px 10px', wordBreak:'break-all', cursor:'pointer' }}>{link}</div>
                      <button onClick={()=>navigator.clipboard.writeText(link).then(()=>showToast('Copiado ✓'))} style={{ background:'rgba(200,212,220,.07)', border:'1px solid rgba(200,212,220,.14)', borderRadius:4, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>📋</button>
                      <button onClick={()=>window.open('https://wa.me/?text='+encodeURIComponent(`🎀 *Invitación — Quince Años de Mariuxi Jordana*\n\nHola Familia ${f.family_display}, aquí está tu invitación:\n${link}\n\n✨ Ábrela para ver la animación`),'_blank')} style={{ background:'rgba(40,180,70,.08)', border:'1px solid rgba(40,180,70,.15)', borderRadius:4, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>💬</button>
                      <button onClick={()=>deleteFamily(f.key)} style={{ background:'transparent', border:'1px solid rgba(200,212,220,.14)', borderRadius:4, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>🗑</button>
                    </div>
                  </div>
                )
              })
          }
          <button onClick={loadAll} style={{ fontFamily:'"Cinzel",serif', fontSize:9, letterSpacing:2, color:'rgba(200,212,220,.35)', background:'transparent', border:'1px solid rgba(200,212,220,.14)', borderRadius:4, padding:'7px 18px', cursor:'pointer', display:'block', margin:'14px auto 0', textTransform:'uppercase' }}>↺ Actualizar</button>
        </>)}

        {/* CREATE TAB */}
        {tab === 'create' && (
          <div style={{ background:'#1C0810', border:'1px solid rgba(200,212,220,.12)', borderRadius:8, padding:'24px 20px' }}>
            <p style={{ fontFamily:'"Cinzel",serif', fontSize:13, letterSpacing:3, color:'#EBF1F6', marginBottom:18, borderBottom:'1px solid rgba(200,212,220,.1)', paddingBottom:11 }}>✦ Nueva Invitación</p>

            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Nombre de la familia</label>
              <input value={fName} onChange={e=>setFName(e.target.value)} placeholder="Ej: Familia Torres Ríos" style={inputStyle}/>
            </div>

            {/* ── SELECTOR DE CANTIDAD CON BOTONES 1-6 ── */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>¿Cuántas personas?</label>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${MAX_PERSONAS},1fr)`, gap:7 }}>
                {Array.from({ length: MAX_PERSONAS }, (_, i) => i + 1).map(n => {
                  const activo = fCount === n
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPersonCount(n)}
                      style={{
                        fontFamily:'"Cinzel",serif',
                        fontSize:18,
                        padding:'14px 0',
                        cursor:'pointer',
                        borderRadius:8,
                        border: activo ? '1px solid rgba(40,180,70,.5)' : '1px solid rgba(200,212,220,.18)',
                        background: activo ? 'linear-gradient(135deg,#2D7A3A,#1A5026)' : 'rgba(200,212,220,.05)',
                        color: activo ? '#fff' : 'rgba(200,212,220,.6)',
                        fontWeight: activo ? 700 : 400,
                        transition:'all .15s'
                      }}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize:12, fontStyle:'italic', color:'rgba(200,212,220,.4)', marginTop:8, textAlign:'center' }}>
                Toca el número de personas de esta familia
              </p>
            </div>

            {/* ── LISTADO DE NOMBRES SEGÚN LA CANTIDAD ── */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Nombre de cada invitado</label>
              {Array.from({ length: fCount }, (_, i) => (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontFamily:'"Cinzel",serif', fontSize:12, color:'rgba(200,212,220,.45)', width:22, height:22, lineHeight:'22px', textAlign:'center', flexShrink:0, borderRadius:'50%', background:'rgba(200,212,220,.08)' }}>{i+1}</span>
                  <input
                    value={members[i] || ''}
                    onChange={e=>{ const m=[...members]; m[i]=e.target.value; setMembers(m) }}
                    placeholder={`Nombre de la persona ${i+1}`}
                    style={{...inputStyle, flex:1}}
                  />
                </div>
              ))}
            </div>

            <button onClick={createInvitation} style={{ fontFamily:'"Cinzel",serif', fontSize:10, letterSpacing:3, color:'#fff', padding:'14px 24px', border:'none', borderRadius:6, background:'linear-gradient(135deg,#6B1A2A,#420D18)', cursor:'pointer', width:'100%', textTransform:'uppercase' }}>✦ Crear Invitación</button>

            {createdLink && (
              <div style={{ marginTop:14, background:'rgba(40,120,60,.1)', border:'1px solid rgba(40,180,70,.18)', borderRadius:8, padding:18 }}>
                <p style={{ fontFamily:'"Cinzel",serif', fontSize:11, letterSpacing:2, color:'#70D080', marginBottom:10 }}>✓ Invitación Creada</p>
                <p style={{ fontSize:13, fontStyle:'italic', color:'rgba(200,212,220,.55)', marginBottom:10 }}>{createdLink.name} · {createdLink.count} persona{createdLink.count!==1?'s':''}</p>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <div onClick={()=>navigator.clipboard.writeText(createdLink.link).then(()=>showToast('Copiado ✓'))} style={{ flex:1, fontFamily:'"Cinzel",serif', fontSize:9, color:'rgba(200,212,220,.5)', background:'rgba(200,212,220,.05)', border:'1px solid rgba(200,212,220,.1)', borderRadius:4, padding:'7px 10px', wordBreak:'break-all', cursor:'pointer' }}>{createdLink.link}</div>
                  <button onClick={()=>navigator.clipboard.writeText(createdLink.link).then(()=>showToast('Copiado ✓'))} style={{ background:'rgba(200,212,220,.07)', border:'1px solid rgba(200,212,220,.14)', borderRadius:4, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>📋</button>
                  <button onClick={()=>window.open('https://wa.me/?text='+encodeURIComponent(`🎀 *Invitación — Quince Años de Mariuxi Jordana*\n\nHola Familia ${createdLink.name}, aquí está tu invitación:\n${createdLink.link}\n\n✨ Ábrela para ver la animación`),'_blank')} style={{ background:'rgba(40,180,70,.08)', border:'1px solid rgba(40,180,70,.15)', borderRadius:4, padding:'6px 10px', cursor:'pointer', fontSize:14 }}>💬</button>
                </div>
                <p style={{ fontSize:9, color:'rgba(200,212,220,.25)', marginTop:8, letterSpacing:1, fontFamily:'"Cinzel",serif' }}>Envía por WhatsApp</p>
              </div>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {tab === 'messages' && (
          messages.length === 0
            ? <p style={{ textAlign:'center', padding:'40px 20px', fontStyle:'italic', color:'rgba(200,212,220,.35)' }}>Aún no hay mensajes de familias que no pudieron asistir.</p>
            : messages.map((m,i) => (
                <div key={i} style={{ background:'#1C0810', border:'1px solid rgba(200,212,220,.1)', borderRadius:8, padding:'16px 18px', marginBottom:10 }}>
                  <p style={{ fontFamily:'"Cinzel",serif', fontSize:12, letterSpacing:2, color:'#EBF1F6', marginBottom:3 }}>{m.family_display}</p>
                  <p style={{ fontSize:11, color:'rgba(200,212,220,.3)', marginBottom:8 }}>{new Date(m.responded_at).toLocaleString('es-EC')}</p>
                  <p style={{ fontSize:15, fontStyle:'italic', color:'rgba(200,212,220,.7)', lineHeight:1.7, borderLeft:'2px solid rgba(107,26,42,.5)', paddingLeft:12 }}>{m.message}</p>
                </div>
              ))
        )}
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:26, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#6B1A2A,#420D18)', color:'#EBF1F6', fontFamily:'"Cinzel",serif', fontSize:10, letterSpacing:2, padding:'10px 24px', borderRadius:30, boxShadow:'0 8px 30px rgba(0,0,0,.5)', zIndex:9999, whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}