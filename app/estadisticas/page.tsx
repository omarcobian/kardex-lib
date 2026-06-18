'use client';

import { useState, useEffect, type CSSProperties } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type MateriaPendienteDetalle = { clave: string; nombre: string; creditos: number };

type ConteoStorage = {
  codigo_alumno: string;
  total: number;
  materias: MateriaPendienteDetalle[];
  ncContabilizados?: number;
  timestamp: string;
};

type DemandaEntry = { nombre: string; creditos: number; alumnos: string[] };

// ─── Donut Chart (SVG) ────────────────────────────────────────────────────────

function DonutChart({ covered, pending }: { covered: number; pending: number }) {
  const total = covered + pending;
  const R = 62;
  const cx = 80;
  const cy = 80;
  const C = 2 * Math.PI * R;
  const arcLen = total > 0 ? (covered / total) * C : 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <svg viewBox="0 0 160 160" width="170" height="170">
      {/* Track — represents pending */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#fecaca" strokeWidth="22" />
      {/* Covered arc */}
      {arcLen > 0 && (
        <circle
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke="#22c55e"
          strokeWidth="22"
          strokeDasharray={`${arcLen} ${C - arcLen}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="24" fontWeight="800" fill="#1e3a5f">
        {pct}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#6b7280">
        avance en LIB
      </text>
    </svg>
  );
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────

function HBarChart({ items }: {
  items: { label: string; value: number; max: number; color: string; bg?: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {items.map(({ label, value, max, color, bg }) => {
        const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
        return (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, color: '#374151' }}>
              <span>{label}</span>
              <span style={{ fontWeight: 700, color }}>
                {value} <span style={{ fontWeight: 400, color: '#9ca3af' }}>/ {max}</span>
              </span>
            </div>
            <div style={{ height: 12, background: bg ?? '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 99,
                  transition: 'width .5s ease',
                  minWidth: value > 0 ? 6 : 0,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Info Card ────────────────────────────────────────────────────────────────

function InfoCard({
  label, value, sub, bg = '#fff', border = '#e5e7eb', color = '#1e3a5f',
}: {
  label: string; value: string | number; sub?: string;
  bg?: string; border?: string; color?: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#374151', marginTop: 6, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EstadisticasPage() {
  const [conteo, setConteo] = useState<ConteoStorage | null>(null);
  const [demanda, setDemanda] = useState<Record<string, DemandaEntry>>({});
  const [folio, setFolio] = useState(0);
  const [totalLib, setTotalLib] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem('cambio_plan_conteo_pendientes');
      if (raw) setConteo(JSON.parse(raw) as ConteoStorage);
      setFolio(parseInt(localStorage.getItem('folio_solicitudes') ?? '0', 10) || 0);
      const rawD = localStorage.getItem('cambio_plan_demanda');
      if (rawD) setDemanda(JSON.parse(rawD) as Record<string, DemandaEntry>);
    } catch {
      // localStorage not available
    }

    fetch('/api/leer-datos-plan')
      .then(r => r.json())
      .then(data => setTotalLib(data?.planLib?.materias?.length ?? null))
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  const covered = totalLib != null && conteo != null ? totalLib - conteo.total : null;
  const hasDatos = conteo !== null || folio > 0 || Object.keys(demanda).length > 0;

  const filteredMaterias = conteo?.materias.filter(m =>
    m.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const demandaOrdenada = Object.entries(demanda)
    .sort(([, a], [, b]) => b.alumnos.length - a.alumnos.length);

  const handleClear = () => {
    localStorage.removeItem('cambio_plan_conteo_pendientes');
    localStorage.removeItem('folio_solicitudes');
    localStorage.removeItem('cambio_plan_demanda');
    setConteo(null);
    setFolio(0);
    setDemanda({});
    setCleared(true);
  };

  // ── Styles ──────────────────────────────────────────────────────────────────

  const card: CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '22px 26px',
    marginBottom: 24,
    background: '#fff',
  };

  const sectionTitle: CSSProperties = {
    margin: '0 0 18px 0',
    fontSize: 15,
    fontWeight: 700,
    color: '#1e3a5f',
    borderBottom: '2px solid #1e3a5f',
    paddingBottom: 7,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const th: CSSProperties = {
    padding: '7px 12px',
    textAlign: 'left' as const,
    fontSize: 11,
    fontWeight: 700,
    background: '#1e3a5f',
    color: '#fff',
  };

  const tdStyle: CSSProperties = {
    padding: '6px 12px',
    fontSize: 12,
    borderBottom: '1px solid #f3f4f6',
    color: '#111',
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main style={{ maxWidth: 1000, margin: '40px auto', padding: '0 16px' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#1e3a5f' }}>
          Panel de Seguimiento
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          Visualización de los datos guardados en el navegador · localStorage
        </p>
      </div>

      {/* ── Aviso sin datos ─────────────────────────────────────────────────── */}
      {!hasDatos && !cleared && (
        <div style={{ ...card, background: '#fefce8', border: '1px solid #fde68a' }}>
          <p style={{ margin: 0, color: '#713f12', fontSize: 14 }}>
            No hay datos guardados aún. Ve a{' '}
            <strong>Igualdad Académica</strong>, sube un kardex y presiona
            &ldquo;Actualizar y guardar conteo&rdquo; para ver las estadísticas aquí.
          </p>
        </div>
      )}

      {cleared && (
        <div style={{ ...card, background: '#ecfdf5', border: '1px solid #6ee7b7' }}>
          <p style={{ margin: 0, color: '#065f46', fontSize: 14 }}>
            Datos borrados correctamente del localStorage.
          </p>
        </div>
      )}

      {/* ── Sección 1 — Cards de resumen ────────────────────────────────────── */}
      <div style={card}>
        <h2 style={sectionTitle}>Resumen del Almacenamiento</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <InfoCard
            label="Alumno guardado"
            value={conteo?.codigo_alumno ?? '—'}
            sub={conteo ? 'código de estudiante' : 'sin datos'}
            bg="#dbeafe" border="#93c5fd" color="#1e40af"
          />
          <InfoCard
            label="Materias pendientes"
            value={conteo?.total ?? '—'}
            sub={conteo ? 'por cursar en LIB' : 'sin datos'}
            bg="#fee2e2" border="#fca5a5" color="#991b1b"
          />
          <InfoCard
            label="Materias equivalentes"
            value={covered ?? '—'}
            sub={totalLib ? `de ${totalLib} en el plan LIB` : 'cargando…'}
            bg="#d1fae5" border="#6ee7b7" color="#065f46"
          />
          <InfoCard
            label="Folios generados"
            value={folio}
            sub="PDFs de solicitud"
            bg="#d1fae5" border="#6ee7b7" color="#065f46"
          />
          <InfoCard
            label="Última actualización"
            value={conteo ? new Date(conteo.timestamp).toLocaleDateString('es-MX') : '—'}
            sub={conteo ? new Date(conteo.timestamp).toLocaleTimeString('es-MX') : 'sin datos'}
            bg="#f0f9ff" border="#bae6fd" color="#0369a1"
          />
        </div>
      </div>

      {/* ── Sección 2 — Gráficas ────────────────────────────────────────────── */}
      {conteo && (
        <div style={{ ...card }}>
          <h2 style={sectionTitle}>Distribución del Plan LIB</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 40, alignItems: 'center' }}>

            {/* Donut chart */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {totalLib != null && covered != null ? (
                <>
                  <DonutChart covered={covered} pending={conteo.total} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 14, height: 14, background: '#22c55e', borderRadius: 3, display: 'inline-block', flexShrink: 0 }} />
                      <span>Equivalentes: <strong>{covered}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 14, height: 14, background: '#fecaca', border: '1px solid #f87171', borderRadius: 3, display: 'inline-block', flexShrink: 0 }} />
                      <span>Pendientes: <strong>{conteo.total}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 14, height: 14, background: '#e5e7eb', borderRadius: 3, display: 'inline-block', flexShrink: 0 }} />
                      <span>Total LIB: <strong>{totalLib}</strong></span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: '#9ca3af', fontSize: 12 }}>Cargando datos del plan…</div>
              )}
            </div>

            {/* Barras horizontales */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 18px' }}>
                Progreso por indicadores
              </p>
              {totalLib != null && covered != null ? (
                <HBarChart
                  items={[
                    {
                      label: 'Materias equivalentes (cubiertas)',
                      value: covered,
                      max: totalLib,
                      color: '#22c55e',
                      bg: '#dcfce7',
                    },
                    {
                      label: 'Materias pendientes por cursar',
                      value: conteo.total,
                      max: totalLib,
                      color: '#f87171',
                      bg: '#fee2e2',
                    },
                    {
                      label: 'Avance general del plan LIB',
                      value: covered,
                      max: totalLib,
                      color: 'linear-gradient(90deg, #0ea5e9, #22c55e)' as string,
                      bg: '#e0f2fe',
                    },
                  ]}
                />
              ) : (
                <div style={{ color: '#9ca3af', fontSize: 12 }}>Cargando…</div>
              )}

              {totalLib != null && covered != null && (
                <div style={{
                  marginTop: 22,
                  padding: '12px 16px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#0369a1',
                }}>
                  <span>Créditos por cursar: </span>
                  <strong>{conteo.materias.reduce((s, m) => s + m.creditos, 0)}</strong>
                  <span> NC</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sección 3 — Tabla de materias pendientes ────────────────────────── */}
      {conteo && conteo.materias.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>
              Materias Pendientes por Cursar
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#6b7280' }}>
                ({conteo.materias.length} materias)
              </span>
            </h2>
            <input
              type="text"
              placeholder="Buscar materia…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                outline: 'none',
                width: 220,
                color: '#111',
              }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 44 }}>#</th>
                  <th style={th}>Materia del Plan LIB</th>
                  <th style={{ ...th, width: 100, textAlign: 'center' as const }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterias.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', padding: 20 }}>
                      No se encontraron materias con ese nombre
                    </td>
                  </tr>
                ) : (
                  filteredMaterias.map((m, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ ...tdStyle, color: '#9ca3af', fontWeight: 700 }}>{i + 1}</td>
                      <td style={tdStyle}>{m.nombre}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 700,
                        }}>
                          Pendiente
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mini gráfica de barras por letra del abecedario */}
          {conteo.materias.length > 0 && (
            <div style={{ marginTop: 20, padding: '14px 18px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Distribución por inicial
              </p>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60, overflowX: 'auto', paddingBottom: 4 }}>
                {(() => {
                  const freq: Record<string, number> = {};
                  for (const m of conteo.materias) {
                    const inicial = m.nombre[0]?.toUpperCase() ?? '?';
                    freq[inicial] = (freq[inicial] ?? 0) + 1;
                  }
                  const maxFreq = Math.max(...Object.values(freq));
                  return Object.entries(freq)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([letra, count]) => (
                      <div key={letra} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700 }}>{count}</span>
                        <div
                          style={{
                            width: 20,
                            height: Math.max(4, (count / maxFreq) * 46),
                            background: '#0ea5e9',
                            borderRadius: '3px 3px 0 0',
                          }}
                        />
                        <span style={{ fontSize: 9, color: '#9ca3af' }}>{letra}</span>
                      </div>
                    ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sección 4 — Cupos estimados próximo semestre ────────────────────── */}
      {demandaOrdenada.length > 0 && (
        <div style={card}>
          <h2 style={sectionTitle}>
            Cupos Estimados — Próximo Semestre
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#6b7280' }}>
              ({demandaOrdenada.length} materias · {new Set(demandaOrdenada.flatMap(([, e]) => e.alumnos)).size} alumnos)
            </span>
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
            Cada vez que se guarda el conteo de un alumno, sus materias pendientes (hasta {50} NC)
            se suman aquí. El contador indica cuántos alumnos necesitan esa materia el siguiente semestre.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }}>#</th>
                  <th style={th}>Materia del Plan LIB</th>
                  <th style={{ ...th, width: 60, textAlign: 'center' as const }}>NC</th>
                  <th style={{ ...th, width: 90, textAlign: 'center' as const }}>Cupos</th>
                  <th style={th}>Alumnos</th>
                </tr>
              </thead>
              <tbody>
                {demandaOrdenada.map(([clave, entry], i) => (
                  <tr key={clave} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', fontWeight: 700 }}>{i + 1}</td>
                    <td style={tdStyle}>{entry.nombre}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' as const, color: '#6b7280' }}>{entry.creditos}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' as const }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        background: entry.alumnos.length >= 3 ? '#fee2e2' : entry.alumnos.length === 2 ? '#fef9c3' : '#dbeafe',
                        color: entry.alumnos.length >= 3 ? '#991b1b' : entry.alumnos.length === 2 ? '#713f12' : '#1e40af',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 800,
                      }}>
                        {entry.alumnos.length}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280', fontSize: 11 }}>
                      {entry.alumnos.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sección 5 — Datos crudos del localStorage ───────────────────────── */}
      <div style={card}>
        <h2 style={sectionTitle}>Datos en el Almacenamiento Local</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              key: 'cambio_plan_conteo_pendientes',
              label: 'Conteo de materias pendientes',
              value: conteo ? JSON.stringify(conteo, null, 2) : null,
            },
            {
              key: 'folio_solicitudes',
              label: 'Folio de solicitudes',
              value: folio > 0 ? String(folio) : null,
            },
          ].map(({ key, label, value }) => (
            <div key={key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                background: '#f8fafc',
                padding: '7px 14px',
                fontSize: 11,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e5e7eb',
              }}>
                <span style={{ fontWeight: 700, color: '#374151' }}>{label}</span>
                <code style={{ color: '#6b7280', fontSize: 10 }}>{key}</code>
              </div>
              <pre style={{
                margin: 0,
                padding: '10px 14px',
                fontSize: 11,
                color: value ? '#111827' : '#9ca3af',
                background: '#fff',
                overflowX: 'auto',
                maxHeight: 180,
                lineHeight: 1.5,
              }}>
                {value ?? '(vacío — sin datos guardados)'}
              </pre>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleClear}
            disabled={!hasDatos}
            style={{
              padding: '8px 18px',
              background: hasDatos ? '#ef4444' : '#d1d5db',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              cursor: hasDatos ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Borrar todos los datos
          </button>
          {!hasDatos && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>No hay datos que borrar</span>
          )}
        </div>
      </div>
    </main>
  );
}
