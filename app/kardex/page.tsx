'use client';

import { useState, type ChangeEvent, type CSSProperties } from 'react';
import type { Kardex } from '@/lib/types';

export default function ExtractorKardex() {
  const [data, setData] = useState<Kardex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formato, setFormato] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    setFormato(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kardex', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Error al procesar el PDF.');
      else {
        setFormato(json._formato ?? null);
        setData(json as Kardex);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#1e3a5f' }}>
        Extractor de Kardex
      </h1>
      <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
        Sube el PDF de tu kardex (formato SIIAU u Oracle Reports / SIGA CUCEI) para extraer
        materias, calificaciones, clave y NRC.
      </p>

      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <input type="file" accept="application/pdf,image/*" onChange={onFile} />

        {formato && (
          <span
            style={{
              marginLeft: 16,
              fontSize: 11,
              fontWeight: 700,
              background: '#dbeafe',
              color: '#1e40af',
              padding: '2px 10px',
              borderRadius: 20,
              border: '1px solid #93c5fd',
              verticalAlign: 'middle',
            }}
          >
            {formato === 'siga-cucei' ? 'SIGA / CUCEI' : 'SIIAU'}
          </span>
        )}

        {loading && (
          <p style={{ color: '#1e3a5f', fontSize: 13, marginTop: 12 }}>Procesando…</p>
        )}
        {error && (
          <p
            style={{
              color: 'crimson',
              fontSize: 13,
              marginTop: 12,
              background: '#fee2e2',
              padding: '8px 12px',
              borderRadius: 6,
            }}
          >
            {error}
          </p>
        )}
      </div>

      {data && (
        <section>
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #6ee7b7',
              borderRadius: 8,
              padding: '12px 18px',
              marginBottom: 20,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#065f46' }}>
              {data.estudiante.nombre}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#047857' }}>
              Código: {data.estudiante.codigo} &nbsp;·&nbsp; {data.estudiante.carrera}{' '}
              &nbsp;·&nbsp; Promedio {data.estudiante.promedio} &nbsp;·&nbsp;{' '}
              {data.totalMaterias} materias &nbsp;·&nbsp; {data.estudiante.creditos} créditos
            </p>
          </div>

          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['NRC', 'Clave', 'Materia', 'Calif.', 'NC', 'Ciclo'].map((h) => (
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
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{m.clave}</td>
                  <td style={td}>
                    {m.nombre}
                    {m.intentos.length > 1 && (
                      <span style={{ color: '#b45309', fontSize: 11 }}>
                        {' '}
                        ({m.intentos.length} intentos)
                      </span>
                    )}
                    {m.sinAreaEstudios && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          background: '#f3f4f6',
                          color: '#6b7280',
                          padding: '1px 6px',
                          borderRadius: 10,
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        sin área
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {m.calificacion}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.nc}</td>
                  <td style={{ ...td, fontSize: 12 }}>{m.calendario}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
              Ver JSON completo
            </summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: '#f8fafc',
                padding: 12,
                borderRadius: 8,
                fontSize: 11,
                border: '1px solid #e2e8f0',
                marginTop: 8,
              }}
            >
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
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 700,
  background: '#1e3a5f',
  color: '#fff',
};
const td: CSSProperties = {
  padding: '5px 10px',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
  color: '#000',
};
