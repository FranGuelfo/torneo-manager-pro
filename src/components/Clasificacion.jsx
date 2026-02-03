import React from "react";

const Clasificacion = ({ equipos, partidos }) => {
  const obtenerEstadisticas = (listaEquipos) => {
    return listaEquipos.map((eq) => {
      let pts = 0, gf = 0, gc = 0;
      partidos
        .filter((p) => p.tipo === "liguilla" && p.finalizado)
        .forEach((p) => {
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
  };

  const gruposExistentes = [...new Set(equipos.map(e => e.grupo))].filter(Boolean).sort();

  const renderTabla = (lista, titulo) => (
    <div style={{ marginBottom: "20px" }}>
      {titulo && <h4 style={{ margin: "10px 0", color: "#1a73e8", fontSize: "14px" }}>{titulo}</h4>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", fontSize: "12px", borderCollapse: 'collapse', color: '#333' }}>
          <thead>
            <tr style={{ color: "#888", borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px' }}>EQ</th>
              <th style={{ textAlign: 'center', color: '#333' }}>PTS</th>
              <th style={{ textAlign: 'center', color: '#333' }}>GF</th>
              <th style={{ textAlign: 'center', color: '#333' }}>DG</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((eq) => (
              <tr key={eq.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                <td style={{ 
                  borderLeft: `4px solid ${eq.color}`, 
                  padding: "8px 5px", 
                  fontWeight: 'bold', 
                  color: eq.color === '#ffffff' || eq.color === 'white' ? '#333' : eq.color,
                  WebkitTextFillColor: eq.color === '#ffffff' || eq.color === 'white' ? '#333' : eq.color
                }}>
                  {eq.nombre}
                </td>
                <td style={{ textAlign: "center", fontWeight: 'bold', color: '#333' }}>{eq.pts}</td>
                <td style={{ textAlign: "center", color: '#333' }}>{eq.gf}</td>
                <td style={{ textAlign: "center", fontWeight: 'bold', color: eq.dg > 0 ? 'green' : eq.dg < 0 ? 'red' : '#333' }}>
                  {eq.dg > 0 ? `+${eq.dg}` : eq.dg}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "15px" }}>
      <h3 style={{ marginTop: 0, color: '#333' }}>📊 Clasificación</h3>
      {gruposExistentes.length > 0 ? (
        gruposExistentes.map(g => renderTabla(obtenerEstadisticas(equipos.filter(e => e.grupo === g)), `Grupo ${g}`))
      ) : (
        renderTabla(obtenerEstadisticas(equipos), null)
      )}
    </div>
  );
};

export default Clasificacion;