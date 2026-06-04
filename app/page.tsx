'use client';

import { useState, type ChangeEvent, type CSSProperties } from 'react';
import type { Kardex } from '@/lib/types';

export default function Home() {
  const [data, setData] = useState<Kardex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kardex', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Error al procesar el PDF.');
      else setData(json as Kardex);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 4 }}>API Kardex UdeG</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Sube tu Kardex en PDF para extraer materias, calificación, clave y NRC.
      </p>

      <input type="file" accept="application/pdf" onChange={onFile} />

      {loading && <p>Procesando…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {data && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ marginBottom: 0 }}>
            {data.estudiante.nombre} — {data.estudiante.codigo}
          </h2>
          <p style={{ color: '#555', marginTop: 4 }}>
            {data.estudiante.carrera} · Promedio {data.estudiante.promedio} ·{' '}
            {data.totalMaterias} materias
          </p>

          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <thead>
              <tr>
                {['NRC', 'Clave', 'Materia', 'Calif.', 'Ciclo'].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.materias.map((m, i) => (
                <tr key={`${m.nrc}-${i}`}>
                  <td style={td}>{m.nrc}</td>
                  <td style={td}>{m.clave}</td>
                  <td style={td}>
                    {m.nombre}
                    {m.intentos.length > 1 && (
                      <span style={{ color: '#b45309' }}> ({m.intentos.length} intentos)</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {m.calificacion}
                  </td>
                  <td style={td}>{m.calendario}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer' }}>Ver JSON completo</summary>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </main>
  );
}

const th: CSSProperties = {
  textAlign: 'left',
  borderBottom: '2px solid #333',
  padding: '6px 8px',
};
const td: CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid #e5e5e5',
};
