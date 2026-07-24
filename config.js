/* ============================================================================
   SIRPC · Configuración general HOME RUN V5 · FIX CARGA DOCENTE + AVA
   - Una sola cita por plan de curso.
   - Esa misma cita sirve para los tres revisores: SIB, APA y AVA.
   - Los horarios son bloques de 1 hora.
   ============================================================================ */

window.SIRPC_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyMrFze11azkTmFGhjWkQ_b_91FWKeHbfuh_s_Y_7SgFyVgxFQHzmPXMcJnLS61f8pK/exec",

  VERSION: "20260724-HR05",

  MAX_CUPOS_HORARIO: 4,

  // Edite estas fechas según la jornada real de revisión.
  // Formato obligatorio: AAAA-MM-DD.
  FECHAS_DISPONIBLES: [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31"
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
