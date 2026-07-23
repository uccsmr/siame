/**
 * SIRPC · Backend Google Apps Script · HOME RUN V3
 * Sistema de Información para la Revisión de Planes de Curso
 *
 * Cambio V2:
 * - El docente agenda UNA sola cita integral por plan.
 * - La misma cita sirve para SIB, APA y Rizoma.
 * - La disponibilidad se cuenta por fecha + jornada + hora, no por revisor.
 * - Cada revisor registra su propio VISADO / CON_OBSERVACIONES / NO_ASISTIO.
 */

const SIRPC = {
  SHEETS: {
    PLANES: 'PlanesCurso',
    CITAS: 'Citas',
    REVISIONES: 'Revisiones',
    REVISORES: 'Revisores'
  },
  MAX_CUPOS: 4,
  ESTADOS_CITA_ACTIVOS: ['RESERVADA', 'ACTIVA', 'CONFIRMADA'],
  TIPOS_REVISION: ['SIB', 'APA', 'Rizoma'],
  REVISORES: {
    'SIB': 'Marisorelis Carrillo Cantillo',
    'APA': 'Emilio Alfonso Lara',
    'Rizoma': 'Adriana Milena Jimenez Camacho'
  },
  TIPO_CITA_INTEGRAL: 'Integral'
};

function doGet(e) {
  return handleRequest_(e, true);
}

function doPost(e) {
  return handleRequest_(e, false);
}

function handleRequest_(e, isGet) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
    let payload = {};

    if (isGet && e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    } else if (!isGet && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const result = route_(action, payload || {});
    return output_(result, e);
  } catch (err) {
    return output_({ ok: false, message: err && err.message ? err.message : String(err) }, e);
  }
}

function route_(action, payload) {
  if (action === 'ping') return { ok: true, message: 'SIRPC backend V3 activo', timestamp: now_() };
  if (action === 'buscarPlanes') return buscarPlanes_(payload);
  if (action === 'getDisponibilidad') return getDisponibilidad_(payload);
  if (action === 'reservarCita') return reservarCita_(payload);
  if (action === 'cancelarCita') return cancelarCita_(payload);
  if (action === 'listarCitas') return listarCitas_(payload);
  if (action === 'listarRevision') return listarRevision_(payload);
  if (action === 'actualizarRevision') return actualizarRevision_(payload);
  throw new Error('Acción no reconocida: ' + action);
}

function output_(obj, e) {
  const json = JSON.stringify(obj);
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function ss_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No se encontró Spreadsheet activo. Cree este Apps Script desde el Google Sheets.');
  return ss;
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('No existe la hoja requerida: ' + name);
  return sh;
}

function headers_(sh) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const arr = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = {};
  arr.forEach(function(h, i) {
    if (h) map[String(h).trim()] = i + 1;
  });
  return { list: arr, map: map };
}

function rows_(sheetName) {
  const sh = sheet_(sheetName);
  const hm = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, hm.list.length).getDisplayValues();
  return values.map(function(row, idx) {
    const obj = { _rowNumber: idx + 2 };
    hm.list.forEach(function(h, i) {
      obj[h] = row[i] == null ? '' : String(row[i]).trim();
    });
    return obj;
  });
}

function appendObject_(sheetName, obj) {
  const sh = sheet_(sheetName);
  const hm = headers_(sh);
  const row = hm.list.map(function(h) { return obj[h] == null ? '' : obj[h]; });
  sh.appendRow(row);
}

function updateRow_(sheetName, rowNumber, updates) {
  const sh = sheet_(sheetName);
  const hm = headers_(sh).map;
  Object.keys(updates).forEach(function(key) {
    if (hm[key]) sh.getRange(rowNumber, hm[key]).setValue(updates[key] == null ? '' : updates[key]);
  });
}

function norm_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function normDoc_(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function upper_(v) {
  return String(v == null ? '' : v).trim().toUpperCase();
}

function normTime_(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return '';
  s = s.replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return String(m[1]).padStart(2, '0') + ':' + m[2];
}

function normFecha_(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  return s;
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function reservaId_() {
  return 'SIRPC-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 9000 + 1000);
}

function isActiveCita_(estado) {
  return SIRPC.ESTADOS_CITA_ACTIVOS.indexOf(upper_(estado)) >= 0;
}

function isTerminalRevision_(estado) {
  return ['VISADO', 'CON_OBSERVACIONES', 'NO_ASISTIO'].indexOf(upper_(estado)) >= 0;
}

function buscarPlanes_(payload) {
  const qRaw = String(payload.query || '').trim();
  if (!qRaw) throw new Error('Debe ingresar documento o correo institucional.');

  const q = norm_(qRaw);
  const qDoc = normDoc_(qRaw);
  const planes = rows_(SIRPC.SHEETS.PLANES).filter(function(p) {
    if (upper_(p.EstadoPlan) === 'PENDIENTE_DOCENTE') return false;
    const doc = normDoc_(p['Documento Profesor']);
    const correo = norm_(p['Correo-E']);
    const nombre = norm_(p['Nombre_Completo']);
    return (qDoc && doc === qDoc) || correo === q || nombre.indexOf(q) >= 0;
  });

  const revisiones = rows_(SIRPC.SHEETS.REVISIONES);
  const citas = rows_(SIRPC.SHEETS.CITAS);

  const planesConEstado = planes.map(function(p) {
    const revs = SIRPC.TIPOS_REVISION.map(function(tipo) {
      return estadoRevisionPlan_(p.IDPlan, tipo, revisiones, citas);
    });
    p.revisiones = revs;
    return p;
  });

  let docente = null;
  if (planesConEstado.length > 0) {
    docente = {
      documento: planesConEstado[0]['Documento Profesor'],
      nombre: planesConEstado[0]['Nombre_Completo'],
      correo: planesConEstado[0]['Correo-E']
    };
  }

  return { ok: true, docente: docente, planes: planesConEstado };
}

function estadoRevisionPlan_(idPlan, tipo, revisiones, citas) {
  const rev = revisiones.find(function(r) { return r.IDPlan === idPlan && r.TipoRevision === tipo; }) || {};
  const citaActiva = citas.find(function(c) {
    return c.IDPlan === idPlan && isActiveCita_(c.EstadoCita);
  });

  const base = {
    IDPlan: idPlan,
    TipoRevision: tipo,
    RevisorAsignado: rev.RevisorAsignado || SIRPC.REVISORES[tipo] || '',
    EstadoRevision: rev.EstadoRevision || 'PENDIENTE',
    NumeroReservaActivo: rev.NumeroReservaActivo || '',
    FechaCita: rev.FechaCita || '',
    HoraCita: rev.HoraCita || '',
    Jornada: rev.Jornada || '',
    citaActiva: null
  };

  if (citaActiva) {
    base.NumeroReservaActivo = citaActiva.NumeroReserva;
    base.FechaCita = normFecha_(citaActiva.FechaCita);
    base.HoraCita = normTime_(citaActiva.HoraCita);
    base.Jornada = citaActiva.Jornada;
    base.citaActiva = citaActiva.NumeroReserva;
    if (!isTerminalRevision_(base.EstadoRevision)) {
      base.EstadoRevision = 'CITA_RESERVADA';
    }
  }

  return base;
}

function getDisponibilidad_(payload) {
  const fecha = normFecha_(payload.fecha);
  const jornada = String(payload.jornada || '').toLowerCase().indexOf('tarde') >= 0 ? 'Tarde' : 'Mañana';

  if (!fecha) throw new Error('La fecha es obligatoria.');

  const citas = rows_(SIRPC.SHEETS.CITAS);
  const ocupados = {};

  citas.forEach(function(c) {
    if (!isActiveCita_(c.EstadoCita)) return;
    if (normFecha_(c.FechaCita) !== fecha) return;
    if (String(c.Jornada).trim() !== jornada) return;
    const hora = normTime_(c.HoraCita);
    ocupados[hora] = (ocupados[hora] || 0) + 1;
  });

  return { ok: true, ocupados: ocupados, maxCupos: SIRPC.MAX_CUPOS };
}

function reservarCita_(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('El sistema está procesando otra reserva. Intente nuevamente.');

  try {
    const idPlan = String(payload.IDPlan || '').trim();
    const fecha = normFecha_(payload.FechaCita);
    const hora = normTime_(payload.HoraCita);
    const jornada = String(payload.Jornada || '').toLowerCase().indexOf('tarde') >= 0 ? 'Tarde' : 'Mañana';

    if (!idPlan || !fecha || !hora) throw new Error('Faltan datos obligatorios para reservar la cita.');

    const plan = rows_(SIRPC.SHEETS.PLANES).find(function(p) {
      return p.IDPlan === idPlan && upper_(p.EstadoPlan) !== 'PENDIENTE_DOCENTE';
    });
    if (!plan) throw new Error('El plan de curso no existe o no está activo.');

    const revisiones = rows_(SIRPC.SHEETS.REVISIONES).filter(function(r) { return r.IDPlan === idPlan; });
    const todasVisadas = SIRPC.TIPOS_REVISION.every(function(tipo) {
      return revisiones.some(function(r) { return r.TipoRevision === tipo && upper_(r.EstadoRevision) === 'VISADO'; });
    });
    if (todasVisadas) throw new Error('Este plan ya está completamente visado. No requiere nueva cita.');

    const citas = rows_(SIRPC.SHEETS.CITAS);

    const yaTiene = citas.find(function(c) {
      return c.IDPlan === idPlan && isActiveCita_(c.EstadoCita);
    });
    if (yaTiene) throw new Error('Este plan ya tiene una cita integral activa. Debe cancelar antes de volver a reservar.');

    const ocupados = citas.filter(function(c) {
      return isActiveCita_(c.EstadoCita)
        && normFecha_(c.FechaCita) === fecha
        && normTime_(c.HoraCita) === hora
        && String(c.Jornada).trim() === jornada;
    }).length;

    if (ocupados >= SIRPC.MAX_CUPOS) throw new Error('El horario seleccionado ya no tiene cupos disponibles.');

    const numero = reservaId_();
    const obj = {
      NumeroReserva: numero,
      FechaRegistro: now_(),
      IDPlan: idPlan,
      TipoRevision: SIRPC.TIPO_CITA_INTEGRAL,
      RevisorAsignado: 'SIB / APA / Rizoma',
      'Documento Profesor': payload['Documento Profesor'] || plan['Documento Profesor'],
      'Nombre_Completo': payload['Nombre_Completo'] || plan['Nombre_Completo'],
      'Correo-E': payload['Correo-E'] || plan['Correo-E'],
      'ID Curso': payload['ID Curso'] || plan['ID Curso'],
      'Descripción': payload['Descripción'] || plan['Descripción'],
      'Nº Clase': payload['Nº Clase'] || plan['Nº Clase'],
      FechaCita: fecha,
      HoraCita: hora,
      Jornada: jornada,
      EstadoCita: 'RESERVADA',
      EstadoRevision: 'CITA_RESERVADA',
      FechaCancelacion: '',
      MotivoCancelacion: '',
      FechaVisado: '',
      ObservacionesRevisor: '',
      UsuarioRegistro: 'Docente'
    };
    appendObject_(SIRPC.SHEETS.CITAS, obj);

    SIRPC.TIPOS_REVISION.forEach(function(tipo) {
      const rev = revisiones.find(function(r) { return r.TipoRevision === tipo; });
      if (rev && upper_(rev.EstadoRevision) === 'VISADO') return;
      upsertRevision_(idPlan, tipo, {
        EstadoRevision: 'CITA_RESERVADA',
        NumeroReservaActivo: numero,
        FechaCita: fecha,
        HoraCita: hora,
        Jornada: jornada,
        FechaVisado: '',
        ObservacionesRevisor: '',
        ActualizadoEn: now_()
      }, plan);
    });

    if (upper_(plan.EstadoPlan) !== 'COMPLETAMENTE_VISADO') {
      updateRow_(SIRPC.SHEETS.PLANES, plan._rowNumber, { EstadoPlan: 'EN_PROCESO' });
    }

    return { ok: true, numeroReserva: numero, message: 'Cita integral registrada correctamente.' };
  } finally {
    lock.releaseLock();
  }
}

function cancelarCita_(payload) {
  const idPlan = String(payload.IDPlan || '').trim();
  const doc = normDoc_(payload['Documento Profesor'] || payload.documento || '');
  const motivo = String(payload.MotivoCancelacion || '').trim();

  if (!idPlan || !doc) throw new Error('Faltan datos para cancelar la cita.');

  const citas = rows_(SIRPC.SHEETS.CITAS);
  const cita = citas.find(function(c) {
    return c.IDPlan === idPlan && normDoc_(c['Documento Profesor']) === doc && isActiveCita_(c.EstadoCita);
  });
  if (!cita) throw new Error('No se encontró cita integral activa para cancelar.');

  updateRow_(SIRPC.SHEETS.CITAS, cita._rowNumber, {
    EstadoCita: 'CANCELADA',
    EstadoRevision: 'CANCELADA',
    FechaCancelacion: now_(),
    MotivoCancelacion: motivo
  });

  const plan = rows_(SIRPC.SHEETS.PLANES).find(function(p) { return p.IDPlan === idPlan; });
  SIRPC.TIPOS_REVISION.forEach(function(tipo) {
    const revs = rows_(SIRPC.SHEETS.REVISIONES);
    const rev = revs.find(function(r) { return r.IDPlan === idPlan && r.TipoRevision === tipo; });
    if (rev && upper_(rev.EstadoRevision) === 'VISADO') return;
    upsertRevision_(idPlan, tipo, {
      EstadoRevision: 'CANCELADA',
      NumeroReservaActivo: '',
      FechaCita: '',
      HoraCita: '',
      Jornada: '',
      ActualizadoEn: now_()
    }, plan || {});
  });

  return { ok: true, message: 'Cita integral cancelada correctamente. El cupo vuelve a quedar disponible.' };
}

function listarCitas_(payload) {
  const revisiones = rows_(SIRPC.SHEETS.REVISIONES);
  let data = rows_(SIRPC.SHEETS.CITAS).map(function(c) {
    c.FechaCita = normFecha_(c.FechaCita);
    c.HoraCita = normTime_(c.HoraCita);
    c.EstadoSIB = estadoTipo_(c.IDPlan, 'SIB', revisiones);
    c.EstadoAPA = estadoTipo_(c.IDPlan, 'APA', revisiones);
    c.EstadoRizoma = estadoTipo_(c.IDPlan, 'Rizoma', revisiones);
    return c;
  });

  if (payload && payload.EstadoCita) {
    data = data.filter(function(c) { return c.EstadoCita === payload.EstadoCita; });
  }

  return { ok: true, citas: data };
}

function listarRevision_(payload) {
  const tipo = String(payload.TipoRevision || '').trim();
  if (SIRPC.TIPOS_REVISION.indexOf(tipo) < 0) throw new Error('Tipo de revisión no válido.');

  const citas = rows_(SIRPC.SHEETS.CITAS).filter(function(c) {
    return c.EstadoCita !== 'CANCELADA';
  });
  const revisiones = rows_(SIRPC.SHEETS.REVISIONES).filter(function(r) {
    return r.TipoRevision === tipo;
  });

  const data = [];
  revisiones.forEach(function(r) {
    const cita = citas.find(function(c) {
      return c.IDPlan === r.IDPlan && c.NumeroReserva === r.NumeroReservaActivo;
    }) || citas.find(function(c) {
      return c.IDPlan === r.IDPlan && isActiveCita_(c.EstadoCita);
    });

    if (!cita) return;

    data.push({
      NumeroReserva: cita.NumeroReserva,
      IDPlan: r.IDPlan,
      TipoRevision: tipo,
      RevisorAsignado: r.RevisorAsignado || SIRPC.REVISORES[tipo],
      'Documento Profesor': cita['Documento Profesor'] || r['Documento Profesor'],
      'Nombre_Completo': cita['Nombre_Completo'] || r['Nombre_Completo'],
      'Correo-E': cita['Correo-E'] || r['Correo-E'],
      'ID Curso': cita['ID Curso'] || r['ID Curso'],
      'Descripción': cita['Descripción'] || r['Descripción'],
      'Nº Clase': cita['Nº Clase'] || r['Nº Clase'],
      FechaCita: normFecha_(cita.FechaCita),
      HoraCita: normTime_(cita.HoraCita),
      Jornada: cita.Jornada,
      EstadoCita: cita.EstadoCita,
      EstadoRevision: r.EstadoRevision || 'PENDIENTE',
      ObservacionesRevisor: r.ObservacionesRevisor || '',
      FechaVisado: r.FechaVisado || ''
    });
  });

  return { ok: true, citas: data };
}

function estadoTipo_(idPlan, tipo, revisiones) {
  const r = revisiones.find(function(x) { return x.IDPlan === idPlan && x.TipoRevision === tipo; });
  return r ? (r.EstadoRevision || 'PENDIENTE') : 'PENDIENTE';
}

function actualizarRevision_(payload) {
  const numero = String(payload.NumeroReserva || '').trim();
  const tipo = String(payload.TipoRevision || '').trim();
  const estado = upper_(payload.EstadoRevision || '');
  const obs = String(payload.ObservacionesRevisor || '').trim();
  const usuario = String(payload.UsuarioRegistro || 'Revisor').trim();

  if (!numero || !tipo || !estado) throw new Error('Número de reserva, tipo de revisión y estado son obligatorios.');
  if (SIRPC.TIPOS_REVISION.indexOf(tipo) < 0) throw new Error('Tipo de revisión no válido.');
  if (['VISADO', 'CON_OBSERVACIONES', 'NO_ASISTIO'].indexOf(estado) < 0) {
    throw new Error('Estado de revisión no permitido: ' + estado);
  }

  const citas = rows_(SIRPC.SHEETS.CITAS);
  const cita = citas.find(function(c) { return c.NumeroReserva === numero; });
  if (!cita) throw new Error('No se encontró la reserva: ' + numero);
  if (cita.EstadoCita === 'CANCELADA') throw new Error('La cita está cancelada. No se puede actualizar la revisión.');

  const plan = rows_(SIRPC.SHEETS.PLANES).find(function(p) { return p.IDPlan === cita.IDPlan; }) || {};

  upsertRevision_(cita.IDPlan, tipo, {
    EstadoRevision: estado,
    NumeroReservaActivo: estado === 'VISADO' ? '' : numero,
    FechaCita: normFecha_(cita.FechaCita),
    HoraCita: normTime_(cita.HoraCita),
    Jornada: cita.Jornada,
    FechaVisado: now_(),
    ObservacionesRevisor: obs,
    ActualizadoEn: now_()
  }, plan);

  actualizarEstadoCitaYPlan_(cita, usuario);

  return { ok: true, message: 'Revisión ' + tipo + ' actualizada correctamente.' };
}

function upsertRevision_(idPlan, tipo, updates, plan) {
  const revisiones = rows_(SIRPC.SHEETS.REVISIONES);
  const rev = revisiones.find(function(r) { return r.IDPlan === idPlan && r.TipoRevision === tipo; });

  if (rev) {
    updateRow_(SIRPC.SHEETS.REVISIONES, rev._rowNumber, updates);
    return;
  }

  const obj = {
    IDRevision: idPlan + '-' + tipo,
    IDPlan: idPlan,
    TipoRevision: tipo,
    RevisorAsignado: SIRPC.REVISORES[tipo] || '',
    'Documento Profesor': plan['Documento Profesor'] || '',
    'Nombre_Completo': plan['Nombre_Completo'] || '',
    'Correo-E': plan['Correo-E'] || '',
    'ID Curso': plan['ID Curso'] || '',
    'Descripción': plan['Descripción'] || '',
    'Nº Clase': plan['Nº Clase'] || '',
    EstadoRevision: updates.EstadoRevision || 'PENDIENTE',
    NumeroReservaActivo: updates.NumeroReservaActivo || '',
    FechaCita: updates.FechaCita || '',
    HoraCita: updates.HoraCita || '',
    Jornada: updates.Jornada || '',
    FechaVisado: updates.FechaVisado || '',
    ObservacionesRevisor: updates.ObservacionesRevisor || '',
    ActualizadoEn: updates.ActualizadoEn || now_()
  };
  appendObject_(SIRPC.SHEETS.REVISIONES, obj);
}

function actualizarEstadoCitaYPlan_(cita, usuario) {
  const revs = rows_(SIRPC.SHEETS.REVISIONES).filter(function(r) {
    return r.IDPlan === cita.IDPlan && SIRPC.TIPOS_REVISION.indexOf(r.TipoRevision) >= 0;
  });

  const estados = {};
  SIRPC.TIPOS_REVISION.forEach(function(tipo) {
    const r = revs.find(function(x) { return x.TipoRevision === tipo; });
    estados[tipo] = r ? upper_(r.EstadoRevision) : 'PENDIENTE';
  });

  let estadoCita = 'RESERVADA';
  let estadoRevisionGeneral = 'CITA_RESERVADA';

  const todosTerminales = SIRPC.TIPOS_REVISION.every(function(tipo) { return isTerminalRevision_(estados[tipo]); });
  const todosVisados = SIRPC.TIPOS_REVISION.every(function(tipo) { return estados[tipo] === 'VISADO'; });
  const algunoNoAsistio = SIRPC.TIPOS_REVISION.some(function(tipo) { return estados[tipo] === 'NO_ASISTIO'; });
  const algunoObservaciones = SIRPC.TIPOS_REVISION.some(function(tipo) { return estados[tipo] === 'CON_OBSERVACIONES'; });

  if (algunoNoAsistio) {
    estadoCita = 'NO_ASISTIO';
    estadoRevisionGeneral = 'NO_ASISTIO';
  } else if (todosVisados) {
    estadoCita = 'ATENDIDA';
    estadoRevisionGeneral = 'COMPLETAMENTE_VISADO';
  } else if (todosTerminales && algunoObservaciones) {
    estadoCita = 'ATENDIDA';
    estadoRevisionGeneral = 'CON_OBSERVACIONES';
  } else if (algunoObservaciones || estados.SIB === 'VISADO' || estados.APA === 'VISADO' || estados.Rizoma === 'VISADO') {
    estadoCita = 'RESERVADA';
    estadoRevisionGeneral = 'EN_PROCESO';
  }

  const citas = rows_(SIRPC.SHEETS.CITAS);
  const citaActual = citas.find(function(c) { return c.NumeroReserva === cita.NumeroReserva; });
  if (citaActual) {
    updateRow_(SIRPC.SHEETS.CITAS, citaActual._rowNumber, {
      EstadoCita: estadoCita,
      EstadoRevision: estadoRevisionGeneral,
      FechaVisado: todosTerminales || todosVisados || algunoNoAsistio ? now_() : '',
      ObservacionesRevisor: resumenObservaciones_(revs),
      UsuarioRegistro: usuario
    });
  }

  const plan = rows_(SIRPC.SHEETS.PLANES).find(function(p) { return p.IDPlan === cita.IDPlan; });
  if (plan) {
    let estadoPlan = 'EN_PROCESO';
    if (todosVisados) estadoPlan = 'COMPLETAMENTE_VISADO';
    else if (algunoNoAsistio) estadoPlan = 'NO_ASISTIO';
    else if (algunoObservaciones) estadoPlan = 'CON_OBSERVACIONES';
    updateRow_(SIRPC.SHEETS.PLANES, plan._rowNumber, { EstadoPlan: estadoPlan });
  }
}

function resumenObservaciones_(revs) {
  const partes = [];
  SIRPC.TIPOS_REVISION.forEach(function(tipo) {
    const r = revs.find(function(x) { return x.TipoRevision === tipo; });
    if (r && r.ObservacionesRevisor) partes.push(tipo + ': ' + r.ObservacionesRevisor);
  });
  return partes.join(' | ');
}
