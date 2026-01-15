import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "./firebase";
import {
  collection, addDoc, doc, setDoc, onSnapshot,
  updateDoc, query, orderBy, deleteDoc, getDocs,
} from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

function App() {
  // --- ESTADOS DE AUTENTICACIÓN ---
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [modoInvitado, setModoInvitado] = useState(false);

  const admins = ["somozaj23@gmail.com", "fran.guelfo@gmail.com"];
  const esAdmin = user && admins.includes(user.email);

  // --- ESTADOS DEL TORNEO ---
  const [vista, setVista] = useState("menu");
  const [torneoActivoId, setTorneoActivoId] = useState(null);
  const [datosTorneo, setDatosTorneo] = useState({});
  const [equiposParticipantes, setEquiposParticipantes] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [modalPartido, setModalPartido] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [rankingHistorico, setRankingHistorico] = useState([]);

  // --- ESTADOS DEL CRONÓMETRO ---
  const [segundos, setSegundos] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [silbatoTocado, setSilbatoTocado] = useState(false);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  // --- ESTADOS DEL FORMULARIO ---
  const [nombreTorneo, setNombreTorneo] = useState("");
  const [fechaTorneo, setFechaTorneo] = useState(new Date().toISOString().split("T")[0]);
  const [horaTorneo, setHoraTorneo] = useState("20:00");
  const [lugarTorneo, setLugarTorneo] = useState("");
  const [tiemposForm, setTiemposForm] = useState({ liguilla: 10, semifinal: 12, final: 15 });
  const [equiposForm, setEquiposForm] = useState([
    { id: "1", nombre: "Equipo 1", color: "#ff4444", jugadores: [] },
    { id: "2", nombre: "Equipo 2", color: "#44ff44", jugadores: [] },
    { id: "3", nombre: "Equipo 3", color: "#4444ff", jugadores: [] },
    { id: "4", nombre: "Equipo 4", color: "#ffff44", jugadores: [] },
  ]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCargandoAuth(false);
      if (currentUser) { setModoInvitado(false); setVista("menu"); }
    });
    return () => unsub();
  }, []);

  const manejarLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); setVista("menu"); } 
    catch { alert("Error: Credenciales incorrectas"); }
  };

  const cerrarSesion = () => { signOut(auth); setModoInvitado(false); setVista("menu"); };

  // --- SISTEMA DE SONIDO Y TIEMPO ---
  const ejecutarFinal = () => {
    const audio = new Audio("/alarma.mp3");
    audioRef.current = audio;
    audio.play().then(() => {
      setTimeout(() => {
        alert("¡FINAL DEL PARTIDO!");
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      }, 150);
    }).catch((e) => {
      console.warn("Audio bloqueado:", e);
      alert("¡FINAL DEL PARTIDO!");
    });
  };

  useEffect(() => {
    if (corriendo) {
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          const tipoActual = modalPartido?.tipo || "liguilla";
          const limiteSegundos = (datosTorneo.tiempos?.[tipoActual] || 10) * 60;
          if (s + 1 >= limiteSegundos && !silbatoTocado) {
            setCorriendo(false); setSilbatoTocado(true); ejecutarFinal(); return limiteSegundos;
          }
          return s + 1;
        });
      }, 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [corriendo, datosTorneo.tiempos, silbatoTocado, modalPartido]);

  const formatearTiempo = (s) => {
    const mins = Math.floor(s / 60);
    const segs = s % 60;
    return `${mins}:${segs < 10 ? "0" : ""}${segs}`;
  };

  const resetCronometro = () => { setCorriendo(false); setSegundos(0); setSilbatoTocado(false); };

  // --- SINCRONIZACIÓN FIREBASE ---
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "torneos"), orderBy("fecha", "desc")), (snap) => {
      setHistorial(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (torneoActivoId) {
      const unsubP = onSnapshot(query(collection(db, `torneos/${torneoActivoId}/partidos`), orderBy("orden")), 
        (snap) => setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      const unsubE = onSnapshot(collection(db, `torneos/${torneoActivoId}/equipos_participantes`), 
        (snap) => setEquiposParticipantes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
      const unsubD = onSnapshot(doc(db, "torneos", torneoActivoId), (snap) => setDatosTorneo(snap.data() || {}));
      return () => { unsubP(); unsubE(); unsubD(); };
    }
  }, [torneoActivoId]);

  // --- CARGAR RANKING GLOBAL ---
  useEffect(() => {
    const cargarGoleadoresGlobales = async () => {
      const tempGoles = {};
      for (const t of historial) {
        const snap = await getDocs(collection(db, `torneos/${t.id}/partidos`));
        snap.docs.forEach((docSnap) => {
          const p = docSnap.data();
          p.detallesGoles?.forEach((g) => { tempGoles[g.jugador] = (tempGoles[g.jugador] || 0) + 1; });
        });
      }
      setRankingHistorico(Object.entries(tempGoles).map(([nombre, goles]) => ({ nombre, goles })).sort((a, b) => b.goles - a.goles));
    };
    if (vista === "estadisticas_globales") cargarGoleadoresGlobales();
  }, [vista, historial]);

  // --- ACCIONES ADMINISTRADOR ---
  const actualizarDatosTorneo = async (campo, valor) => {
    if (!esAdmin || !torneoActivoId) return;
    await updateDoc(doc(db, "torneos", torneoActivoId), { [campo]: valor });
  };

  const anotarGolDirecto = async (partidoId, jugadorNombre, equipoId) => {
    const pData = partidos.find((p) => p.id === partidoId);
    if (!esAdmin || pData.finalizado || datosTorneo.estado === "finalizado") return;
    const nuevosDetalles = [...(pData.detallesGoles || []), { jugador: jugadorNombre, equipoId }];
    const esA = pData.equipoA === equipoId;
    await updateDoc(doc(db, `torneos/${torneoActivoId}/partidos`, partidoId), {
      detallesGoles: nuevosDetalles,
      [esA ? "golesA" : "golesB"]: (esA ? pData.golesA : pData.golesB) + 1,
    });
  };

  const finalizarPartidoManual = async (partidoId) => {
    if (!esAdmin) return;
    if (window.confirm("¿Deseas finalizar el partido y registrar el resultado?")) {
      await updateDoc(doc(db, `torneos/${torneoActivoId}/partidos`, partidoId), { finalizado: true });
      setModalPartido(null);
      resetCronometro();
    }
  };

  const crearTorneo = async () => {
    if (!esAdmin) return;
    const torneoRef = await addDoc(collection(db, "torneos"), {
      nombre: nombreTorneo, fecha: fechaTorneo, hora: horaTorneo, lugar: lugarTorneo, estado: "liguilla", campeon: "", tiempos: tiemposForm, iniciado: false
    });
    for (const eq of equiposForm) {
      await setDoc(doc(db, `torneos/${torneoRef.id}/equipos_participantes`, eq.id), { nombre: eq.nombre, color: eq.color, jugadores: eq.jugadores });
    }
    const emp = [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]];
    for (let i = 0; i < emp.length; i++) {
      await addDoc(collection(db, `torneos/${torneoRef.id}/partidos`), {
        equipoA: emp[i][0].toString(), equipoB: emp[i][1].toString(), golesA: 0, golesB: 0, detallesGoles: [], orden: i, tipo: "liguilla", finalizado: false
      });
    }
    setTorneoActivoId(torneoRef.id); setVista("torneo_en_curso");
  };

  const togglePagoRealtime = async (equipoId, jugadorIndex) => {
    if (!esAdmin) return;
    const equipo = equiposParticipantes.find((e) => e.id === equipoId);
    const nuevosJugadores = [...equipo.jugadores];
    nuevosJugadores[jugadorIndex].pagado = !nuevosJugadores[jugadorIndex].pagado;
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), { jugadores: nuevosJugadores });
  };

  const generarSemifinales = async () => {
    if (!esAdmin) return;
    const clas = clasificacion;
    const semis = [{ a: clas[0], b: clas[3], n: "Semifinal 1", o: 7 }, { a: clas[1], b: clas[2], n: "Semifinal 2", o: 8 }];
    for (const s of semis) {
      await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
        equipoA: s.a.id, equipoB: s.b.id, golesA: 0, golesB: 0, detallesGoles: [], tipo: "semifinal", nombrePartido: s.n, orden: s.o, finalizado: false
      });
    }
    await updateDoc(doc(db, "torneos", torneoActivoId), { estado: "semifinales" });
  };

  const generarFinal = async () => {
    if (!esAdmin) return;
    const s = partidos.filter((p) => p.tipo === "semifinal");
    const ganadores = s.map((p) => (p.golesA >= p.golesB ? p.equipoA : p.equipoB));
    await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
      equipoA: ganadores[0], equipoB: ganadores[1], golesA: 0, golesB: 0, detallesGoles: [], tipo: "final", nombrePartido: "GRAN FINAL", orden: 9, finalizado: false
    });
    await updateDoc(doc(db, "torneos", torneoActivoId), { estado: "final" });
  };

  const finalizarTorneo = async () => {
    if (!esAdmin) return;
    const pFinal = partidos.find((p) => p.tipo === "final");
    const idCamp = pFinal?.golesA >= pFinal?.golesB ? pFinal?.equipoA : pFinal?.equipoB;
    const nombreCamp = equiposParticipantes.find((e) => e.id === idCamp)?.nombre;
    await updateDoc(doc(db, "torneos", torneoActivoId), {
      estado: "finalizado", campeon: nombreCamp, campeonId: idCamp,
      pichichi: goleadoresTorneo[0]?.nombre || "---", golesPichichi: goleadoresTorneo[0]?.goles || 0,
    });
    setVista("menu");
  };

  // --- CÁLCULOS CLASIFICACIÓN (Mejorado con GC y DG) ---
  const clasificacion = equiposParticipantes.map((eq) => {
    let pts = 0, gf = 0, gc = 0;
    partidos.filter((p) => p.tipo === "liguilla" && p.finalizado).forEach((p) => {
      if (p.equipoA === eq.id || p.equipoB === eq.id) {
        const soyA = p.equipoA === eq.id;
        const mG = soyA ? p.golesA : p.golesB;
        const sG = soyA ? p.golesB : p.golesA;
        gf += mG; gc += sG;
        if (mG > sG) pts += 3; else if (mG === sG) pts += 1;
      }
    });
    return { ...eq, pts, gf, gc, dg: gf - gc };
  }).sort((a, b) => b.pts - a.pts || b.dg - a.dg);

  const goleadoresTorneo = (() => {
    const conteo = {};
    // Cambiado para que cuente TODOS los partidos del torneo actual
    partidos.forEach((p) => p.detallesGoles?.forEach((g) => (conteo[g.jugador] = (conteo[g.jugador] || 0) + 1)));
    return Object.entries(conteo).map(([nombre, goles]) => ({ nombre, goles })).sort((a, b) => b.goles - a.goles);
  })();

  const renderPartidosPorTipo = (tipo, titulo) => {
    const filtrados = partidos.filter((p) => p.tipo === tipo);
    if (filtrados.length === 0) return null;
    return (
      <div style={{ marginTop: "20px" }}>
        <h3 style={{ fontSize: "14px", color: "#555", borderBottom: "1px solid #ddd", paddingBottom: "5px" }}>{titulo}</h3>
        {filtrados.map((p) => (
          <div key={p.id} onClick={() => { setModalPartido(p); resetCronometro(); }} style={{...matchCardStyle(p.tipo), opacity: p.finalizado ? 0.7 : 1}}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#888", marginBottom: "5px" }}>
                <span>{p.nombrePartido || "PARTIDO"}</span>
                {p.finalizado && <span style={{color: "green", fontWeight: "bold"}}>FINALIZADO</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: '13px' }}>{equiposParticipantes.find((e) => e.id === p.equipoA)?.nombre}</span>
              <span style={{ background: "#333", color: "#fff", padding: "4px 12px", borderRadius: "8px", fontWeight: "bold" }}>{p.golesA} - {p.golesB}</span>
              <span style={{ flex: 1, textAlign: "right", fontSize: '13px' }}>{equiposParticipantes.find((e) => e.id === p.equipoB)?.nombre}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (cargandoAuth) return <div style={{ padding: "50px", textAlign: "center" }}>Cargando sistema...</div>;

  if (!user && !modoInvitado) {
    return (
      <div style={{ padding: "20px", textAlign: "center", width: "100%", maxWidth: "400px", margin: "auto" }}>
        <h1 style={{ color: "#1a73e8", marginBottom: "30px" }}>🏟️ Cup Manager</h1>
        <div style={formCardStyle}>
          <form onSubmit={manejarLogin}>
            <input type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
            <input type="password" placeholder="Contraseña" onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
            <button type="submit" style={{ ...mainBtnStyle, background: "#1a73e8", marginTop: "10px" }}>ENTRAR</button>
          </form>
          <button onClick={() => setModoInvitado(true)} style={{ ...mainBtnStyle, background: "#34a853", marginTop: "20px" }}>VER COMO ESPECTADOR</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "15px", maxWidth: "500px", margin: "0 auto", background: "#f0f2f5", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", background: "#fff", padding: "10px", borderRadius: "10px" }}>
        <span style={{ fontSize: "12px" }}>{user ? `👤 ${user.email.split("@")[0]}` : "👁️ Espectador"}</span>
        <button onClick={cerrarSesion} style={{ border: "none", background: "none", color: "red", fontWeight: "bold" }}>SALIR</button>
      </div>

      {vista === "menu" && (
        <div style={{ textAlign: "center" }}>
          <h1>🏟️ Torneo Manager</h1>
          {esAdmin && <button onClick={() => setVista("crear_torneo")} style={{ ...mainBtnStyle, background: "#4285f4" }}>➕ NUEVO TORNEO</button>}
          <button onClick={() => setVista("estadisticas_globales")} style={{ ...mainBtnStyle, background: "#34a853", marginTop: "10px" }}>🌍 RANKING GLOBAL</button>
          
          <h3 style={{ textAlign: "left", marginTop: "20px" }}>Historial</h3>
          {historial.length === 0 && <p style={{fontSize: '12px', color: '#888'}}>Cargando torneos o sin permisos...</p>}
          
          {historial.map((t) => (
            <div key={t.id} onClick={() => { setTorneoActivoId(t.id); setVista("torneo_en_curso"); }} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold" }}>{t.nombre}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>📅 {t.fecha} | {t.lugar}</div>
                {t.campeon && <div style={{ fontSize: "13px", color: "#d4af37", fontWeight: "bold", marginTop: "4px" }}>🏆 Ganador: {t.campeon}</div>}
              </div>
              {esAdmin && <button onClick={(e) => { e.stopPropagation(); if (window.confirm("¿Borrar?")) deleteDoc(doc(db, "torneos", t.id)); }} style={deleteIconStyle}>🗑️</button>}
            </div>
          ))}
        </div>
      )}

      {vista === "crear_torneo" && (
        <div>
          <button onClick={() => setVista("menu")} style={backBtnStyle}>← Volver</button>
          <h2>Nuevo Torneo</h2>
          <div style={formCardStyle}>
            <input value={nombreTorneo} placeholder="Nombre" onChange={(e) => setNombreTorneo(e.target.value)} style={inputStyle} />
            <div style={{ display: "flex", gap: "10px" }}>
              <input type="date" value={fechaTorneo} onChange={(e) => setFechaTorneo(e.target.value)} style={inputStyle} />
              <input type="time" value={horaTorneo} onChange={(e) => setHoraTorneo(e.target.value)} style={inputStyle} />
            </div>
            <input value={lugarTorneo} placeholder="📍 Lugar" onChange={(e) => setLugarTorneo(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>⏱️ Minutos fase (L/S/F):</label>
            <div style={{ display: "flex", gap: "5px" }}>
              {["liguilla", "semifinal", "final"].map((f) => (
                <input key={f} type="number" value={tiemposForm[f]} onChange={(e) => setTiemposForm({ ...tiemposForm, [f]: Number(e.target.value) })} style={inputStyle} />
              ))}
            </div>
          </div>
          {equiposForm.map((eq, i) => (
            <div key={eq.id} style={{ ...formCardStyle, borderLeft: `6px solid ${eq.color}` }}>
              <input value={eq.nombre} onChange={(e) => { const n = [...equiposForm]; n[i].nombre = e.target.value; setEquiposForm(n); }} style={inputStyle} />
              <button onClick={() => { const val = prompt("Nombre jugador:"); if (val) { const n = [...equiposForm]; n[i].jugadores.push({ nombre: val.trim(), pagado: false }); setEquiposForm(n); } }} style={{ ...mainBtnStyle, background: "#eee", color: "#333", fontSize: "12px" }}>+ Añadir Jugador</button>
              <div style={{ fontSize: "12px", marginTop: "5px" }}>{eq.jugadores.map((j) => j.nombre).join(", ")}</div>
            </div>
          ))}
          <button onClick={crearTorneo} style={{ ...mainBtnStyle, background: "#1a73e8" }}>EMPEZAR</button>
        </div>
      )}

      {vista === "estadisticas_globales" && (
        <div>
          <button onClick={() => setVista("menu")} style={backBtnStyle}>← Menú</button>
          <h2>🥇 Goleadores Históricos</h2>
          <div style={formCardStyle}>
            {rankingHistorico.map((j, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <span>{i + 1}. {j.nombre}</span><strong>{j.goles} ⚽</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === "torneo_en_curso" && (
        <div>
          <button onClick={() => setVista("menu")} style={backBtnStyle}>← Volver</button>
          
          {esAdmin && (
            <div style={{ ...formCardStyle, background: "#fff3e0" }}>
              <h3 style={{ marginTop: 0 }}>⚙️ Edición Admin</h3>
              <input type="date" disabled={datosTorneo.iniciado} value={datosTorneo.fecha || ""} onChange={(e) => actualizarDatosTorneo("fecha", e.target.value)} style={inputStyle} />
              <input type="time" disabled={datosTorneo.iniciado} value={datosTorneo.hora || ""} onChange={(e) => actualizarDatosTorneo("hora", e.target.value)} style={inputStyle} />
              <input disabled={datosTorneo.iniciado} value={datosTorneo.lugar || ""} onChange={(e) => actualizarDatosTorneo("lugar", e.target.value)} style={inputStyle} placeholder="Lugar" />
              <div style={{ display: "flex", gap: "5px" }}>
                {["liguilla", "semifinal", "final"].map((f) => (
                  <div key={f} style={{ flex: 1 }}>
                    <span style={{ fontSize: "10px" }}>{f}</span>
                    <input type="number" value={datosTorneo.tiempos?.[f] || ""} onChange={(e) => actualizarDatosTorneo("tiempos", { ...datosTorneo.tiempos, [f]: Number(e.target.value) })} style={inputStyle} />
                  </div>
                ))}
              </div>
              {!datosTorneo.iniciado && <button onClick={() => actualizarDatosTorneo("iniciado", true)} style={{ ...mainBtnStyle, background: "#34a853", marginTop: "10px" }}>🚀 INICIAR TORNEO (Bloquear Datos)</button>}
            </div>
          )}

          <div style={formCardStyle}>
            <h3>💰 Control de Pagos</h3>
            {equiposParticipantes.map((eq) => (
              <div key={eq.id} style={{ marginBottom: "10px" }}>
                <div style={{ fontWeight: "bold", fontSize: "14px", borderBottom: "1px solid #eee" }}>{eq.nombre}</div>
                {eq.jugadores?.map((j, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", margin: "5px 0" }}>
                    <span style={{ fontSize: "13px" }}>{j.nombre}</span>
                    <button onClick={() => togglePagoRealtime(eq.id, i)} style={{ background: j.pagado ? "#34a853" : "#ddd", border: "none", borderRadius: "10px", padding: "2px 8px", fontSize: "10px", color: j.pagado ? "white" : "black" }}>{j.pagado ? "PAGADO" : "PENDIENTE"}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={formCardStyle}>
            <h3>Clasificación</h3>
            <div style={{overflowX: 'auto'}}>
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ color: "#888", borderBottom: '1px solid #eee' }}>
                    <th style={{textAlign: 'left', padding: '5px'}}>EQ</th>
                    <th>PTS</th><th>GF</th><th>GC</th><th>DG</th>
                    </tr>
                </thead>
                <tbody>
                    {clasificacion.map((eq) => (
                    <tr key={eq.id} style={{borderBottom: '1px solid #f9f9f9'}}>
                        <td style={{ borderLeft: `4px solid ${eq.color}`, padding: "8px 5px", fontWeight: 'bold' }}>{eq.nombre}</td>
                        <td style={{ textAlign: "center", fontWeight: 'bold' }}>{eq.pts}</td>
                        <td style={{ textAlign: "center" }}>{eq.gf}</td>
                        <td style={{ textAlign: "center", color: '#999' }}>{eq.gc}</td>
                        <td style={{ textAlign: "center", color: eq.dg > 0 ? 'green' : eq.dg < 0 ? 'red' : '#333' }}>{eq.dg}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
          </div>

          <div style={formCardStyle}>
            <h3>Pichichi</h3>
            {goleadoresTorneo.slice(0, 5).map((g, i) => <div key={i}>{g.nombre}: {g.goles} ⚽</div>)}
          </div>

          {renderPartidosPorTipo("final", "🏆 GRAN FINAL")}
          {renderPartidosPorTipo("semifinal", "⚔️ SEMIFINALES")}
          {renderPartidosPorTipo("liguilla", "📅 FASE DE LIGUILLA")}

          {esAdmin && datosTorneo.estado !== "finalizado" && (
            <div style={{ marginTop: "20px" }}>
              <button onClick={generarSemifinales} style={{ ...mainBtnStyle, background: "orange", marginBottom: "5px" }}>GENERAR SEMIFINALES</button>
              <button onClick={generarFinal} style={{ ...mainBtnStyle, background: "red", marginBottom: "5px" }}>GENERAR FINAL</button>
              <button onClick={finalizarTorneo} style={{ ...mainBtnStyle, background: "#000" }}>CERRAR TORNEO</button>
            </div>
          )}
        </div>
      )}

      {modalPartido && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "40px", margin: "10px 0" }}>{formatearTiempo(segundos)}</h2>
              {esAdmin && !modalPartido.finalizado && (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button onClick={() => setCorriendo(!corriendo)} style={{ background: corriendo ? "red" : "green", color: "white", padding: "10px", borderRadius: "8px", border: "none" }}>{corriendo ? "PAUSA" : "INICIAR"}</button>
                  <button onClick={resetCronometro} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ddd" }}>RESET</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: "20px" }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <strong style={{ fontSize: "12px" }}>{equiposParticipantes.find((e) => e.id === modalPartido.equipoA)?.nombre}</strong>
                <div style={{ fontSize: "40px", fontWeight: "bold" }}>{partidos.find(p => p.id === modalPartido.id)?.golesA}</div>
                {esAdmin && !modalPartido.finalizado && equiposParticipantes.find((e) => e.id === modalPartido.equipoA)?.jugadores.map((j) => (
                  <button key={j.nombre} onClick={() => anotarGolDirecto(modalPartido.id, j.nombre, modalPartido.equipoA)} style={{ display: "block", width: "100%", fontSize: "10px", marginBottom: "2px" }}>{j.nombre}</button>
                ))}
              </div>
              <div style={{ fontWeight: "bold", alignSelf: 'center' }}>VS</div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <strong style={{ fontSize: "12px" }}>{equiposParticipantes.find((e) => e.id === modalPartido.equipoB)?.nombre}</strong>
                <div style={{ fontSize: "40px", fontWeight: "bold" }}>{partidos.find(p => p.id === modalPartido.id)?.golesB}</div>
                {esAdmin && !modalPartido.finalizado && equiposParticipantes.find((e) => e.id === modalPartido.equipoB)?.jugadores.map((j) => (
                  <button key={j.nombre} onClick={() => anotarGolDirecto(modalPartido.id, j.nombre, modalPartido.equipoB)} style={{ display: "block", width: "100%", fontSize: "10px", marginBottom: "2px" }}>{j.nombre}</button>
                ))}
              </div>
            </div>

            {/* LISTADO DE GOLEADORES DEL PARTIDO */}
            <div style={{marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px'}}>
              <h4 style={{fontSize: '12px', margin: '0 0 5px 0', color: '#555'}}>Goleadores:</h4>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center'}}>
                {partidos.find(p => p.id === modalPartido.id)?.detallesGoles?.map((gol, idx) => (
                  <span key={idx} style={{fontSize: '11px', background: '#f0f0f0', padding: '2px 8px', borderRadius: '10px'}}>⚽ {gol.jugador}</span>
                )) || <span style={{fontSize: '11px', color: '#999'}}>Sin goles</span>}
              </div>
            </div>

            {esAdmin && !modalPartido.finalizado && (
              <button onClick={() => finalizarPartidoManual(modalPartido.id)} style={{ ...mainBtnStyle, background: "#fb8c00", marginTop: "20px" }}>
                🏁 FINALIZAR PARTIDO
              </button>
            )}

            <button onClick={() => { setModalPartido(null); setCorriendo(false); }} style={{ ...mainBtnStyle, background: "#333", marginTop: "10px" }}>CERRAR</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ESTILOS
const cardStyle = { background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "10px", display: "flex", alignItems: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", cursor: "pointer" };
const formCardStyle = { background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "15px" };
const inputStyle = { width: "100%", padding: "10px", marginBottom: "10px", borderRadius: "8px", border: "1px solid #ddd", boxSizing: "border-box" };
const mainBtnStyle = { width: "100%", padding: "12px", borderRadius: "8px", border: "none", color: "#fff", fontWeight: "bold", cursor: "pointer" };
const backBtnStyle = { background: "none", border: "none", color: "#1a73e8", fontWeight: "bold", marginBottom: "10px", cursor: "pointer" };
const deleteIconStyle = { background: "none", border: "none", cursor: "pointer", marginLeft: "10px" };
const modalOverlayStyle = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "20px", width: "90%", maxWidth: "400px" };
const labelStyle = { display: "block", fontSize: "11px", fontWeight: "bold", color: "#666", marginBottom: "4px", marginTop: "10px" };
const matchCardStyle = (tipo) => ({ background: "#fff", padding: "12px", borderRadius: "12px", marginBottom: "10px", border: tipo === "final" ? "2px solid #ffd700" : "1px solid #eee", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" });

export default App;