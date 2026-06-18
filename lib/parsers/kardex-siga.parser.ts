// Parser del Kardex de la UdeG — formato SIGA/CUCEI.
//
// Este formato se distingue del SIIAU/Oracle Reports en tres puntos:
//   1. Encabezado del estudiante en disposición diferente ("Ultimo" sin tilde,
//      créditos en la misma línea que el promedio).
//   2. Calificación en formato doble: "100 CIEN", "97 NOVENTA Y SIETE", etc.
//   3. Sección adicional "CURSOS SIN REGISTRO DE AREA DE ESTUDIOS" (ET352, ET355…).
//
// La extracción posicional (X/Y) la provee extractPages() de @/lib/extractPdf,
// que ya usa pdfjs-dist internamente a través de `unpdf`.
// Las bandas de X están calibradas a una página de ~612pt de ancho.
// Si el parseo es incorrecto, ajustar las constantes al final de este archivo.

import { extractPages } from '@/lib/extractPdf';
import type { TextItem, Materia, Intento, Estudiante, ResumenCreditos, Kardex } from '@/lib/types';

// ─── Tipos internos ────────────────────────────────────────────────────────────

type ColumnaSiga = 'crn' | 'clave' | 'nombre' | 'calif' | 'tipo' | 'nc' | 'hc' | 'fecha';
type ColsSiga = Partial<Record<ColumnaSiga, string>>;

// ─── Constantes de calibración ─────────────────────────────────────────────────
// Derivadas de los valores aproximados del PDF real (tarea) escalados a 612pt.
// Ajustar si el PDF tiene otra anchura o márgenes distintos.

const SIGA_X: Record<string, number> = {
  crnMax:    65,  // NRC/CRN
  claveMax:  106, // Clave de materia
  nombreMax: 295, // Nombre largo de la materia
  califMax:  396, // Calificación (número + texto en español)
  tipoMax:   486, // ORDINARIO (OE) / EXTRAORDINARIO (E) …
  ncMax:     503, // Número de créditos
  hcMax:     525, // Horas clase
            // fecha: resto de la línea
};

// ─── Detección de columna por X ────────────────────────────────────────────────

function columnaSiga(x: number): ColumnaSiga {
  if (x < SIGA_X.crnMax)    return 'crn';
  if (x < SIGA_X.claveMax)  return 'clave';
  if (x < SIGA_X.nombreMax) return 'nombre';
  if (x < SIGA_X.califMax)  return 'calif';
  if (x < SIGA_X.tipoMax)   return 'tipo';
  if (x < SIGA_X.ncMax)     return 'nc';
  if (x < SIGA_X.hcMax)     return 'hc';
  return 'fecha';
}

// ─── Agrupación de ítems en renglones visuales ────────────────────────────────
// Iguales a parseKardex.ts (Y mayor = más arriba en la página).

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

function textoRenglon(renglon: TextItem[]): string {
  return [...renglon]
    .sort((a, b) => a.x - b.x)
    .map(i => i.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function columnasDeSiga(renglon: TextItem[]): ColsSiga {
  const cols: ColsSiga = {};
  for (const it of [...renglon].sort((a, b) => a.x - b.x)) {
    const c = columnaSiga(it.x);
    cols[c] = (cols[c] ? cols[c] + ' ' : '') + it.text;
  }
  return cols;
}

// ─── Parseo de calificaciones SIGA ("100 CIEN", "97 NOVENTA Y SIETE") ─────────

export function parseCalificacionSiga(s: string): { num: number | null; texto: string } {
  const trim = s.trim();
  // Formato esperado: dígitos seguidos de texto en mayúsculas
  const m = trim.match(/^(\d+)\s+([A-ZÁÉÍÓÚÑ\s]+)$/);
  if (m) {
    return { num: parseInt(m[1], 10), texto: m[2].trim() };
  }
  // Caer de vuelta: intentar al menos extraer el número
  const solo = trim.match(/^(\d+)/);
  return { num: solo ? parseInt(solo[1], 10) : null, texto: '' };
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function aEntero(s?: string): number | null {
  const t = (s ?? '').trim();
  return /^\d+$/.test(t) ? parseInt(t, 10) : null;
}

const norm = (s: string) => s.normalize('NFC');

// ─── Parser del encabezado del estudiante (formato SIGA) ──────────────────────
// El formato SIGA tiene las etiquetas en distinto orden que SIIAU:
//   Código: XXX        Nombre: XXX
//   Situación: ACTIVO  Nivel: LICENCIATURA
//   Admisión: 2023B    Ultimo Ciclo: 2026A          ← sin tilde en "Ultimo"
//   Carrera: XXX
//   Centro: XXX
//   Sede: XXX
//   Promedio: 97.00    Créditos: 200                ← Créditos junto al promedio

export function parseSigaEstudiante(paginaUno: TextItem[]): Estudiante {
  const blob = agruparRenglones(paginaUno)
    .map(textoRenglon)
    .map(norm)
    .join('\n');

  const g = (re: RegExp): string | null => {
    const m = blob.match(re);
    return m ? m[1].trim() : null;
  };
  const num = (re: RegExp): number | null => {
    const v = g(re);
    return v != null && /^[\d.]+$/.test(v) ? Number(v) : null;
  };

  return {
    codigo:      g(/Código:\s*(\S+)/),
    nombre:      g(/Nombre:\s*([^\n]+)/),
    carrera:     g(/Carrera:\s*([^\n]+)/),
    nivel:       g(/Nivel:\s*([^\s\n]+)/),
    centro:      g(/Centro:\s*([^\n]+)/),
    sede:        g(/Sede:\s*([^\n]+)/),
    // "Situación: ACTIVO" — en SIGA la situación va en su propia línea
    situacion:   g(/Situación:\s*([A-ZÁÉÍÓÚÑ]+)/),
    admision:    g(/Admisión:\s*(\S+)/),
    // SIGA escribe "Ultimo Ciclo" sin tilde
    ultimoCiclo: g(/[Uu]ltimo Ciclo:\s*(\S+)/),
    creditos:    num(/Créditos:\s*(\d+)/),
    promedio:    num(/Promedio:\s*([\d.]+)/),
  };
}

// ─── Patrones de validación ───────────────────────────────────────────────────

const CRN_RE   = /^(\d{5,6}|[A-Z]{2}\d{3,4})$/; // 159329, SN001…
const CLAVE_RE = /^[A-Z]{1,2}[\dA-Z]{3,5}$|^ET\d{3}$/; // I7590, ET352…

// ─── Parser de materias (formato SIGA) ────────────────────────────────────────

export function parseSigaMaterias(paginas: TextItem[][]): Materia[] {
  const materias: Materia[] = [];
  let calendario: string | null = null;
  let actual: Materia | null = null;
  let intento: Intento | null = null;
  let terminado = false;
  let sinArea = false; // true dentro de la sección "CURSOS SIN REGISTRO DE AREA"

  for (const pagina of paginas) {
    if (terminado) break;
    for (const renglon of agruparRenglones(pagina)) {
      if (terminado) break;

      const c = columnasDeSiga(renglon);
      const crn   = (c.crn    ?? '').trim();
      const clave  = (c.clave  ?? '').trim();
      const nombre = norm((c.nombre ?? '').trim());

      // Fin de la sección de materias: comienza el resumen de créditos
      if (nombre.startsWith('RESUMEN')) {
        terminado = true;
        break;
      }

      // Detectar sección de cursos sin área de estudios
      if (/CURSOS SIN (REGISTRO|AREA)/i.test(textoRenglon(renglon))) {
        sinArea = true;
        continue;
      }

      // Encabezado de bloque de calendario: "CALENDARIO" en columna CRN
      if (crn === 'CALENDARIO') {
        sinArea = false; // resetear sección
        // El año-semestre aparece en la columna clave: "2023-B"
        calendario = clave || null;
        continue;
      }

      // Fila de encabezado de la tabla
      if (crn === 'CRN' || crn === 'NRC') continue;

      // Renglón que inicia una materia: CRN y Clave válidos.
      // Materias Acreditado pueden venir sin CRN — las admitimos si clave y nombre son válidos.
      const esAcreditado = /acredit/i.test(c.calif ?? '') || /acredit/i.test(c.tipo ?? '');
      if ((CRN_RE.test(crn) || (crn === '' && esAcreditado && nombre !== '')) && CLAVE_RE.test(clave)) {
        const g = parseCalificacionSiga(c.calif ?? '');
        intento = {
          calificacion:     g.num,
          calificacionTexto: g.texto,
          tipo:  (c.tipo  ?? '').trim(),
          nc:    aEntero(c.nc),
          hc:    aEntero(c.hc),
          fecha: (c.fecha ?? '').trim(),
        };
        actual = {
          calendario,
          nrc:   crn,
          clave,
          nombre,
          calificacion:      g.num,
          calificacionTexto: g.texto,
          tipo:  intento.tipo,
          nc:    intento.nc,
          hc:    intento.hc,
          fecha: intento.fecha,
          intentos: [intento],
          sinAreaEstudios: sinArea || undefined,
        };
        materias.push(actual);
        continue;
      }

      if (!actual || !intento) continue;

      const calif = (c.calif ?? '').trim();
      if (/^\d/.test(calif)) {
        // Nuevo intento de la misma materia (recursamiento / extraordinario)
        if (nombre) actual.nombre += ' ' + nombre;
        const g = parseCalificacionSiga(calif);
        intento = {
          calificacion:      g.num,
          calificacionTexto: g.texto,
          tipo:  (c.tipo  ?? '').trim(),
          nc:    aEntero(c.nc),
          hc:    aEntero(c.hc),
          fecha: (c.fecha ?? '').trim(),
        };
        actual.intentos.push(intento);
      } else {
        // Continuación: nombre de materia largo o calificación partida
        if (nombre) actual.nombre += ' ' + nombre;
        if (calif) {
          intento.calificacionTexto = (intento.calificacionTexto + ' ' + calif).trim();
        }
        if (c.tipo) intento.tipo = (intento.tipo + ' ' + c.tipo).trim();
      }
    }
  }

  // Los campos de primer nivel reflejan el último intento registrado
  for (const m of materias) {
    const ult = m.intentos[m.intentos.length - 1];
    m.calificacion      = ult.calificacion;
    m.calificacionTexto = ult.calificacionTexto;
    m.tipo              = ult.tipo;
    m.nc                = ult.nc;
    m.hc                = ult.hc;
    m.fecha             = ult.fecha;
  }

  return materias;
}

// ─── Parser del resumen de créditos (estructura SIGA) ─────────────────────────
// El formato de la tabla del resumen puede variar, pero las etiquetas clave
// son las mismas que en SIIAU. Reutilizamos la misma lógica con la misma
// delimitación por "RESUMEN".

type SCol = 'name' | 'a' | 'b' | 'c';
function columnaSigaResumen(x: number): SCol {
  if (x < 280) return 'name';
  if (x < 350) return 'a';
  if (x < 470) return 'b';
  return 'c';
}

export function parseSigaResumen(paginas: TextItem[][]): ResumenCreditos | null {
  for (const pagina of paginas) {
    const renglones = agruparRenglones(pagina);
    if (!renglones.some(r => norm(textoRenglon(r)).includes('RESUMEN DE CREDITOS'))) {
      continue;
    }
    const res: ResumenCreditos = {
      requeridosPrograma: null,
      adquiridosTotales:  null,
      faltantesTotales:   null,
      certificado:        null,
      porArea:            [],
    };
    let iniciado = false;

    for (const renglon of renglones) {
      const cols: Partial<Record<SCol, string>> = {};
      for (const it of [...renglon].sort((a, b) => a.x - b.x)) {
        const k = columnaSigaResumen(it.x);
        cols[k] = (cols[k] ? cols[k] + ' ' : '') + it.text;
      }
      const nm = norm((cols.name ?? '').trim());

      if (nm.includes('RESUMEN')) { iniciado = true; continue; }
      if (!iniciado) continue;

      if (nm.includes('REQUERIDOS DEL PROGRAMA')) {
        res.requeridosPrograma = aEntero(cols.a);
      } else if (nm.includes('ADQUIRIDOS TOTALES')) {
        res.adquiridosTotales = aEntero(cols.a);
        res.faltantesTotales  = aEntero(cols.c);
      } else if (nm.startsWith('SE EMITIRA')) {
        res.certificado = (cols.a ?? '').trim() || null;
      } else if (nm === 'CREDITOS' || nm === 'AREA' || nm.startsWith('Nota')) {
        continue;
      } else if (aEntero(cols.a) !== null && aEntero(cols.b) !== null) {
        res.porArea.push({
          area:       nm,
          requeridos: aEntero(cols.a),
          adquiridos: aEntero(cols.b),
          faltantes:  aEntero(cols.c),
        });
      }
    }
    return res;
  }
  return null;
}

// ─── Punto de entrada público ─────────────────────────────────────────────────

/** Construye el Kardex a partir de páginas ya extraídas (sin re-extraer el PDF). */
export function parseSigaPages(paginas: TextItem[][]): Kardex {
  const estudiante      = parseSigaEstudiante(paginas[0] ?? []);
  const materias        = parseSigaMaterias(paginas);
  const resumenCreditos = parseSigaResumen(paginas);
  return { estudiante, materias, resumenCreditos, totalMaterias: materias.length };
}

/** Wrapper de conveniencia: extrae páginas y parsea en un solo paso.
 *  Útil para tests o llamadas externas. En la API route usar parseSigaPages()
 *  para evitar que el ArrayBuffer sea transferido dos veces al Worker de pdfjs. */
export async function buildKardexSiga(bytes: Uint8Array): Promise<Kardex> {
  const paginas = await extractPages(bytes);
  return parseSigaPages(paginas);
}
