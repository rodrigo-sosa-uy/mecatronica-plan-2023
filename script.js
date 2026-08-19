let subjects = [];
let selectedTracerCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  const response = await fetch('./data.json');
  subjects = await response.json();
  renderGrid();
});

function getBackwardDependencies(rootCode) {
  const deps = new Map();
  const rootSub = subjects.find(s => s.codigo === rootCode);
  if (!rootSub) return deps;

  const prev = rootSub.previas || {};

  (prev.aprobado || []).forEach(c => deps.set(c, { level: 'direct', type: 'aprobado' }));
  (prev.curso || []).forEach(c => deps.set(c, { level: 'direct', type: 'curso' }));
  (prev.correquisito || []).forEach(c => deps.set(c, { level: 'direct', type: 'correquisito' }));
  
  if (prev.semestreCompleto) {
    // Ignorar las materias de Inglés en el chequeo de semestre completo
    subjects.filter(s => s.semestre === prev.semestreCompleto && !s.nombre.startsWith('Inglés')).forEach(s => {
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
      // Ignorar Inglés recursivamente
      subjects.filter(s => s.semestre === p.semestreCompleto && !s.nombre.startsWith('Inglés')).forEach(s => processPrereq(s.codigo, 'semestre'));
    }
  }

  return deps;
}

function handleCardClick(codigo) {
  selectedTracerCode = (selectedTracerCode === codigo) ? null : codigo;
  renderGrid();
}

function renderGrid() {
  const container = document.getElementById('curriculum-grid');
  container.innerHTML = '';

  const semestres = [...new Set(subjects.map(s => s.semestre))].sort((a, b) => a - b);
  let tracerDeps = new Map();

  if (selectedTracerCode) {
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

      let tracerClass = '';
      let badgeText = '';

      if (s.codigo === selectedTracerCode) {
        tracerClass = 'tracer-target';
        badgeText = 'OBJETIVO';
      } else if (tracerDeps.has(s.codigo)) {
        const dep = tracerDeps.get(s.codigo);
        tracerClass = `tracer-type-${dep.type} level-${dep.level}`;
        
        let typeName = '';
        if (dep.type === 'aprobado') typeName = 'APROB';
        else if (dep.type === 'curso') typeName = 'CURSO';
        else if (dep.type === 'correquisito') typeName = 'CORREQ';
        else if (dep.type === 'semestre') typeName = 'SEMESTRE';

        badgeText = `${dep.level === 'direct' ? 'DIRECTA' : 'INDIRECTA'} (${typeName})`;
      } else if (selectedTracerCode) {
        tracerClass = 'tracer-dimmed';
      }

      const creditosHTML = s.creditos ? `<span>Créditos: ${s.creditos}</span>` : '<span></span>';
      const badgeHTML = badgeText ? `<span>${badgeText}</span>` : '';

      card.innerHTML = `
        <div class="subject-title">${s.nombre}</div>
        <div class="subject-code">${s.codigo}</div>
        <div class="subject-meta">
          ${creditosHTML}
          ${badgeHTML}
        </div>
      `;
      card.className = `subject-card ${tracerClass}`;
      col.appendChild(card);
    });

    container.appendChild(col);
  });
}