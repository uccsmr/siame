/* ============================================================================
   SIRPC · Frontend HOME RUN V3
   Agenda integral: un solo horario por plan de curso para SIB, APA y Rizoma.
   Usa JSONP para evitar bloqueos CORS entre GitHub Pages y Google Apps Script.
   ============================================================================ */

(function(){
  "use strict";

  const CFG = window.SIRPC_CONFIG || {};
  const API_URL = String(CFG.API_URL || "").trim();
  const MAX_CUPOS = Number(CFG.MAX_CUPOS_HORARIO || 4);
  const REVISORES = CFG.REVISORES || {
    SIB: "Marisorelis Carrillo Cantillo",
    APA: "Emilio Alfonso Lara",
    E-Learning: "Adriana Milena Jimenez Camacho"
  };
  const HORARIOS = CFG.HORARIOS || { manana: [], tarde: [] };
  const FECHAS = CFG.FECHAS_DISPONIBLES || [];

  let planesActuales = [];
  let agendaActual = null;
  let citasActuales = [];
  let revisionActual = [];

  const $ = (id) => document.getElementById(id);

  function htmlEscape(str){
    return String(str == null ? "" : str).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function normalize(str){
    return String(str == null ? "" : str).trim().toLowerCase();
  }

  function estadoUpper(str){
    return String(str == null ? "" : str).trim().toUpperCase();
  }

  function formatDate(yyyyMMdd){
    if(!yyyyMMdd) return "";
    const parts = String(yyyyMMdd).split("-").map(Number);
    if(parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return yyyyMMdd;
    const fecha = new Date(parts[0], parts[1]-1, parts[2]);
    return fecha.toLocaleDateString("es-CO", { weekday:"short", year:"numeric", month:"short", day:"2-digit" });
  }

  function rangoHorario(hora){
    const h = String(hora || "").slice(0,5);
    const m = h.match(/^(\d{2}):(\d{2})$/);
    if(!m) return h;
    const start = Number(m[1]);
    const end = start + 1;
    return `${h} - ${String(end).padStart(2,"0")}:00`;
  }

  function showMsg(text, type="info"){
    const box = $("msg");
    if(!box) return;
    box.className = `msg ${type}`;
    box.innerHTML = text;
  }

  function clearMsg(){
    const box = $("msg");
    if(!box) return;
    box.className = "hidden";
    box.innerHTML = "";
  }

  function validateConfig(){
    if(!API_URL || API_URL.includes("PEGUE_AQUI") || !API_URL.includes("/exec")){
      showMsg("Falta configurar la URL /exec de Google Apps Script en <b>config.js</b>.", "error");
      return false;
    }
    return true;
  }

  function apiCall(action, payload = {}){
    if(!validateConfig()) return Promise.reject(new Error("API_URL no configurada"));

    return new Promise((resolve, reject) => {
      const cbName = "sirpc_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Tiempo de espera agotado consultando Google Apps Script."));
      }, 30000);

      function cleanup(){
        clearTimeout(timer);
        try { delete window[cbName]; } catch(e) { window[cbName] = undefined; }
        if(script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function(response){
        cleanup();
        if(response && response.ok){
          resolve(response);
        }else{
          reject(new Error((response && response.message) || "Respuesta no válida del backend."));
        }
      };

      const url = API_URL
        + "?action=" + encodeURIComponent(action)
        + "&payload=" + encodeURIComponent(JSON.stringify(payload || {}))
        + "&callback=" + encodeURIComponent(cbName)
        + "&_=" + Date.now();

      script.onerror = function(){
        cleanup();
        reject(new Error("No se pudo conectar con Google Apps Script. Revise la URL /exec y permisos de implementación."));
      };
      script.src = url;
      document.body.appendChild(script);
    });
  }

  function badgeEstado(estado){
    const e = normalize(estado || "PENDIENTE");
    let cls = "pendiente";
    if(e.includes("reserv") || e.includes("proceso")) cls = "reservada";
    if(e.includes("visado") || e.includes("completamente")) cls = "visado";
    if(e.includes("observ")) cls = "obs";
    if(e.includes("cancel")) cls = "cancelada";
    if(e.includes("asistio") || e.includes("asistió")) cls = "no";
    return `<span class="badge ${cls}">${htmlEscape(estado || "PENDIENTE")}</span>`;
  }

  function init(){
    const page = document.body.dataset.page;
    if(!validateConfig()) return;

    if(page === "docente") initDocente();
    if(page === "citas") initCitas();
    if(page === "revision") initRevision();
  }

  // -----------------------------------------------------------------------
  // Página docente
  // -----------------------------------------------------------------------
  function initDocente(){
    $("btnCargarPlanes").addEventListener("click", cargarPlanes);
    $("txtConsulta").addEventListener("keydown", (e) => {
      if(e.key === "Enter") cargarPlanes();
    });
  }

  async function cargarPlanes(){
    clearMsg();
    const query = $("txtConsulta").value.trim();
    if(!query){
      showMsg("Ingrese documento o correo institucional.", "warn");
      return;
    }
    $("btnCargarPlanes").disabled = true;
    $("btnCargarPlanes").textContent = "Cargando...";
    $("planesContainer").innerHTML = "";
    $("agendaBox").classList.add("hidden");

    try{
      const res = await apiCall("buscarPlanes", { query });
      planesActuales = res.planes || [];
      renderResumenDocente(res);
      renderPlanes();
      if(planesActuales.length === 0){
        showMsg("No se encontraron planes activos para el documento/correo ingresado.", "warn");
      }else{
        showMsg(`Se encontraron <b>${planesActuales.length}</b> planes de curso asignados.`, "ok");
      }
    }catch(err){
      showMsg(err.message, "error");
    }finally{
      $("btnCargarPlanes").disabled = false;
      $("btnCargarPlanes").textContent = "Cargar planes asignados";
    }
  }

  function renderResumenDocente(res){
    const box = $("resumenDocente");
    if(!box) return;
    if(!res.docente){
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = `
      <h2>👤 Docente</h2>
      <div class="grid">
        <div><b>Nombre:</b><br>${htmlEscape(res.docente.nombre || "")}</div>
        <div><b>Documento:</b><br>${htmlEscape(res.docente.documento || "")}</div>
        <div><b>Correo:</b><br>${htmlEscape(res.docente.correo || "")}</div>
        <div><b>Planes activos:</b><br>${htmlEscape(res.planes ? res.planes.length : 0)}</div>
      </div>
    `;
  }

  function getPlanEstadoIntegral(plan){
    const revisiones = plan.revisiones || [];
    const active = revisiones.find(r => r.citaActiva || estadoUpper(r.EstadoRevision) === "CITA_RESERVADA");
    const allVisado = ["SIB","APA","Rizoma"].every(tipo => {
      const r = revisiones.find(x => x.TipoRevision === tipo);
      return r && estadoUpper(r.EstadoRevision) === "VISADO";
    });
    return { active, allVisado };
  }

  function renderPlanes(){
    const cont = $("planesContainer");
    cont.innerHTML = "";

    planesActuales.forEach((plan, idx) => {
      const revisiones = plan.revisiones || [];
      const integral = getPlanEstadoIntegral(plan);

      const revHtml = ["SIB","APA","Rizoma"].map((tipo) => {
        const rev = revisiones.find(r => r.TipoRevision === tipo) || {};
        const estado = rev.EstadoRevision || "PENDIENTE";
        return `
          <div class="rev-card">
            <h4>${htmlEscape(tipo)}</h4>
            <div>${badgeEstado(estado)}</div>
            <div class="revisor">${htmlEscape(rev.RevisorAsignado || REVISORES[tipo] || "")}</div>
            ${rev.FechaCita ? `<div class="revisor"><b>Cita:</b> ${htmlEscape(formatDate(rev.FechaCita))} · ${htmlEscape(rangoHorario(rev.HoraCita))} · ${htmlEscape(rev.Jornada)}</div>` : ""}
          </div>
        `;
      }).join("");

      let actionHtml = "";
      if(integral.allVisado){
        actionHtml = `<div class="note-green">✅ Este plan ya cuenta con visado completo de SIB, APA y Rizoma.</div>`;
      }else if(integral.active){
        actionHtml = `
          <div class="note-green">
            📌 Cita integral reservada para <b>${htmlEscape(formatDate(integral.active.FechaCita))}</b>,
            bloque <b>${htmlEscape(rangoHorario(integral.active.HoraCita))}</b>, jornada <b>${htmlEscape(integral.active.Jornada)}</b>.<br>
            Esta única cita aplica para SIB, APA y Rizoma.
          </div>
          <div class="actions-row">
            <button class="btn-danger btn-small" data-action="cancelar" data-plan="${idx}">Cancelar cita integral</button>
          </div>
        `;
      }else{
        actionHtml = `
          <div class="note-green">🗓️ Agende una sola cita para que el plan sea revisado por SIB, APA y Rizoma.</div>
          <div class="actions-row">
            <button class="btn-green btn-small" data-action="agendar" data-plan="${idx}">Agendar cita integral</button>
          </div>
        `;
      }

      const div = document.createElement("div");
      div.className = "plan";
      div.innerHTML = `
        <div class="plan-title">${htmlEscape(plan["Descripción"] || "Plan de curso")}</div>
        <div class="plan-meta">
          <b>IDPlan:</b> ${htmlEscape(plan.IDPlan)}<br>
          <b>ID Curso:</b> ${htmlEscape(plan["ID Curso"])} ·
          <b>Nº Clase:</b> ${htmlEscape(plan["Nº Clase"])} ·
          <b>Org Acad:</b> ${htmlEscape(plan["Org Acad"])}<br>
          <b>Sede:</b> ${htmlEscape(plan["Sede"] || "")} ·
          <b>Sección:</b> ${htmlEscape(plan["Sección"] || "")} ·
          <b>Ciclo:</b> ${htmlEscape(plan["Ciclo"] || "")}<br>
          <b>Estudiantes:</b> ${htmlEscape(plan["Total de Estudiantes Inscritos"])} ·
          <b>Modo:</b> ${htmlEscape(plan["Modo Enseñanza"])}
        </div>
        <div class="integral-box">
          <h3>Revisión integral del plan</h3>
          <div class="integral-status">${revHtml}</div>
          ${actionHtml}
        </div>
      `;
      cont.appendChild(div);
    });

    cont.querySelectorAll("button[data-action='agendar']").forEach(btn => {
      btn.addEventListener("click", () => abrirAgenda(Number(btn.dataset.plan)));
    });
    cont.querySelectorAll("button[data-action='cancelar']").forEach(btn => {
      btn.addEventListener("click", () => cancelarCita(Number(btn.dataset.plan)));
    });
  }

  function abrirAgenda(planIndex){
    const plan = planesActuales[planIndex];
    agendaActual = { plan, fecha: FECHAS[0] || "", jornada: "manana", hora: "" };

    const box = $("agendaBox");
    box.classList.remove("hidden");
    box.innerHTML = `
      <h2>🗓️ Agendar cita integral</h2>
      <p class="help">
        Plan: <b>${htmlEscape(plan["Descripción"])}</b><br>
        Revisión: <b>SIB + APA + Rizoma</b><br>
        Revisores: ${htmlEscape(REVISORES.SIB)}, ${htmlEscape(REVISORES.APA)} y ${htmlEscape(REVISORES.Rizoma)}.
      </p>
      <h3>1. Seleccione fecha</h3>
      <div class="date-grid" id="fechaGrid">
        ${FECHAS.map(f => `<div class="choice ${f===agendaActual.fecha?'sel':''}" data-fecha="${htmlEscape(f)}">${htmlEscape(formatDate(f))}</div>`).join("")}
      </div>
      <h3>2. Seleccione jornada</h3>
      <div class="journey-grid">
        <div class="choice sel" data-jornada="manana">🌞 Mañana<br><small>8:00 a.m. - 12:00 m.</small></div>
        <div class="choice" data-jornada="tarde">🌇 Tarde<br><small>2:00 p.m. - 5:00 p.m.</small></div>
      </div>
      <h3>3. Horarios disponibles</h3>
      <div id="slotsMsg" class="msg info">Cargando disponibilidad...</div>
      <div class="slots" id="slotsGrid"></div>
      <div class="row">
        <button id="btnConfirmarAgenda" class="btn-green" disabled>Confirmar cita integral</button>
        <button id="btnCerrarAgenda" class="btn-outline">Cerrar</button>
      </div>
    `;

    box.scrollIntoView({ behavior:"smooth", block:"start" });

    box.querySelectorAll("[data-fecha]").forEach(el => {
      el.addEventListener("click", () => {
        agendaActual.fecha = el.dataset.fecha;
        agendaActual.hora = "";
        box.querySelectorAll("[data-fecha]").forEach(x => x.classList.remove("sel"));
        el.classList.add("sel");
        cargarDisponibilidad();
      });
    });
    box.querySelectorAll("[data-jornada]").forEach(el => {
      el.addEventListener("click", () => {
        agendaActual.jornada = el.dataset.jornada;
        agendaActual.hora = "";
        box.querySelectorAll("[data-jornada]").forEach(x => x.classList.remove("sel"));
        el.classList.add("sel");
        cargarDisponibilidad();
      });
    });
    $("btnCerrarAgenda").addEventListener("click", () => box.classList.add("hidden"));
    $("btnConfirmarAgenda").addEventListener("click", confirmarAgenda);

    cargarDisponibilidad();
  }

  async function cargarDisponibilidad(){
    const slotsGrid = $("slotsGrid");
    const slotsMsg = $("slotsMsg");
    const btn = $("btnConfirmarAgenda");
    if(!slotsGrid || !agendaActual) return;
    slotsGrid.innerHTML = "";
    btn.disabled = true;

    if(!agendaActual.fecha){
      slotsMsg.className = "msg warn";
      slotsMsg.textContent = "No hay fechas configuradas en config.js.";
      return;
    }

    slotsMsg.className = "msg info";
    slotsMsg.textContent = "Consultando cupos ocupados...";

    try{
      const res = await apiCall("getDisponibilidad", {
        fecha: agendaActual.fecha,
        jornada: agendaActual.jornada
      });
      const ocupados = res.ocupados || {};
      const lista = HORARIOS[agendaActual.jornada] || [];

      slotsGrid.innerHTML = lista.map(h => {
        const usados = Number(ocupados[h] || 0);
        const quedan = Math.max(0, MAX_CUPOS - usados);
        const full = quedan <= 0;
        return `
          <div class="slot ${full ? 'full' : ''}" data-hora="${htmlEscape(h)}">
            ${htmlEscape(rangoHorario(h))}
            <small>${full ? "Sin cupos" : `Quedan ${quedan}/${MAX_CUPOS}`}</small>
          </div>
        `;
      }).join("");

      slotsGrid.querySelectorAll(".slot:not(.full)").forEach(el => {
        el.addEventListener("click", () => {
          agendaActual.hora = el.dataset.hora;
          slotsGrid.querySelectorAll(".slot").forEach(x => x.classList.remove("sel"));
          el.classList.add("sel");
          btn.disabled = false;
        });
      });

      slotsMsg.className = "msg ok";
      slotsMsg.textContent = `Cada bloque admite máximo ${MAX_CUPOS} reservas. El mismo horario sirve para SIB, APA y Rizoma.`;
    }catch(err){
      slotsMsg.className = "msg error";
      slotsMsg.textContent = err.message;
    }
  }

  async function confirmarAgenda(){
    if(!agendaActual || !agendaActual.hora){
      showMsg("Seleccione un horario.", "warn");
      return;
    }
    const btn = $("btnConfirmarAgenda");
    btn.disabled = true;
    btn.textContent = "Guardando...";

    try{
      const p = agendaActual.plan;
      const payload = {
        IDPlan: p.IDPlan,
        FechaCita: agendaActual.fecha,
        HoraCita: agendaActual.hora,
        Jornada: agendaActual.jornada === "manana" ? "Mañana" : "Tarde",
        "Documento Profesor": p["Documento Profesor"],
        "Nombre_Completo": p["Nombre_Completo"],
        "Correo-E": p["Correo-E"],
        "ID Curso": p["ID Curso"],
        "Descripción": p["Descripción"],
        "Nº Clase": p["Nº Clase"]
      };
      const res = await apiCall("reservarCita", payload);
      showMsg(`Cita integral registrada correctamente. Número de reserva: <b>${htmlEscape(res.numeroReserva)}</b>`, "ok");
      $("agendaBox").classList.add("hidden");
      await cargarPlanes();
    }catch(err){
      showMsg(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Confirmar cita integral";
    }
  }

  async function cancelarCita(planIndex){
    const plan = planesActuales[planIndex];
    const motivo = prompt("Motivo de cancelación (opcional):") || "";
    try{
      const res = await apiCall("cancelarCita", {
        IDPlan: plan.IDPlan,
        "Documento Profesor": plan["Documento Profesor"],
        MotivoCancelacion: motivo
      });
      showMsg(res.message || "Cita cancelada. El cupo vuelve a quedar disponible.", "ok");
      await cargarPlanes();
    }catch(err){
      showMsg(err.message, "error");
    }
  }

  // -----------------------------------------------------------------------
  // Página citas
  // -----------------------------------------------------------------------
  function initCitas(){
    $("btnRecargarCitas").addEventListener("click", cargarCitas);
    $("btnExportarCitas").addEventListener("click", exportarCitasCSV);
    ["filtroTexto","filtroEstado"].forEach(id => {
      const el = $(id);
      if(el){
        el.addEventListener("input", renderCitas);
        el.addEventListener("change", renderCitas);
      }
    });
    cargarCitas();
  }

  async function cargarCitas(){
    clearMsg();
    try{
      const res = await apiCall("listarCitas", {});
      citasActuales = res.citas || [];
      renderCitas();
      showMsg(`Citas cargadas: <b>${citasActuales.length}</b>.`, "ok");
    }catch(err){
      showMsg(err.message, "error");
    }
  }

  function filtrarCitasBase(){
    const texto = normalize($("filtroTexto") ? $("filtroTexto").value : "");
    const estado = $("filtroEstado") ? $("filtroEstado").value : "";
    return citasActuales.filter(c => {
      const blob = normalize(Object.values(c).join(" "));
      return (!texto || blob.includes(texto)) && (!estado || c.EstadoCita === estado);
    });
  }

  function renderCitas(){
    const data = filtrarCitasBase();
    const tabla = $("tablaCitas");
    if(!tabla) return;

    const total = data.length;
    const reservadas = data.filter(c => c.EstadoCita === "RESERVADA").length;
    const canceladas = data.filter(c => c.EstadoCita === "CANCELADA").length;
    const completas = data.filter(c => c.EstadoRevision === "COMPLETAMENTE_VISADO").length;
    $("kpisCitas").innerHTML = `
      <div class="kpi"><strong>${total}</strong><span>Registros filtrados</span></div>
      <div class="kpi"><strong>${reservadas}</strong><span>Reservadas</span></div>
      <div class="kpi"><strong>${canceladas}</strong><span>Canceladas</span></div>
      <div class="kpi"><strong>${completas}</strong><span>Completamente visadas</span></div>
    `;

    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Reserva</th><th>Fecha cita</th><th>Bloque</th><th>Docente</th>
          <th>Curso</th><th>Clase</th><th>Estado cita</th><th>SIB</th><th>APA</th><th>Rizoma</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(c => `
          <tr>
            <td>${htmlEscape(c.NumeroReserva)}</td>
            <td>${htmlEscape(formatDate(c.FechaCita))}</td>
            <td>${htmlEscape(rangoHorario(c.HoraCita))}<br><small>${htmlEscape(c.Jornada)}</small></td>
            <td>${htmlEscape(c["Nombre_Completo"])}<br><small>${htmlEscape(c["Documento Profesor"])} · ${htmlEscape(c["Correo-E"])}</small></td>
            <td>${htmlEscape(c["Descripción"])}<br><small>ID ${htmlEscape(c["ID Curso"])}</small></td>
            <td>${htmlEscape(c["Nº Clase"])}</td>
            <td>${badgeEstado(c.EstadoCita)}<br><small>${htmlEscape(c.EstadoRevision || "")}</small></td>
            <td>${badgeEstado(c.EstadoSIB || "PENDIENTE")}</td>
            <td>${badgeEstado(c.EstadoAPA || "PENDIENTE")}</td>
            <td>${badgeEstado(c.EstadoRizoma || "PENDIENTE")}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
  }

  function exportarCitasCSV(){
    const data = filtrarCitasBase();
    if(data.length === 0){
      showMsg("No hay datos para exportar.", "warn");
      return;
    }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(";"),
      ...data.map(row => headers.map(h => `"${String(row[h] == null ? "" : row[h]).replace(/"/g,'""')}"`).join(";"))
    ].join("\n");
    descargarArchivo("citas_integrales_sirpc.csv", csv, "text/csv;charset=utf-8");
  }

  // -----------------------------------------------------------------------
  // Página revisión
  // -----------------------------------------------------------------------
  function initRevision(){
    $("btnCargarRevision").addEventListener("click", cargarRevision);
    $("revTipo").addEventListener("change", cargarRevision);
    $("revBuscar").addEventListener("input", renderRevision);
    cargarRevision();
  }

  async function cargarRevision(){
    clearMsg();
    try{
      const tipo = $("revTipo").value;
      const res = await apiCall("listarRevision", { TipoRevision: tipo });
      revisionActual = (res.citas || []).filter(c => c.EstadoCita !== "CANCELADA");
      renderRevision();
      showMsg(`Citas cargadas para ${tipo}: <b>${revisionActual.length}</b>.`, "ok");
    }catch(err){
      showMsg(err.message, "error");
    }
  }

  function renderRevision(){
    const texto = normalize($("revBuscar") ? $("revBuscar").value : "");
    const data = revisionActual.filter(c => !texto || normalize(Object.values(c).join(" ")).includes(texto));
    const tabla = $("tablaRevision");

    const pendientes = data.filter(c => c.EstadoRevision !== "VISADO").length;
    const visadas = data.filter(c => c.EstadoRevision === "VISADO").length;
    $("kpisRevision").innerHTML = `
      <div class="kpi"><strong>${data.length}</strong><span>Citas filtradas</span></div>
      <div class="kpi"><strong>${pendientes}</strong><span>Pendientes</span></div>
      <div class="kpi"><strong>${visadas}</strong><span>Visadas</span></div>
    `;

    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Fecha/Hora</th><th>Docente</th><th>Plan de curso</th><th>Estado de este revisor</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(c => `
          <tr>
            <td>${htmlEscape(formatDate(c.FechaCita))}<br><b>${htmlEscape(rangoHorario(c.HoraCita))}</b> · ${htmlEscape(c.Jornada)}<br><small>${htmlEscape(c.NumeroReserva)}</small></td>
            <td>${htmlEscape(c["Nombre_Completo"])}<br><small>${htmlEscape(c["Documento Profesor"])} · ${htmlEscape(c["Correo-E"])}</small></td>
            <td>${htmlEscape(c["Descripción"])}<br><small>IDPlan: ${htmlEscape(c.IDPlan)} · Clase ${htmlEscape(c["Nº Clase"])}</small></td>
            <td>${badgeEstado(c.EstadoRevision)}<br><small>${htmlEscape(c.ObservacionesRevisor || "")}</small></td>
            <td>
              <button class="btn-green btn-small" data-reserva="${htmlEscape(c.NumeroReserva)}" data-tipo="${htmlEscape(c.TipoRevision)}" data-estado="VISADO">Visado ✓</button>
              <button class="btn-outline btn-small" data-reserva="${htmlEscape(c.NumeroReserva)}" data-tipo="${htmlEscape(c.TipoRevision)}" data-estado="CON_OBSERVACIONES">Con observaciones</button>
              <button class="btn-danger btn-small" data-reserva="${htmlEscape(c.NumeroReserva)}" data-tipo="${htmlEscape(c.TipoRevision)}" data-estado="NO_ASISTIO">No asistió</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    `;

    tabla.querySelectorAll("button[data-reserva]").forEach(btn => {
      btn.addEventListener("click", () => actualizarRevision(btn.dataset.reserva, btn.dataset.tipo, btn.dataset.estado));
    });
  }

  async function actualizarRevision(numeroReserva, tipoRevision, estado){
    const obs = prompt("Observaciones del revisor (opcional):") || "";
    try{
      const res = await apiCall("actualizarRevision", {
        NumeroReserva: numeroReserva,
        TipoRevision: tipoRevision,
        EstadoRevision: estado,
        ObservacionesRevisor: obs,
        UsuarioRegistro: "Revisor " + tipoRevision
      });
      showMsg(res.message || "Revisión actualizada.", "ok");
      await cargarRevision();
    }catch(err){
      showMsg(err.message, "error");
    }
  }

  function descargarArchivo(nombre, contenido, mime){
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
