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

  setTab('simulador');
});

function evaluateStatus(subject) {
  if (state[subject.codigo] === 'aprobado') return 'aprobado';
  if (state[subject.codigo] === 'cursado') return 'cursado';

  const prev = subject.previas || {};
  const cursoOK = (prev.curso || []).every(code => ['cursado', 'aprobado'].includes(state[code]));
  const aprobadoOK = (prev.aprobado || []).every(code => state[code] === 'aprobado');
  const correquisitoOK = (prev.correquisito || []).every(code => ['cursado', 'aprobado'].includes(state[code]));

  let semestreOK = true;
  if (prev.semestreCompleto) {
    const semSubjects = subjects.filter(s => s.semestre === prev.semestreCompleto);
    semestreOK = semSubjects.every(s => state[s.codigo] === 'aprobado');
  }

  return (cursoOK && aprobadoOK && correquisitoOK && semestreOK) ? 'disponible' : 'bloqueado';
}

function getMissingPrereqs(subject) {
  const prev = subject.previas || {};
  const missing = [];

  (prev.aprobado || []).forEach(code => {
    if (state[code] !== 'aprobado') {
      missing.push(`${code} (Aprob)`);
    }
  });

  (prev.curso || []).forEach(code => {
    if (!['cursado', 'aprobado'].includes(state[code])) {
      missing.push(`${code} (Curso)`);
    }
  });

  (prev.correquisito || []).forEach(code => {
    if (!['cursado', 'aprobado'].includes(state[code])) {
      missing.push(`${code} (Correq)`);
    }
  });

  if (prev.semestreCompleto) {
    const semSubjects = subjects.filter(s => s.semestre === prev.semestreCompleto);
    if (!semSubjects.every(s => state[s.codigo] === 'aprobado')) {
      missing.push(`Semestre ${prev.semestreCompleto} Completo`);
    }
  }

  return missing;
}

function getBackwardDependencies(rootCode) {
  const deps = new Map();
  const rootSub = subjects.find(s => s.codigo === rootCode);
  if (!rootSub) return deps;

  const prev = rootSub.previas || {};

  (prev.aprobado || []).forEach(c => deps.set(c, { level: 'direct', type: 'aprobado' }));
  (prev.curso || []).forEach(c => deps.set(c, { level: 'direct', type: 'curso' }));
  (prev.correquisito || []).forEach(c => deps.set(c, { level: 'direct', type: 'correquisito' }));
  if (prev.semestreCompleto) {
    subjects.filter(s => s.semestre === prev.semestreCompleto).forEach(s => {
      if (!deps.has(s.codigo)) deps.set(s.codigo, { level: 'direct', type: 'semestre' });
    });
  }

  const queue = Array.from(deps.keys());
  const visited = new Set([rootCode, ...queue]);

  while (queue.length > 0) {
    const currentCode = queue.shift();
    const sub = subjects.find(s => s.codigo === currentCode);
    if (!sub) continue;

    const p = sub.previas || {};
    
    const processPrereq = (code, reqType) => {
      if (!visited.has(code)) {
        visited.add(code);
        deps.set(code, { level: 'indirect', type: reqType });
        queue.push(code);
      }
    };

    (p.aprobado || []).forEach(c => processPrereq(c, 'aprobado'));
    (p.curso || []).forEach(c => processPrereq(c, 'curso'));
    (p.correquisito || []).forEach(c => processPrereq(c, 'correquisito'));
    if (p.semestreCompleto) {
      subjects.filter(s => s.semestre === p.semestreCompleto).forEach(s => processPrereq(s.codigo, 'semestre'));
    }
  }

  return deps;
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  const banner = document.getElementById('tab-info');
  if (tab === 'simulador') {
    banner.innerHTML = '<strong>Modo Simulador:</strong> Haz clic en las materias habilitadas para cambiar su estado (Disponible ➔ Cursado ➔ Aprobado). Las materias bloqueadas indican qué requisitos te faltan cumplir.';
  } else {
    banner.innerHTML = `
      <div><strong>Modo Rastreador:</strong> Haz clic en cualquier materia para inspeccionar toda la cadena de requisitos requeridos.</div>
      <div class="tracer-legend">
        <span class="legend-item"><span class="legend-box" style="background:var(--req-aprobado)"></span> Exige Aprobado</span>
        <span class="legend-item"><span class="legend-box" style="background:var(--req-curso)"></span> Exige Curso</span>
        <span class="legend-item"><span class="legend-box" style="background:var(--req-correquisito)"></span> Correquisito</span>
        <span class="legend-item"><span class="legend-box" style="border:2px solid #fff"></span> Borde Sólido: Directa</span>
        <span class="legend-item"><span class="legend-box" style="border:2px dashed #fff"></span> Borde Punteado: Indirecta</span>
      </div>
    `;
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

function renderGrid() {
  const container = document.getElementById('curriculum-grid');
  container.innerHTML = '';

  const semestres = [...new Set(subjects.map(s => s.semestre))].sort((a, b) => a - b);
  let tracerDeps = new Map();

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

        let missingHTML = '';
        if (status === 'bloqueado' && state[s.codigo] === 'pendiente') {
          const missing = getMissingPrereqs(s);
          if (missing.length > 0) {
            missingHTML = `<div class="subject-missing">Pendiente: ${missing.join(' - ')}</div>`;
          }
        }

        card.innerHTML = `
          <div class="subject-title">${s.nombre}</div>
          <div class="subject-code">${s.codigo}</div>
          <div class="subject-meta">
            <span>Créditos: ${s.creditos}</span>
            <span>${state[s.codigo].toUpperCase()}</span>
          </div>
          ${missingHTML}
        `;
      } else {
        // Tab Rastreador
        let tracerClass = '';
        let badgeText = state[s.codigo].toUpperCase();

        if (s.codigo === selectedTracerCode) {
          tracerClass = 'tracer-target';
          badgeText = 'SELECCIONADA';
        } else if (tracerDeps.has(s.codigo)) {
          const dep = tracerDeps.get(s.codigo);
          tracerClass = `tracer-type-${dep.type} level-${dep.level}`;
          const typeName = dep.type === 'aprobado' ? 'APROB' : dep.type === 'curso' ? 'CURSO' : 'CORREQ';
          badgeText = `${dep.level === 'direct' ? 'DIRECTA' : 'INDIRECTA'} (${typeName})`;
        } else if (selectedTracerCode) {
          tracerClass = 'tracer-dimmed';
        }

        card.innerHTML = `
          <div class="subject-title">${s.nombre}</div>
          <div class="subject-code">${s.codigo}</div>
          <div class="subject-meta">
            <span>Créditos: ${s.creditos}</span>
            <span>${badgeText}</span>
          </div>
        `;
        card.className = `subject-card ${tracerClass}`;
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