// ============ Estado ============
const state = {
  artistas: [],
  canciones: [],
  cargado: false,
  cola: [],          // canciones en la cola actual
  actual: -1,        // índice dentro de la cola
  reproduciendo: false,
  segundo: 0,
  timer: null,
};

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');

// ============ Utilidades ============
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('es-MX'));
const tiempo = (s) => {
  s = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const parseDuracion = (v) => {
  v = String(v).trim();
  if (!v) return undefined;
  if (v.includes(':')) {
    const [m, s] = v.split(':').map(Number);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : NaN;
  }
  return Number(v);
};
const hue = (str = '') => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const iniciales = (t = '?') => t.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

function cover(url, nombre, extraClass = '') {
  const h = hue(nombre);
  const bg = `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 50) % 360} 60% 22%))`;
  const img = url ? `url('${encodeURI(url)}'), ` : '';
  return `<div class="cover ${extraClass}" style="background-image:${img}${bg}">${url ? '' : esc(iniciales(nombre))}</div>`;
}

const artistaDe = (c) => {
  if (c.artista_id && typeof c.artista_id === 'object') return c.artista_id;
  return state.artistas.find((a) => a._id === c.artista_id) || null;
};
const idArtista = (c) => (c.artista_id && typeof c.artista_id === 'object' ? c.artista_id._id : c.artista_id);

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" style="width:16px;height:16px"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
};

function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2800);
}

// ============ API ============
async function api(url, opciones = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function cargarTodo() {
  try {
    const [artistas, canciones] = await Promise.all([api('/artistas'), api('/canciones')]);
    state.artistas = artistas;
    state.canciones = canciones;
  } catch (e) {
    toast('No se pudo cargar: ' + e.message, true);
  }
  state.cargado = true;
  renderBiblioteca();
  render();
}

// ============ Biblioteca lateral ============
function renderBiblioteca() {
  const lista = $('#library-list');
  if (!state.artistas.length) {
    lista.innerHTML = '<li class="muted" style="padding:8px">Aún no hay artistas.</li>';
    return;
  }
  lista.innerHTML = state.artistas
    .map((a) => `
      <li class="lib-item" data-go="#/artista/${a._id}">
        ${cover(a.urlFoto, a.nombre, 'lib-cover')}
        <div><div class="lib-name">${esc(a.nombre)}</div><div class="lib-sub">Artista</div></div>
      </li>`)
    .join('');
}

// ============ Componentes ============
function cardArtista(a) {
  return `
    <div class="card" data-go="#/artista/${a._id}">
      <div class="card-media">
        ${cover(a.urlFoto, a.nombre)}
        <button class="big-play card-play" data-play-artista="${a._id}" title="Reproducir">${ICON.play}</button>
      </div>
      <div class="card-tools">
        <button class="icon-btn" data-edit-artista="${a._id}" title="Editar">${ICON.edit}</button>
        <button class="icon-btn" data-del-artista="${a._id}" title="Eliminar">${ICON.trash}</button>
      </div>
      <div class="card-title">${esc(a.nombre)}</div>
      <div class="card-sub">${esc(a.generoMusical || 'Artista')}</div>
    </div>`;
}

function tablaCanciones(lista, { conArtista = true } = {}) {
  if (!lista.length) {
    return `<div class="empty"><h3>No hay canciones</h3><p>Agrega la primera para empezar a escuchar.</p>
      <button class="btn btn-light" data-create="cancion">+ Canción</button></div>`;
  }
  const actual = state.cola[state.actual];
  const ids = lista.map((c) => c._id).join(',');
  return `
    <table class="tracks">
      <thead><tr>
        <th class="num">#</th><th>Título</th><th class="col-hide-sm">Álbum</th>
        <th class="right col-hide-sm">Reproducciones</th><th class="right">${ICON.clock}</th><th class="right"></th>
      </tr></thead>
      <tbody>
        ${lista.map((c, i) => {
          const art = artistaDe(c);
          return `
          <tr data-play-cancion="${c._id}" data-cola="${ids}" class="${actual && actual._id === c._id ? 'playing' : ''}">
            <td class="num"><span class="idx">${i + 1}</span><span class="hover-play">${ICON.play}</span></td>
            <td><div class="track-main">
              ${cover(c.urlFotoAlbum, c.album || c.titulo)}
              <div style="min-width:0">
                <div class="track-title">${esc(c.titulo)}</div>
                ${conArtista ? `<div class="track-artist">${art ? `<a href="#/artista/${art._id}">${esc(art.nombre)}</a>` : 'Artista desconocido'}</div>` : ''}
              </div>
            </div></td>
            <td class="col-hide-sm">${esc(c.album || '—')}${c.añoLanzamiento ? ` · ${c.añoLanzamiento}` : ''}</td>
            <td class="right col-hide-sm">${num(c.reproducciones)}</td>
            <td class="right">${tiempo(c.duracion)}</td>
            <td class="right"><span class="row-tools">
              <button class="icon-btn" data-edit-cancion="${c._id}" title="Editar">${ICON.edit}</button>
              <button class="icon-btn" data-del-cancion="${c._id}" title="Eliminar">${ICON.trash}</button>
            </span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function cargando() {
  return `<div class="cards" style="margin-top:24px">${Array.from({ length: 6 }, () =>
    '<div class="card"><div class="skeleton" style="aspect-ratio:1;border-radius:50%;margin-bottom:12px"></div><div class="skeleton" style="height:14px;width:70%"></div></div>').join('')}</div>`;
}

// ============ Vistas ============
function vistaInicio() {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const top = [...state.canciones].sort((a, b) => (b.reproducciones || 0) - (a.reproducciones || 0)).slice(0, 5);
  const populares = [...state.artistas].sort((a, b) => (b.reproduccionesMensuales || 0) - (a.reproduccionesMensuales || 0));

  if (!state.artistas.length && !state.canciones.length) {
    return `<h1 class="greeting">${saludo}</h1>
      <div class="empty"><h3>Tu biblioteca está vacía</h3><p>Crea un artista y luego agrégale canciones.</p>
      <button class="btn btn-light" data-create="artista">+ Crear artista</button></div>`;
  }
  return `
    <h1 class="greeting">${saludo}</h1>
    <div class="quick-grid">
      ${populares.slice(0, 6).map((a) => `
        <div class="quick" data-go="#/artista/${a._id}">${cover(a.urlFoto, a.nombre)}<span>${esc(a.nombre)}</span></div>`).join('')}
    </div>
    <div class="section-title"><h2>Artistas populares</h2><a href="#/artistas">Mostrar todo</a></div>
    <div class="cards">${populares.slice(0, 6).map(cardArtista).join('')}</div>
    <div class="section-title"><h2>Lo más escuchado</h2><a href="#/canciones">Mostrar todo</a></div>
    ${tablaCanciones(top)}`;
}

function vistaArtistas() {
  return `
    <div class="section-title"><h2>Artistas</h2><span class="muted">${state.artistas.length} en total</span></div>
    ${state.artistas.length ? `<div class="cards">${state.artistas.map(cardArtista).join('')}</div>`
      : `<div class="empty"><h3>No hay artistas</h3><button class="btn btn-light" data-create="artista">+ Artista</button></div>`}`;
}

function vistaCanciones() {
  const total = state.canciones.reduce((s, c) => s + (Number(c.duracion) || 0), 0);
  return `
    <section class="hero square" style="background:linear-gradient(180deg,#5038a0,#2a1f55 70%,transparent)">
      <div class="cover" style="background:linear-gradient(135deg,#450af5,#c4efd9)"><svg viewBox="0 0 24 24" style="width:80px;height:80px"><path d="M12 21s-7-4.4-9.5-9C.8 8.6 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 5 23.2 8.6 21.5 12 19 16.6 12 21 12 21z" fill="#fff"/></svg></div>
      <div>
        <div class="hero-kind">Playlist</div>
        <h1>Todas las canciones</h1>
        <div class="hero-meta"><span>${state.canciones.length} canciones</span><span>${tiempo(total)}</span></div>
      </div>
    </section>
    <div class="action-bar">
      <button class="big-play" data-play-todo title="Reproducir">${ICON.play}</button>
      <button class="btn btn-light" data-create="cancion">+ Canción</button>
    </div>
    ${tablaCanciones(state.canciones)}`;
}

function vistaArtista(id) {
  const a = state.artistas.find((x) => x._id === id);
  if (!a) return `<div class="empty"><h3>Artista no encontrado</h3><a class="btn btn-light" href="#/artistas">Ver artistas</a></div>`;
  const h = hue(a.nombre);
  const suyas = state.canciones.filter((c) => idArtista(c) === a._id)
    .sort((x, y) => (y.reproducciones || 0) - (x.reproducciones || 0));
  const meta = [
    a.reproduccionesMensuales != null && `${num(a.reproduccionesMensuales)} oyentes mensuales`,
    a.generoMusical, a.pais,
    a.añoFormacion && `Desde ${a.añoFormacion}`,
    a.integrantes && `${a.integrantes} integrante${a.integrantes == 1 ? '' : 's'}`,
  ].filter(Boolean);
  return `
    <section class="hero" style="background:linear-gradient(180deg,hsl(${h} 45% 35%),hsl(${h} 40% 16%) 75%,transparent)">
      ${cover(a.urlFoto, a.nombre)}
      <div>
        <div class="hero-kind">Artista</div>
        <h1>${esc(a.nombre)}</h1>
        <div class="hero-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
      </div>
    </section>
    <div class="action-bar">
      <button class="big-play" data-play-artista="${a._id}" title="Reproducir">${ICON.play}</button>
      <button class="btn btn-light" data-create="cancion" data-artista="${a._id}">+ Canción</button>
      <button class="icon-btn" data-edit-artista="${a._id}" title="Editar artista">${ICON.edit}</button>
      <button class="icon-btn" data-del-artista="${a._id}" title="Eliminar artista">${ICON.trash}</button>
    </div>
    <div class="section-title"><h2>Populares</h2></div>
    ${tablaCanciones(suyas, { conArtista: false })}`;
}

function vistaBuscar() {
  const q = $('#search').value.trim().toLowerCase();
  if (!q) {
    return `<div class="section-title"><h2>Explorar todo</h2></div><div class="cards">${state.artistas.map(cardArtista).join('')}</div>`;
  }
  const arts = state.artistas.filter((a) => [a.nombre, a.generoMusical, a.pais].some((v) => v && v.toLowerCase().includes(q)));
  const cans = state.canciones.filter((c) => [c.titulo, c.album, artistaDe(c)?.nombre].some((v) => v && v.toLowerCase().includes(q)));
  if (!arts.length && !cans.length) {
    return `<div class="empty"><h3>No se encontraron resultados para "${esc(q)}"</h3><p>Revisa la ortografía o usa otras palabras.</p></div>`;
  }
  return `
    ${cans.length ? `<div class="section-title"><h2>Canciones</h2></div>${tablaCanciones(cans)}` : ''}
    ${arts.length ? `<div class="section-title"><h2>Artistas</h2></div><div class="cards">${arts.map(cardArtista).join('')}</div>` : ''}`;
}

// ============ Router ============
function render() {
  const hash = location.hash || '#/';
  const [, ruta, id] = hash.split('/');
  const nav = ruta || 'inicio';
  document.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === nav));
  $('#search-wrap').hidden = nav !== 'buscar';

  if (!state.cargado) { view.innerHTML = cargando(); return; }
  const vistas = { inicio: vistaInicio, artistas: vistaArtistas, canciones: vistaCanciones, buscar: vistaBuscar };
  view.innerHTML = ruta === 'artista' ? vistaArtista(id) : (vistas[nav] || vistaInicio)();
}

window.addEventListener('hashchange', () => {
  render();
  $('#main').scrollTop = 0;
  if (location.hash === '#/buscar') $('#search').focus();
});
$('#search').addEventListener('input', render);

// ============ Formularios (crear / editar) ============
const CAMPOS = {
  artista: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, full: true },
    { name: 'generoMusical', label: 'Género musical', type: 'text' },
    { name: 'pais', label: 'País', type: 'text' },
    { name: 'añoFormacion', label: 'Año de formación', type: 'number', min: 1900, max: 2100 },
    { name: 'integrantes', label: 'Integrantes', type: 'number', min: 1 },
    { name: 'reproduccionesMensuales', label: 'Oyentes mensuales', type: 'number', min: 0, full: true },
    { name: 'urlFoto', label: 'URL de la foto', type: 'url', full: true },
  ],
  cancion: [
    { name: 'titulo', label: 'Título', type: 'text', required: true, full: true },
    { name: 'artista_id', label: 'Artista', type: 'select', required: true, full: true },
    { name: 'album', label: 'Álbum', type: 'text' },
    { name: 'añoLanzamiento', label: 'Año de lanzamiento', type: 'number', min: 1900, max: 2100 },
    { name: 'duracion', label: 'Duración (m:ss o segundos)', type: 'text', placeholder: '3:45' },
    { name: 'reproducciones', label: 'Reproducciones', type: 'number', min: 0 },
    { name: 'urlFotoAlbum', label: 'URL portada del álbum', type: 'url', full: true },
  ],
};

let formCtx = null;

function abrirFormulario(tipo, doc = null, preset = {}) {
  if (tipo === 'cancion' && !state.artistas.length) {
    toast('Primero crea un artista', true);
    return;
  }
  formCtx = { tipo, id: doc?._id || null };
  $('#modal-title').textContent = `${doc ? 'Editar' : 'Crear'} ${tipo === 'artista' ? 'artista' : 'canción'}`;
  $('#modal-submit').textContent = doc ? 'Guardar cambios' : 'Crear';
  $('#form-error').hidden = true;

  const valores = { ...preset, ...(doc || {}) };
  if (tipo === 'cancion') {
    valores.artista_id = doc ? idArtista(doc) : preset.artista_id;
    if (valores.duracion != null && valores.duracion !== '') valores.duracion = tiempo(valores.duracion);
  }

  $('#modal-fields').innerHTML = CAMPOS[tipo].map((f) => {
    const v = valores[f.name] ?? '';
    const attrs = `id="f-${f.name}" name="${f.name}" ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} placeholder="${esc(f.placeholder || ' ')}"`;
    const input = f.type === 'select'
      ? `<select ${attrs}><option value="">Selecciona…</option>${state.artistas.map((a) =>
          `<option value="${a._id}" ${a._id === v ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select>`
      : `<input type="${f.type}" ${attrs} value="${esc(v)}">`;
    return `<div class="field ${f.full ? 'full' : ''}"><label for="f-${f.name}">${f.label}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');

  $('#modal-preview').className = 'modal-preview' + (tipo === 'artista' ? ' round' : '');
  actualizarPreview();
  $('#modal').hidden = false;
  $('#modal-fields input, #modal-fields select').focus();
}

function actualizarPreview() {
  const f = $('#modal-form');
  const esArtista = formCtx.tipo === 'artista';
  const url = (esArtista ? f.urlFoto : f.urlFotoAlbum).value.trim();
  const nombre = (esArtista ? f.nombre : (f.album.value ? f.album : f.titulo)).value || '?';
  $('#modal-preview').innerHTML = cover(url, nombre);
}

function cerrarModal() { $('#modal').hidden = true; formCtx = null; }

$('#modal-form').addEventListener('input', () => formCtx && actualizarPreview());
$('#modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const err = $('#form-error');
  if (!form.checkValidity()) {
    err.textContent = 'Revisa los campos marcados (los que tienen * son obligatorios).';
    err.hidden = false;
    form.reportValidity();
    return;
  }
  const body = {};
  for (const f of CAMPOS[formCtx.tipo]) {
    let v = form[f.name].value.trim();
    if (f.name === 'duracion') {
      v = parseDuracion(v);
      if (Number.isNaN(v)) { err.textContent = 'Duración inválida. Usa m:ss (ej. 3:45) o segundos.'; err.hidden = false; return; }
    } else if (f.type === 'number') {
      v = v === '' ? undefined : Number(v);
    }
    // En edición mandamos null para limpiar campos vacíos; en creación los omitimos
    if (v === '' || v === undefined) { if (formCtx.id) body[f.name] = null; continue; }
    body[f.name] = v;
  }

  const btn = $('#modal-submit');
  btn.disabled = true;
  const ruta = formCtx.tipo === 'artista' ? '/artistas' : '/canciones';
  try {
    if (formCtx.id) {
      const actualizado = await api(`${ruta}/${formCtx.id}`, { method: 'PUT', body });
      reemplazar(formCtx.tipo, actualizado);
      toast('Cambios guardados');
    } else {
      const creado = await api(ruta, { method: 'POST', body });
      if (formCtx.tipo === 'artista') state.artistas.push(creado);
      else state.canciones.push({ ...creado, artista_id: state.artistas.find((a) => a._id === creado.artista_id) || creado.artista_id });
      toast(formCtx.tipo === 'artista' ? 'Artista creado' : 'Canción agregada');
    }
    cerrarModal();
    renderBiblioteca();
    render();
    renderPlayer();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

function reemplazar(tipo, doc) {
  const lista = tipo === 'artista' ? state.artistas : state.canciones;
  const i = lista.findIndex((x) => x._id === doc._id);
  if (i >= 0) lista[i] = doc;
  if (tipo === 'artista') {
    // actualizar el artista poblado dentro de sus canciones
    state.canciones.forEach((c) => { if (idArtista(c) === doc._id) c.artista_id = doc; });
  }
  state.cola = state.cola.map((c) => (c._id === doc._id ? doc : c));
}

// ============ Eliminar ============
let confirmar = null;
function pedirConfirmacion(titulo, texto, accion) {
  $('#confirm-title').textContent = titulo;
  $('#confirm-text').textContent = texto;
  confirmar = accion;
  $('#confirm').hidden = false;
  $('#confirm-no').focus();
}
$('#confirm-no').addEventListener('click', () => ($('#confirm').hidden = true));
$('#confirm-yes').addEventListener('click', async () => {
  const btn = $('#confirm-yes');
  btn.disabled = true;
  try { await confirmar(); $('#confirm').hidden = true; }
  catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; }
});

function eliminarArtista(id) {
  const a = state.artistas.find((x) => x._id === id);
  const n = state.canciones.filter((c) => idArtista(c) === id).length;
  pedirConfirmacion(`¿Eliminar a ${a.nombre}?`,
    n ? `También se eliminarán sus ${n} canción${n === 1 ? '' : 'es'}. Esta acción no se puede deshacer.` : 'Esta acción no se puede deshacer.',
    async () => {
      await api(`/artistas/${id}`, { method: 'DELETE' });
      state.artistas = state.artistas.filter((x) => x._id !== id);
      state.canciones = state.canciones.filter((c) => idArtista(c) !== id);
      quitarDeCola((c) => idArtista(c) === id);
      toast('Artista eliminado');
      renderBiblioteca();
      if (location.hash === `#/artista/${id}`) location.hash = '#/artistas'; else render();
    });
}

function eliminarCancion(id) {
  const c = state.canciones.find((x) => x._id === id);
  pedirConfirmacion(`¿Eliminar "${c.titulo}"?`, 'Esta acción no se puede deshacer.', async () => {
    await api(`/canciones/${id}`, { method: 'DELETE' });
    state.canciones = state.canciones.filter((x) => x._id !== id);
    quitarDeCola((x) => x._id === id);
    toast('Canción eliminada');
    render();
  });
}

// ============ Reproductor (simulado) ============
function reproducir(cola, indice = 0) {
  if (!cola.length) { toast('No hay canciones para reproducir', true); return; }
  state.cola = cola;
  state.actual = indice;
  state.segundo = 0;
  state.reproduciendo = true;
  arrancarTimer();
  renderPlayer();
  render();
}

function arrancarTimer() {
  clearInterval(state.timer);
  if (!state.reproduciendo) return;
  state.timer = setInterval(() => {
    const c = state.cola[state.actual];
    if (!c) return;
    state.segundo++;
    if (state.segundo >= (Number(c.duracion) || 180)) return siguiente();
    renderProgreso();
  }, 1000);
}

function siguiente() {
  if (state.actual < state.cola.length - 1) { state.actual++; state.segundo = 0; }
  else { state.reproduciendo = false; state.segundo = 0; arrancarTimer(); }
  renderPlayer(); render();
}

function anterior() {
  if (state.segundo > 3 || state.actual <= 0) state.segundo = 0;
  else { state.actual--; state.segundo = 0; }
  renderPlayer(); render();
}

function quitarDeCola(pred) {
  const actual = state.cola[state.actual];
  state.cola = state.cola.filter((c) => !pred(c));
  if (actual && pred(actual)) {
    state.actual = -1; state.reproduciendo = false; arrancarTimer();
  } else if (actual) {
    state.actual = state.cola.findIndex((c) => c._id === actual._id);
  }
  renderPlayer();
}

function renderProgreso() {
  const c = state.cola[state.actual];
  const total = c ? Number(c.duracion) || 180 : 0;
  $('#time-cur').textContent = tiempo(state.segundo);
  $('#time-total').textContent = tiempo(total);
  $('#progress-fill').style.width = total ? `${(state.segundo / total) * 100}%` : '0';
}

function renderPlayer() {
  const c = state.cola[state.actual];
  const np = $('#now-playing');
  if (!c) {
    np.innerHTML = '<div class="np-cover placeholder"></div><div class="np-text"><div class="np-title">Nada sonando</div><div class="np-artist">Elige una canción</div></div>';
  } else {
    const art = artistaDe(c);
    np.innerHTML = `${cover(c.urlFotoAlbum, c.album || c.titulo, 'np-cover')}
      <div class="np-text"><div class="np-title">${esc(c.titulo)}</div>
      <div class="np-artist">${art ? `<a href="#/artista/${art._id}">${esc(art.nombre)}</a>` : ''}</div></div>`;
  }
  $('#btn-play').innerHTML = state.reproduciendo ? ICON.pause : ICON.play;
  $('#btn-play').title = state.reproduciendo ? 'Pausar' : 'Reproducir';
  renderProgreso();
}

$('#btn-play').addEventListener('click', () => {
  if (!state.cola[state.actual]) return reproducir(state.canciones, 0);
  state.reproduciendo = !state.reproduciendo;
  arrancarTimer();
  renderPlayer();
});
$('#btn-next').addEventListener('click', () => state.cola.length && siguiente());
$('#btn-prev').addEventListener('click', () => state.cola.length && anterior());
$('#progress').addEventListener('click', (e) => {
  const c = state.cola[state.actual];
  if (!c) return;
  const r = e.currentTarget.getBoundingClientRect();
  state.segundo = Math.floor(((e.clientX - r.left) / r.width) * (Number(c.duracion) || 180));
  renderProgreso();
});

// ============ Delegación de clics ============
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-create],[data-edit-artista],[data-del-artista],[data-edit-cancion],[data-del-cancion],[data-play-artista],[data-play-todo],[data-play-cancion],[data-go],[data-close],a[href]');
  if (!t) return;
  const d = t.dataset;

  if (t.matches('a[href]')) return; // los enlaces navegan solos
  if ('close' in d) return cerrarModal();
  if (d.create) return abrirFormulario(d.create, null, d.artista ? { artista_id: d.artista } : {});
  if (d.editArtista) { e.stopPropagation(); return abrirFormulario('artista', state.artistas.find((a) => a._id === d.editArtista)); }
  if (d.delArtista) return eliminarArtista(d.delArtista);
  if (d.editCancion) return abrirFormulario('cancion', state.canciones.find((c) => c._id === d.editCancion));
  if (d.delCancion) return eliminarCancion(d.delCancion);
  if (d.playArtista) {
    const cola = state.canciones.filter((c) => idArtista(c) === d.playArtista)
      .sort((x, y) => (y.reproducciones || 0) - (x.reproducciones || 0));
    return reproducir(cola, 0);
  }
  if ('playTodo' in d) return reproducir(state.canciones, 0);
  if (d.playCancion) {
    const ids = d.cola.split(',');
    const cola = ids.map((id) => state.canciones.find((c) => c._id === id)).filter(Boolean);
    return reproducir(cola, cola.findIndex((c) => c._id === d.playCancion));
  }
  if (d.go) location.hash = d.go;
});

// Cerrar modales con Escape o clic en el fondo
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#confirm').hidden) $('#confirm').hidden = true;
  else if (!$('#modal').hidden) cerrarModal();
});
['#modal', '#confirm'].forEach((s) => $(s).addEventListener('mousedown', (e) => {
  if (e.target === e.currentTarget) { $(s).hidden = true; if (s === '#modal') formCtx = null; }
}));

$('#btn-add-menu').addEventListener('click', () => abrirFormulario('artista'));

// ============ Inicio ============
render();
renderPlayer();
cargarTodo();
