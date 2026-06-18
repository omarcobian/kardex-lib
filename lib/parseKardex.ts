// Parser del Kardex de la UdeG (formato SIIAU, generado por Oracle Reports, tamaño carta).
//
// La lógica es 100% por posición (coordenadas X/Y del texto), no por orden del flujo,
// porque el extractor de PDF devuelve el texto agrupado por columnas, no por renglones.
// Las bandas de X están calibradas contra el documento real (puntos PDF, página de 612pt).

import type {
  TextItem,
  Materia,
  Intento,
  Estudiante,
  ResumenCreditos,
  Kardex,
} from './types';

// ---------------------------------------------------------------------------
// Tabla de materias: a qué columna pertenece un fragmento según su X inicial.
// ---------------------------------------------------------------------------
type Columna = 'nrc' | 'clave' | 'materia' | 'calif' | 'tipo' | 'nc' | 'hc' | 'fecha';

function columna(x: number): Columna {
  if (x < 64) return 'nrc';
  if (x < 100) return 'clave';
  if (x < 295) return 'materia';
  if (x < 396) return 'calif';
  if (x < 486) return 'tipo';
  if (x < 503) return 'nc';
  if (x < 525) return 'hc';
  return 'fecha';
}

type Cols = Partial<Record<Columna, string>>;

// ---------------------------------------------------------------------------
// Agrupar fragmentos en renglones visuales.
// `y` viene de pdf.js (origen abajo): mayor y = más arriba. Ordenamos de arriba
// hacia abajo y abrimos renglón nuevo cuando el salto vertical supera la tolerancia.
// ---------------------------------------------------------------------------
function agruparRenglones(items: TextItem[]): TextItem[][] {
  const ordenados = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const renglones: TextItem[][] = [];
  let actual: TextItem[] = [];
  let ancla: number | null = null;
  for (const it of ordenados) {
    if (ancla === null || Math.abs(it.y - ancla) <= 2.5) {
      actual.push(it);
      if (ancla === null) ancla = it.y;
    } else {
      renglones.push(actual);
      actual = [it];
      ancla = it.y;
    }
  }
  if (actual.length) renglones.push(actual);
  return renglones;
}

/** Texto de cada columna del renglón (fragmentos unidos por espacio, en orden de X). */
function columnasDe(renglon: TextItem[]): Cols {
  const cols: Cols = {};
  for (const it of [...renglon].sort((a, b) => a.x - b.x)) {
    const c = columna(it.x);
    cols[c] = (cols[c] ? cols[c] + ' ' : '') + it.text;
  }
  return cols;
}

/** Renglón completo como una sola cadena (para el encabezado). */
function textoRenglon(renglon: TextItem[]): string {
  return [...renglon]
    .sort((a, b) => a.x - b.x)
    .map((i) => i.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Utilidades de parseo de valores.
// ---------------------------------------------------------------------------
const NRC_RE = /^(\d{5,6}|[A-Z]{2}\d{3,4})$/; // 189611, SN001, etc.
const CLAVE_RE = /^[A-Z0-9]{4,6}$/; // IL341, I5288, CB224, LT251, ...

function aEntero(s?: string): number | null {
  const t = (s ?? '').trim();
  return /^\d+$/.test(t) ? parseInt(t, 10) : null;
}

function parseCalificacion(t?: string): { num: number | null; texto: string } {
  const s = t ?? '';
  const m = s.match(/^\s*(\d+)/);
  const p = s.match(/\(([^)]*)/);
  return {
    num: m ? parseInt(m[1], 10) : null,
    texto: p ? p[1].replace(/\s+/g, ' ').trim() : '',
  };
}

const norm = (s: string) => s.normalize('NFC');

// ---------------------------------------------------------------------------
// Encabezado: datos del estudiante.
// Reconstruimos cada renglón como texto y aplicamos expresiones regulares
// ancladas a las etiquetas del formato.
// ---------------------------------------------------------------------------
export function parseEstudiante(paginaUno: TextItem[]): Estudiante {
  const blob = agruparRenglones(paginaUno).map(textoRenglon).map(norm).join('\n');
  const g = (re: RegExp): string | null => {
    const m = blob.match(re);
    return m ? m[1].trim() : null;
  };
  const numero = (re: RegExp): number | null => {
    const v = g(re);
    return v != null && /^[\d.]+$/.test(v) ? Number(v) : null;
  };
  return {
    codigo: g(/Código:\s*(.+?)\s+Nombre:/),
    nombre: g(/Nombre:\s*(.+)/),
    carrera: g(/Carrera:\s*(.+?)\s+Centro:/),
    nivel: g(/Nivel:\s*(.+?)\s+Admisión:/),
    centro: g(/Centro:\s*(.+?)\s+Sede:/),
    sede: g(/Sede:\s*(.+?)\s+(?:Créditos|Nota)/),
    situacion: g(/Situación:\s*([A-ZÁÉÍÓÚÑ ]+?)\s+Carrera:/),
    admision: g(/Admisión:\s*(.+?)\s+Último/),
    ultimoCiclo: g(/Ciclo:\s*([A-Z0-9]+)/),
    creditos: numero(/Créditos:\s*(\d+)/),
    promedio: numero(/Promedio:\s*([\d.]+)/),
  };
}

// ---------------------------------------------------------------------------
// Materias (recorre todas las páginas).
// ---------------------------------------------------------------------------
export function parseMaterias(paginas: TextItem[][]): Materia[] {
  const materias: Materia[] = [];
  let calendario: string | null = null;
  let actual: Materia | null = null;
  let intento: Intento | null = null;
  let terminado = false;

  for (const pagina of paginas) {
    if (terminado) break;
    for (const renglon of agruparRenglones(pagina)) {
      if (terminado) break;
      const c = columnasDe(renglon);
      const nrc = (c.nrc ?? '').trim();
      const clave = (c.clave ?? '').trim();
      const mat = norm((c.materia ?? '').trim());

      // El resumen de créditos marca el fin de la lista de materias.
      if (mat.startsWith('RESUMEN')) {
        terminado = true;
        break;
      }
      // Encabezado de bloque de calendario: "CALENDARIO 2023-B".
      if (nrc === 'CALENDARIO') {
        calendario = clave || null;
        continue;
      }
      // Encabezado de columnas de la tabla.
      if (nrc === 'NRC') continue;

      // Renglón que inicia una materia: tiene NRC y Clave válidos.
      // Materias con calificación "Acreditado" pueden tener NRC vacío — las aceptamos
      // si la clave y el nombre son válidos para evitar que se pierdan del mapa.
      const esAcreditado = /acredit/i.test(c.calif ?? '') || /acredit/i.test(c.tipo ?? '');
      if ((NRC_RE.test(nrc) || (nrc === '' && esAcreditado && mat !== '')) && CLAVE_RE.test(clave)) {
        const g = parseCalificacion(c.calif);
        intento = {
          calificacion: g.num,
          calificacionTexto: g.texto,
          tipo: (c.tipo ?? '').trim(),
          nc: aEntero(c.nc),
          hc: aEntero(c.hc),
          fecha: (c.fecha ?? '').trim(),
        };
        actual = {
          calendario,
          nrc,
          clave,
          nombre: mat,
          calificacion: g.num,
          calificacionTexto: g.texto,
          tipo: intento.tipo,
          nc: intento.nc,
          hc: intento.hc,
          fecha: intento.fecha,
          intentos: [intento],
        };
        materias.push(actual);
        continue;
      }

      if (!actual || !intento) continue;

      const calif = (c.calif ?? '').trim();
      if (/^\d/.test(calif)) {
        // Nuevo intento de la misma materia (recursamiento / extraordinario):
        // este renglón trae otra calificación numérica.
        if (mat) actual.nombre += ' ' + mat;
        const g = parseCalificacion(calif);
        intento = {
          calificacion: g.num,
          calificacionTexto: g.texto,
          tipo: (c.tipo ?? '').trim(),
          nc: aEntero(c.nc),
          hc: aEntero(c.hc),
          fecha: (c.fecha ?? '').trim(),
        };
        actual.intentos.push(intento);
      } else {
        // Continuación: nombre o calificación con letra que se partió en dos renglones.
        if (mat) actual.nombre += ' ' + mat;
        if (calif) {
          intento.calificacionTexto = (
            intento.calificacionTexto +
            ' ' +
            calif.replace(/[()]/g, '')
          ).trim();
        }
        if (c.tipo) intento.tipo = (intento.tipo + ' ' + c.tipo).trim();
      }
    }
  }

  // Los campos de primer nivel reflejan el último intento.
  for (const m of materias) {
    const ult = m.intentos[m.intentos.length - 1];
    m.calificacion = ult.calificacion;
    m.calificacionTexto = ult.calificacionTexto;
    m.tipo = ult.tipo;
    m.nc = ult.nc;
    m.hc = ult.hc;
    m.fecha = ult.fecha;
  }
  return materias;
}

// ---------------------------------------------------------------------------
// Resumen de créditos (parte inferior). Usa sus propias bandas de X.
// ---------------------------------------------------------------------------
type SCol = 'name' | 'a' | 'b' | 'c';
function columnaResumen(x: number): SCol {
  if (x < 280) return 'name';
  if (x < 350) return 'a';
  if (x < 470) return 'b';
  return 'c';
}

export function parseResumen(paginas: TextItem[][]): ResumenCreditos | null {
  for (const pagina of paginas) {
    const renglones = agruparRenglones(pagina);
    if (!renglones.some((r) => norm(textoRenglon(r)).includes('RESUMEN DE CREDITOS'))) {
      continue;
    }
    const res: ResumenCreditos = {
      requeridosPrograma: null,
      adquiridosTotales: null,
      faltantesTotales: null,
      certificado: null,
      porArea: [],
    };
    let iniciado = false;
    for (const renglon of renglones) {
      const cols: Partial<Record<SCol, string>> = {};
      for (const it of [...renglon].sort((p, q) => p.x - q.x)) {
        const k = columnaResumen(it.x);
        cols[k] = (cols[k] ? cols[k] + ' ' : '') + it.text;
      }
      const nm = norm((cols.name ?? '').trim());
      if (nm.startsWith('RESUMEN')) {
        iniciado = true;
        continue;
      }
      if (!iniciado) continue;

      if (nm.includes('REQUERIDOS DEL PROGRAMA')) {
        res.requeridosPrograma = aEntero(cols.a);
      } else if (nm.includes('ADQUIRIDOS TOTALES')) {
        res.adquiridosTotales = aEntero(cols.a);
        res.faltantesTotales = aEntero(cols.c);
      } else if (nm.startsWith('SE EMITIRA')) {
        res.certificado = (cols.a ?? '').trim() || null;
      } else if (nm === 'CREDITOS' || nm === 'AREA' || nm.startsWith('Nota')) {
        continue;
      } else if (aEntero(cols.a) !== null && aEntero(cols.b) !== null) {
        res.porArea.push({
          area: nm,
          requeridos: aEntero(cols.a),
          adquiridos: aEntero(cols.b),
          faltantes: aEntero(cols.c),
        });
      }
    }
    return res;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ensamblar la respuesta completa.
// ---------------------------------------------------------------------------
export function buildKardex(paginas: TextItem[][]): Kardex {
  const estudiante = parseEstudiante(paginas[0] ?? []);
  const materias = parseMaterias(paginas);
  const resumenCreditos = parseResumen(paginas);
  return { estudiante, materias, resumenCreditos, totalMaterias: materias.length };
}
