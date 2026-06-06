// Tipos del Kardex de la UdeG (SIIAU)

/** Un intento/registro de calificación de una materia (ordinario, extraordinario, etc.). */
export interface Intento {
  /** Calificación numérica (0–100). null si no se pudo leer. */
  calificacion: number | null;
  /** Calificación con letra, p. ej. "NOVENTA Y CINCO". */
  calificacionTexto: string;
  /** Tipo de evaluación, p. ej. "ORDINARIO (OE)" o "EXTRAORDINARIO (E)". */
  tipo: string;
  /** Número de créditos obtenidos (columna NC). */
  nc: number | null;
  /** Horas / clave de créditos (columna HC). */
  hc: number | null;
  /** Fecha del registro, p. ej. "08/DIC/2023". */
  fecha: string;
}

/** Una materia del Kardex. Los campos de primer nivel reflejan el último intento. */
export interface Materia {
  /** Calendario/ciclo en que se cursó, p. ej. "2023-B". */
  calendario: string | null;
  /** NRC (puede ser numérico de 6 dígitos o un código tipo "SN001"). */
  nrc: string;
  /** Clave de la materia, p. ej. "IL346". */
  clave: string;
  /** Nombre de la materia. */
  nombre: string;
  /** Calificación numérica del último intento. */
  calificacion: number | null;
  /** Calificación con letra del último intento. */
  calificacionTexto: string;
  /** Tipo del último intento. */
  tipo: string;
  /** NC del último intento. */
  nc: number | null;
  /** HC del último intento. */
  hc: number | null;
  /** Fecha del último intento. */
  fecha: string;
  /** Todos los intentos en orden cronológico (>1 cuando hubo recursamiento/extraordinario). */
  intentos: Intento[];
  /** Solo presente en el formato SIGA: true para materias de la sección "CURSOS SIN ÁREA DE ESTUDIOS". */
  sinAreaEstudios?: boolean;
}

/** Renglón del resumen de créditos por área de estudios. */
export interface AreaCreditos {
  area: string;
  requeridos: number | null;
  adquiridos: number | null;
  faltantes: number | null;
}

/** Resumen de créditos del estudiante (parte inferior del Kardex). */
export interface ResumenCreditos {
  requeridosPrograma: number | null;
  adquiridosTotales: number | null;
  faltantesTotales: number | null;
  certificado: string | null;
  porArea: AreaCreditos[];
}

/** Datos del encabezado del estudiante. */
export interface Estudiante {
  codigo: string | null;
  nombre: string | null;
  carrera: string | null;
  nivel: string | null;
  centro: string | null;
  sede: string | null;
  situacion: string | null;
  admision: string | null;
  ultimoCiclo: string | null;
  creditos: number | null;
  promedio: number | null;
}

/** Respuesta completa de la API. */
export interface Kardex {
  estudiante: Estudiante;
  materias: Materia[];
  resumenCreditos: ResumenCreditos | null;
  totalMaterias: number;
}

/** Un fragmento de texto del PDF con su posición. `y` es la coordenada base de pdf.js (origen abajo-izquierda). */
export interface TextItem {
  x: number;
  y: number;
  text: string;
}
