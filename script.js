const API_URL = "https://script.google.com/macros/s/AKfycbymWjk3ZeeElIrJ7UnlldggvH2Lrkh0QHr59xCUZM8JTn-7XO3OdtxL-7sr1NY3y76g/exec";

let currentMode = 'registrar'; // 'registrar' o 'modificar'
let subModeAnterior = 'editar'; // 'editar' o 'crear' (per al mode registres anteriors)

// Variables globals en memòria
let estructuraEscola = [];
let mapaQualificacions = {};

// =======================================================
// FUNCIONS DE CONTROL DE L'OVERLAY DE CÀRREGA I LOGS
// =======================================================

function mostrarLoading(missatgeInicial = "Carregant...", subtext = "") {
  const overlay = document.getElementById("loading-overlay");
  const textEl = document.getElementById("loading-text");
  const subtextEl = document.getElementById("loading-subtext");
  const logsEl = document.getElementById("log-messages");

  if (textEl) textEl.textContent = missatgeInicial;
  if (subtextEl) subtextEl.textContent = subtext;
  if (logsEl) logsEl.innerHTML = ""; // Neteja els logs anteriors
  if (overlay) overlay.classList.remove("hidden");
}

function ocultarLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.classList.add("hidden");
}

function actualitzarTextLoading(missatge, subtext = "") {
  const textEl = document.getElementById("loading-text");
  const subtextEl = document.getElementById("loading-subtext");
  if (textEl) textEl.textContent = missatge;
  if (subtextEl) subtextEl.textContent = subtext;
}

function afegirLogLoading(missatge, tipus = "normal") {
  const logsEl = document.getElementById("log-messages");
  if (!logsEl) return;

  const p = document.createElement("p");
  p.textContent = `> ${missatge}`;
  if (tipus === "success") p.classList.add("success");
  if (tipus === "highlight") p.classList.add("highlight");

  logsEl.appendChild(p);

  // Scroll automàtic cap al darrer log
  const parent = logsEl.parentElement;
  if (parent) parent.scrollTop = parent.scrollHeight;
}

// =======================================================
// INICIALITZACIÓ
// =======================================================

window.addEventListener('DOMContentLoaded', () => {
  // Data d'avui per defecte
  const today = getTodayFormatted();
  const inputData = document.getElementById('inputData');
  if (inputData) {
    inputData.value = today;
    inputData.disabled = true; // En mode registrar, bloquejat a avui
  }

  // Carreguem Estructura i Mapa de Qualificacions simultàniament
  carregarDadesIniciais();

  // Assignació d'esdeveniments
  const selectGrup = document.getElementById('selectGrup');
  const selectModul = document.getElementById('selectModul');
  const btnCarregar = document.getElementById('btnCarregar');
  const btnGuardar = document.getElementById('btnGuardar');
  const btnModeRegistrar = document.getElementById('btnModeRegistrar');
  const btnModeModificar = document.getElementById('btnModeModificar');

  if (selectGrup) selectGrup.addEventListener('change', enCanviarGrup);
  if (selectModul) selectModul.addEventListener('change', enCanviarModul);
  if (btnCarregar) btnCarregar.addEventListener('click', carregarAlumnesOAssistencies);
  if (btnGuardar) btnGuardar.addEventListener('click', guardarOActualitzar);

  if (btnModeRegistrar) {
    btnModeRegistrar.addEventListener('click', () => canviarMode('registrar'));
  }
  if (btnModeModificar) {
    btnModeModificar.addEventListener('click', () => canviarMode('modificar'));
  }
});

function getTodayFormatted() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Funció genèrica per fer peticions HTTP a la Web App d'Apps Script
async function callApi(action, params = {}, payload = null) {
  let url = `${API_URL}?action=${encodeURIComponent(action)}`;

  for (const key in params) {
    if (params[key] !== undefined && params[key] !== null) {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
    }
  }

  try {
    let res;
    if (payload) {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, ...payload })
      });
    } else {
      res = await fetch(url);
    }

    const text = await res.text(); // Llegim com a text primer per seguretat

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("❌ La resposta de Google no és un JSON vàlid:", text);
      throw new Error("El servidor de Google ha retornat una resposta no vàlida (HTML/Error). Revisa la consola.");
    }

    if (data.status === 'error') throw new Error(data.message || 'Error en la petició');
    return data.result !== undefined ? data.result : data;

  } catch (err) {
    console.error(`Error a la crida API [${action}]:`, err);
    throw err;
  }
}

// Càrrega SIMULTÀNIA d'Estructura i Mapa de Qualificacions
function carregarDadesIniciais() {
  const selectGrup = document.getElementById('selectGrup');
  if (selectGrup) selectGrup.innerHTML = '<option value="">Carregant opcions...</option>';

  console.log("🔄 Carregant dades inicials (Estructura i Qualificacions)...");

  // 1. Mostrem l'overlay de càrrega i iniciem els logs
  mostrarLoading("Carregant dades inicials...", "Sincronitzant amb el servidor");
  afegirLogLoading("Iniciant petició simultània d'estructura i qualificacions...");

  Promise.all([
    callApi('getEstructuraCompleta'),
    callApi('getMapaQualificacions')
  ])
  .then(([dataEstructura, dataMapa]) => {
    // 2. Processar Estructura
    actualitzarTextLoading("Processant dades...", "Generant estructura de l'escola");
    
    let llista = dataEstructura;
    if (dataEstructura && dataEstructura.result) llista = dataEstructura.result;
    if (dataEstructura && dataEstructura.data) llista = dataEstructura.data;

    estructuraEscola = Array.isArray(llista) ? llista : [];
    console.log("✅ Estructura carregada:", estructuraEscola.length, "registres.");
    afegirLogLoading(`Estructura carregada: ${estructuraEscola.length} registres.`, "success");

    poblarDesplegableGrups();

    // 3. Processar Mapa de Qualificacions
    mapaQualificacions = dataMapa || {};
    const totalQualificacions = Object.keys(mapaQualificacions).length;
    console.log("✅ Mapa de qualificacions carregat en memòria. Registres:", totalQualificacions);
    afegirLogLoading(`Mapa de qualificacions carregat: ${totalQualificacions} alumnes.`, "success");

    afegirLogLoading("Totes les dades s'han carregat correctament.", "highlight");

    // Deixem 400ms perquè l'usuari pugui llegir el log de confirmació abans de tancar
    setTimeout(() => {
      ocultarLoading();
    }, 400);
  })
  .catch(err => {
    console.error("❌ Error en la càrrega inicial:", err);
    afegirLogLoading(`Error en la càrrega: ${err.message || err}`, "highlight");
    actualitzarTextLoading("Error de càrrega", "No s'han pogut obtenir les dades");
    
    mostrarError(err);
    if (selectGrup) selectGrup.innerHTML = '<option value="">Error carregant opcions</option>';

    // En cas d'error ho deixem 1.5s visible perquè es pugui llegir l'error
    setTimeout(() => {
      ocultarLoading();
    }, 1500);
  });
}

// Pobla els grups únics de l'estructura descarregada
function poblarDesplegableGrups() {
  const selectGrup = document.getElementById('selectGrup');
  if (!selectGrup) return;

  selectGrup.innerHTML = '<option value="">-- Selecciona Curs --</option>';

  if (!Array.isArray(estructuraEscola) || estructuraEscola.length === 0) return;

  const grupsUnics = [...new Set(estructuraEscola.map(item => item.grup))].filter(Boolean);

  grupsUnics.forEach(grup => {
    const opt = document.createElement('option');
    opt.value = grup;
    opt.textContent = grup;
    selectGrup.appendChild(opt);
  });
}

// Filtre INSTANTANI de Mòduls segons el Grup triat
function enCanviarGrup() {
  const selectGrup = document.getElementById('selectGrup');
  const selectModul = document.getElementById('selectModul');
  const selectUF = document.getElementById('selectUF');

  if (!selectGrup || !selectModul || !selectUF) return;

  const grup = selectGrup.value;

  selectModul.innerHTML = '<option value="">-- Selecciona Mòdul --</option>';
  selectUF.innerHTML = '<option value="">-- Selecciona UF --</option>';

  selectModul.disabled = true;
  selectUF.disabled = true;

  if (!grup || !Array.isArray(estructuraEscola)) return;

  const modulsDelGrup = [...new Set(
    estructuraEscola
      .filter(item => item.grup === grup)
      .map(item => item.modul)
  )].filter(Boolean);

  modulsDelGrup.forEach(modul => {
    const opt = document.createElement('option');
    opt.value = modul;
    opt.textContent = modul;
    selectModul.appendChild(opt);
  });

  selectModul.disabled = false;
}

// Filtre INSTANTANI de UFs segons el Mòdul triat
function enCanviarModul() {
  const selectGrup = document.getElementById('selectGrup');
  const selectModul = document.getElementById('selectModul');
  const selectUF = document.getElementById('selectUF');

  if (!selectGrup || !selectModul || !selectUF) return;

  const grup = selectGrup.value;
  const modul = selectModul.value;

  selectUF.innerHTML = '<option value="">-- Selecciona UF --</option>';
  selectUF.disabled = true;

  if (!grup || !modul || !Array.isArray(estructuraEscola)) return;

  const ufsDelModul = estructuraEscola.filter(item => item.grup === grup && item.modul === modul);

  ufsDelModul.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.uf;
    opt.textContent = item.nomUf ? `${item.uf} - ${item.nomUf}` : item.uf;
    selectUF.appendChild(opt);
  });

  if (selectUF.options.length > 1) {
    selectUF.disabled = false;
  }
}

function canviarMode(mode) {
  currentMode = mode;

  const btnRegistrar = document.getElementById('btnModeRegistrar');
  const btnModificar = document.getElementById('btnModeModificar');
  const btnGuardar = document.getElementById('btnGuardar');
  const inputData = document.getElementById('inputData');
  const containerHores = document.getElementById('containerHores');
  const infoContainer = document.getElementById('infoModeContainer');

  const today = getTodayFormatted();

  if (infoContainer) infoContainer.style.display = 'none';

  if (mode === 'registrar') {
    if (btnRegistrar) btnRegistrar.classList.add('active');
    if (btnModificar) btnModificar.classList.remove('active');
    if (btnGuardar) {
      btnGuardar.textContent = "Guardar Assistència";
      btnGuardar.className = "btn btn-success";
    }

    if (containerHores) containerHores.style.display = "block";

    if (inputData) {
      inputData.value = today;
      inputData.disabled = true;
    }
  } else {
    if (btnModificar) btnModificar.classList.add('active');
    if (btnRegistrar) btnRegistrar.classList.remove('active');
    if (btnGuardar) {
      btnGuardar.textContent = "Actualitzar / Guardar Registre";
      btnGuardar.className = "btn btn-primary";
    }
    if (containerHores) containerHores.style.display = "block";
    if (inputData) inputData.disabled = false;
  }

  const alumnesContainer = document.getElementById('alumnesContainer');
  if (alumnesContainer) alumnesContainer.innerHTML = '';
  if (btnGuardar) btnGuardar.style.display = 'none';
}

// FILTRATGE I ORDENACIÓ DE PENDENTS
function filtrarAlumnesPendents(llistaAlumnes, modul, uf, grupSolicitat) {
  if (!Array.isArray(llistaAlumnes)) {
    console.warn("⚠️ llistaAlumnes no és un Array vàlid:", llistaAlumnes);
    return [];
  }

  const normalitzar = (str) => str ? String(str).trim().toLowerCase() : '';

  const pendents = llistaAlumnes.filter(alumne => {
    const clau = alumne.id + '_' + modul + '_' + uf;
    const dadesQ = mapaQualificacions[clau];

    // 1. Comprovació de nota aprovada
    if (dadesQ && dadesQ.nota !== undefined && dadesQ.nota !== null && dadesQ.nota !== '') {
      const textNota = String(dadesQ.nota).replace(',', '.').trim();
      
      // Si diu "Pendent", "No presentat", etc., NO està aprovat
      if (textNota.toLowerCase() !== 'pendent') {
        const valNota = parseFloat(textNota);
        if (!isNaN(valNota) && valNota >= 5) {
          // Alumne aprovat en aquesta UF -> Es descarta
          return false;
        }
      }
    }

    // 2. Comprovació de coincidència de grup (flexible)
    const grupAlumne = normalitzar(alumne.grup || alumne.grupBase);
    const subgrupAlumne = normalitzar(alumne.subgrup);
    const grupCercat = normalitzar(grupSolicitat);

    // Mètodes de grup que pot portar el registre de Qualificacions
    const grupPendentQ = dadesQ ? normalitzar(dadesQ.grupUFsPendentsPrimer || dadesQ.grupPendent || dadesQ.grupAssignat) : '';

    // Si té una UF assignada expressament a aquest grup (ex: alumne de 2n amb pendent de 1er A) -> S'inclou!
    if (grupPendentQ && grupPendentQ === grupCercat) {
      return true;
    }

    // Si l'alumne no té grup definit a la llista base, el deixem passar per defecte.
    if (!grupAlumne) {
      return true;
    }

    // Comprovació combinada de grup/subgrup de l'alumne (Ex: "1er" + "a" = "1er a")
    const grupCombinat = (grupAlumne + ' ' + subgrupAlumne).trim();

    // Si ni el seu grup principal, ni el seu grup combinat, ni la qualificació coincideixen -> Es descarta
    if (grupAlumne !== grupCercat && grupCombinat !== grupCercat && grupPendentQ !== grupCercat) {
      return false;
    }

    return true;
  });

  pendents.sort((a, b) => {
    const nomA = a.nomComplet || a.nom || '';
    const nomB = b.nomComplet || b.nom || '';
    return nomA.localeCompare(nomB, 'ca', { sensitivity: 'base' });
  });

  return pendents;
}

async function carregarAlumnesOAssistencies() {
  const elData = document.getElementById('inputData');
  const elGrup = document.getElementById('selectGrup');
  const elModul = document.getElementById('selectModul');
  const elUF = document.getElementById('selectUF');

  const data = elData ? elData.value : '';
  const grup = elGrup ? elGrup.value : '';
  const modul = elModul ? elModul.value : '';
  const uf = elUF ? elUF.value : '';

  if (!data || !grup || !modul || !uf) {
    alert("Si us plau, selecciona tots els camps del formulari.");
    return;
  }

  const container = document.getElementById('alumnesContainer');
  const infoContainer = document.getElementById('infoModeContainer');

  if (infoContainer) infoContainer.style.display = 'none';
  if (container) container.innerHTML = '<p style="text-align: center; color: #6b7280;">Carregant dades...</p>';

  try {
    if (currentMode === 'registrar') {
      const jaExisteix = await callApi('comprovarSiExisteixRegistre', { data, grup, modul, uf });

      if (jaExisteix) {
        if (container) {
          container.innerHTML = `
            <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 8px; text-align: center; color: #991b1b; margin-top: 10px;">
              <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 1rem;">⚠ Atenció: Classe ja registrada</p>
              <p style="margin: 0; font-size: 0.9rem;">Ja s'ha passat llista per a aquesta UF en la data d'avui.</p>
              <p style="margin: 8px 0 0 0; font-size: 0.85rem; color: #7f1d1d;">Si necessites fer cap canvi, utilitza l'opció superior <strong>"Registres Anteriors"</strong>.</p>
            </div>
          `;
        }
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) btnGuardar.style.display = 'none';

      } else {
        const alumnesBase = await callApi('getAlumnesBase', { grupSolicitat: grup });
        
        console.log("🔍 Alumnes de base rebuts des del servidor:", alumnesBase);
        console.log("🔍 Grup sol·licitat:", grup);

        const alumnesFiltrats = filtrarAlumnesPendents(alumnesBase, modul, uf, grup);
        console.log("✅ Alumnes finals filtrats:", alumnesFiltrats.length);

        renderitzadorAlumnesNoves(alumnesFiltrats);
      }
    } else {
      const res = await callApi('getAssistenciesOAlumnesPerData', { data, grup, modul, uf });

      if (res && res.existeix) {
        subModeAnterior = 'editar';
        if (res.hores) {
          const elHores = document.getElementById('inputHores');
          if (elHores) elHores.value = res.hores;
        }

        if (infoContainer) {
          infoContainer.innerHTML = 'ℹ️ <strong>S\'han carregat dades gravades anteriorment.</strong> Pots modificar-les (incloses les hores) i fer clic a "Actualitzar Registre".';
          infoContainer.style.display = 'block';
        }

        if (Array.isArray(res.alumnes)) {
          res.alumnes.sort((a, b) => (a.nomComplet || '').localeCompare(b.nomComplet || '', 'ca', { sensitivity: 'base' }));
        }
        renderitzadorAlumnesModificar(res.alumnes);
      } else {
        subModeAnterior = 'crear';
        if (infoContainer) {
          infoContainer.innerHTML = '📝 <strong>No hi ha assistència registrada per a aquesta data.</strong> Carregant alumnes per a crear un nou registre retroactiu.';
          infoContainer.style.display = 'block';
        }

        const alumnesBase = (res && Array.isArray(res.alumnes)) ? res.alumnes : await callApi('getAlumnesBase', { grupSolicitat: grup });
        const alumnesFiltrats = filtrarAlumnesPendents(alumnesBase, modul, uf, grup);
        renderitzadorAlumnesNoves(alumnesFiltrats);
      }
    }
  } catch (err) {
    mostrarError(err);
  }
}

function renderitzadorAlumnesNoves(alumnes) {
  const container = document.getElementById('alumnesContainer');
  const btnGuardar = document.getElementById('btnGuardar');
  if (!container) return;

  container.innerHTML = '';

  if (!alumnes || alumnes.length === 0) {
    container.innerHTML = '<p style="text-align: center;">No s\'han trobat alumnes matriculats o tots tenen la UF aprovada.</p>';
    if (btnGuardar) btnGuardar.style.display = 'none';
    return;
  }

  alumnes.forEach(al => {
    const esSegon = Boolean(al.esSegon || al.curs == 2);
    const card = crearTargetaAlumne(al.id, al.nomComplet, 'Pres.', al.esMenor, esSegon, null);
    container.appendChild(card);
  });

  if (btnGuardar) {
    btnGuardar.textContent = (currentMode === 'registrar') ? "Guardar Assistència" : "Guardar Registre Anterior";
    btnGuardar.className = "btn btn-success";
    btnGuardar.style.display = 'block';
  }
}

function renderitzadorAlumnesModificar(registres) {
  const container = document.getElementById('alumnesContainer');
  const btnGuardar = document.getElementById('btnGuardar');
  if (!container) return;

  container.innerHTML = '';

  if (!registres || registres.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #dc2626; font-weight: 600;">No s\'han trobat registres.</p>';
    if (btnGuardar) btnGuardar.style.display = 'none';
    return;
  }

  registres.forEach(reg => {
    const esSegon = Boolean(reg.esSegon || reg.curs == 2);
    const card = crearTargetaAlumne(reg.idAlumne, reg.nomComplet, reg.estat, reg.esMenor, esSegon, reg.idRegistre);
    container.appendChild(card);
  });

  if (btnGuardar) {
    btnGuardar.textContent = "Actualitzar Registre";
    btnGuardar.className = "btn btn-primary";
    btnGuardar.style.display = 'block';
  }
}

function crearTargetaAlumne(idAlumne, nomComplet, estatActual, esMenor, esSegon, idRegistre) {
  const card = document.createElement('div');
  card.className = 'student-card';
  card.setAttribute('data-id-alumne', idAlumne);
  if (idRegistre) card.setAttribute('data-id-registre', idRegistre);

  const header = document.createElement('div');
  header.className = 'student-header';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'student-name';
  nameSpan.textContent = nomComplet;
  header.appendChild(nameSpan);

  const badgesContainer = document.createElement('div');
  badgesContainer.className = 'badges-container';

  if (esMenor) {
    const badgeMenor = document.createElement('span');
    badgeMenor.className = 'badge-menor';
    badgeMenor.textContent = 'MENOR';
    badgesContainer.appendChild(badgeMenor);
  }

  if (esSegon) {
    const badgeSegon = document.createElement('span');
    badgeSegon.className = 'badge-segon';
    badgeSegon.textContent = '2n';
    badgesContainer.appendChild(badgeSegon);
  }

  if (badgesContainer.children.length > 0) {
    header.appendChild(badgesContainer);
  }

  const statusDiv = document.createElement('div');
  statusDiv.className = 'status-options';

  const estats = ['Pres.', 'Falta', 'Just.', 'Ret.'];
  estats.forEach(estat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-status' + (estatActual === estat ? ' active' : '');
    btn.setAttribute('data-status', estat);
    btn.textContent = estat;
    btn.addEventListener('click', () => {
      statusDiv.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    statusDiv.appendChild(btn);
  });

  card.appendChild(header);
  card.appendChild(statusDiv);
  return card;
}

function guardarOActualitzar() {
  const btnGuardar = document.getElementById('btnGuardar');
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Processant...";
  }

  const elHores = document.getElementById('inputHores');
  const horesValor = elHores ? elHores.value : null;

  if (currentMode === 'registrar' || (currentMode === 'modificar' && subModeAnterior === 'crear')) {
    const elData = document.getElementById('inputData');
    const elGrup = document.getElementById('selectGrup');
    const elModul = document.getElementById('selectModul');
    const elUF = document.getElementById('selectUF');

    const dades = {
      data: elData ? elData.value : '',
      grup: elGrup ? elGrup.value : '',
      modul: elModul ? elModul.value : '',
      uf: elUF ? elUF.value : '',
      hores: horesValor,
      alumnes: []
    };

    const cards = document.querySelectorAll('.student-card');
    cards.forEach(card => {
      const idAlumne = card.getAttribute('data-id-alumne');
      const btnActiu = card.querySelector('.btn-status.active');
      const estat = btnActiu ? btnActiu.getAttribute('data-status') : 'Pres.';
      dades.alumnes.push({ id: idAlumne, estat: estat });
    });

    callApi('guardarAssistència', {}, { dades: dades })
      .then(res => {
        alert(`S'ha desat l'assistència de ${res.total || 0} alumnes.`);
        if (btnGuardar) btnGuardar.disabled = false;

        const alumnesContainer = document.getElementById('alumnesContainer');
        if (alumnesContainer) alumnesContainer.innerHTML = '';

        const infoContainer = document.getElementById('infoModeContainer');
        if (infoContainer) infoContainer.style.display = 'none';

        if (btnGuardar) btnGuardar.style.display = 'none';
      })
      .catch(err => {
        mostrarError(err);
        if (btnGuardar) {
          btnGuardar.disabled = false;
          btnGuardar.textContent = "Guardar Assistència";
        }
      });

  } else {
    const dades = { 
      hores: horesValor, 
      alumnes: [] 
    };

    const cards = document.querySelectorAll('.student-card');
    cards.forEach(card => {
      const idRegistre = card.getAttribute('data-id-registre');
      const btnActiu = card.querySelector('.btn-status.active');
      const nouEstat = btnActiu ? btnActiu.getAttribute('data-status') : 'Pres.';

      if (idRegistre) {
        dades.alumnes.push({
          idRegistre: idRegistre,
          estat: nouEstat
        });
      }
    });

    callApi('actualitzarAssistencia', {}, { dades: dades })
      .then(res => {
        alert(`S'han actualitzat ${res.total || 0} registres d'assistència!`);
        if (btnGuardar) btnGuardar.disabled = false;

        const alumnesContainer = document.getElementById('alumnesContainer');
        if (alumnesContainer) alumnesContainer.innerHTML = '';

        const infoContainer = document.getElementById('infoModeContainer');
        if (infoContainer) infoContainer.style.display = 'none';

        if (btnGuardar) btnGuardar.style.display = 'none';
      })
      .catch(err => {
        mostrarError(err);
        if (btnGuardar) {
          btnGuardar.disabled = false;
          btnGuardar.textContent = "Actualitzar Registre";
        }
      });
  }
}

function mostrarError(error) {
  const missatge = (error && error.message) ? error.message : String(error);

  if (missatge.includes('JA_EXISTEIX:')) {
    const textNetejat = missatge
      .replace('S\'ha produït un error en executar la funció: ', '')
      .replace('JA_EXISTEIX: ', '');
    alert("⚠️ ATENCIÓ: REGISTRE DUPLICAT\n\n" + textNetejat);
  } else {
    alert("S'ha produït un error: " + missatge);
  }
}
