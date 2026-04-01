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
  // --- ESTADOS ---
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [modoInvitado, setModoInvitado] = useState(false);
  const [vista, setVista] = useState("menu");

  const admins = import.meta.env.VITE_ADMIN_EMAILS ? import.meta.env.VITE_ADMIN_EMAILS.split(",") : [];
  const esAdmin = user && admins.includes(user.email);

  const [torneoActivoId, setTorneoActivoId] = useState(null);
  const [datosTorneo, setDatosTorneo] = useState({});
  const [equiposParticipantes, setEquiposParticipantes] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [modalPartido, setModalPartido] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [rankingHistorico, setRankingHistorico] = useState([]);

  const [segundos, setSegundos] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const timerRef = useRef(null);

  // --- EFFECTS ---
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

  // --- LÓGICA DE DESCANSO EQUITATIVO ---
  const mezclarConDescanso = (lista) => {
    let copia = [...lista];
    // Mezcla inicial aleatoria
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }

    let resultado = [];
    while (copia.length > 0) {
      let ultimo = resultado[resultado.length - 1];
      let indiceEncontrado = -1;

      for (let i = 0; i < copia.length; i++) {
        const p = copia[i];
        const coincidencia = ultimo && (
          p.equipoA === ultimo.equipoA || p.equipoA === ultimo.equipoB ||
          p.equipoB === ultimo.equipoA || p.equipoB === ultimo.equipoB
        );
        if (!coincidencia) {
          indiceEncontrado = i;
          break;
        }
      }

      if (indiceEncontrado !== -1) {
        resultado.push(copia.splice(indiceEncontrado, 1)[0]);
      } else {
        resultado.push(copia.splice(0, 1)[0]);
      }
    }
    return resultado;
  };

  // --- FUNCIONES DE ACCIÓN ---
  const manejarLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); setVista("menu"); }
    catch { alert("Error: Credenciales incorrectas"); }
  };

  const cerrarSesion = () => { signOut(auth); setModoInvitado(false); setVista("menu"); };

  const resetCronometro = () => { setCorriendo(false); setSegundos(0); };
  const formatearTiempo = (s) => {
    const mins = Math.floor(s / 60);
    const segs = s % 60;
    return `${mins}:${segs < 10 ? "0" : ""}${segs}`;
  };

  const actualizarEquipo = async (equipoId, nuevoNombre, nuevoColor) => {
    if (!esAdmin) return;
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), {
      nombre: nuevoNombre, color: nuevoColor
    });
  };

  const regenerarPartidosLiguilla = async () => {
    if (!esAdmin || !window.confirm("¿Seguro? Se optimizarán los descansos y se borrarán resultados actuales.")) return;

    const snap = await getDocs(collection(db, `torneos/${torneoActivoId}/partidos`));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, `torneos/${torneoActivoId}/partidos`, d.id))));

    const n = equiposParticipantes.length;
    const usarGrupos = (n === 6 || n === 8);
    const idaYVuelta = datosTorneo.idaYVuelta;

    let lista = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const mismoGrupo = usarGrupos ? (equiposParticipantes[i].grupo === equiposParticipantes[j].grupo) : true;
        if (mismoGrupo) {
          lista.push({ equipoA: equiposParticipantes[i].id, equipoB: equiposParticipantes[j].id, tipo: "liguilla", nombrePartido: "LIGUILLA" });
          if (idaYVuelta) lista.push({ equipoA: equiposParticipantes[j].id, equipoB: equiposParticipantes[i].id, tipo: "liguilla", nombrePartido: "LIGUILLA (V)" });
        }
      }
    }

    const finalOrdenados = mezclarConDescanso(lista);
    for (let index = 0; index < finalOrdenados.length; index++) {
      await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
        ...finalOrdenados[index], golesA: 0, golesB: 0, detallesGoles: [], finalizado: false, orden: index
      });
    }
    alert("Calendario optimizado generado.");
  };

  // --- LÓGICA AUTOMÁTICA DE FASE FINAL ---

  const generarSemis = async () => {
    if (!esAdmin || !window.confirm("¿Generar Semifinales basadas en la clasificación actual?")) return;

    // 1. Obtenemos la clasificación actual (usando la misma lógica que tu componente Clasificacion)
    // Nota: Esta lógica asume que ya tienes los puntos calculados o que los calculamos aquí rápido
    const stats = equiposParticipantes.map(eq => {
      let pts = 0;
      partidos.filter(p => p.finalizado && p.tipo === "liguilla").forEach(p => {
        if (p.equipoA === eq.id) {
          if (p.golesA > p.golesB) pts += 3;
          else if (p.golesA === p.golesB) pts += 1;
        } else if (p.equipoB === eq.id) {
          if (p.golesB > p.golesA) pts += 3;
          else if (p.golesB === p.golesA) pts += 1;
        }
      });
      return { ...eq, puntos: pts };
    });

    // Ordenamos por puntos
    const ordenados = stats.sort((a, b) => b.puntos - a.puntos);

    if (ordenados.length < 4) {
      alert("Necesitas al menos 4 equipos para semis.");
      return;
    }

    // 2. Creamos los emparejamientos (1º vs 4º y 2º vs 3º)
    const semis = [
      { a: ordenados[0], b: ordenados[3], nombre: "SEMIFINAL 1 (1º vs 4º)" },
      { a: ordenados[1], b: ordenados[2], nombre: "SEMIFINAL 2 (2º vs 3º)" }
    ];

    for (let i = 0; i < semis.length; i++) {
      await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
        equipoA: semis[i].a.id,
        equipoB: semis[i].b.id,
        tipo: "semifinal",
        nombrePartido: semis[i].nombre,
        golesA: 0,
        golesB: 0,
        finalizado: false,
        orden: partidos.length + i // Van al final de la lista
      });
    }

    await actualizarDatosTorneo("estado", "semifinales");
    alert("Semifinales generadas con éxito.");
  };

  const generarGranFinal = async () => {
    if (!esAdmin) return;

    // Buscamos las semis finalizadas para ver quién ganó
    const semis = partidos.filter(p => p.tipo === "semifinal" && p.finalizado);

    if (semis.length < 2) {
      alert("Primero debes finalizar las dos semifinales.");
      return;
    }

    const ganador1 = semis[0].golesA > semis[0].golesB ? semis[0].equipoA : semis[0].equipoB;
    const ganador2 = semis[1].golesA > semis[1].golesB ? semis[1].equipoA : semis[1].equipoB;

    await addDoc(collection(db, `torneos/${torneoActivoId}/partidos`), {
      equipoA: ganador1,
      equipoB: ganador2,
      tipo: "final",
      nombrePartido: "🏆 GRAN FINAL",
      golesA: 0,
      golesB: 0,
      finalizado: false,
      orden: partidos.length + 1
    });

    await actualizarDatosTorneo("estado", "final");
    alert("¡La Gran Final ha sido generada!");
  };

  const moverPartido = async (indexActual, direccion) => {
    if (!esAdmin) return;
    const nuevoIndex = indexActual + direccion;
    if (nuevoIndex < 0 || nuevoIndex >= partidos.length) return;
    const pA = partidos[indexActual];
    const pB = partidos[nuevoIndex];
    await updateDoc(doc(db, `torneos/${torneoActivoId}/partidos`, pA.id), { orden: nuevoIndex });
    await updateDoc(doc(db, `torneos/${torneoActivoId}/partidos`, pB.id), { orden: indexActual });
  };

  const actualizarDatosTorneo = async (campo, valor) => {
    if (!esAdmin || !torneoActivoId) return;
    await updateDoc(doc(db, "torneos", torneoActivoId), { [campo]: valor });
  };

  const anotarGolDirecto = async (partidoId, jugadorNombre, equipoId) => {
    const pData = partidos.find((p) => p.id === partidoId);
    if (!esAdmin || pData.finalizado) return;
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

  const añadirJugador = async (equipoId, nombre) => {
    const equipo = equiposParticipantes.find(e => e.id === equipoId);
    const nuevosJugadores = [...(equipo.jugadores || []), { nombre, pagado: false }];
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), { jugadores: nuevosJugadores });
  };

  const eliminarJugador = async (equipoId, index) => {
    if (!window.confirm("¿Eliminar jugador?")) return;
    const equipo = equiposParticipantes.find(e => e.id === equipoId);
    const nuevosJugadores = equipo.jugadores.filter((_, i) => i !== index);
    await updateDoc(doc(db, `torneos/${torneoActivoId}/equipos_participantes`, equipoId), { jugadores: nuevosJugadores });
  };

  const togglePagoRealtime = async (equipoId, jugadorIndex) => {
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

  const renderPartidosPorTipo = (tipo, titulo) => {
    const filtrados = partidos.filter((p) => p.tipo === tipo);
    if (filtrados.length === 0) return null;

    return (
      <div style={{ marginTop: "20px" }}>
        <h3 className="section-title">{titulo}</h3>
        {filtrados.map((p) => {
          const idxGlobal = partidos.indexOf(p);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              {esAdmin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button onClick={() => moverPartido(idxGlobal, -1)} disabled={idxGlobal === 0} className="btn-orden">▲</button>
                  <button onClick={() => moverPartido(idxGlobal, 1)} disabled={idxGlobal === partidos.length - 1} className="btn-orden">▼</button>
                </div>
              )}
              <div onClick={() => { setModalPartido(p); resetCronometro(); }} className="match-card-clickable" style={{ flex: 1, margin: 0, opacity: p.finalizado ? 0.7 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#888", marginBottom: "5px" }}>
                  <span>{p.nombrePartido}</span>
                  {p.finalizado && <span style={{ color: "green", fontWeight: "bold" }}>FINALIZADO</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="team-name">{equiposParticipantes.find(e => e.id === p.equipoA)?.nombre}</span>
                  <span className="score-badge">{p.golesA} - {p.golesB}</span>
                  <span className="team-name" style={{ textAlign: "right" }}>{equiposParticipantes.find(e => e.id === p.equipoB)?.nombre}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const mainBtnStyle = { width: "100%", padding: "12px", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "bold", cursor: "pointer" };
  const inputStyle = { width: "100%", padding: "10px", marginBottom: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box", color: "#333", background: "#fff" };
  const formCardStyle = { background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "15px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" };
  const cardStyle = { background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "10px", display: "flex", alignItems: "center", cursor: "pointer" };
  const backBtnStyle = { background: "none", border: "none", color: "#1a73e8", fontWeight: "bold", marginBottom: "10px", cursor: "pointer" };

  if (cargandoAuth) return <div className="loading">Cargando sistema...</div>;

  if (!user && !modoInvitado) {
    return (
      <div className="login-screen">
        <h1 className="main-title">🏟️ Cup Manager</h1>
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
    <div className="app-container">
      <div className="user-bar">
        <span className="user-name">{user ? `👤 ${user.email.split("@")[0]}` : "👁️ Espectador"}</span>
        <button onClick={cerrarSesion} className="btn-exit">SALIR</button>
      </div>

      {vista === "menu" && (
        <div style={{ textAlign: "center" }}>
          <h1 className="main-title">Torneo Manager</h1>
          {esAdmin && <button onClick={() => setVista("crear_torneo")} style={{ ...mainBtnStyle, background: "#4285f4" }}>➕ NUEVO TORNEO</button>}
          <h3 className="section-title" style={{ textAlign: 'left', marginTop: '20px' }}>Historial</h3>
          {historial.map((t) => (
            <div key={t.id} onClick={() => { setTorneoActivoId(t.id); setVista("torneo_en_curso"); }} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div className="tournament-name">{t.nombre}</div>
                <div className="tournament-meta">📅 {t.fecha} | {t.lugar}</div>
                {t.campeon && <div className="winner-tag">🏆 {t.campeon}</div>}
              </div>
              {esAdmin && <button onClick={(e) => { e.stopPropagation(); if (window.confirm("¿Borrar?")) deleteDoc(doc(db, "torneos", t.id)); }} className="btn-delete">🗑️</button>}
            </div>
          ))}
        </div>
      )}

      {vista === "crear_torneo" && (
        <CrearTorneo alCrear={(d) => { setVista("menu"); }} alCancelar={() => setVista("menu")} mainBtnStyle={mainBtnStyle} inputStyle={inputStyle} formCardStyle={formCardStyle} />
      )}

      {vista === "torneo_en_curso" && (
        <div>
          <button onClick={() => setVista("menu")} style={backBtnStyle}>← Volver</button>

          {esAdmin && datosTorneo.estado !== "finalizado" && (
            <div style={{ ...formCardStyle, background: "#e3f2fd", border: "1px solid #90caf9" }}>
              <h3 style={{ marginTop: 0, color: "#1565c0" }}>🛠️ Panel de Control</h3>
              <input value={datosTorneo.nombre || ""} onChange={(e) => actualizarDatosTorneo("nombre", e.target.value)} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={regenerarPartidosLiguilla} style={{ ...mainBtnStyle, background: '#e67e22', fontSize: '11px' }}>🔄 REGENERAR LIGUILLA</button>
                <button onClick={generarSemis} style={{ ...mainBtnStyle, background: '#f39c12', fontSize: '11px' }}>⚔️ GENERAR SEMIS</button>
                <button onClick={generarFinal} style={{ ...mainBtnStyle, background: '#9b59b6', fontSize: '11px', gridColumn: 'span 2' }}>🏆 GENERAR FINAL</button>
              </div>
            </div>
          )}

          <div style={formCardStyle}>
            <h3 className="section-title">👥 Plantillas y Pagos</h3>
            {equiposParticipantes.map((eq) => {
              const esClaro = eq.color?.toLowerCase() === "#ffffff" || eq.color?.toLowerCase() === "white";
              return (
                <div key={eq.id} className="team-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{
                      color: esClaro ? "#333" : eq.color,
                      background: esClaro ? "#eee" : "transparent",
                      padding: esClaro ? "2px 5px" : "0",
                      borderRadius: "4px"
                    }}>{eq.nombre}</strong>
                    {esAdmin && <button onClick={() => { const n = prompt("Nombre:"); if (n) añadirJugador(eq.id, n); }} className="btn-add-player">+ Jugador</button>}
                  </div>
                  {eq.jugadores?.map((j, i) => (
                    <div key={i} className="player-row">
                      <span>{j.nombre} {esAdmin && <button onClick={() => eliminarJugador(eq.id, i)} className="btn-del-mini">×</button>}</span>
                      <button onClick={() => togglePagoRealtime(eq.id, i)} className={`btn-pago ${j.pagado ? 'pagado' : 'pendiente'}`}>{j.pagado ? "PAGADO" : "PENDIENTE"}</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <Clasificacion equipos={equiposParticipantes} partidos={partidos} />

          <div style={formCardStyle}>
            <h3 className="section-title">🎯 Top Goleadores</h3>
            {goleadoresTorneo.slice(0, 5).map((g, i) => (
              <div key={i} className="goleador-item">{i + 1}. {g.nombre}: <strong>{g.goles} ⚽</strong></div>
            ))}
          </div>

          {renderPartidosPorTipo("final", "🏆 GRAN FINAL")}
          {renderPartidosPorTipo("semifinal", "⚔️ SEMIFINALES")}
          {renderPartidosPorTipo("liguilla", "📅 LIGUILLA")}
        </div>
      )}

      {modalPartido && (
        <ModalPartido
          partido={partidos.find(p => p.id === modalPartido?.id)}
          equipos={equiposParticipantes}
          esAdmin={esAdmin && datosTorneo.estado !== "finalizado"}
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