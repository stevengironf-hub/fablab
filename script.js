const DATA_KEY = "proyecto_id_data";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const AUTH_MODE = window.supabaseClient ? "supabase" : "demo";

let isMemberAuthenticated = false;
let activeTabId = "portada";
let editorBlocks = [];

const DEFAULT_DATA = {
  tabs: [
    { id: "portada", title: "Portada General", isDeletable: false, entries: [] },
    { id: "semana-1", title: "Semana 01", isDeletable: true, entries: [] }
  ]
};

// ==========================================
// NUEVAS FUNCIONES DE PREFERENCIAS (Agregadas)
// ==========================================
function updatePreferences() {
  const fontFamily = document.getElementById('prefFontFamily')?.value || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
  const fontSize = document.getElementById('prefFontSize')?.value || '16';
  const textColor = document.getElementById('prefTextColor')?.value || '#222222';

  document.documentElement.style.setProperty('--app-font-family', fontFamily);
  document.documentElement.style.setProperty('--app-font-size', fontSize + 'px');
  document.documentElement.style.setProperty('--app-text-color', textColor);

  const display = document.getElementById('prefFontSizeDisplay');
  if (display) display.textContent = fontSize + 'px';

  localStorage.setItem('proyecto_id_prefs', JSON.stringify({ fontFamily, fontSize, textColor }));
}

function loadPreferences() {
  const storedPrefs = localStorage.getItem('proyecto_id_prefs');
  if (storedPrefs) {
    try {
      const prefs = JSON.parse(storedPrefs);
      
      document.documentElement.style.setProperty('--app-font-family', prefs.fontFamily);
      document.documentElement.style.setProperty('--app-font-size', prefs.fontSize + 'px');
      document.documentElement.style.setProperty('--app-text-color', prefs.textColor);
      
      if(document.getElementById('prefFontFamily')) document.getElementById('prefFontFamily').value = prefs.fontFamily;
      if(document.getElementById('prefFontSize')) document.getElementById('prefFontSize').value = prefs.fontSize;
      if(document.getElementById('prefTextColor')) document.getElementById('prefTextColor').value = prefs.textColor;
      if(document.getElementById('prefFontSizeDisplay')) document.getElementById('prefFontSizeDisplay').textContent = prefs.fontSize + 'px';
    } catch (e) {
      console.error("Error cargando preferencias de apariencia", e);
    }
  }
}

function resetPreferences() {
  if(document.getElementById('prefFontFamily')) document.getElementById('prefFontFamily').value = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
  if(document.getElementById('prefFontSize')) document.getElementById('prefFontSize').value = '16';
  if(document.getElementById('prefTextColor')) document.getElementById('prefTextColor').value = '#222222';
  
  updatePreferences();
}
// ==========================================

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function createBlock(type) {
  if (type === "image") return { type: "image", fileName: "", mimeType: "", alt: "Evidencia visual", dataUrl: "" };
  if (type === "video") return { type: "video", fileName: "", mimeType: "", alt: "Video de evidencia", file: null, previewUrl: "" };
  if (type === "comparison") return { type: "comparison", title: "Comparación de alternativas", ideas: [{ title: "Opción A", description: "", pros: "", cons: "" }] };
  return { type: "text", content: "" };
}

function normalizeEntry(entry) {
  if (Array.isArray(entry.blocks)) return { ...entry, blocks: entry.blocks };
  const blocks = [];
  if (entry.htmlContent) blocks.push({ type: "text", content: entry.htmlContent });
  if (Array.isArray(entry.ideas) && entry.ideas.length) {
    blocks.push({ type: "comparison", title: "Comparación de ideas", ideas: entry.ideas.map(idea => ({ title: idea.title || "Opción", description: idea.desc || "", pros: idea.pro || "", cons: idea.con || "" })) });
  }
  if (entry.image) blocks.push({ type: "image", fileName: "evidencia.jpg", mimeType: "image/jpeg", alt: "Evidencia visual", dataUrl: entry.image });
  return { ...entry, blocks };
}

function loadData() {
  if (AUTH_MODE === "supabase") return cloneDefaultData();
  const stored = localStorage.getItem(DATA_KEY);
  if (!stored) return cloneDefaultData();
  try {
    const data = JSON.parse(stored);
    if (!data || !Array.isArray(data.tabs)) return cloneDefaultData();
    data.tabs.forEach(tab => { tab.entries = Array.isArray(tab.entries) ? tab.entries.map(normalizeEntry) : []; });
    return data;
  } catch {
    return cloneDefaultData();
  }
}

function saveData(data) {
  if (AUTH_MODE === "supabase") return true;
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch {
    showToast("No hay espacio suficiente para guardar este registro.", "error");
    return false;
  }
}

let siteData = loadData();

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function sanitizeRichHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "S", "P", "BR", "UL", "OL", "LI", "H3", "H4", "BLOCKQUOTE"]);
  template.content.querySelectorAll("*").forEach(node => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
  });
  return template.innerHTML;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function getCurrentTab() {
  return siteData.tabs.find(tab => tab.id === activeTabId);
}

async function loadEntriesFromSupabase() {
  if (!window.supabaseClient?.from) return;

  const { data, error } = await window.supabaseClient
    .from("entries")
    .select("id, tab_id, title, blocks, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    showToast("No se pudieron cargar los registros de Supabase.", "error");
    console.error("Supabase load error:", error);
    return;
  }

  const remoteEntries = data.map(entry => ({
    id: entry.id,
    tabId: entry.tab_id,
    title: entry.title,
    blocks: Array.isArray(entry.blocks) ? entry.blocks : [],
    createdAt: entry.created_at
  }));

  siteData.tabs.forEach(tab => {
    tab.entries = remoteEntries.filter(entry => entry.tabId === tab.id);
  });

  renderView();
}

async function loadTabsFromSupabase() {
  if (!window.supabaseClient?.from) return;

  const { data, error } = await window.supabaseClient
    .from("tabs")
    .select("id, title, is_deletable, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    showToast("No se pudieron cargar las semanas de Supabase.", "error");
    console.error("Supabase tabs load error:", error);
    return;
  }

  siteData.tabs = data.map(tab => ({
    id: tab.id,
    title: tab.title,
    isDeletable: tab.is_deletable,
    entries: []
  }));

  if (!siteData.tabs.some(tab => tab.id === activeTabId)) activeTabId = siteData.tabs[0]?.id || "portada";
  renderView();
}

function setAuthenticatedState(session) {
  isMemberAuthenticated = Boolean(session);
  document.getElementById("authBadge").hidden = !isMemberAuthenticated;
  document.getElementById("authBtn").textContent = isMemberAuthenticated ? "Cerrar sesión" : "Soy del equipo :)";
  renderView();
}

async function restoreSupabaseSession() {
  if (!window.supabaseClient?.auth) return;

  const { data, error } = await window.supabaseClient.auth.getSession();
  if (!error) setAuthenticatedState(data.session);

  window.supabaseClient.auth.onAuthStateChange((_event, session) => {
    setAuthenticatedState(session);
  });
}

function renderTabs() {
  document.getElementById("weekCount").textContent = `${Math.max(0, siteData.tabs.length - 1)} semanas`;
  document.getElementById("tabList").innerHTML = siteData.tabs.map(tab => `
    <li><button class="tab-button ${tab.id === activeTabId ? "active" : ""}" type="button" data-tab-id="${escapeHtml(tab.id)}"><span>${escapeHtml(tab.title)}</span><span class="tab-arrow">↗</span></button></li>
  `).join("");
}

function renderView() {
  renderTabs();
  renderPublicView();
  const editing = isMemberAuthenticated && activeTabId !== "portada";
  document.getElementById("editorPanel").hidden = !editing;
  document.getElementById("tabAdminControls").hidden = !isMemberAuthenticated;
  if (editing) {
    document.getElementById("editorTitle").textContent = `Nuevo registro en ${getCurrentTab().title}`;
    renderEditorBlocks();
  }
}

function renderPublicView() {
  const container = document.getElementById("tabContentContainer");
  if (activeTabId === "portada") {
    container.innerHTML = `<section class="hero-panel animate-in"><span class="eyebrow">Investigación y desarrollo / 2026</span><h2>Del problema al prototipo.</h2><p>Una bitácora abierta sobre decisiones, pruebas y aprendizajes detrás de un producto nuevo.</p><div class="hero-stats"><span><strong>${siteData.tabs.length - 1}</strong> semanas documentadas</span><span><strong>${siteData.tabs.reduce((total, tab) => total + tab.entries.length, 0)}</strong> registros publicados</span></div></section><section class="intro-grid animate-in"><div class="section-heading"><span class="eyebrow">Equipo de trabajo</span><h3>Cuatro miradas, un laboratorio.</h3></div><div class="team-list"><div class="team-member"><span>01</span><strong>Javier Abad</strong><small>Investigación / Desarrollo</small></div><div class="team-member"><span>02</span><strong>Steven Giron</strong><small>Investigación / Desarrollo</small></div><div class="team-member"><span>03</span><strong>Francisco Siguenza</strong><small>Investigación / Desarrollo</small></div><div class="team-member"><span>04</span><strong>Juan Pablo Quinteros</strong><small>Investigación / Desarrollo</small></div></div></section>`;
    return;
  }
  const tab = getCurrentTab();
  if (!tab) return;
  const entries = tab.entries.map(renderEntry).join("");
  container.innerHTML = `<div class="page-heading animate-in"><span class="eyebrow">Registro semanal</span><h2>${escapeHtml(tab.title)}</h2><span class="heading-line"></span></div>${entries || `<div class="public-empty animate-in"><span class="empty-icon">○</span><h3>Aún no hay registros publicados</h3><p>El primer avance de esta semana aparecerá aquí.</p></div>`}`;
}

function renderEntry(entry) {
  return `<article class="entry-card animate-in"><div class="entry-meta"><span>Registro de avance</span><time>${new Date(entry.createdAt || Date.now()).toLocaleDateString("es-EC")}</time></div><h3>${escapeHtml(entry.title)}</h3>${(entry.blocks || []).map(renderBlock).join("")} ${isMemberAuthenticated ? `<button class="entry-delete" type="button" data-delete-entry="${escapeHtml(entry.id)}">Eliminar registro</button>` : ""}</article>`;
}

function renderBlock(block) {
  if (block.type === "image") {
    const imageSource = block.url || block.dataUrl;
    return imageSource ? `<figure class="content-image"><img src="${escapeHtml(imageSource)}" alt="${escapeHtml(block.alt || "Evidencia visual")}"><figcaption>${escapeHtml(block.fileName || "Evidencia visual")}</figcaption></figure>` : "";
  }
  if (block.type === "video") {
    const videoSource = block.url || block.previewUrl;
    return videoSource ? `<figure class="content-video"><video controls preload="metadata" src="${escapeHtml(videoSource)}"></video><figcaption>${escapeHtml(block.fileName || "Video de evidencia")}</figcaption></figure>` : "";
  }
  if (block.type === "comparison") return `<section class="content-comparison"><div class="comparison-heading"><span class="block-kicker">Matriz de decisión</span><h4>${escapeHtml(block.title)}</h4></div><div class="comparison-grid">${(block.ideas || []).map(idea => `<div class="comparison-card"><h5>${escapeHtml(idea.title)}</h5><p>${escapeHtml(idea.description)}</p><div class="comparison-pro"><b>A favor</b>${escapeHtml(idea.pros)}</div><div class="comparison-con"><b>Riesgos</b>${escapeHtml(idea.cons)}</div></div>`).join("")}</div></section>`;
  return `<div class="content-text">${sanitizeRichHtml(block.content || "")}</div>`;
}

function renderEditorBlocks() {
  document.getElementById("editorEmptyState").hidden = editorBlocks.length > 0;
  document.getElementById("editorBlocks").innerHTML = editorBlocks.map(renderEditorBlock).join("");
}

function renderEditorBlock(block, index) {
  const label = block.type === "text" ? "Párrafo" : block.type === "image" ? "Imagen" : block.type === "video" ? "Video" : "Cuadro comparativo";
  const header = `<div class="block-header"><span><i class="block-number">${String(index + 1).padStart(2, "0")}</i>${label}</span><button class="block-remove" type="button" data-remove-block="${index}" aria-label="Eliminar bloque">×</button></div>`;
  if (block.type === "image") return `<article class="editor-block block-image animate-in" data-block-index="${index}">${header}<label class="image-dropzone" data-drop-index="${index}">${block.url || block.dataUrl ? `<img src="${block.url || block.dataUrl}" alt="Vista previa">` : `<span class="upload-icon">↥</span><strong>Arrastra una imagen aquí</strong><small>o haz clic para buscar un archivo · máximo 8 MB</small>`}<input type="file" accept="image/*" data-image-input="${index}"></label><div class="image-fields"><input class="form-control" type="text" value="${escapeHtml(block.alt)}" placeholder="Texto alternativo" data-block-field="alt" data-block-index="${index}"><span class="file-name">${escapeHtml(block.fileName || "Sin archivo seleccionado")}</span></div></article>`;
  if (block.type === "video") return `<article class="editor-block block-video animate-in" data-block-index="${index}">${header}<label class="image-dropzone" data-drop-index="${index}">${block.url || block.previewUrl ? `<video controls muted src="${block.url || block.previewUrl}"></video>` : `<span class="upload-icon">↥</span><strong>Arrastra un video aquí</strong><small>o haz clic para buscar un archivo · máximo 50 MB</small>`}<input type="file" accept="video/*" data-video-input="${index}"></label><div class="image-fields"><input class="form-control" type="text" value="${escapeHtml(block.alt)}" placeholder="Descripción del video" data-block-field="alt" data-block-index="${index}"><span class="file-name">${escapeHtml(block.fileName || "Sin archivo seleccionado")}</span></div></article>`;
  if (block.type === "comparison") return `<article class="editor-block block-comparison animate-in" data-block-index="${index}">${header}<input class="form-control block-title" type="text" value="${escapeHtml(block.title)}" placeholder="Título del cuadro" data-block-field="title" data-block-index="${index}"><div class="idea-editor-list">${block.ideas.map((idea, ideaIndex) => `<div class="idea-editor-row"><input class="form-control" type="text" value="${escapeHtml(idea.title)}" placeholder="Nombre de opción" data-idea-field="title" data-block-index="${index}" data-idea-index="${ideaIndex}"><textarea class="form-control" placeholder="Descripción" data-idea-field="description" data-block-index="${index}" data-idea-index="${ideaIndex}">${escapeHtml(idea.description)}</textarea><input class="form-control" type="text" value="${escapeHtml(idea.pros)}" placeholder="A favor" data-idea-field="pros" data-block-index="${index}" data-idea-index="${ideaIndex}"><input class="form-control" type="text" value="${escapeHtml(idea.cons)}" placeholder="Riesgos / en contra" data-idea-field="cons" data-block-index="${index}" data-idea-index="${ideaIndex}"><button class="idea-remove" type="button" data-remove-idea="${index}" data-idea-index="${ideaIndex}">Eliminar opción</button></div>`).join("")}</div><button class="button button-secondary" type="button" data-add-idea="${index}">+ Añadir opción</button></article>`;
  return `<article class="editor-block block-text animate-in" data-block-index="${index}">${header}<textarea class="block-textarea" placeholder="Describe qué ocurrió, qué observaste y qué aprendiste..." data-block-field="content" data-block-index="${index}">${escapeHtml(block.content)}</textarea></article>`;
}

function addBlock(type) { editorBlocks.push(createBlock(type)); renderEditorBlocks(); document.querySelector(`[data-block-index="${editorBlocks.length - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
function removeBlock(index) { editorBlocks.splice(index, 1); renderEditorBlocks(); }
function addIdea(index) { editorBlocks[index].ideas.push({ title: `Opción ${String.fromCharCode(65 + editorBlocks[index].ideas.length)}`, description: "", pros: "", cons: "" }); renderEditorBlocks(); }
function removeIdea(index, ideaIndex) { editorBlocks[index].ideas.splice(ideaIndex, 1); renderEditorBlocks(); }

function handleEditorInput(event) {
  const blockIndex = Number(event.target.dataset.blockIndex);
  if (event.target.dataset.blockField && editorBlocks[blockIndex]) editorBlocks[blockIndex][event.target.dataset.blockField] = event.target.value;
  if (event.target.dataset.ideaField && editorBlocks[blockIndex]?.ideas) editorBlocks[blockIndex].ideas[Number(event.target.dataset.ideaIndex)][event.target.dataset.ideaField] = event.target.value;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error("La imagen supera el límite de 8 MB."));
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => { const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(objectUrl); resolve(canvas.toDataURL("image/jpeg", 0.78)); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("El archivo de imagen no es válido.")); };
    image.src = objectUrl;
  });
}

async function attachImageFile(index, file) {
  if (!file || !file.type.startsWith("image/")) return showToast("Selecciona un archivo de imagen válido.", "error");
  try { editorBlocks[index].dataUrl = await compressImage(file); editorBlocks[index].fileName = file.name; editorBlocks[index].mimeType = file.type; renderEditorBlocks(); showToast("Imagen preparada para el registro."); } catch (error) { showToast(error.message, "error"); }
}

function attachVideoFile(index, file) {
  if (!file || !file.type.startsWith("video/")) return showToast("Selecciona un archivo de video válido.", "error");
  if (file.size > MAX_VIDEO_BYTES) return showToast("El video supera el límite de 50 MB.", "error");
  const block = editorBlocks[index];
  if (block.previewUrl) URL.revokeObjectURL(block.previewUrl);
  block.file = file;
  block.fileName = file.name;
  block.mimeType = file.type;
  block.previewUrl = URL.createObjectURL(file);
  renderEditorBlocks();
  showToast("Video preparado para el registro.");
}

function serializeBlocksForSupabase(blocks) {
  return blocks.map(block => {
    if (block.type === "image" || block.type === "video") {
      return { type: block.type, fileName: block.fileName, mimeType: block.mimeType, alt: block.alt, storagePath: block.storagePath || null, url: block.url || null };
    }
    return { ...block };
  });
}

async function uploadMediaBlocks(blocks, entryId) {
  if (!window.supabaseClient?.storage) return blocks;
  const { data: sessionData } = await window.supabaseClient.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("La sesión de Supabase no está disponible para subir imágenes.");

  return Promise.all(blocks.map(async block => {
    if (!((block.type === "image" && block.dataUrl) || (block.type === "video" && block.file)) || block.url) return block;
    const fileName = (block.fileName || "evidencia.jpg").replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `${userId}/${entryId}/${Date.now()}-${fileName}`;
    const mediaBlob = block.type === "image" ? await fetch(block.dataUrl).then(response => response.blob()) : block.file;
    const { error } = await window.supabaseClient.storage.from("project-media").upload(storagePath, mediaBlob, { contentType: block.mimeType || "application/octet-stream", upsert: false });
    if (error) throw error;
    const { data } = window.supabaseClient.storage.from("project-media").getPublicUrl(storagePath);
    return { ...block, url: data.publicUrl, storagePath, dataUrl: block.type === "image" ? data.publicUrl : "", previewUrl: data.publicUrl, file: null };
  }));
}

async function saveEntryToSupabase(payload) {
  if (window.supabaseClient?.from) return window.supabaseClient.from("entries").insert(payload).select().single();
  console.info("[Supabase simulator] Payload listo para insertar:", payload);
  return { data: payload, error: null };
}

async function signIn(email, password) {
  if (AUTH_MODE === "supabase" && window.supabaseClient?.auth) return window.supabaseClient.auth.signInWithPassword({ email, password });
  if (!email || password.length < 8) return { error: { message: "Introduce un correo válido y una contraseña de 8 caracteres." } };
  return { data: { user: { email }, session: { demo: true } }, error: null };
}

async function submitAuth(event) {
  event.preventDefault();
  const result = await signIn(document.getElementById("authEmail").value.trim(), document.getElementById("authPassword").value);
  if (result.error) { const error = document.getElementById("authError"); error.textContent = result.error.message; error.hidden = false; return; }
  document.getElementById("authDialog").close();
  setAuthenticatedState(result.data.session);
}

async function toggleAuth() {
  if (isMemberAuthenticated) {
    if (AUTH_MODE === "supabase" && window.supabaseClient?.auth) {
      const { error } = await window.supabaseClient.auth.signOut();
      if (error) return showToast("No se pudo cerrar la sesión.", "error");
    } else {
      setAuthenticatedState(null);
    }
    editorBlocks = [];
    return;
  }
  document.getElementById("authError").hidden = true;
  document.getElementById("authDialog").showModal();
}

async function saveNewEntry() {
  const title = document.getElementById("entryTitle").value.trim() || "Registro de actividad";
  const validBlocks = editorBlocks.filter(block => block.type === "text" ? block.content.trim() : block.type === "image" ? block.dataUrl : block.type === "video" ? block.file : block.ideas.length);
  if (!validBlocks.length) return showToast("Añade al menos un bloque antes de guardar.", "error");
  const tab = getCurrentTab();
  const entry = { id: `entry-${Date.now()}`, title, blocks: validBlocks, createdAt: new Date().toISOString() };
  let preparedBlocks;
  try {
    preparedBlocks = await uploadMediaBlocks(validBlocks, entry.id);
  } catch (error) {
    showToast(`No se pudo subir la imagen: ${error.message}`, "error");
    return;
  }
  entry.blocks = preparedBlocks;
  const result = await saveEntryToSupabase({ tab_id: tab.id, title: entry.title, blocks: serializeBlocksForSupabase(entry.blocks), created_at: entry.createdAt });
  if (result.error) return showToast("No se pudo preparar el registro para Supabase.", "error");
  tab.entries.push(entry);
  if (!saveData(siteData)) return;
  editorBlocks = [];
  document.getElementById("entryTitle").value = "";
  renderView();
  showToast("Avance guardado y preparado para Supabase.");
}

async function deleteEntry(entryId) {
  const tab = getCurrentTab();
  const entry = tab?.entries.find(item => item.id === entryId);
  if (!entry || !window.confirm("¿Eliminar este registro y sus archivos multimedia?")) return;

  if (AUTH_MODE === "supabase") {
    const { error } = await window.supabaseClient.from("entries").delete().eq("id", entryId);
    if (error) return showToast("No se pudo eliminar el registro.", "error");

    const storagePaths = (entry.blocks || []).map(block => block.storagePath).filter(Boolean);
    if (storagePaths.length) {
      const { error: storageError } = await window.supabaseClient.storage.from("project-media").remove(storagePaths);
      if (storageError) showToast("Registro eliminado; no se pudieron limpiar todos sus archivos.", "error");
    }
  }

  tab.entries = tab.entries.filter(item => item.id !== entryId);
  saveData(siteData);
  renderView();
  showToast("Registro eliminado.");
}

async function createNewTab() {
  const number = siteData.tabs.reduce((highest, tab) => {
    const match = tab.title.match(/(\d+)/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0) + 1;
  const newTab = { id: `semana-${Date.now()}`, title: `Semana ${String(number).padStart(2, "0")}`, isDeletable: true, entries: [] };

  if (AUTH_MODE === "supabase") {
    const { error } = await window.supabaseClient.from("tabs").insert({ id: newTab.id, title: newTab.title, is_deletable: true, sort_order: number });
    if (error) return showToast("No se pudo crear la semana en Supabase.", "error");
  }

  siteData.tabs.push(newTab);
  activeTabId = newTab.id;
  saveData(siteData);
  renderView();
}

async function deleteCurrentTab() {
  const tab = getCurrentTab();
  if (!tab?.isDeletable) return showToast("La portada no se puede eliminar.", "error");
  if (!window.confirm(`¿Eliminar ${tab.title} y sus registros?`)) return;

  if (AUTH_MODE === "supabase") {
    const { data: remoteEntries } = await window.supabaseClient.from("entries").select("blocks").eq("tab_id", activeTabId);
    const storagePaths = (remoteEntries || []).flatMap(entry => Array.isArray(entry.blocks) ? entry.blocks.map(block => block.storagePath).filter(Boolean) : []);
    const { error: entriesError } = await window.supabaseClient.from("entries").delete().eq("tab_id", activeTabId);
    if (entriesError) return showToast("No se pudieron eliminar los registros de la semana.", "error");
    if (storagePaths.length) await window.supabaseClient.storage.from("project-media").remove(storagePaths);
    const { error: tabError } = await window.supabaseClient.from("tabs").delete().eq("id", activeTabId);
    if (tabError) return showToast("No se pudo eliminar la semana en Supabase.", "error");
  }

  siteData.tabs = siteData.tabs.filter(item => item.id !== activeTabId);
  activeTabId = "portada";
  saveData(siteData);
  renderView();
}

document.addEventListener("DOMContentLoaded", () => {
  // === INICIA PREFERENCIAS VISUALES AL CARGAR ===
  loadPreferences();
  
  document.getElementById("authModeHint").textContent = AUTH_MODE === "supabase" ? "Autenticación gestionada por Supabase." : "Modo demostración: cualquier correo válido y una contraseña de 8 caracteres.";
  document.getElementById("authBtn").addEventListener("click", toggleAuth);
  document.getElementById("authForm").addEventListener("submit", submitAuth);
  document.getElementById("closeAuthBtn").addEventListener("click", () => document.getElementById("authDialog").close());
  document.getElementById("newTabBtn").addEventListener("click", createNewTab);
  document.getElementById("deleteTabBtn").addEventListener("click", deleteCurrentTab);
  document.getElementById("saveEntryBtn").addEventListener("click", saveNewEntry);
  document.getElementById("clearBlocksBtn").addEventListener("click", () => { editorBlocks = []; document.getElementById("entryTitle").value = ""; renderEditorBlocks(); });
  document.getElementById("tabList").addEventListener("click", event => { const button = event.target.closest("[data-tab-id]"); if (!button) return; activeTabId = button.dataset.tabId; editorBlocks = []; renderView(); });
  document.getElementById("tabContentContainer").addEventListener("click", event => { const button = event.target.closest("[data-delete-entry]"); if (button) deleteEntry(button.dataset.deleteEntry); });
  document.querySelector(".brand").addEventListener("click", event => { event.preventDefault(); activeTabId = "portada"; renderView(); });
  document.querySelector(".block-toolbar").addEventListener("click", event => { if (event.target.dataset.addBlock) addBlock(event.target.dataset.addBlock); });
  document.getElementById("editorBlocks").addEventListener("input", handleEditorInput);
  document.getElementById("editorBlocks").addEventListener("click", event => { if (event.target.dataset.removeBlock) removeBlock(Number(event.target.dataset.removeBlock)); if (event.target.dataset.addIdea) addIdea(Number(event.target.dataset.addIdea)); if (event.target.dataset.removeIdea) removeIdea(Number(event.target.dataset.removeIdea), Number(event.target.dataset.ideaIndex)); });
  document.getElementById("editorBlocks").addEventListener("change", event => { if (event.target.dataset.imageInput) attachImageFile(Number(event.target.dataset.imageInput), event.target.files[0]); if (event.target.dataset.videoInput) attachVideoFile(Number(event.target.dataset.videoInput), event.target.files[0]); });
  document.getElementById("editorBlocks").addEventListener("dragover", event => { if (event.target.closest("[data-drop-index]")) event.preventDefault(); });
  document.getElementById("editorBlocks").addEventListener("drop", event => { const zone = event.target.closest("[data-drop-index]"); if (!zone) return; event.preventDefault(); const index = Number(zone.dataset.dropIndex); const file = event.dataTransfer.files[0]; if (editorBlocks[index].type === "video") attachVideoFile(index, file); else attachImageFile(index, file); });
  
  renderView();
  restoreSupabaseSession();
  loadTabsFromSupabase().then(loadEntriesFromSupabase);
});
