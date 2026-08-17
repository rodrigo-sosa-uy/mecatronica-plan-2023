let subjects = [];
const state = {}; // Guarda estado por código: 'pendiente', 'cursado', 'aprobado'

document.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('./data.json');
  subjects = await response.json();
  
  // Inicializar estado guardado o por defecto
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

  const prev = subject.previas;

  // Validar materias a tener en curso/aprobadas
  const cursoOK = prev.curso.every(code => ['cursado', 'aprobado'].includes(state[code]));
  
  // Validar materias aprobadas obligatorias
  const aprobadoOK = prev.aprobado.every(code => state[code] === 'aprobado');

  // Validar semestre completo
  let semestreOK = true;
  if (prev.semestreCompleto) {
    const semSubjects = subjects.filter(s => s.semestre === prev.semestreCompleto);
    semestreOK = semSubjects.every(s => state[s.codigo] === 'aprobado');
  }

  return (cursoOK && aprobadoOK && semestreOK) ? 'disponible' : 'bloqueado';
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

  semestres.forEach(sem => {
    const col = document.createElement('div');
    col.className = 'semester-col';
    col.innerHTML = `<div class="semester-title">Semestre ${sem}</div>`;

    const semSubjects = subjects.filter(s => s.semestre === sem);
    semSubjects.forEach(s => {
      const status = evaluateStatus(s);
      const card = document.createElement('div');
      card.className = `subject-card status-${status}`;
      card.onclick = () => toggleState(s.codigo);

      card.innerHTML = `
        <div class="subject-title">${s.nombre}</div>
        <div class="subject-code">${s.codigo}</div>
        <div class="subject-meta">
          <span>Créditos: ${s.creditos}</span>
          <span>${state[s.codigo].toUpperCase()}</span>
        </div>
      `;
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