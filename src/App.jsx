import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "./firebase";
import {
  collection, addDoc, doc, setDoc, onSnapshot,
  updateDoc, query, orderBy, deleteDoc, getDocs,
} from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

import Clasificacion from "./components/Clasificacion";
import ModalPartido from "./components/ModalPartido";
import CrearTorneo from "./components/CrearTorneo";
import "./App.css";

function App() {
  // --- ESTADOS DE AUTH Y NAVEGACIÓN ---
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [modoInvitado, setModoInvitado] = useState(false);
  const [vista, setVista] = useState("menu");

  const admins = import.meta.env.VITE_ADMIN_EMAILS ? import.meta.env.VITE_ADMIN_EMAILS.split(",") : [];
  const esAdmin = user && admins.includes(user.email);

  // --- ESTADOS DEL TORNEO ACTIVO ---
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

  // --- EFFECTS (FIREBASE REALTIME) ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCargandoAuth(false);
      if (currentUser) { setModoInvitado(false); setVista("menu"); }
    });
    return () => unsub();
  }, []);

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

  // --- LÓGICA DE CRONÓMETRO ---
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

  // --- FUNCIONES ---
  const manejarLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); setVista("menu"); }
    catch { alert("Error: Credenciales incorrectas"); }
  };

  const cerrarSesion = () => { signOut(auth); setModoInvitado(false); setVista("menu"); };

  const ejecutarFinal = () => {
    const audio = new Audio("/alarma.mp3");
    audioRef.current = audio;
    audio.play().then(() => {
      setTimeout(() => {
        alert("¡FINAL DEL PARTIDO!");
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      }, 150);
    }).catch(() => alert("¡FINAL DEL PARTIDO!"));
  };

  const resetCronometro = () => { setCorriendo(false); setSegundos(0); setSilbatoTocado(false); };
  const formatearTiempo = (s) => {
    const mins = Math.floor(s / 60);
    const segs = s % 60;
    return `${mins}:${segs < 10 ? "0" : ""}${segs}`;
  };

  const manejarCreacionTorneo = async (datos) => {
    if (!esAdmin) return;
    const { nombreTorneo, fechaTorneo, horaTorneo, lugarTorneo, tiemposForm, equiposForm, idaYVuelta } = datos;
    const n = equiposForm.length;

    const torneoRef = await addDoc(collection(db, "torneos"), {
      nombre: nombreTorneo, fecha: fechaTorneo, hora: horaTorneo, lugar: lugarTorneo,
      estado: "liguilla", campeon: "", tiempos: tiemposForm, iniciado: false,
      numEquipos: n, idaYVuelta: idaYVuelta || false
    });

    const usarGrupos = (n === 6 || n === 8);
    const mitad = n / 2;

    for (let i = 0; i < n; i++) {
      const grupo = usarGrupos ? (i < mitad ? "A" : "B") : null;
      await setDoc(doc(db, `torneos/${torneoRef.id}/equipos_participantes`, equiposForm[i].id), {
        nombre: equiposForm[i].nombre,
        color: equiposForm[i].color,
        jugadores: [],
        grupo: grupo
      });
    }

    let orden = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const mismoGrupo = usarGrupos ? 
          ((i < mitad && j < mitad) || (i >= mitad && j >= mitad)) : true;

        if (mismoGrupo) {
          // IDA
          await addDoc(collection(db, `torneos/${torneoRef.id}/partidos`), {
            equipoA: equiposForm[i].id, equipoB: equiposForm[j].id, golesA: 0, golesB: 0,
            detallesGoles: [], orden: orden++, tipo: "liguilla", finalizado: false,
            nombrePartido: idaYVuelta ? "LIGUILLA (IDA)" : "LIGUILLA"
          });
          // VUELTA
          if (idaYVuelta) {
            await addDoc(collection(db, `torneos/${torneoRef.id}/partidos`), {
              equipoA: equiposForm[j].id, equipoB: equiposForm[i].id, golesA: 0, golesB: 0,
              detallesGoles: [], orden: orden++, tipo: "liguilla", finalizado: false,
              nombrePartido: "LIGUILLA (VUELTA)"
            });
          }
        }
      }
    }
    setTorneoActivoId(torneoRef.id);
    setVista("torneo_en_curso");
  };

  const generarFaseFinal = async () => {
    const liguillaFinalizada = partidos.filter(p => p.tipo === "liguilla").every(p => p.finalizado);
    if (!liguillaFinalizada) return alert("Primero termina todos los partidos de liguilla.");
    if (!window.confirm("¿Generar cruces de fase final?")) return;

    const n = equiposParticipantes.length;
    const usarGrupos = (n === 6 || n === 8);

    const obtenerRanking = (lista) => {
      return lista.map(eq => {
        let pts = 0, dg = 0;
        partidos.filter(p => p.tipo === "liguilla" && p.finalizado && (p.equipoA === eq.id || p.equipoB === eq.id))
          .forEach(p => {
            const soyA = p.equipoA === eq.id;
            const mG = soyA ? p.golesA : p.golesB;
            const sG = soyA ? p.golesB : p.golesA;
            dg += (mG - sG);
            if (mG > sG) pts += 3; else if (mG === sG) pts += 1;
          });
        return { ...eq, pts, dg };
      }).sort((a, b) => b.pts - a.pts || b.dg - a.dg);
    };

    if (usarGrupos) {
      const rankA = obtenerRanking(equiposParticipantes.filter(e => e.grupo === "A"));
      const rankB = obtenerRanking(equiposParticipantes.filter(e => e.grupo === "B"));

      // Semis
      const semis = [
        { a: rankA[0], b: rankB[1], n: "Semifinal 1 (1ºA vs 2ºB)" },
        { a: rankB[0], b: rankA[1], n: "Semifinal 2 (1ºB vs 2ºA)" }
      ];
      for (let s of semis) {
        await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
          equipoA: s.a.id, equipoB: s.b.id, golesA: 0, golesB: 0, detallesGoles: [], orden: 100, tipo: "semifinal", finalizado: false, nombrePartido: s.n
        });
      }
      // 5º Puesto
      await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
        equipoA: rankA[2].id, equipoB: rankB[2].id, golesA: 0, golesB: 0, detallesGoles: [], orden: 99, tipo: "liguilla", finalizado: false, nombrePartido: "5º y 6º PUESTO"
      });
    } else {
      const rank = obtenerRanking(equiposParticipantes);
      await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
        equipoA: rank[0].id, equipoB: rank[1].id, golesA: 0, golesB: 0, detallesGoles: [], orden: 110, tipo: "final", finalizado: false, nombrePartido: "GRAN FINAL"
      });
    }
    alert("Cruces generados.");
  };

  const generarGranFinal = async () => {
    const semis = partidos.filter(p => p.tipo === "semifinal");
    if (semis.length < 2 || !semis.every(p => p.finalizado)) return alert("Las semifinales deben terminar primero.");
    
    const ganadores = semis.map(p => p.golesA > p.golesB ? p.equipoA : p.equipoB);
    const perdedores = semis.map(p => p.golesA > p.golesB ? p.equipoB : p.equipoA);

    await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
      equipoA: ganadores[0], equipoB: ganadores[1], golesA: 0, golesB: 0, detallesGoles: [], orden: 120, tipo: "final", finalizado: false, nombrePartido: "GRAN FINAL"
    });
    await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
      equipoA: perdedores[0], equipoB: perdedores[1], golesA: 0, golesB: 0, detallesGoles: [], orden: 115, tipo: "final", finalizado: false, nombrePartido: "3er y 4º PUESTO"
    });
    alert("¡Final y 3er puesto listos!");
  };

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
    if (window.confirm("¿Deseas finalizar el partido?")) {
      await updateDoc(doc(db, `torneos/${torneoActivoId}/partidos`, partidoId), { finalizado: true });
      setModalPartido(null); resetCronometro();
    }
  };

  const togglePagoRealtime = async (equipoId, jugadorIndex) => {
    if (!esAdmin) return;
    const equipo = equiposParticipantes.find((e) => e.id === equipoId);
    const nuevosJugadores = [...equipo.jugadores];
    nuevosJugadores[jugadorIndex].pagado = !nuevosJugadores[jugadorIndex].pagado;
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), { jugadores: nuevosJugadores });
  };

  const goleadoresTorneo = (() => {
    const conteo = {};
    partidos.forEach((p) => p.detallesGoles?.forEach((g) => (conteo[g.jugador] = (conteo[g.jugador] || 0) + 1)));
    return Object.entries(conteo).map(([nombre, goles]) => ({ nombre, goles })).sort((a, b) => b.goles - a.goles);
  })();

  const añadirJugador = async (equipoId, nombre) => {
    if (!esAdmin) return;
    const equipo = equiposParticipantes.find(e => e.id === equipoId);
    const nuevosJugadores = [...(equipo.jugadores || []), { nombre, pagado: false }];
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), { jugadores: nuevosJugadores });
  };

  const eliminarJugador = async (equipoId, index) => {
    if (!esAdmin || !window.confirm("¿Eliminar jugador?")) return;
    const equipo = equiposParticipantes.find(e => e.id === equipoId);
    const nuevosJugadores = equipo.jugadores.filter((_, i) => i !== index);
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), { jugadores: nuevosJugadores });
  };

  const compartirClasificacion = () => {
    let texto = `🏆 *${datosTorneo.nombre}*\n`;
    texto += `--------------------------\n`;
    texto += `⚽ *Goleadores Actuales:*\n`;
    goleadoresTorneo.slice(0, 5).forEach((g, i) => {
      texto += `${i + 1}. ${g.nombre} (${g.goles} ⚽)\n`;
    });
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  };

  const renderPartidosPorTipo = (tipo, titulo) => {
    const filtrados = partidos.filter((p) => p.tipo === tipo);
    if (filtrados.length === 0) return null;
    return (
      <div style={{ marginTop: "20px" }}>
        <h3 style={{ fontSize: "14px", color: "#555", borderBottom: "1px solid #ddd", paddingBottom: "5px" }}>{titulo}</h3>
        {filtrados.map((p) => (
          <div key={p.id} onClick={() => { setModalPartido(p); resetCronometro(); }} className="match-card-clickable" style={{ opacity: p.finalizado ? 0.7 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#888", marginBottom: "5px" }}>
              <span>{p.nombrePartido || "PARTIDO"}</span>
              {p.finalizado && <span style={{ color: "green", fontWeight: "bold" }}>FINALIZADO</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 'bold' }}>{equiposParticipantes.find((e) => e.id === p.equipoA)?.nombre}</span>
              <span style={{ background: "#333", color: "#fff", padding: "4px 12px", borderRadius: "8px", fontWeight: "bold" }}>{p.golesA} - {p.golesB}</span>
              <span style={{ flex: 1, textAlign: "right", fontSize: '13px', fontWeight: 'bold' }}>{equiposParticipantes.find((e) => e.id === p.equipoB)?.nombre}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // --- DISEÑOS ---
  const mainBtnStyle = { width: "100%", padding: "12px", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "bold", cursor: "pointer" };
  const inputStyle = { width: "100%", padding: "10px", marginBottom: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" };
  const formCardStyle = { background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "15px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" };
  const cardStyle = { background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "10px", display: "flex", alignItems: "center", cursor: "pointer" };
  const deleteIconStyle = { background: "none", border: "none", fontSize: "18px", cursor: "pointer", marginLeft: "10px" };
  const backBtnStyle = { background: "none", border: "none", color: "#1a73e8", fontWeight: "bold", marginBottom: "10px", cursor: "pointer" };

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
          {historial.map((t) => (
            <div key={t.id} onClick={() => { setTorneoActivoId(t.id); setVista("torneo_en_curso"); }} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold" }}>{t.nombre}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>📅 {t.fecha} | {t.lugar}</div>
                {t.campeon && <div style={{ fontSize: "13px", color: "#d4af37", fontWeight: "bold", marginTop: "4px" }}>🏆 {t.campeon}</div>}
              </div>
              {esAdmin && <button onClick={(e) => { e.stopPropagation(); if (window.confirm("¿Borrar?")) deleteDoc(doc(db, "torneos", t.id)); }} style={deleteIconStyle}>🗑️</button>}
            </div>
          ))}
        </div>
      )}

      {vista === "crear_torneo" && (
        <CrearTorneo alCrear={manejarCreacionTorneo} alCancelar={() => setVista("menu")} mainBtnStyle={mainBtnStyle} inputStyle={inputStyle} formCardStyle={formCardStyle} />
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
              <h3 style={{ marginTop: 0 }}>⚙️ Datos del Evento</h3>
              <input type="date" value={datosTorneo.fecha || ""} onChange={(e) => actualizarDatosTorneo("fecha", e.target.value)} style={inputStyle} />
              <input type="time" value={datosTorneo.hora || ""} onChange={(e) => actualizarDatosTorneo("hora", e.target.value)} style={inputStyle} />
              <input value={datosTorneo.lugar || ""} onChange={(e) => actualizarDatosTorneo("lugar", e.target.value)} style={inputStyle} placeholder="Lugar" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={generarFaseFinal} style={{ ...mainBtnStyle, background: '#f39c12', flex: 1 }}>⚡ SEMIS / FINAL</button>
                <button onClick={generarGranFinal} style={{ ...mainBtnStyle, background: '#9b59b6', flex: 1 }}>🏆 GENERAR FINAL</button>
              </div>
            </div>
          )}

          <div style={formCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>👥 Plantillas y Pagos</h3>
              <button onClick={compartirClasificacion} style={{ background: '#25D366', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 10px', fontSize: '12px', fontWeight: 'bold' }}>
                WhatsApp 🔗
              </button>
            </div>
            {equiposParticipantes.map((eq) => (
              <div key={eq.id} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong style={{ color: eq.color }}>{eq.nombre} {eq.grupo ? `(Gr. ${eq.grupo})` : ''}</strong>
                  {esAdmin && (
                    <button onClick={() => { const n = prompt("Nombre:"); if(n) añadirJugador(eq.id, n); }} style={{ fontSize: '10px', padding: '2px 8px' }}>+ Jugador</button>
                  )}
                </div>
                {eq.jugadores?.map((j, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", margin: "5px 0", alignItems: 'center', background: '#f9f9f9', padding: '5px', borderRadius: '5px' }}>
                    <span style={{ fontSize: "13px" }}>
                      {j.nombre}
                      {esAdmin && <button onClick={() => eliminarJugador(eq.id, i)} style={{ border: 'none', background: 'none', color: 'red', marginLeft: '5px' }}>×</button>}
                    </span>
                    <button
                      onClick={() => togglePagoRealtime(eq.id, i)}
                      style={{ background: j.pagado ? "#34a853" : "#d93025", color: "white", border: "none", borderRadius: "12px", padding: "4px 10px", fontSize: "10px", fontWeight: 'bold', minWidth: '85px' }}
                    >
                      {j.pagado ? "✅ PAGADO" : "❌ PENDIENTE"}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <Clasificacion equipos={equiposParticipantes} partidos={partidos} />

          <div style={formCardStyle}>
            <h3>🎯 Top Goleadores</h3>
            {goleadoresTorneo.slice(0, 5).map((g, i) => <div key={i} style={{fontSize: '14px', margin: '5px 0'}}>{i+1}. {g.nombre}: <strong>{g.goles} ⚽</strong></div>)}
          </div>

          {renderPartidosPorTipo("final", "🏆 GRAN FINAL")}
          {renderPartidosPorTipo("semifinal", "⚔️ SEMIFINALES")}
          {renderPartidosPorTipo("liguilla", "📅 FASE DE GRUPOS / LIGUILLA")}
        </div>
      )}

      {modalPartido && (
        <ModalPartido
          partido={partidos.find(p => p.id === modalPartido?.id)}
          equipos={equiposParticipantes}
          esAdmin={esAdmin}
          segundos={segundos}
          corriendo={corriendo}
          setCorriendo={setCorriendo}
          resetCronometro={resetCronometro}
          formatearTiempo={formatearTiempo}
          anotarGolDirecto={anotarGolDirecto}
          finalizarPartidoManual={finalizarPartidoManual}
          cerrarModal={() => { setModalPartido(null); setCorriendo(false); }}
        />
      )}
    </div>
  );
}
export default App;