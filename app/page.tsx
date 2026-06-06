import Link from 'next/link';
import type { CSSProperties } from 'react';

const MODULOS = [
  {
    href: '/kardex',
    acento: '#0ea5e9',
    titulo: 'Extractor de Kardex',
    descripcion:
      'Procesa PDFs de kardex y extrae materias, calificaciones, claves y créditos en formato estructurado.',
    detalles: ['Detecta SIIAU (Oracle Reports) y SIGA/CUCEI automáticamente', 'Muestra historial de intentos y recursamiento', 'Exporta JSON completo'],
    estado: 'Disponible',
    estadoColor: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  },
  {
    href: '/cambio-plan',
    acento: '#8b5cf6',
    titulo: 'Igualdad Académica INBI → LIB',
    descripcion:
      'Gestiona el cambio de plan de estudios de Ingeniería Biomédica al nuevo plan Licenciatura en Ingeniería Biomédica.',
    detalles: ['Tabla de equivalencias con código de colores', 'Calcula materias pendientes y avance estimado', 'Genera solicitud oficial en PDF con hoja membretada'],
    estado: 'Disponible',
    estadoColor: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  },
] as const;

export default function Dashboard() {
  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '52px 24px 64px' }}>

      {/* Hero */}
      <div style={{ marginBottom: 48 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>
          Centro Universitario de Ciencias Exactas e Ingenierías · Universidad de Guadalajara
        </p>
        <h1 style={{ margin: '0 0 10px', fontSize: 30, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
          Sistema de Gestión Académica
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: '#64748b', maxWidth: 560 }}>
          Herramientas digitales para automatizar trámites escolares del CUCEI.
          Selecciona un módulo para comenzar.
        </p>
      </div>

      {/* Module grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          marginBottom: 40,
        }}
      >
        {MODULOS.map((m) => (
          <div
            key={m.href}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Color band */}
            <div style={{ height: 5, background: m.acento }} />

            <div style={{ padding: '22px 24px 24px', display: 'flex', flexDirection: 'column', flex: 1, gap: 14 }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                  {m.titulo}
                </h2>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    background: m.estadoColor.bg,
                    color: m.estadoColor.text,
                    border: `1px solid ${m.estadoColor.border}`,
                    padding: '2px 8px',
                    borderRadius: 20,
                  }}
                >
                  {m.estado}
                </span>
              </div>

              {/* Description */}
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                {m.descripcion}
              </p>

              {/* Feature list */}
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {m.detalles.map((d) => (
                  <li key={d} style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ color: m.acento, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>›</span>
                    {d}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={m.href}
                style={{
                  marginTop: 'auto',
                  display: 'block',
                  textAlign: 'center',
                  background: m.acento,
                  color: '#fff',
                  textDecoration: 'none',
                  borderRadius: 7,
                  padding: '10px 0',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                } as CSSProperties}
              >
                Abrir módulo
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Footer info */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 12,
          color: '#94a3b8',
        }}
      >
        <span>CUCEI · Universidad de Guadalajara</span>
        <span>Departamento de Control Escolar — Ingeniería Biomédica</span>
      </div>
    </main>
  );
}
