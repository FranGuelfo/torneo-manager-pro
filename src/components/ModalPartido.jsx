import React from "react";

const ModalPartido = ({ 
  partido, 
  equipos, 
  esAdmin, 
  segundos, 
  corriendo, 
  setCorriendo, 
  resetCronometro, 
  formatearTiempo, 
  anotarGolDirecto, 
  finalizarPartidoManual, 
  cerrarModal 
}) => {
  if (!partido) return null;

  const equipoA = equipos.find((e) => e.id === partido.equipoA);
  const equipoB = equipos.find((e) => e.id === partido.equipoB);

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "40px", margin: "10px 0" }}>{formatearTiempo(segundos)}</h2>
          {esAdmin && !partido.finalizado && (
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button 
                onClick={() => setCorriendo(!corriendo)} 
                style={{ background: corriendo ? "red" : "green", color: "white", padding: "10px", borderRadius: "8px", border: "none" }}
              >
                {corriendo ? "PAUSA" : "INICIAR"}
              </button>
              <button onClick={resetCronometro} style={{ padding: "10px", borderRadius: "8px", border: "1px solid #ddd" }}>
                RESET
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-around", marginTop: "20px" }}>
          {/* Equipo A */}
          <div style={{ textAlign: "center", flex: 1 }}>
            <strong style={{ fontSize: "12px" }}>{equipoA?.nombre}</strong>
            <div style={{ fontSize: "40px", fontWeight: "bold" }}>{partido.golesA}</div>
            {esAdmin && !partido.finalizado && equipoA?.jugadores.map((j) => (
              <button key={j.nombre} onClick={() => anotarGolDirecto(partido.id, j.nombre, partido.equipoA)} style={btnGolStyle}>
                {j.nombre}
              </button>
            ))}
          </div>

          <div style={{ fontWeight: "bold", alignSelf: 'center' }}>VS</div>

          {/* Equipo B */}
          <div style={{ textAlign: "center", flex: 1 }}>
            <strong style={{ fontSize: "12px" }}>{equipoB?.nombre}</strong>
            <div style={{ fontSize: "40px", fontWeight: "bold" }}>{partido.golesB}</div>
            {esAdmin && !partido.finalizado && equipoB?.jugadores.map((j) => (
              <button key={j.nombre} onClick={() => anotarGolDirecto(partido.id, j.nombre, partido.equipoB)} style={btnGolStyle}>
                {j.nombre}
              </button>
            ))}
          </div>
        </div>

        {/* Listado de Goleadores (No se pierde nada) */}
        <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
          <h4 style={{ fontSize: '12px', margin: '0 0 5px 0', color: '#555' }}>Goleadores:</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center' }}>
            {partido.detallesGoles?.map((gol, idx) => (
              <span key={idx} style={{ fontSize: '11px', background: '#f0f0f0', padding: '2px 8px', borderRadius: '10px' }}>
                ⚽ {gol.jugador}
              </span>
            )) || <span style={{ fontSize: '11px', color: '#999' }}>Sin goles</span>}
          </div>
        </div>

        {esAdmin && !partido.finalizado && (
          <button onClick={() => finalizarPartidoManual(partido.id)} style={btnFinalizarStyle}>
            🏁 FINALIZAR PARTIDO
          </button>
        )}

        <button onClick={cerrarModal} style={btnCerrarStyle}>CERRAR</button>
      </div>
    </div>
  );
};

// Estilos internos para que el componente sea autónomo
const modalOverlayStyle = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "20px", width: "90%", maxWidth: "400px" };
const btnGolStyle = { display: "block", width: "100%", fontSize: "10px", marginBottom: "2px", cursor: "pointer" };
const btnFinalizarStyle = { width: "100%", padding: "12px", borderRadius: "8px", border: "none", color: "#fff", fontWeight: "bold", background: "#fb8c00", marginTop: "20px", cursor: "pointer" };
const btnCerrarStyle = { width: "100%", padding: "12px", borderRadius: "8px", border: "none", color: "#fff", fontWeight: "bold", background: "#333", marginTop: "10px", cursor: "pointer" };

export default ModalPartido;