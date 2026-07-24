/* ============================================================================
   SIRPC · Configuración general HOME RUN V4 · FIX CARGA DOCENTE
   - Una sola cita por plan de curso.
   - Esa misma cita sirve para los tres revisores: SIB, APA y Rizoma.
   - Los horarios son bloques de 1 hora.
   ============================================================================ */

window.SIRPC_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxgPxbstKmPx4I62Ac6EFKShFvTflANRs2W_ziiLLtyiCRS0dOqXirkXWQ2Wsg5mS_j/exec",

  VERSION: "20260724-HR04",

  MAX_CUPOS_HORARIO: 4,

  // Edite estas fechas según la jornada real de revisión.
  // Formato obligatorio: AAAA-MM-DD.
  FECHAS_DISPONIBLES: [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06"
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
    Elearning: "Adriana Milena Jimenez Camacho"
  }
};
