/* ============================================================================
   SIRPC · Configuración general HOME RUN V5 · FIX CARGA DOCENTE + AVA
   - Una sola cita por plan de curso.
   - Esa misma cita sirve para los tres revisores: SIB, APA y AVA.
   - Los horarios son bloques de 1 hora.
   ============================================================================ */

window.SIRPC_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxm3-FD1y78DYaiVBQtKsXB5c8BjGiy4_IDHS5Xu094xYPiFgmg6VkkzO8e8pc6uNLE/exec",

  VERSION: "20260927-V7",

  MAX_CUPOS_HORARIO: 4,

  // Edite estas fechas según la jornada real de revisión.
  // Formato obligatorio: AAAA-MM-DD.
FECHAS_DISPONIBLES: [
  "2026-09-28",
  "2026-09-29",

  "2026-10-01",
  "2026-10-02",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",

  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",

  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",

  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30"
],

  // Bloques de UNA HORA.
  HORARIOS: {
    manana: ["08:00", "09:00", "10:00", "11:00"],
    tarde: ["14:00", "15:00", "16:00"]
  },

  JORNADAS_LABEL: {
    manana: "Mañana",
    tarde: "Tarde"
  },

  REVISORES: {
    SIB: "Marisorelis Carrillo Cantillo",
    APA: "Emilio Alfonso Lara",
    AVA: "Adriana Milena Jimenez Camacho"
  }
};
