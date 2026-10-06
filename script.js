/* =========================================================
   1. Configuração e referências
   ========================================================= */
const COLS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ROWS = 10;

const sheet = document.getElementById('sheet');
const statusText = document.getElementById('statusText');
const clearBtn = document.getElementById('clearBtn');

const classifications = new Map();

const classificationColors = {
  fa: '#FC8989',
  tsv: '#B6CBFD',
  normal: '#9CD292',
  anormal: '#FDD083',
  noise: '#D4B7FC'
};

const selected = new Set();   // ids selecionados, ex.: 'B04'
const cells = new Map();      // id  -> elemento da célula
const colHdrs = new Map();    // 'A' -> cabeçalho da coluna
const rowHdrs = new Map();    // 1   -> cabeçalho da linha

const pad = n => String(n).padStart(2, '0');
const cellId = (col, row) => col + pad(row);

function mk(tag, cls, text) {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/* =========================================================
   2. Construção do grid
   ========================================================= */
function buildGrid() {
  const corner = mk('div', 'hdr corner');
  corner.title = 'Selecionar tudo';
  corner.onclick = () => toggleGroup([...cells.keys()]);
  sheet.appendChild(corner);
  sheet.corner = corner;

  COLS.forEach(col => {
    const h = mk('div', 'hdr col-hdr', col);
    h.title = `Selecionar coluna ${col}`;
    h.onclick = () => toggleGroup(rangeIds(col, 1, col, ROWS));
    colHdrs.set(col, h);
    sheet.appendChild(h);
  });

  for (let r = 1; r <= ROWS; r++) {
    const rh = mk('div', 'hdr row-hdr', r);
    rh.title = `Selecionar linha ${r}`;
    rh.onclick = () => toggleGroup(rangeIds(COLS[0], r, COLS[COLS.length - 1], r));
    rowHdrs.set(r, rh);
    sheet.appendChild(rh);

    COLS.forEach(col => {
      const id = cellId(col, r);
      const c = mk('div', 'cell');
      c.dataset.id = id;
      c.dataset.col = col;
      c.dataset.row = r;
      c.appendChild(mk('span', 'tag', id));
      c.appendChild(document.createElement('canvas'));

      const label = mk(
        'label',
        'cell-footer-label hidden',
        ''
      );
      c.appendChild(label);


      cells.set(id, c);
      sheet.appendChild(c);
    });
    
  }
}

/* =========================================================
   3. Seleção
   ========================================================= */
// Retorna os ids do retângulo entre duas células (inclusive)
function rangeIds(c1, r1, c2, r2) {
  const [ca, cb] = [COLS.indexOf(c1), COLS.indexOf(c2)].sort((a, b) => a - b);
  const [ra, rb] = [r1, r2].sort((a, b) => a - b);
  const ids = [];
  for (let r = ra; r <= rb; r++)
    for (let c = ca; c <= cb; c++) ids.push(cellId(COLS[c], r));
  return ids;
}

// Se o grupo já está todo selecionado, remove; senão, adiciona tudo
function toggleGroup(ids) {
  const allOn = ids.every(id => selected.has(id));
  ids.forEach(id => (allOn ? selected.delete(id) : selected.add(id)));
  render();
}

let dragging = false;
let dragMode = 'add';
let anchor = null;

function apply(id) {
  console.log('aplicou')

  dragMode === 'add' ? selected.add(id) : selected.delete(id);

  render();
}

sheet.addEventListener('mousedown', e => {
  const cell = e.target.closest('.cell');
  if (!cell || e.button !== 0) return;
  e.preventDefault();

  // Shift + clique: seleciona o retângulo até a última célula clicada
  if (e.shiftKey && anchor) {
    const a = cells.get(anchor).dataset;
    const b = cell.dataset;
    rangeIds(a.col, +a.row, b.col, +b.row).forEach(i => selected.add(i));
    render();
    return;
  }

  dragging = true;
  dragMode = selected.has(cell.dataset.id) ? 'remove' : 'add';
  anchor = cell.dataset.id;
  apply(anchor);
});

sheet.addEventListener('mouseover', e => {
  if (!dragging) return;
  const cell = e.target.closest('.cell');
  if (cell) apply(cell.dataset.id);
});

window.addEventListener('mouseup', () => { dragging = false; });
clearBtn.addEventListener('click', () => { selected.clear(); render(); });

/* =========================================================
   4. Atualização da tela
   ========================================================= */
function render() {

  // Atualiza a seleção visual das células
  cells.forEach((el, id) => {
    el.classList.toggle('sel', selected.has(id));

    // Remove classes de classificação anteriores
    el.classList.remove(
      'classified-fa',
      'classified-tsv',
      'classified-normal',
      'classified-anormal',
      'classified-noise'
    );

    // Recupera a classificação dessa célula
    const classification = classifications.get(id);

    // Se tiver classificação, aplica a classe
    if (classification) {
      el.classList.add(`classified-${classification}`);
    }
  });

  // Atualiza cabeçalhos das colunas
  COLS.forEach(col => {
    const full = rangeIds(col, 1, col, ROWS)
      .every(i => selected.has(i));

    colHdrs.get(col).classList.toggle('full', full);
  });

  // Atualiza cabeçalhos das linhas
  for (let r = 1; r <= ROWS; r++) {
    const full = rangeIds(
      COLS[0],
      r,
      COLS[COLS.length - 1],
      r
    ).every(i => selected.has(i));

    rowHdrs.get(r).classList.toggle('full', full);
  }

  // Atualiza o canto do grid
  sheet.corner.classList.toggle(
    'full',
    selected.size === cells.size
  );

  // Lista das células selecionadas
  const list = [...cells.keys()]
    .filter(id => selected.has(id));

  // Atualiza status
  statusText.textContent = list.length
    ? `${list.length} selecionada${list.length > 1 ? 's' : ''}: ${list.join(', ')}`
    : 'Nenhuma linha selecionada';

  // Evento de alteração da seleção
  sheet.dispatchEvent(
    new CustomEvent('selectionchange', {
      detail: list,
      bubbles: true
    })
  );
}

/* =========================================================
   5. Traçado ECG em cada célula
   (troque pelos dados reais quando tiver a API/sinal)
   ========================================================= */
function drawStrip(canvas, seed, classification) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // quadriculado leve, como papel milimetrado
  ctx.strokeStyle = 'rgba(100,116,139,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }

  // batimentos, com pequena variação por célula
  const mid = h * 0.6;
  const amp = h * 0.42;
  const period = 62 + (seed % 5) * 4;
const line =
  classificationColors[classification] ||
  getComputedStyle(document.documentElement)
    .getPropertyValue('--trace-line');

ctx.beginPath();
ctx.strokeStyle = line;


  ctx.beginPath();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.4;
  ctx.moveTo(0, mid);
  for (let x0 = -(seed % 20); x0 < w; x0 += period) {
    const p = (dx, dy) => ctx.lineTo(x0 + dx, mid - dy * amp);
    p(period * .15, 0);  p(period * .22, .08); p(period * .29, 0);            // onda P
    p(period * .40, 0);  p(period * .43, -.14); p(period * .47, 1);           // Q, R
    p(period * .51, -.24);                                                    // S
    p(period * .55, 0);  p(period * .70, .18); p(period * .80, 0);           // onda T
    p(period, 0);
  }
  ctx.stroke();
}

function drawAll() {
  let i = 0;

  cells.forEach((el, id) => {
    const classification = classifications.get(id);

    drawStrip(
      el.querySelector('canvas'),
      i++,
      classification
    );
  });
}

/* =========================================================
   6. Classificação (painel direito)
   ========================================================= */
const options = [...document.querySelectorAll('.class-opt')];

let classification = null;

function selectOption(opt) {
    console.log('clicou na opcao', opt)
  options.forEach(o => o.classList.toggle('selected', o === opt));

    // let classification;

    if(opt.classList.contains("class-opt-fa")){
        classification = 'fa'
    }

    else if (opt.classList.contains('class-opt-tsv')) {
        classification = 'tsv';
    } 

    else if (opt.classList.contains('class-opt-normal')) {
        classification = 'normal';
    } 

    else if (opt.classList.contains('class-opt-anormal')) {
        classification = 'anormal';
    } 

    else if (opt.classList.contains('class-opt-noise')) {
        classification = 'interferência';
    }

    if(!classification) return;
    
    selected.forEach(id => {
        classifications.set(id, classification)
    })

    render()

  // Redesenha os traçados com suas respectivas cores
  drawAll();

}


options.forEach(opt => opt.addEventListener('click', () => selectOption(opt)));


function toogleRightSidebar(){
    console.log('chamou o toggle right sidebar')

    const rightSidebar = document.getElementById("rightSidebar")
    console.log(rightSidebar)
    const rotateIcon = document.getElementById("toogle-icon")

    if(!rightSidebar || !rotateIcon) return
    
    rightSidebar.classList.toggle("sidebar-hidden")
    

    if(rightSidebar.classList.contains("sidebar-hidden")){
        rotateIcon.style.transform = 'rotate(180deg)'
    } else{
        rotateIcon.style.transform = 'rotate(0deg)'
    }

}

let isModalOpen = false
let modalZoom;

function renderModal(){
    modalZoom.style.display = isModalOpen ? 'block' : 'none'
}

function openEcgZoomModal(){
    isModalOpen = true 
    renderModal()
}

function closeEcgZoomModal(){
    isModalOpen = false
    renderModal()
}


function applyClassifications(){
  console.log('entrou no apply classifications')

  if(!classification) return

  selected.forEach(id => {
    const cell = cells.get(id)

    if(!cell) return;

    const label = cell.querySelector('.cell-footer-label')

    if(!label) return;

    const selectedOption = document.querySelector('.class-opt.selected')

    if(selectedOption){
      label.style.backgroundColor = getComputedStyle(selectedOption).backgroundColor
    }
    
    label.textContent = `${classification}`
    label.style.background = 'class-opt-tsv.selected'
    label.classList.remove('hidden')

    // limpa a selecao para permitir uma nova
    selected.clear()
  })

  render()
  drawAll()
}


function applyRemaining() {
  console.log('entrou no apply remaining');

  if (!classification) {
    console.log('Nenhuma classificação selecionada');
    return;
  }

  const selectedOption =
    document.querySelector('.class-opt.selected');

  if (!selectedOption) {
    console.log('Nenhuma opção selecionada');
    return;
  }

  const backgroundColor =
    getComputedStyle(selectedOption).backgroundColor;

  cells.forEach((cell, id) => {

    // Não altera quem já possui classificação
    if (classifications.has(id)) {
      return;
    }

    // Salva a classificação
    classifications.set(id, [classification]);

    // Procura o container das labels
    let labelsContainer =
      cell.querySelector('.cell-labels');

    // Se não existir, cria
    if (!labelsContainer) {
      labelsContainer = document.createElement('div');
      labelsContainer.className = 'cell-labels';

      cell.appendChild(labelsContainer);
    }

    // Cria a label
    const label = document.createElement('label');

    label.className = 'cell-footer-label';
    label.textContent = classification;
    label.style.backgroundColor = backgroundColor;

    labelsContainer.appendChild(label);
  });

  render();
  drawAll();
}

// full screen ecg
function onFullScreen(){

  const fullScreen = document.getElementById("fullScreenOption")

  fullScreen.addEventListener("click", async ()=> {
    try {
      if(!document.fullscreenElement){
        await document.documentElement.requestFullscreen()
      } else{
        await document.exitFullscreen()
      }
    } catch (error) {
      console.error('Erro ao alternar tela cheia:', error);
    }
  })

}

//controla o zoom (para mais ou menos) modal de zoom 
const zoomRange = document.getElementById("zoomRange");
const zoomValue = document.getElementById("zoomValue");

zoomRange.addEventListener("click", ()=> {
  zoomValue.textContent = `${zoomRange.value}%`
})


//controla a exibicao do modal de zoom de ecg
document.addEventListener("DOMContentLoaded", ()=> {
     modalZoom = document.querySelector(".ecg-modal")
     renderModal()
})


// Atalhos de teclado 1 a 5
window.addEventListener('keydown', e => {
  const opt = options.find(o => o.dataset.key === e.key);
  if (opt) selectOption(opt);
});

/* =========================================================
   7. Inicialização
   ========================================================= */
buildGrid();
render();
drawAll();
new ResizeObserver(drawAll).observe(sheet);