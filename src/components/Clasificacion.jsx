import React from "react";

const Clasificacion = ({ equipos, partidos }) => {
  const tabla = equipos.map((eq) => {
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

  return (
    <div style={{ background: "#fff", padding: "15px", borderRadius: "12px", marginBottom: "15px" }}>
      <h3 style={{ marginTop: 0 }}>📊 Clasificación</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", fontSize: "12px", borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: "#888", borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px' }}>EQ</th>
              <th>PTS</th><th>GF</th><th>GC</th><th>DG</th>
            </tr>
          </thead>
          <tbody>
            {tabla.map((eq) => (
              <tr key={eq.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
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
  );
};

export default Clasificacion;