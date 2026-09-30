const API_URL = "https://script.google.com/macros/s/AKfycbymWjk3ZeeElIrJ7UnlldggvH2Lrkh0QHr59xCUZM8JTn-7XO3OdtxL-7sr1NY3y76g/exec";
let currentMode = 'registrar'; // 'registrar' o 'modificar'
let subModeAnterior = 'editar'; // 'editar' o 'crear' (per al mode registres anteriors)

// Variable global per emmagatzemar l'estructura de la plantilla en memòria
let estructuraEscola = [];

window.addEventListener('DOMContentLoaded', () => {
  // Data d'avui per defecte
  const today = getTodayFormatted();
  const inputData = document.getElementById('inputData');
  if (inputData) inputData.value = today;

  // En mode registrar, la data queda bloquejada a avui
  if (inputData) inputData.disabled = true;

  // Carreguem l'estructura completa al principi d'una sola vegada
  carregarEstructuraInicial();

  // Assignació d'esdeveniments
  document.getElementById('selectGrup').addEventListener('change', enCanviarGrup);
  document.getElementById('selectModul').addEventListener('change', enCanviarModul);
  document.getElementById('btnCarregar').addEventListener('click', carregarAlumnesOAssistencies);
  document.getElementById('btnGuardar').addEventListener('click', guardarOActualitzar);

  document.getElementById('btnModeRegistrar').addEventListener('click', () => canviarMode('registrar'));
  document.getElementById('btnModeModificar').addEventListener('click', () => canviarMode('modificar'));
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

  if (payload) {
    // Si enviem dades (POST)
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, ...payload })
    };
    const res = await fetch(API_URL, options);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'Error en la petició');
    return data.result !== undefined ? data.result : data;
  } else {
    // Si només llegim dades (GET)
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'Error en la petició');
    return data.result !== undefined ? data.result : data;
  }
}

// Carrega TOTA l'estructura de grups, mòduls i UFs al principi
// Carrega TOTA l'estructura de grups, mòduls i UFs al principi
function carregarEstructuraInicial() {
  const selectGrup = document.getElementById('selectGrup');
  if (selectGrup) selectGrup.innerHTML = '<option value="">Carregant opcions...</option>';

  callApi('getEstructuraCompleta')
    .then(data => {
      console.log("Dades rebudes de getEstructuraCompleta:", data);

      // Comprovar si les dades venen directament o embolcallades
      let llista = data;
      if (data && data.result) llista = data.result;
      if (data && data.data) llista = data.data;

      if (Array.isArray(llista)) {
        estructuraEscola = llista;
      } else {
        console.error("No s'ha rebut un Array vàlid de l'API. Contingut:", data);
        estructuraEscola = [];
      }

      poblarDesplegableGrups();
    })
    .catch(err => {
      mostrarError(err);
      if (selectGrup) selectGrup.innerHTML = '<option value="">Error carregant opcions</option>';
    });
}

// Pobla els grups únics de l'estructura descarregada
function poblarDesplegableGrups() {
  const selectGrup = document.getElementById('selectGrup');
  selectGrup.innerHTML = '<option value="">-- Selecciona Curs --</option>';

  if (!Array.isArray(estructuraEscola) || estructuraEscola.length === 0) {
    return;
  }

  // Extreure grups únics
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
  const grup = document.getElementById('selectGrup').value;
  const selectModul = document.getElementById('selectModul');
  const selectUF = document.getElementById('selectUF');

  selectModul.innerHTML = '<option value="">-- Selecciona Mòdul --</option>';
  selectUF.innerHTML = '<option value="">-- Selecciona UF --</option>';
  selectModul.disabled = true;
  selectUF.disabled = true;

  if (!grup || !Array.isArray(estructuraEscola)) return;

  // Filtrar mòduls únics en memòria
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
  const grup = document.getElementById('selectGrup').value;
  const modul = document.getElementById('selectModul').value;
  const selectUF = document.getElementById('selectUF');

  selectUF.innerHTML = '<option value="">-- Selecciona UF --</option>';
  selectUF.disabled = true;

  if (!grup || !modul || !Array.isArray(estructuraEscola)) return;

  // Filtrar UFs en memòria
  const ufsDelModul = estructuraEscola
    .filter(item => item.grup === grup && item.modul === modul);

  ufsDelModul.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.uf;
    opt.textContent = item.nomUf ? `${item.uf} - ${item.nomUf}` : item.uf;
    selectUF.appendChild(opt);
  });

  selectUF.disabled = false;
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
    
    // Forçar data d'avui i bloquejar
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
    
    // Permetre triar qualsevol data
    if (inputData) inputData.disabled = false;
  }

  document.getElementById('alumnesContainer').innerHTML = '';
  if (btnGuardar) btnGuardar.style.display = 'none';
}

async function carregarAlumnesOAssistencies() {
  const data = document.getElementById('inputData').value;
  const grup = document.getElementById('selectGrup').value;
  const modul = document.getElementById('selectModul').value;
  const uf = document.getElementById('selectUF').value;

  if (!data || !grup || !modul || !uf) {
    alert("Si us plau, selecciona tots els camps del formulari.");
    return;
  }

  const container = document.getElementById('alumnesContainer');
  const infoContainer = document.getElementById('infoModeContainer');
  if (infoContainer) infoContainer.style.display = 'none';

  container.innerHTML = '<p style="text-align: center; color: #6b7280;">Carregant dades...</p>';

  try {
    if (currentMode === 'registrar') {
      const jaExisteix = await callApi('comprovarSiExisteixRegistre', { data, grup, modul, uf });

      if (jaExisteix) {
        container.innerHTML = `
          <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 8px; text-align: center; color: #991b1b; margin-top: 10px;">
            <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 1rem;">⚠️ Atenció: Classe ja registrada</p>
            <p style="margin: 0; font-size: 0.9rem;">Ja s'ha passat llista per a aquesta UF en la data d'avui.</p>
            <p style="margin: 8px 0 0 0; font-size: 0.85rem; color: #7f1d1d;">Si necessites fer cap canvi, utilitza l'opció superior <strong>"Registres Anteriors"</strong>.</p>
          </div>
        `;
        document.getElementById('btnGuardar').style.display = 'none';
      } else {
        const alumnes = await callApi('getAlumnesPerUF', { grup, modul, uf });
        renderitzadorAlumnesNoves(alumnes);
      }
    } else {
      const res = await callApi('getAssistenciesOAlumnesPerData', { data, grup, modul, uf });

      if (res.existeix) {
        subModeAnterior = 'editar';
        if (res.hores) {
          const elHores = document.getElementById('inputHores');
          if (elHores) elHores.value = res.hores;
        }

        if (infoContainer) {
          infoContainer.innerHTML = 'ℹ️ <strong>S\'han carregat dades gravades anteriorment.</strong> Pots modificar-les (incloses les hores) i fer clic a "Actualitzar Registre".';
          infoContainer.style.display = 'block';
        }
        renderitzadorAlumnesModificar(res.alumnes);
      } else {
        subModeAnterior = 'crear';
        if (infoContainer) {
          infoContainer.innerHTML = '📝 <strong>No hi ha assistència registrada per a aquesta data.</strong> Carregant alumnes per a crear un nou registre retroactiu.';
          infoContainer.style.display = 'block';
        }
        renderitzadorAlumnesNoves(res.alumnes);
      }
    }
  } catch (err) {
    mostrarError(err);
  }
}

function renderitzadorAlumnesNoves(alumnes) {
  const container = document.getElementById('alumnesContainer');
  const btnGuardar = document.getElementById('btnGuardar');
  container.innerHTML = '';

  if (!alumnes || alumnes.length === 0) {
    container.innerHTML = '<p style="text-align: center;">No s\'han trobat alumnes matriculats per a aquesta UF.</p>';
    btnGuardar.style.display = 'none';
    return;
  }

  alumnes.forEach(al => {
    const card = crearTargetaAlumne(al.id, al.nomComplet, 'Pres.', al.esMenor, null);
    container.appendChild(card);
  });

  btnGuardar.textContent = (currentMode === 'registrar') ? "Guardar Assistència" : "Guardar Registre Anterior";
  btnGuardar.className = "btn btn-success";
  btnGuardar.style.display = 'block';
}

function renderitzadorAlumnesModificar(registres) {
  const container = document.getElementById('alumnesContainer');
  const btnGuardar = document.getElementById('btnGuardar');
  container.innerHTML = '';

  if (!registres || registres.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #dc2626; font-weight: 600;">No s\'han trobat registres.</p>';
    btnGuardar.style.display = 'none';
    return;
  }

  registres.forEach(reg => {
    const card = crearTargetaAlumne(reg.idAlumne, reg.nomComplet, reg.estat, reg.esMenor, reg.idRegistre);
    container.appendChild(card);
  });

  btnGuardar.textContent = "Actualitzar Registre";
  btnGuardar.className = "btn btn-primary";
  btnGuardar.style.display = 'block';
}

function crearTargetaAlumne(idAlumne, nomComplet, estatActual, esMenor, idRegistre) {
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

  if (esMenor) {
    const badge = document.createElement('span');
    badge.className = 'badge-menor';
    badge.textContent = 'MENOR';
    header.appendChild(badge);
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
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Processant...";

  const horesValor = document.getElementById('inputHores') ? document.getElementById('inputHores').value : null;

  if (currentMode === 'registrar' || (currentMode === 'modificar' && subModeAnterior === 'crear')) {
    const dades = {
      data: document.getElementById('inputData').value,
      grup: document.getElementById('selectGrup').value,
      modul: document.getElementById('selectModul').value,
      uf: document.getElementById('selectUF').value,
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
        alert(`S'ha desat l'assistència de ${res.total} alumnes.`);
        btnGuardar.disabled = false;
        document.getElementById('alumnesContainer').innerHTML = '';
        const infoContainer = document.getElementById('infoModeContainer');
        if (infoContainer) infoContainer.style.display = 'none';
        btnGuardar.style.display = 'none';
      })
      .catch(err => {
        mostrarError(err);
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Guardar Assistència";
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
        alert(`S'han actualitzat ${res.total} registres d'assistència!`);
        btnGuardar.disabled = false;
        document.getElementById('alumnesContainer').innerHTML = '';
        const infoContainer = document.getElementById('infoModeContainer');
        if (infoContainer) infoContainer.style.display = 'none';
        btnGuardar.style.display = 'none';
      })
      .catch(err => {
        mostrarError(err);
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Actualitzar Registre";
      });
  }
}

function mostrarError(error) {
  const missatge = error.message || error;
  
  if (missatge.includes('JA_EXISTEIX:')) {
    const textNetejat = missatge.replace('S\'ha produït un error en executar la funció: ', '').replace('JA_EXISTEIX: ', '');
    alert("⚠️ ATENCIÓ: REGISTRE DUPLICAT\n\n" + textNetejat);
  } else {
    alert("S'ha produït un error: " + missatge);
  }
}
