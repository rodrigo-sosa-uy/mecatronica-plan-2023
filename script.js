let subjects = [];
const state = {}; 
let currentTab = 'simulador';
let selectedTracerCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('./data.json');
  subjects = await response.json();
  
  const savedState = localStorage.getItem('mecatronica_state');
  if (savedState) {
    Object.assign(state, JSON.parse(savedState));
  } else {
    subjects.forEach(s => state[s.codigo] = 'pendiente');
  }

  renderGrid();
  updateStats();
});

function evaluateStatus(subject) {
  if (state[subject.codigo] === 'aprobado') return 'aprobado';
  if (state[subject.codigo] === 'cursado') return 'cursado';

  const prev = subject.previas || {};

  // Validar cursadas de prerrequisito
  const cursoOK = (prev.curso || []).every(code => ['cursado', 'aprobado'].includes(state[code]));
  
  // Validar aprobadas de prerrequisito
  const aprobadoOK = (prev.aprobado || []).every(code => state[code] === 'aprobado');

  // Validar correquisitos (deben estar al menos en 'cursado' o 'aprobado')
  const correquisitoOK = (prev.correquisito || []).every(code => ['cursado', 'aprobado'].includes(state[code]));

  // Validar semestre completo
  let semestreOK = true;
  if (prev.semestreCompleto) {
    const semSubjects = subjects.filter(s => s.semestre === prev.semestreCompleto);
    semestreOK = semSubjects.every(s => state[s.codigo] === 'aprobado');
  }

  return (cursoOK && aprobadoOK && correquisitoOK && semestreOK) ? 'disponible' : 'bloqueado';
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  const banner = document.getElementById('tab-info');
  if (tab === 'simulador') {
    banner.innerText = 'Modo Simulador: Haz clic en las materias habilitadas para avanzar en tu carrera (Disponible ➔ Cursado ➔ Aprobado).';
  } else {
    banner.innerText = 'Modo Rastreador: Haz clic en cualquier materia para resaltar cuáles necesitas haber cursado, aprobado o correquisitado previamente.';
  }

  renderGrid();
}

function handleCardClick(codigo) {
  if (currentTab === 'simulador') {
    toggleState(codigo);
  } else {
    selectedTracerCode = (selectedTracerCode === codigo) ? null : codigo;
    renderGrid();
  }
}

function toggleState(codigo) {
  const current = state[codigo];
  const subject = subjects.find(s => s.codigo === codigo);
  const status = evaluateStatus(subject);

  if (status === 'bloqueado' && current === 'pendiente') return;

  if (current === 'pendiente') state[codigo] = 'cursado';
  else if (current === 'cursado') state[codigo] = 'aprobado';
  else state[codigo] = 'pendiente';

  localStorage.setItem('mecatronica_state', JSON.stringify(state));
  renderGrid();
  updateStats();
}

function getBackwardDependencies(rootCode) {
  const direct = new Set();
  const indirect = new Set();

  function getImmediatePrereqs(code) {
    const sub = subjects.find(s => s.codigo === code);
    if (!sub) return [];
    const p = sub.previas || {};
    let list = [...(p.curso || []), ...(p.aprobado || []), ...(p.correquisito || [])];
    if (p.semestreCompleto) {
      subjects.filter(s => s.semestre === p.semestreCompleto).forEach(s => list.push(s.codigo));
    }
    return list;
  }

  const immediate = getImmediatePrereqs(rootCode);
  immediate.forEach(c => direct.add(c));

  const queue = [...immediate];
  const visited = new Set([rootCode, ...immediate]);

  while (queue.length > 0) {
    const current = queue.shift();
    const prereqs = getImmediatePrereqs(current);
    prereqs.forEach(pCode => {
      if (!visited.has(pCode)) {
        visited.add(pCode);
        indirect.add(pCode);
        queue.push(pCode);
      }
    });
  }

  return { direct, indirect };
}

function renderGrid() {
  const container = document.getElementById('curriculum-grid');
  container.innerHTML = '';

  const semestres = [...new Set(subjects.map(s => s.semestre))].sort((a, b) => a - b);
  let tracerDeps = { direct: new Set(), indirect: new Set() };

  if (currentTab === 'tracer' && selectedTracerCode) {
    tracerDeps = getBackwardDependencies(selectedTracerCode);
  }

  semestres.forEach(sem => {
    const col = document.createElement('div');
    col.className = 'semester-col';
    col.innerHTML = `<div class="semester-title">Semestre ${sem}</div>`;

    const semSubjects = subjects.filter(s => s.semestre === sem);
    semSubjects.forEach(s => {
      const card = document.createElement('div');
      card.onclick = () => handleCardClick(s.codigo);

      if (currentTab === 'simulador') {
        const status = evaluateStatus(s);
        card.className = `subject-card status-${status}`;
        card.innerHTML = `
          <div class="subject-title">${s.nombre}</div>
          <div class="subject-code">${s.codigo}</div>
          <div class="subject-meta">
            <span>Créditos: ${s.creditos}</span>
            <span>${state[s.codigo].toUpperCase()}</span>
          </div>
        `;
      } else {
        // Tab Rastreador
        let tracerClass = '';
        let badgeText = state[s.codigo].toUpperCase();

        if (s.codigo === selectedTracerCode) {
          tracerClass = 'tracer-target';
          badgeText = 'SELECCIONADA';
        } else if (tracerDeps.direct.has(s.codigo)) {
          tracerClass = 'tracer-direct';
          badgeText = 'PREVIA DIRECTA';
        } else if (tracerDeps.indirect.has(s.codigo)) {
          tracerClass = 'tracer-indirect';
          badgeText = 'PREVIA INDIRECTA';
        } else if (selectedTracerCode) {
          tracerClass = 'tracer-dimmed';
        }

        card.className = `subject-card ${tracerClass}`;
        card.innerHTML = `
          <div class="subject-title">${s.nombre}</div>
          <div class="subject-code">${s.codigo}</div>
          <div class="subject-meta">
            <span>Créditos: ${s.creditos}</span>
            <span>${badgeText}</span>
          </div>
        `;
      }

      col.appendChild(card);
    });

    container.appendChild(col);
  });
}

function updateStats() {
  const totalCredits = subjects.reduce((acc, s) => acc + s.creditos, 0);
  const approvedCredits = subjects
    .filter(s => state[s.codigo] === 'aprobado')
    .reduce((acc, s) => acc + s.creditos, 0);

  document.getElementById('credits-count').innerText = approvedCredits;
  document.getElementById('progress-percent').innerText = `${Math.round((approvedCredits / totalCredits) * 100)}%`;
}