import React, { useState } from "react";

const CrearTorneo = ({ alCrear, alCancelar, mainBtnStyle, inputStyle, formCardStyle }) => {
  const [nombreTorneo, setNombreTorneo] = useState("");
  const [fechaTorneo, setFechaTorneo] = useState(new Date().toISOString().split("T")[0]);
  const [horaTorneo, setHoraTorneo] = useState("20:00");
  const [lugarTorneo, setLugarTorneo] = useState("");
  const [idaYVuelta, setIdaYVuelta] = useState(false);
  const [tiemposForm, setTiemposForm] = useState({ liguilla: 10, semifinal: 12, final: 15 });
  const [equiposForm, setEquiposForm] = useState([
    { id: "1", nombre: "Equipo 1", color: "#ff4444" },
    { id: "2", nombre: "Equipo 2", color: "#44ff44" },
    { id: "3", nombre: "Equipo 3", color: "#4444ff" },
    { id: "4", nombre: "Equipo 4", color: "#ffff44" },
  ]);

  const manejarCambioEquipo = (id, campo, valor) => {
    setEquiposForm(equiposForm.map(eq => eq.id === id ? { ...eq, [campo]: valor } : eq));
  };

  const agregarEquipo = () => {
    const nuevoId = (equiposForm.length + 1).toString();
    setEquiposForm([...equiposForm, { id: nuevoId, nombre: `Equipo ${nuevoId}`, color: "#cccccc" }]);
  };

  const eliminarEquipo = () => {
    if (equiposForm.length > 2) {
      setEquiposForm(equiposForm.slice(0, -1));
    }
  };

  const enviar = (e) => {
    e.preventDefault();
    alCrear({ nombreTorneo, fechaTorneo, horaTorneo, lugarTorneo, tiemposForm, equiposForm, idaYVuelta });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button onClick={alCancelar} style={{ background: 'none', border: 'none', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer' }}>← Volver</button>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Configurar Torneo</h2>
      </div>

      <form onSubmit={enviar}>
        <div style={formCardStyle}>
          <label style={labelStyle}>Información General</label>
          <input type="text" placeholder="Nombre del Torneo" value={nombreTorneo} onChange={(e) => setNombreTorneo(e.target.value)} style={inputStyle} required />
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="date" value={fechaTorneo} onChange={(e) => setFechaTorneo(e.target.value)} style={inputStyle} required />
            <input type="time" value={horaTorneo} onChange={(e) => setHoraTorneo(e.target.value)} style={inputStyle} required />
          </div>
          <input type="text" placeholder="Lugar del evento" value={lugarTorneo} onChange={(e) => setLugarTorneo(e.target.value)} style={inputStyle} required />
        </div>

        <div style={formCardStyle}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
            <input 
              type="checkbox" 
              checked={idaYVuelta} 
              onChange={(e) => setIdaYVuelta(e.target.checked)} 
              style={{ width: '20px', height: '20px' }}
            />
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>¿Formato Ida y Vuelta? 🔄</span>
          </label>
          <p style={{ fontSize: '11px', color: '#888', margin: '5px 0 0 30px' }}>Se jugarán dos partidos contra cada rival del grupo.</p>
        </div>

        <div style={formCardStyle}>
          <label style={labelStyle}>Duración Partidos (minutos)</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}><small>Liguilla</small><input type="number" value={tiemposForm.liguilla} onChange={(e) => setTiemposForm({ ...tiemposForm, liguilla: e.target.value })} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><small>Semis</small><input type="number" value={tiemposForm.semifinal} onChange={(e) => setTiemposForm({ ...tiemposForm, semifinal: e.target.value })} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><small>Final</small><input type="number" value={tiemposForm.final} onChange={(e) => setTiemposForm({ ...tiemposForm, final: e.target.value })} style={inputStyle} /></div>
          </div>
        </div>

        <div style={formCardStyle}>
          <label style={labelStyle}>Equipos ({equiposForm.length})</label>
          {equiposForm.map((eq) => (
            <div key={eq.id} style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <input type="color" value={eq.color} onChange={(e) => manejarCambioEquipo(eq.id, 'color', e.target.value)} style={{ width: '40px', height: '38px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
              <input type="text" placeholder="Nombre" value={eq.nombre} onChange={(e) => manejarCambioEquipo(eq.id, 'nombre', e.target.value)} style={inputStyle} required />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={agregarEquipo} style={{ ...mainBtnStyle, background: "#34a853", flex: 1, padding: '8px' }}>+ Equipo</button>
            <button type="button" onClick={eliminarEquipo} style={{ ...mainBtnStyle, background: "#d93025", flex: 1, padding: '8px' }}>- Quitar</button>
          </div>
        </div>

        <button type="submit" style={{ ...mainBtnStyle, background: "#1a73e8", marginBottom: '30px' }}>CREAR TORNEO</button>
      </form>
    </div>
  );
};

const labelStyle = { display: 'block', fontWeight: 'bold', marginBottom: '10px', fontSize: '14px', color: '#555' };

export default CrearTorneo;