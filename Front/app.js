// ============================
// app.js — Pequenos Passos
// ============================

// ===== CONFIG / STORAGE KEYS =====
const WHATSAPP_NUMBER = (window.__CONFIG__?.WHATSAPP || '5538992076130');

const CART_KEY          = window.__CONFIG__?.KEYS?.CART          || 'pp_cart';
const STORAGE_KEY       = window.__CONFIG__?.KEYS?.PRODUCTS      || 'pp_products_v4';
const ORDER_KEY         = window.__CONFIG__?.KEYS?.ORDERS        || 'pp_orders_v1';
const CHECKOUT_INFO_KEY = window.__CONFIG__?.KEYS?.CHECKOUT_INFO || 'pp_checkout_info_v1';

const REMOTE_CATALOG_URL  = window.__CONFIG__?.REMOTE_CATALOG_URL || null;
const LOW_STOCK_THRESHOLD = window.__CONFIG__?.STOCK?.LOW_THRESHOLD ?? 5;

// === API (lê do config.js) ===
const API_URL = window.__CONFIG__?.API_URL || 'http://localhost:8000';

// === PLACEHOLDER IMG ===
const NOIMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 200'>
      <defs><linearGradient id='g' x1='0' x2='1'>
        <stop offset='0' stop-color='#ddd'/><stop offset='1' stop-color='#bbb'/>
      </linearGradient></defs>
      <rect width='300' height='200' fill='url(#g)'/>
      <g fill='#888' font-family='Arial' font-size='16'>
        <text x='150' y='100' text-anchor='middle'>Imagem indisponível</text>
      </g>
    </svg>`
  );

// === AUTH/TOKEN (backend) ===
const TOKEN_KEY = 'pp_token';
const getToken   = () => localStorage.getItem(TOKEN_KEY);
const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// === Supabase (carregamento dinâmico) ===
let supabase = null;
async function ensureSupabaseClient() {
  if (supabase) return supabase;
  const url = window.__CONFIG__?.SUPABASE_URL;
  const key = window.__CONFIG__?.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    }).catch(() => null);
  }
  if (!window.supabase) return null;

  supabase = window.supabase.createClient(url, key);
  return supabase;
}
const SUPABASE_BUCKET = window.__CONFIG__?.SUPABASE_BUCKET || 'media';

// === Wrapper ÚNICO: sempre chama a API_URL e retorna JSON (ou null) ===
async function apiFetch(path, options = {}) {
  if (!API_URL) throw new Error('API_URL não configurado');
  const headers = options.headers ? { ...options.headers } : {};
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
  const txt = await res.text().catch(() => '');
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt || null; }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.detail)) ||
      (typeof data === 'string' ? data : '') ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ===== ESTADO =====
let products = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let filteredProducts = [...products];
let isLoggedIn = false, currentUser = '', loginTime = '';
let cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
let tempImages = [], tempVideo = null, editingId = null, lightboxImages = [], lightboxIndex = 0;

// Manter os arquivos reais selecionados
let tempImageFiles = [];   // File[]
let tempVideoFile  = null; // File | null

// ===== HELPERS =====
const brl  = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const byId = id => document.getElementById(id);
const saveState  = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
const saveCart   = () => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartCount(); };

function handleImgError(ev){ const el=ev.target; if(el && el.src!==NOIMG){ el.src=NOIMG; } }
function showNotification(message,type='success'){
  const n=byId('notification'); if(!n) return alert(message);
  n.textContent=message; n.className='notification';
  if(type==='error') n.classList.add('error');
  if(type==='info'){ n.style.background='linear-gradient(45deg,#3b82f6,#06b6d4)'; } else { n.style.background=''; }
  n.classList.add('show'); setTimeout(()=>n.classList.remove('show'), type==='info'?5000:3000);
}
function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, m =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])
  );
}

const phoneRe = /^\+?\d{10,14}$/;
const onlyDigits = s => (s||'').replace(/\D+/g,'');

function formatBRPhone(v){
  let d = onlyDigits(v||'');
  if (d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return v||'';
}

// ===== MÁSCARA DE TELEFONE (BR) + UI DO BOTÃO =====
function formatPhoneBRDisplay(v) {
  let d = (v || '').replace(/\D+/g, '');
  if (d.startsWith('55')) d = d.slice(2);
  if (d.length > 11) d = d.slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function attachPhoneMask() {
  const inp = byId('ck-phone');
  if (!inp) return;
  inp.setAttribute('inputmode','numeric');
  inp.setAttribute('autocomplete','tel');
  inp.setAttribute('placeholder','(38) 9 9999-9999');
  inp.maxLength = 20;
  inp.value = formatPhoneBRDisplay(inp.value);
  inp.addEventListener('input', () => {
    inp.value = formatPhoneBRDisplay(inp.value);
    const L = inp.value.length;
    try { inp.setSelectionRange(L, L); } catch {}
    const ok = (inp.value.match(/\d/g) || []).length >= 10;
    inp.classList.toggle('is-valid', ok);
  });
  inp.addEventListener('blur', () => { inp.value = formatPhoneBRDisplay(inp.value); });
}
function tweakCheckoutUI(){
  const sendBtn = byId('btn-send-whatsapp');
  if (sendBtn){
    sendBtn.innerHTML = `<i class="fas fa-check-circle"></i> Finalizar Pedido`;
    sendBtn.title = 'Finalizar e abrir o WhatsApp';
  }
}

// ===== CLOUD/SUPABASE HELPERS =====
function slugify(str){
  return (str||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'');
}
function thumb(url){
  if (!url) return url;
  // Mantém thumbnails Cloudinary/Supabase (se não reconhecer, devolve igual)
  return url.includes('/upload/')
    ? url.replace('/upload/', '/upload/f_auto,q_auto,c_fill,w_600,h_600/')
    : url;
}
function large(url){
  if (!url) return url;
  return url.includes('/upload/')
    ? url.replace('/upload/', '/upload/f_auto,q_auto,c_fill,w_1200,h_1200/')
    : url;
}

// ===== UPLOAD VIA BACKEND (com fallback Supabase Storage) =====
async function supabaseUploadFile(file, folder){
  const sb = await ensureSupabaseClient();
  if (!sb) throw new Error('Supabase não configurado');
  const fname = `${folder}/${Date.now()}_${slugify(file.name || 'file')}`;
  const { data, error } = await sb.storage.from(SUPABASE_BUCKET).upload(fname, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw error;
  const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(data.path);
  return { url: pub.publicUrl, public_id: data.path };
}
async function uploadImagesViaBackend(files){
  const results = [];
  try {
    for (const f of files){
      const form = new FormData();
      form.append('file', f);
      const res = await fetch(`${API_URL}/upload/image`, { method:'POST', body: form });
      const j = await res.json();
      if(!res.ok) throw new Error(j?.error || 'Falha no upload de imagem.');
      results.push({ url: j.url, public_id: j.public_id });
    }
    return results;
  } catch (e) {
    // Fallback Supabase Storage (público)
    const ups = [];
    for (const f of files){
      const up = await supabaseUploadFile(f, 'images');
      ups.push(up);
    }
    return ups;
  }
}
async function uploadVideoViaBackend(file){
  try{
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/upload/video`, { method:'POST', body: form });
    const j = await res.json();
    if(!res.ok) throw new Error(j?.error || 'Falha no upload de vídeo.');
    return { url: j.url, public_id: j.public_id };
  }catch(e){
    // Fallback Supabase
    return supabaseUploadFile(file, 'videos');
  }
}

// ===== BACKEND (API) =====
function mapBackendProductToFrontend(p) {
  let sizes = [];
  if (Array.isArray(p.sizes)) {
    if (p.sizes.length && typeof p.sizes[0] === 'string') {
      sizes = p.sizes.map(s => ({ size: String(s), quantity: 0 }));
    } else {
      sizes = p.sizes.map(s => ({ size: String(s.size), quantity: Number(s.quantity||0) }));
    }
  } else if (Array.isArray(p.sizes_json)) {
    sizes = p.sizes_json.map(s => ({ size: String(s.size), quantity: Number(s.quantity||0) }));
  }

  const price =
    (p.price_cents != null) ? (p.price_cents/100) :
    (p.price != null) ? Number(p.price) : 0;

  return {
    id: p.id,
    name: p.name,
    description: p.description || "",
    category: p.category || "Geral",
    emoji: p.emoji || "👟",
    price,
    sizes,
    images: p.image_url ? [p.image_url] : (Array.isArray(p.images) ? p.images : []),
    image_public_id: p.image_public_id || null,
    video: p.video_url || p.video_playback_url || null,
    video_playback_url: p.video_playback_url || null,
    video_public_id: p.video_public_id || null,
  };
}
function mapFrontendProductToBackend(p, override = {}) {
  return {
    name: p.name,
    description: p.description || p.name,
    price: Number(p.price || 0),
    category: p.category,
    emoji: p.emoji,
    sizes: override.sizes || p.sizes || [],
    image_url: (p.images && p.images[0]) || null,
    image_public_id: p.image_public_id || null,
    video_url: p.video || null,
    video_public_id: p.video_public_id || null
  };
}
async function fetchProductsFromAPI() {
  try {
    const data = await apiFetch('/products');
    products = Array.isArray(data) ? data.map(mapBackendProductToFrontend) : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    filteredProducts = [...products];
    return products.length > 0;
  } catch (e) {
    console.warn('fetchProductsFromAPI fallback:', e.message);
    return false;
  }
}

// (opcional) tenta hidratar sessão se já existir token OU Supabase session
async function tryHydrateSession(){
  const token = getToken();
  if(token){
    try{
      const me = await apiFetch('/auth/me', { method:'GET' });
      isLoggedIn = true;
      currentUser = me?.user?.email || me?.user?.role || 'admin';
      loginTime = new Date().toLocaleString('pt-BR');
      const lu=byId('logged-user'), lt=byId('login-time');
      if(lu) lu.textContent=currentUser;
      if(lt) lt.textContent=loginTime;
      return true;
    }catch{
      clearToken();
    }
  }
  // Supabase session (se configurado)
  const sb = await ensureSupabaseClient();
  if (sb) {
    try{
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        isLoggedIn = true;
        currentUser = data.session.user.email || 'admin';
        loginTime = new Date().toLocaleString('pt-BR');
        byId('logged-user') && (byId('logged-user').textContent = currentUser);
        byId('login-time')  && (byId('login-time').textContent  = loginTime);
        return true;
      }
    }catch{}
  }
  return false;
}

// ===== REMOTE CATALOG (fallback opcional) =====
async function tryLoadRemoteCatalog(){
  if(!REMOTE_CATALOG_URL) return false; // desligado
  try{
    const r = await fetch(`${REMOTE_CATALOG_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if(!r.ok) return false;
    const data = await r.json();

    // aceita tanto { products: [...] } quanto [...] direto
    const arr = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
    if(Array.isArray(arr) && arr.length){
      products = arr;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
      filteredProducts = [...products];
      return true;
    }
    return false;
  }catch{
    return false;
  }
}

function exportCatalog(){
  const payload = { products };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'products.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showNotification('📦 Catálogo exportado (products.json).');
}
async function reloadCatalog(){
  if(!REMOTE_CATALOG_URL){
    showNotification('ℹ️ Catálogo estático desativado.', 'info');
    return;
  }
  const ok = await tryLoadRemoteCatalog();
  if(ok){
    renderProducts(); updateSizeFilter(); renderAdminProductList();
    showNotification('🔄 Catálogo recarregado do arquivo remoto.');
  }else{
    showNotification('⚠️ Falha ao recarregar catálogo remoto.', 'error');
  }
}
function hideStaticCatalogButtons(){
  if(window.__CONFIG__?.REMOTE_CATALOG_URL) return; // há catálogo remoto, mantém
  // Esconde o botão "Recarregar products.json" no Admin
  const btn = document.querySelector('.admin-tools .btn[onclick="reloadCatalog()"]');
  if(btn) btn.style.display = 'none';
}

// ===== NAVEGAÇÃO =====
function hideAllSections(){
  ['home-section','products-section','login-section','admin-section','filters-section','cart-section','contact-section']
    .forEach(id=>{const el=byId(id); if(el) el.style.display='none';});
}
function showHome(){ hideAllSections(); byId('home-section')?.style.display='block'; byId('products-section')?.style.display='block'; byId('filters-section')?.style.display='flex'; window.scrollTo({top:0,behavior:'smooth'}); }
function showProducts(){ hideAllSections(); byId('products-section')?.style.display='block'; byId('filters-section')?.style.display='flex'; byId('products-section')?.scrollIntoView({behavior:'smooth'}); }
function showContact(){ hideAllSections(); byId('contact-section')?.style.display='block'; byId('contact-section')?.scrollIntoView({behavior:'smooth'}); }
function showAdmin(){
  hideAllSections();
  if(isLoggedIn){
    byId('admin-section') && (byId('admin-section').style.display='block');
    renderAdminDashboard();
    showAdminTab('products');
  } else {
    byId('login-section') && (byId('login-section').style.display='block');
  }
  setTimeout(()=>{ (isLoggedIn?byId('admin-section'):byId('login-section'))?.scrollIntoView({behavior:'smooth'}); }, 50);
}
function showCart(){ hideAllSections(); byId('cart-section') && (byId('cart-section').style.display='block'); renderCart(); setTimeout(()=>{ byId('cart-section')?.scrollIntoView({behavior:'smooth'}); }, 50); }

// ===== LOGIN =====
async function handleLogin(e){
  e.preventDefault();
  const email=byId('username')?.value.trim();
  const password=byId('password')?.value.trim();
  const err=byId('login-error'); if(err) err.style.display='none';

  // 1) Backend (Render)
  try{
    if(!API_URL) throw new Error('Sem API_URL');
    const data = await apiFetch('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) });
    if(!data?.token) throw new Error('Login sem token');
    setToken(data.token);
    isLoggedIn = true;
    currentUser = (data.user?.email || email || 'admin');
    loginTime = new Date().toLocaleString('pt-BR');
    byId('logged-user') && (byId('logged-user').textContent=currentUser);
    byId('login-time')  && (byId('login-time').textContent  =loginTime);
    byId('login-form')?.reset();
    showAdmin();
    showNotification('🎉 Login (backend) realizado com sucesso!');
    return;
  }catch(_e){ /* tenta supabase abaixo */ }

  // 2) Supabase Auth (fallback moderno)
  try{
    const sb = await ensureSupabaseClient();
    if (sb) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data?.user) {
        isLoggedIn = true;
        currentUser = data.user.email || email || 'admin';
        loginTime = new Date().toLocaleString('pt-BR');
        byId('logged-user') && (byId('logged-user').textContent=currentUser);
        byId('login-time')  && (byId('login-time').textContent  =loginTime);
        byId('login-form')?.reset();
        showAdmin();
        showNotification('🎉 Login via Supabase realizado!');
        return;
      }
    }
  }catch{ /* ignora */ }

  // 3) Fallback local (último recurso)
  try{
    if(email==='admin' && password==='pequenospassos123'){
      isLoggedIn=true; currentUser=email; loginTime=new Date().toLocaleString('pt-BR');
      byId('logged-user') && (byId('logged-user').textContent=currentUser);
      byId('login-time')  && (byId('login-time').textContent  =loginTime);
      byId('login-form')?.reset(); showAdmin(); showNotification('🎉 Login local (fallback) realizado!');
      return;
    }
  }catch{}

  if(err){ err.innerHTML='<i class="fas fa-exclamation-triangle"></i> Login inválido.'; err.style.display='block'; }
  byId('password') && (byId('password').value='');
  showNotification('❌ Credenciais inválidas!','error');
}
async function logout(){
  isLoggedIn=false; currentUser=''; loginTime='';
  clearToken();
  try { const sb = await ensureSupabaseClient(); if (sb) await sb.auth.signOut(); } catch {}
  byId('login-form')?.reset(); resetForm(); resetUploads();
  showNotification('👋 Logout realizado!'); showHome();
}

// ===== FILTROS, BUSCA E ORDENAÇÃO =====
function updateSizeFilter(){
  const sel=byId('size-filter'); if(!sel) return;
  const sizes=new Set();
  products.forEach(p=>p.sizes.forEach(s=>sizes.add(String(s.size))));
  const sorted=[...sizes].sort((a,b)=>parseInt(a)-parseInt(b));
  sel.innerHTML='<option value="">Todos os tamanhos</option>'+sorted.map(s=>`<option value="${s}">${s}</option>`).join('');
}
function filterProducts(){
  const category = byId('category-filter')?.value;
  const size = byId('size-filter')?.value;
  const priceRange = byId('price-filter')?.value;
  const searchTerm = (byId('search-input')?.value || '').toLowerCase();
  const sortOrder = byId('sort-filter')?.value;

  let tempProducts = products.filter(p => {
    const categoryMatch = !category || p.category === category;
    const sizeMatch = !size || p.sizes.some(o => String(o.size) === size && o.quantity > 0);
    const searchMatch = !searchTerm || p.name.toLowerCase().includes(searchTerm) || (p.description && p.description.toLowerCase().includes(searchTerm));
    let priceMatch = true;
    if(priceRange){
      const [min, maxStr] = priceRange.split('-');
      const minNum = parseFloat(min);
      if(priceRange.includes('+')) priceMatch = p.price >= minNum;
      else priceMatch = p.price >= minNum && p.price <= parseFloat(maxStr);
    }
    return categoryMatch && sizeMatch && priceMatch && searchMatch;
  });

  if (sortOrder === 'price-asc') tempProducts.sort((a, b) => a.price - b.price);
  else if (sortOrder === 'price-desc') tempProducts.sort((a, b) => b.price - a.price);

  filteredProducts = tempProducts;
  renderProducts();
}

// ===== RENDERIZAÇÃO DE PRODUTOS =====
function renderProducts() {
  const grid = byId('products-grid'); if(!grid) return;
  grid.innerHTML = '';

  if (filteredProducts.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:#666">
        <i class='fas fa-search' style='font-size:3rem;margin-bottom:12px;opacity:.5'></i>
        <h3>Nenhum produto encontrado</h3>
        <p>Tente alterar os filtros ou o termo da busca.</p>
      </div>`;
    return;
  }

  filteredProducts.forEach(product => {
    const totalStock = product.sizes.reduce((t, s) => t + Number(s.quantity || 0), 0);

    // ===== MÍDIA DO CARD =====
    let productMediaHtml = `<span style="font-size:4rem">${product.emoji || '👟'}</span>`;

    if (product.video) {
      const poster = (product.images && product.images.length) ? thumb(product.images[0]) : '';
      productMediaHtml = `
        <video
          src="${product.video}#t=0.1"
          ${poster ? `poster="${poster}"` : ''}
          autoplay
          muted
          loop
          playsinline
          preload="metadata">
        </video>`;
    } else if (product.images && product.images.length) {
      const src = thumb(product.images[0]);
      productMediaHtml = `
        <img
          loading="lazy"
          src="${src}"
          onerror="handleImgError(event)"
          alt="${escapeHtml(product.name)}">`;
    }

    const card = document.createElement('div');
    card.className = 'product-card';
    const disabledAttr = totalStock === 0 ? 'disabled' : '';

    card.innerHTML = `
      <div class="product-image js-open-modal" data-id="${product.id}" style="cursor:pointer; position: relative;">
        ${productMediaHtml}
        ${product.images && product.images.length > 1
          ? `<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;padding:2px 6px;border-radius:10px;font-size:.75rem">
               <i class='fas fa-images'></i> ${product.images.length}
             </div>` : ''}
        ${product.video
          ? `<div style="position:absolute;bottom:6px;left:6px;background:rgba(255,107,157,.9);color:#fff;padding:2px 6px;border-radius:10px;font-size:.75rem">
               <i class='fas fa-play'></i>
             </div>` : ''}
      </div>

      <h3 class='product-title'>${escapeHtml(product.name)}</h3>
      <p class='product-price'>${brl(product.price)}</p>
      <p class='product-description'>${escapeHtml(product.description || '')}</p>
      <p style='color:#999;font-size:.9rem;margin-bottom:12px;text-align:center'>
        <i class='fas fa-box'></i> ${totalStock} unidades
      </p>
      <button class="buy-btn js-open-modal" data-id="${product.id}" ${disabledAttr}>
        ${ totalStock > 0 ? `<i class="fas fa-shopping-cart"></i> Comprar` : 'Esgotado' }
      </button>
    `;

    if (totalStock === 0) {
      card.style.opacity = '.6';
      const btn = card.querySelector('.buy-btn');
      btn.style.background = '#ccc';
      btn.style.cursor = 'not-allowed';
    }

    grid.appendChild(card);
  });
}

// ===== MODAL e PRODUTOS RELACIONADOS =====
let currentModalProduct = null;
function showProductModal(id){
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;

  currentModalProduct = p;
  byId('modal-title') && (byId('modal-title').textContent = p.name);
  byId('modal-price') && (byId('modal-price').textContent = brl(p.price));
  byId('modal-desc')  && (byId('modal-desc').textContent  = p.description || '');

  const big    = byId('modal-big');
  const thumbs = byId('modal-thumbs');
  big && (big.innerHTML = '');
  thumbs && (thumbs.innerHTML = '');

  const medias = [ ...(p.images || []), ...(p.video ? [p.video] : []) ];
  if (medias.length && big && thumbs) {
    setBigMedia(medias[0], (p.video && medias[0] === p.video));
    medias.forEach((src, idx) => {
      const isVideo = (p.video && src === p.video);
      const el = document.createElement('div');
      el.className = 'media-thumb' + (idx === 0 ? ' active' : '');
      el.innerHTML = isVideo
        ? `<video src='${src}' muted></video>`
        : `<img loading="lazy" src='${thumb(src)}' onerror="handleImgError(event)" alt='thumb'>`;
      el.onclick = () => {
        [...thumbs.children].forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        setBigMedia(src, isVideo);
      };
      thumbs.appendChild(el);
    });
    big.addEventListener('click', () => {
      const currentImg = big.querySelector('img');
      if (!currentImg) return;
      const original = currentImg.getAttribute('data-original') || currentImg.getAttribute('src');
      lightboxImages = p.images || [];
      const idx = lightboxImages.indexOf(original);
      lightboxIndex = Math.max(0, idx);
      openLightbox(lightboxImages, lightboxIndex);
    }, { once: true });
  } else if (big) {
    big.innerHTML = `<div style="padding:20px;color:#777;text-align:center;font-size:5rem">${p.emoji || '👟'}</div>`;
  }

  const sizeGrid  = byId('modal-size-grid');
  const available = p.sizes.filter(s => s.quantity > 0);
  if(sizeGrid){
    sizeGrid.innerHTML = available.length
      ? available.map(s => `<button type="button" class="size-box" data-size="${s.size}" data-max="${s.quantity}">${s.size}</button>`).join('')
      : `<div class="size-box disabled" style="grid-column:1/-1">Sem estoque</div>`;
  }

  const qtyInp = byId('modal-qty');
  byId('modal-add-cart') && (byId('modal-add-cart').disabled = available.length === 0);
  byId('modal-go-cart')  && (byId('modal-go-cart').disabled  = available.length === 0);

  if (available.length && sizeGrid && qtyInp) {
    const firstBtn = sizeGrid.querySelector('.size-box');
    firstBtn.classList.add('selected');
    qtyInp.max = firstBtn.dataset.max || 1;
    qtyInp.value = 1;
  } else if(qtyInp) {
    qtyInp.value = 0;
  }

  if(sizeGrid){
    sizeGrid.onclick = (e) => {
      const btn = e.target.closest('.size-box');
      if (!btn || btn.classList.contains('disabled')) return;
      sizeGrid.querySelectorAll('.size-box').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if(qtyInp){ qtyInp.max = btn.dataset.max || 1; if (Number(qtyInp.value) > Number(qtyInp.max)) qtyInp.value = qtyInp.max; }
    };
  }

  const addBtn = byId('modal-add-cart');
  if(addBtn) addBtn.onclick = () => {
    const sel = sizeGrid?.querySelector('.size-box.selected');
    if (!sel) return showNotification('Selecione um tamanho','error');
    const qty = Math.max(1, Math.min(parseInt(qtyInp.value) || 1, parseInt(qtyInp.max || '1')));
    addToCart(p.id, sel.dataset.size, qty);
    showNotification(`🛒 ${p.name} (tam. ${sel.dataset.size}) adicionado!`);
  };
  const goBtn = byId('modal-go-cart');
  if(goBtn) goBtn.onclick = () => {
    const sel = sizeGrid?.querySelector('.size-box.selected');
    if (!sel) return showNotification('Selecione um tamanho','error');
    const qty = Math.max(1, Math.min(parseInt(qtyInp.value) || 1, parseInt(qtyInp.max || '1')));
    addToCart(p.id, sel.dataset.size, qty);
    closeProductModal();
    showCart();
  };

  renderRelatedProducts(p.category, p.id);
  const modal = byId('product-modal');
  if(modal){
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }
}
function setBigMedia(src, isVideo) {
  const big = byId('modal-big'); if(!big) return;

  if (isVideo) {
    big.innerHTML = `
      <div class="video-wrapper" style="position:relative;width:100%;height:100%">
        <video id="modal-video"
               src="${src}"
               controls
               autoplay
               muted
               playsinline
               preload="metadata"
               style="width:100%;height:100%;object-fit:cover;border-radius:12px"></video>

        <button type="button" class="fs-btn"
                style="position:absolute;right:8px;bottom:8px;border:none;border-radius:10px;padding:6px 10px;background:rgba(0,0,0,.55);color:#fff;cursor:pointer">
          <i class="fas fa-maximize"></i>
        </button>
      </div>`;

    const vid = byId('modal-video');
    const fsBtn = big.querySelector('.fs-btn');

    const goFullscreen = () => {
      if (vid.webkitEnterFullscreen) {
        try { vid.webkitEnterFullscreen(); return; } catch {}
      }
      if (vid.requestFullscreen) return vid.requestFullscreen();
      if (big.requestFullscreen) return big.requestFullscreen();
    };

    vid.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goFullscreen();
    });
    fsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goFullscreen();
    });

  } else {
    big.innerHTML = `
      <img loading="lazy" src='${large(src)}' data-original='${src}'
           onerror="handleImgError(event)" alt='media'
           style='width:100%;height:100%;object-fit:cover;border-radius:12px'>
      <div class="zoom-hint"><i class="fas fa-maximize"></i></div>`;
  }
}
function closeProductModal(){
  const m = byId('product-modal'); if(!m) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden','true');
  currentModalProduct = null;
}
window.addEventListener('keydown', e => { if (e.key === 'Escape') { closeProductModal(); closeLightbox(); closeCheckoutModal(); } });
byId('product-modal')?.addEventListener('click', e => { if (e.target.id === 'product-modal') closeProductModal(); });

function renderRelatedProducts(category, currentProductId) {
  const container = byId('modal-related-products'); if(!container) return;
  const related = products
    .filter(p =>
      p.category === category &&
      String(p.id) !== String(currentProductId) &&
      p.sizes.reduce((total, s) => total + (s.quantity || 0), 0) > 0
    )
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  if (related.length === 0) { container.innerHTML = ''; return; }

  let html = '<h4>Você também pode gostar</h4>';
  html += '<div class="related-products-grid">';
  html += related.map(p => {
    const img = (p.images && p.images.length > 0) ? thumb(p.images[0]) : NOIMG;
    return `
      <div class="related-product-card" onclick="openRelatedProduct('${p.id}')">
        <img src="${img}" alt="${escapeHtml(p.name)}" onerror="handleImgError(event)">
        <p>${escapeHtml(p.name)}</p>
      </div>`;
  }).join('');
  html += '</div>';
  container.innerHTML = html;
}
function openRelatedProduct(id) { closeProductModal(); setTimeout(() => showProductModal(id), 200); }

// ===== LIGHTBOX =====
function openLightbox(images, idx=0){
  if(!images || !images.length) return;
  lightboxImages = images; lightboxIndex = Math.max(0, Math.min(idx, images.length-1));
  const box = byId('lightbox'); const img = byId('lightbox-img');
  if(!box || !img) return;
  img.src = images[lightboxIndex] || NOIMG; img.onerror = ()=>{ img.src = NOIMG; };
  box.classList.add('open'); box.setAttribute('aria-hidden','false');
}
function closeLightbox(){ const box = byId('lightbox'); if(!box) return; box.classList.remove('open'); box.setAttribute('aria-hidden','true'); }
function navLightbox(delta){
  if(!lightboxImages.length) return;
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  const el = byId('lightbox-img'); if(el) el.src = lightboxImages[lightboxIndex] || NOIMG;
}
byId('lightbox')?.addEventListener('click',(e)=>{ if(e.target.id==='lightbox') closeLightbox(); });

// ===== CARRINHO =====
function addToCart(pid, size, qty){
  const p=products.find(x=>String(x.id)===String(pid)); if(!p) return;
  const stock = p.sizes.find(s=>String(s.size)===String(size));
  if(!stock||stock.quantity<=0) return showNotification('😔 Sem estoque para esse tamanho','error');
  const existing = cart.find(i=>String(i.pid)===String(pid) && String(i.size)===String(size));
  const newQty = (existing?existing.qty:0) + qty;
  if(newQty>stock.quantity) return showNotification('⚠️ Quantidade acima do estoque','error');
  if(existing){ existing.qty = newQty; } else { cart.push({ pid:String(pid), name:p.name, price:p.price, size:String(size), qty }); }
  saveCart(); updateCartCount();
}
function updateCartCount(){ const c = cart.reduce((t,i)=>t+i.qty,0); byId('cart-count') && (byId('cart-count').textContent=String(c)); }
function renderCart(){
  const wrapper = byId('cart-wrapper'); if(!wrapper) return;
  if(cart.length===0){
    wrapper.innerHTML = `<div style="text-align:center;color:#666;padding:20px"><i class='fas fa-cart-arrow-down' style='font-size:2rem;opacity:.5'></i><p>Seu carrinho está vazio.</p></div>`;
    return;
  }
  let total = 0;
  const rows = cart.map((i,idx)=>{
    const sub = i.price * i.qty; total += sub;
    return `<tr><td><strong>${escapeHtml(i.name)}</strong></td><td>${i.size}</td><td><input type='number' min='1' value='${i.qty}' style='width:80px;padding:8px;border:2px solid #e5e7eb;border-radius:10px;font-weight:800' onchange='changeQty(${idx}, this.value)'></td><td>${brl(i.price)}</td><td>${brl(sub)}</td><td><button class='delete-btn' onclick='removeFromCart(${idx})'><i class="fas fa-trash"></i></button></td></tr>`;
  }).join('');
  wrapper.innerHTML = `<div style='overflow:auto'><table class='cart-table'><thead><tr><th>Produto</th><th>Tamanho</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th>Ações</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan='4' style='text-align:right;font-weight:900'>Total</td><td style='font-weight:900'>${brl(total)}</td><td></td></tr></tfoot></table></div>`;
}
function changeQty(index, val){
  const item = cart[index]; if(!item) return;
  const p = products.find(x=>String(x.id)===String(item.pid));
  const stock = p?.sizes?.find(s=>String(s.size)===String(item.size));
  const q = Math.max(1, parseInt(val)||1);
  if(stock && q>stock.quantity){ showNotification('⚠️ Sem estoque suficiente','error'); return renderCart(); }
  item.qty = q; saveCart(); renderCart();
}
function removeFromCart(index){ cart.splice(index,1); saveCart(); renderCart(); }
function clearCart(){ if(confirm('Limpar todo o carrinho?')){ cart = []; saveCart(); renderCart(); }}

// ===== CHECKOUT MODAL =====
function loadCheckoutInfo(){
  try{ return JSON.parse(localStorage.getItem(CHECKOUT_INFO_KEY) || '{}'); }catch{ return {}; }
}
function saveCheckoutInfo(info){
  localStorage.setItem(CHECKOUT_INFO_KEY, JSON.stringify(info||{}));
}
function buildCheckoutSummary(){
  const el = byId('checkout-summary'); if(!el) return;
  let total = 0;
  const rows = cart.map((i,idx)=>{
    const sub = i.price * i.qty; total += sub;
    return `<div class="ck-row">
      <span>${idx+1}) ${escapeHtml(i.name)}</span>
      <span>Tam ${i.size} • Qtd ${i.qty}</span>
      <span>${brl(sub)}</span>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="ck-rows">${rows}</div>
    <div class="ck-total"><strong>Total:</strong> ${brl(total)}</div>`;
}
function openCheckoutModal(){
  const m = byId('checkout-modal'); if(!m) return;
  m.hidden = false; document.body.style.overflow='hidden';
}
function closeCheckoutModal(){
  const m = byId('checkout-modal'); if(!m) return;
  m.hidden = true; document.body.style.overflow='';
}
async function handleSendCheckout(){
  const name = byId('ck-name')?.value.trim();
  const phoneRaw = byId('ck-phone')?.value.trim();
  let digits = onlyDigits(phoneRaw||'');
  if (!digits.startsWith('55')) digits = '55' + digits;
  const phone = `+${digits}`;

  const address = byId('ck-address')?.value.trim();
  const payment = byId('ck-payment')?.value || 'pix';
  const notes   = byId('ck-notes')?.value.trim();

  if(!name){ byId('ck-name')?.focus(); return showNotification('Informe o nome completo.','error'); }
  if(!phoneRe.test(phone)){ byId('ck-phone')?.focus(); return showNotification('Telefone inválido. Use DDD + número.','error'); }
  if (cart.length === 0) return showNotification('🛒 Carrinho vazio!', 'error');

  saveCheckoutInfo({ name, phone, address, payment, notes });

  const items = cart.map(i => ({
    product_id: String(i.pid),
    size: String(i.size),
    qty: Number(i.qty),
    price_cents: Math.round(Number(i.price) * 100)
  }));

  const sendBtn = byId('btn-send-whatsapp');
  const btnLabel = sendBtn ? sendBtn.textContent : '';
  if(sendBtn){ sendBtn.disabled = true; sendBtn.textContent = 'Enviando...'; }

  const lines = cart.map((i, idx) =>
    `${idx + 1}) ${i.name} - Tam: ${i.size} - Qtd: ${i.qty} - ${brl(i.price)} (Sub: ${brl(i.price * i.qty)})`
  );
  const total = items.reduce((s, it) => s + it.price_cents * it.qty, 0) / 100;
  const dt = new Date().toLocaleString('pt-BR');
  const msg =
`Olá! Gostaria de confirmar meu pedido na *Pequenos Passos* 👟

*RESUMO DO PEDIDO:*
${lines.join('\n')}

*Total:* ${brl(total)}
*Data:* ${dt}

*DADOS DO CLIENTE:*
• *Nome:* ${name}
• *WhatsApp:* ${phone}
• *Endereço:* ${address || '—'}

*Pagamento:* ${payment.toUpperCase()}
${notes ? `*Observações:* ${notes}` : ''}`;

  try {
    // Tenta criar pedido no backend SE existir essa rota (se não, ignora)
    try {
      const payload = { customer: { name, phone, address }, payment_method: payment, items, notes };
      await apiFetch('/orders', { method:'POST', body: JSON.stringify(payload) });
    } catch { /* sem /orders? segue só com WhatsApp */ }

    const encodedMsg = encodeURIComponent(msg);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMsg}`, '_blank');

    cart = []; saveCart(); renderCart();
    await fetchProductsFromAPI(); // se backend atualizar estoque no futuro
    filteredProducts = [...products];
    renderProducts(); updateSizeFilter();
    showNotification('✅ Pedido enviado por WhatsApp!');
    closeCheckoutModal();
  } catch (e) {
    console.error(e);
    showNotification('❌ Falha ao enviar pedido.', 'error');
  } finally {
    if(sendBtn){ sendBtn.disabled = false; sendBtn.textContent = btnLabel; }
  }
}
function setupCheckoutModal(){
  const modal = byId('checkout-modal'); if(!modal) return;
  modal.addEventListener('click', (e)=>{ if(e.target.matches('[data-close-modal]')) closeCheckoutModal(); });
  const sendBtn = byId('btn-send-whatsapp');
  if(sendBtn) sendBtn.addEventListener('click', handleSendCheckout);
  attachPhoneMask();
  tweakCheckoutUI();
}
async function finalizeOrder() {
  if (cart.length === 0) return showNotification('🛒 Carrinho vazio!', 'error');
  buildCheckoutSummary();

  const info = loadCheckoutInfo();
  if(info){
    if(info.name)    byId('ck-name').value = info.name;
    if(info.phone)   byId('ck-phone').value = formatPhoneBRDisplay(String(info.phone).replace(/^\+/, ''));
    if(info.address) byId('ck-address').value = info.address;
    if(info.payment) byId('ck-payment').value = info.payment;
    if(info.notes)   byId('ck-notes').value = info.notes;
  }

  openCheckoutModal();
}

// ===== ADMIN (CRUD, UPLOADS, ETC) =====
function addSizeInput(){
  const c=byId('sizes-container'); if(!c) return;
  const d=document.createElement('div');
  d.className='size-input-group';
  d.style.cssText='display:flex;gap:10px;align-items:center;background:#fff;border:2px solid #e5e7eb;border-radius:12px;padding:12px';
  d.innerHTML = `<label style="min-width:80px;margin:0">Tamanho:</label><input type='number' class='size-number' min='15' max='45' placeholder='Ex: 21'><label style="min-width:100px;margin:0">Quantidade:</label><input type='number' class='size-quantity' min='0' placeholder='Ex: 10'><button type='button' class='remove-size-btn' onclick='removeSizeInput(this)'><i class='fas fa-minus'></i></button>`;
  c.appendChild(d);
}
function removeSizeInput(btn){
  const c=byId('sizes-container'); if(!c) return;
  if(c.children.length>1){ btn.parentElement.remove(); }
  else { showNotification('⚠️ Pelo menos um tamanho deve ser mantido!','error'); }
}
function setupMediaUpload(){
  const imgInput=byId('product-images');
  const vidInput=byId('product-video');
  const imgPrev=byId('images-preview');
  const vidPrev=byId('video-preview');

  if(imgInput){
    imgInput.addEventListener('change',async (e)=>{
      tempImages=[]; tempImageFiles=[]; if(imgPrev) imgPrev.innerHTML='';
      const files=[...e.target.files].slice(0,8);
      for(const f of files){
        const data=await fileToDataURL(f);
        tempImages.push(data);
        tempImageFiles.push(f);
        if(imgPrev){
          const thumb=document.createElement('div');
          thumb.className='media-thumb';
          thumb.innerHTML=`<img src='${data}' onerror="handleImgError(event)" alt='img'>`;
          imgPrev.appendChild(thumb);
        }
      }
    });
  }

  if(vidInput){
    vidInput.addEventListener('change',async (e)=>{
      tempVideo=null; if(vidPrev) vidPrev.innerHTML=''; tempVideoFile=null;
      const f=e.target.files[0];
      if(f){
        if(!f.type.startsWith('video/')) { showNotification('Selecione um arquivo de vídeo.','error'); return; }
        const MAX_MB = 80;
        if(f.size > MAX_MB*1024*1024){ showNotification(`Vídeo muito grande (>${MAX_MB}MB).`, 'error'); return; }
        const data=await fileToDataURL(f);
        tempVideo=data; tempVideoFile=f;
        if(vidPrev){
          const t=document.createElement('div');
          t.className='media-thumb';
          t.innerHTML=`<video src='${data}'></video>`;
          vidPrev.appendChild(t);
        }
      }
    });
  }
}
function resetUploads(){
  tempImages=[]; tempVideo=null; tempImageFiles=[]; tempVideoFile=null;
  byId('product-images') && (byId('product-images').value='');
  byId('product-video')  && (byId('product-video').value='');
  byId('images-preview') && (byId('images-preview').innerHTML='');
  byId('video-preview')  && (byId('video-preview').innerHTML='');
}
function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

function renderAdminProductList(){
  const list=byId('admin-product-list'); if(!list) return;
  if(products.length===0){
    list.innerHTML = `<div style='text-align:center;color:#666;padding:20px'><i class='fas fa-box-open' style='font-size:2rem;opacity:.5'></i><p>Nenhum produto cadastrado.</p></div>`;
    return;
  }
  list.innerHTML = products.map(p=>{
    const total=p.sizes.reduce((t,s)=>t+Number(s.quantity||0),0);
    const sizes=p.sizes.map(s=>`${s.size}(${s.quantity})`).join(', ');
    return `<div class='product-item'>
      <div>
        <strong style='font-size:1.05rem'>${escapeHtml(p.emoji||'')} ${escapeHtml(p.name)}</strong><br>
        <small style='color:#666'><i class='fas fa-dollar-sign'></i> ${brl(p.price)} • <i class='fas fa-tag'></i> ${p.category} • <i class='fas fa-box'></i> ${total} un.</small><br>
        <small style='color:#999'><i class='fas fa-ruler'></i> Tamanhos: ${sizes}</small>
      </div>
      <div class='product-actions'>
        <button class='edit-btn' onclick='editProduct("${p.id}")'><i class='fas fa-edit'></i> Editar</button>
        <button class='delete-btn' onclick='deleteProduct("${p.id}")'><i class='fas fa-trash'></i> Excluir</button>
      </div>
    </div>`;
  }).join('');
}

// >>>>>>>>>> CRIAR / EDITAR PRODUTO (COM UPLOADS) <<<<<<<<<<
async function submitProduct(e){
  e.preventDefault();
  if(!isLoggedIn){ return showNotification('❌ Acesso negado!','error'); }

  const name=byId('product-name')?.value.trim();
  const priceInput=byId('product-price')?.value;
  const description=byId('product-description')?.value.trim();
  const category=byId('product-category')?.value;
  const emoji=byId('product-emoji')?.value;

  const sizeInputs = document.querySelectorAll('#sizes-container .size-input-group');
  const sizes=[]; sizeInputs.forEach(g=>{
    const n=g.querySelector('.size-number')?.value;
    const q=parseInt(g.querySelector('.size-quantity')?.value)||0;
    if(n){ sizes.push({size:String(n),quantity:q}); }
  });

  if(!name || !priceInput || sizes.length===0){
    return showNotification('⚠️ Preencha nome, preço e ao menos um tamanho.','error');
  }

  // uploads (imagens múltiplas + vídeo) via backend (fallback Supabase)
  let uploadedImgs = [];   // [{url, public_id}]
  let uploadedVid  = null; // {url, public_id} | null

  try{
    if (tempImageFiles.length > 0){
      uploadedImgs = await uploadImagesViaBackend(tempImageFiles);
    }
  }catch(upErr){ console.warn('⚠️ Falha no upload (imagem):', upErr); }

  try{
    if (tempVideoFile){
      uploadedVid = await uploadVideoViaBackend(tempVideoFile);
    }
  }catch(upErr){ console.warn('⚠️ Falha no upload (vídeo):', upErr); }

  // preserva mídia ao editar
  const prev = editingId !== null ? products.find(x => String(x.id) === String(editingId)) : null;
  const finalImages = (uploadedImgs.length ? uploadedImgs.map(x=>x.url) : (prev?.images ?? []));
  const finalImagePublicId = uploadedImgs.length ? uploadedImgs[0].public_id : (prev?.image_public_id ?? null);
  const finalVideoURL = uploadedVid?.url ?? (prev?.video ?? null);
  const finalVideoPublicId = uploadedVid?.public_id ?? (prev?.video_public_id ?? null);

  const priceNum = Number(String(priceInput).replace('.', '').replace(',','.')) || 0;

  try{
    if (API_URL && getToken()){
      if(editingId!==null){
        // UPDATE (PATCH)
        const payloadUpdate = {
          name,
          description: description || name,
          price: priceNum,
          category,
          emoji,
          sizes,
          image_url: finalImages[0] || null,
          image_public_id: finalImagePublicId || null,
          video_url: finalVideoURL || null,
          video_public_id: finalVideoPublicId || null
        };
        await apiFetch(`/products/${editingId}`, { method:'PATCH', body: JSON.stringify(payloadUpdate) });
        showNotification(`✏️ Produto "${name}" atualizado no backend!`);
      }else{
        // CREATE
        const payloadCreate = {
          name,
          description: description || name,
          price: priceNum,
          category,
          emoji,
          sizes,
          image_url: finalImages[0] || null,
          image_public_id: finalImagePublicId || null,
          video_url: finalVideoURL || null,
          video_public_id: finalVideoPublicId || null
        };
        await apiFetch('/products', { method:'POST', body: JSON.stringify(payloadCreate) });
        showNotification(`✅ Produto "${name}" criado no backend!`);
      }
      await fetchProductsFromAPI();
    }else{
      // Fallback local (sem backend)
      if(editingId!==null){
        const idx = products.findIndex(x=>String(x.id)===String(editingId));
        if(idx<0) throw new Error('Produto não encontrado');
        const prevLocal = products[idx];
        products[idx] = {
          ...prevLocal,
          name,
          price: priceNum,
          description: description||name,
          category,
          sizes,
          emoji,
          images: finalImages.length ? finalImages : (prevLocal.images||[]),
          video: (uploadedVid ? uploadedVid.url : prevLocal.video)
        };
        showNotification(`✏️ Produto "${name}" atualizado (local).`);
      }else{
        const newProduct = { id: Date.now(), name, price: priceNum, description: description||name, category, sizes, emoji, images: finalImages, video: finalVideoURL };
        products.push(newProduct);
        showNotification(`✅ Produto "${name}" adicionado (local).`);
      }
      saveState();
    }

    filteredProducts=[...products];
    renderProducts(); renderAdminProductList(); updateSizeFilter();
    resetForm(true); resetUploads(); renderLowStockReport(); renderAdminDashboard();

  }catch(err){
    console.error(err);
    showNotification('❌ Erro ao salvar produto no backend. Veja o console/Network.','error');
  }
}

function editProduct(id){
  if(!isLoggedIn) return showNotification('❌ Acesso negado!','error');
  const p=products.find(x=>String(x.id)===String(id)); if(!p) return;
  editingId = id; showAdminTab('products'); byId('product-form')?.scrollIntoView({behavior:'smooth'});
  byId('submit-btn') && (byId('submit-btn').innerHTML = `<i class='fas fa-save'></i> Salvar alterações`);
  byId('cancel-edit') && (byId('cancel-edit').style.display='inline-block');
  byId('product-name') && (byId('product-name').value = p.name);
  byId('product-price') && (byId('product-price').value = p.price);
  byId('product-description') && (byId('product-description').value = p.description||'');
  byId('product-category') && (byId('product-category').value = p.category);
  byId('product-emoji') && (byId('product-emoji').value = p.emoji||'👟');
  const c=byId('sizes-container'); if(c){ c.innerHTML='';
    p.sizes.forEach((s)=>{
      const d=document.createElement('div'); d.className='size-input-group';
      d.style.cssText='display:flex;gap:10px;align-items:center;background:#fff;border:2px solid #e5e7eb;border-radius:12px;padding:12px';
      d.innerHTML = `<label style="min-width:80px;margin:0">Tamanho:</label><input type='number' class='size-number' min='15' max='45' value='${s.size}'><label style="min-width:100px;margin:0">Quantidade:</label><input type='number' class='size-quantity' min='0' value='${s.quantity}'><button type='button' class='remove-size-btn' onclick='removeSizeInput(this)' ${p.sizes.length>1?'':''}><i class='fas fa-minus'></i></button>`;
      c.appendChild(d);
    });
  }
  const imgPrev=byId('images-preview'); const vidPrev=byId('video-preview');
  imgPrev && (imgPrev.innerHTML=''); vidPrev && (vidPrev.innerHTML='');
  (p.images||[]).forEach(src=>{
    if(imgPrev){
      const t=document.createElement('div'); t.className='media-thumb';
      t.innerHTML=`<img src='${src}' onerror="handleImgError(event)" alt='img'>`;
      imgPrev.appendChild(t);
    }
  });
  if(p.video && vidPrev){
    const t=document.createElement('div'); t.className='media-thumb';
    t.innerHTML=`<video src='${p.video}'></video>`;
    vidPrev.appendChild(t);
  }
  tempImages=[]; tempVideo=null; tempImageFiles=[]; tempVideoFile=null;
}

async function deleteProduct(id){
  if(!isLoggedIn) return showNotification('❌ Acesso negado!','error');
  const p=products.find(x=>String(x.id)===String(id)); if(!p) return;
  if(!confirm(`Excluir "${p.name}"? Essa ação não pode ser desfeita.`)) return;

  try{
    if(API_URL && getToken()){
      await apiFetch(`/products/${id}`, { method:'DELETE' });
      showNotification('🗑️ Produto excluído no backend.');
      await fetchProductsFromAPI();
    }else{
      products = products.filter(x=>String(x.id)!==String(id));
      saveState();
      showNotification('🗑️ Produto excluído (local).');
    }

    filteredProducts=[...products];
    renderProducts(); renderAdminProductList(); updateSizeFilter(); renderLowStockReport();
    if(editingId===id) cancelEdit();

  }catch(err){
    console.error(err);
    showNotification('❌ Erro ao excluir produto no backend.','error');
  }
}

function cancelEdit(){ editingId=null; resetForm(); resetUploads(); showNotification('✖️ Edição cancelada'); }
function resetForm(focusTop=false){
  byId('product-form')?.reset();
  byId('submit-btn') && (byId('submit-btn').innerHTML = `<i class='fas fa-plus-circle'></i> Adicionar Produto`);
  byId('cancel-edit') && (byId('cancel-edit').style.display='none');
  byId('sizes-container') && (byId('sizes-container').innerHTML = `<div class='size-input-group' style="display:flex;gap:10px;align-items:center;background:#fff;border:2px solid #e5e7eb;border-radius:12px;padding:12px"><label style='min-width:80px;margin:0'>Tamanho:</label><input type='number' class='size-number' min='15' max='45' placeholder='Ex: 20'><label style='min-width:100px;margin:0'>Quantidade:</label><input type='number' class='size-quantity' min='0' placeholder='Ex: 10'><button type='button' class='remove-size-btn' onclick='removeSizeInput(this)' style='display:none'><i class='fas fa-minus'></i></button></div>`);
  if(focusTop){ byId('product-form')?.scrollIntoView({behavior:'smooth'}); }
}

// ADMIN TABS, DASHBOARD, LOW STOCK
function showAdminTab(tabName) {
  ['products', 'orders', 'stock'].forEach(tab => {
    const sec = byId(`admin-${tab}-tab`);
    const btn = document.querySelector(`.admin-tab-btn[onclick="showAdminTab('${tab}')"]`);
    if(sec) sec.style.display = 'none';
    if(btn) btn.classList.remove('active');
  });
  const sec = byId(`admin-${tabName}-tab`);
  const btn = document.querySelector(`.admin-tab-btn[onclick="showAdminTab('${tabName}')"]`);
  if(sec) sec.style.display = 'block';
  if(btn) btn.classList.add('active');

  if (tabName === 'products') renderAdminProductList();
  if (tabName === 'orders') renderOrders();
  if (tabName === 'stock') renderLowStockReport();
}

// dashboard puxando do backend (apenas quando logado)
async function renderAdminDashboard() {
  const dashboard = byId('admin-dashboard'); if(!dashboard) return;
  if (!getToken()) {
    dashboard.innerHTML = `<div class="stat-card"><div class="stat-card-title"><i class="fas fa-lock"></i> Área Admin</div><div class="stat-card-value" style="font-size:1rem">Faça login para ver estatísticas</div></div>`;
    return;
  }
  try {
    const rows = await apiFetch('/orders?limit=200&page=1', { method: 'GET' });
    const approved = (Array.isArray(rows) ? rows : []).filter(o => o.status === 'APPROVED');
    const totalOrders = approved.length;
    const totalRevenue = approved.reduce((s,o)=> s + (o.total_cents||0), 0) / 100;

    const details = await Promise.all(approved.map(o => apiFetch(`/orders/${o.id}`)));
    const productCounts = {};
    (details || []).forEach(ord => (ord.items||[]).forEach(it=>{
      const pid = String(it.product_id);
      productCounts[pid] = (productCounts[pid]||0) + (it.qty||0);
    }));
    let bestSellerName = 'Nenhum';
    if (Object.keys(productCounts).length) {
      const bestId = Object.entries(productCounts).sort((a,b)=> b[1]-a[1])[0][0];
      bestSellerName = products.find(p => String(p.id) === String(bestId))?.name || '—';
    }

    dashboard.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-title"><i class="fas fa-check-circle"></i> Pedidos Aprovados</div>
        <div class="stat-card-value">${totalOrders}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title"><i class="fas fa-dollar-sign"></i> Faturamento Total</div>
        <div class="stat-card-value">${brl(totalRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title"><i class="fas fa-star"></i> Mais Vendido</div>
        <div class="stat-card-value" style="font-size: 1.2rem;">${escapeHtml(bestSellerName)}</div>
      </div>`;
  } catch (e) {
    console.error(e);
    dashboard.innerHTML = `<div class="stat-card"><div class="stat-card-title"><i class="fas fa-exclamation-triangle"></i> Erro</div><div class="stat-card-value" style="font-size:1rem">Não foi possível carregar o dashboard.</div></div>`;
  }
}

function renderLowStockReport() {
  const listContainer = byId('low-stock-list'); if(!listContainer) return;
  const lowStockProducts = products.filter(p => {
    const totalStock = p.sizes.reduce((sum, size) => sum + (size.quantity || 0), 0);
    return totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD;
  });
  if (lowStockProducts.length === 0) {
    listContainer.innerHTML = `<div style='text-align:center;color:#666;padding:20px'><i class='fas fa-check-circle' style='font-size:2rem;opacity:.5'></i><p>Nenhum produto com estoque baixo.</p></div>`;
    return;
  }
  listContainer.innerHTML = lowStockProducts.map(p => {
    const totalStock = p.sizes.reduce((sum, size) => sum + (size.quantity || 0), 0);
    return `<div class='product-item'><div><strong style='font-size:1.05rem'>${escapeHtml(p.emoji||'')} ${escapeHtml(p.name)}</strong><br><small style='color:#e74c3c; font-weight: bold;'><i class='fas fa-box-open'></i> Apenas ${totalStock} unidades restantes!</small></div><div class='product-actions'><button class='edit-btn' onclick='editProduct("${p.id}")'><i class='fas fa-edit'></i> Editar</button></div></div>`;
  }).join('');
}

// ===== ORDERS (placeholders/compat) =====
async function renderOrders(tab = 'PENDING') {
  const list = byId('orders-list'); if(!list) return;
  if (!getToken()) {
    list.innerHTML = `<div style="text-align:center;color:#666;padding:12px">
      <i class="fas a-lock" style="opacity:.6"></i> Faça login para ver os pedidos.
    </div>`;
    return;
  }
  try{
    const rows = await apiFetch('/orders?limit=50&page=1', { method: 'GET' });
    const mapTab = {
      pending: 'PENDING',
      approved: 'APPROVED',
      preparing: 'PREPARING',
      out: 'OUT_FOR_DELIVERY',
      delivered: 'DELIVERED',
      canceled: 'CANCELED'
    };
    const wanted = mapTab[String(tab).toLowerCase()] || 'PENDING';
    const base = (Array.isArray(rows) ? rows : []).filter(o => (o.status || 'PENDING') === wanted);

    const detailed = await Promise.all(base.map(async (o) => {
      try { const det = await apiFetch(`/orders/${o.id}`, { method: 'GET' }); return { ...o, items: det?.items || [] }; }
      catch { return { ...o, items: [] }; }
    }));

    if (detailed.length === 0) {
      list.innerHTML = `<div style="text-align:center;color:#666;padding:12px">
        <i class="fas fa-inbox" style="opacity:.5"></i> Nenhum pedido ${tab}.
      </div>`;
      return;
    }

    list.innerHTML = detailed.map(o => {
      const when = new Date(o.created_at).toLocaleString('pt-BR');
      const itemsHtml = (o.items || []).map((it, idx) => {
        const pname = products.find(p => String(p.id) === String(it.product_id))?.name || '';
        return `${idx + 1}) ${escapeHtml(pname)} • Tam ${it.size || '-'} • Qtd ${it.qty} • ${brl((it.price_cents || 0)/100)}`;
      }).join('<br>');
      const actions =
        o.status === 'PENDING'
          ? `<button class="btn btn-approve" onclick="approveOrder('${o.id}')"><i class="fas fa-check"></i> Aprovar</button>
             <button class="btn btn-cancel"  onclick="cancelOrder('${o.id}')"><i class="fas fa-times"></i> Cancelar</button>`
          : (o.status === 'APPROVED'
              ? `<button class="btn btn-cancel" onclick="returnOrderToStock('${o.id}')"><i class="fas fa-undo"></i> Devolver ao estoque</button>`
              : `<button class="btn btn-cancel" onclick="deleteOrderLocal('${o.id}')"><i class="fas fa-trash"></i> Remover (local)</button>`);
      return `<div class="order-card" data-oid="${o.id}">
        <div class="order-header">
          <strong>Pedido #${o.id}</strong>
          <span style="color:#666"><i class="fas fa-clock"></i> ${when}</span>
        </div>
        <div style="margin:6px 0 10px;color:#444">
          <i class="fas fa-user"></i>
          <strong>${escapeHtml(o.customer_name || 'Cliente')}</strong>
          ${o.customer_phone ? `<span style="color:#777"> • ${formatBRPhone(o.customer_phone)}</span>` : ''}
        </div>
        <div class="order-items">${itemsHtml || ''}</div>
        <div style="font-weight:900">Total: ${brl((o.total_cents || 0)/100)}</div>
        <div class="order-actions">
          ${actions}
          <button class="btn btn-whats" onclick="whatsappCustomer('${o.id}')">
            <i class="fab fa-whatsapp"></i> WhatsApp
          </button>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    console.error(e);
    list.innerHTML = `<div style="text-align:center;color:#666;padding:12px">
      <i class="fas fa-exclamation-triangle" style="opacity:.7;color:#eab308"></i> Erro ao buscar pedidos.
    </div>`;
  }
}
async function approveOrder(orderId){ showNotification('⚠️ Endpoint /orders não habilitado ainda.', 'info'); }
async function cancelOrder(orderId){ showNotification('⚠️ Endpoint /orders não habilitado ainda.', 'info'); }
async function returnOrderToStock(orderId){ showNotification('⚠️ Endpoint /orders não habilitado ainda.', 'info'); }
function deleteOrderLocal(_oid){ showNotification('ℹ️ Pedidos agora vêm do backend. Não há remoção local.'); }
async function whatsappCustomer(orderId){ showNotification('⚠️ Endpoint /orders não habilitado ainda.', 'info'); }

// ====== ADMIN SHORTCUTS (10 cliques no logo, Ctrl+Alt+A, link #admin) ======
function installAdminShortcuts() {
  const openAdmin = (e) => { if(e){ e.preventDefault?.(); e.stopPropagation?.(); } showAdmin(); };

  // Tenta achar a marca: use data-admin-trigger no HTML para precisão
  const brandEl = (() => {
    const sels = [
      '[data-admin-trigger]',
      '#brand', '#brand-logo', '#brand-title',
      '.brand', '.logo', 'header .logo', '.site-title', 'header h1',
      'a[href="/"]', 'a[href="#"]'
    ];
    for (const s of sels) { const el = document.querySelector(s); if (el) return el; }
    // Fallback por texto
    const nodes = [...document.querySelectorAll('header *, h1, h2, .title, .site-title, .brand, .logo, a')];
    const t = nodes.find(n => (n.textContent || '').toLowerCase().includes('pequenos passos'));
    return t || document.body;
  })();

  let clicks = 0, timer = null;
  const handleClicks = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    clicks++;
    if (clicks === 1) timer = setTimeout(() => (clicks = 0), 5000);
    if (clicks >= 10) {
      clearTimeout(timer);
      clicks = 0;
      openAdmin(e);
    }
  };
  brandEl.style.cursor = 'pointer';
  brandEl.addEventListener('click', handleClicks, true);

  // Ctrl + Alt + A (e também Ctrl + Shift + A pra quem preferir)
  document.addEventListener('keydown', (e) => {
    const key = e.key || '';
    const okCombo =
      ((e.ctrlKey || e.metaKey) && e.altKey && (key === 'a' || key === 'A')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'a' || key === 'A'));
    if (okCombo) {
      e.preventDefault();
      openAdmin(e);
    }
  });

  // Links e hash #admin
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#admin"], [data-open-admin]');
    if (a) { e.preventDefault(); openAdmin(e); }
  });

  if (location.hash === '#admin' || location.hash === '#login') {
    openAdmin();
  }

  console.info('[AdminShortcuts] ativo: 10 cliques no logo, Ctrl+Alt+A, hash #admin');
}

// ===== INIT =====
async function initializeApp(){
  // reset rápido via query
  if (location.search.includes('reset=1')){
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ORDER_KEY);
    localStorage.removeItem(CART_KEY);
    location.replace(location.origin + location.pathname);
    return;
  }

  // sessão (token backend / supabase)
  await tryHydrateSession();

  // carrega produtos do backend (com fallback opcional para catálogo estático)
  let loadedFromAPI = await fetchProductsFromAPI();
  if (!loadedFromAPI && REMOTE_CATALOG_URL) {
    loadedFromAPI = await tryLoadRemoteCatalog();
  }
  if (!loadedFromAPI) {
    products = [];
    filteredProducts = [];
  } else {
    filteredProducts = [...products];
  }

  // render inicial
  renderProducts();
  updateSizeFilter();
  setupMediaUpload();
  showHome();
  updateCartCount();

  // listeners
  const lf = byId('login-form');   if (lf) lf.addEventListener('submit', handleLogin);
  const pf = byId('product-form'); if (pf) pf.addEventListener('submit', submitProduct);
  setupCheckoutModal();

  document.addEventListener('submit', (e) => {
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; setTimeout(() => btn.disabled = false, 1500); }
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.js-open-modal'); if (!trigger) return;
    e.preventDefault();
    const id = trigger.dataset.id;
    if (id != null) showProductModal(id);
  });

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.orders-tabs .tab-btn');
    if (tab) {
      document.querySelectorAll('.orders-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      renderOrders(tab.dataset.tab);
    }
  });

  // Navegação básica por hash (home/produtos/contato/carrinho/admin)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    const h = href.toLowerCase();
    if (['#home','#inicio','#início'].includes(h)) { e.preventDefault(); showHome(); }
    if (['#produtos','#products','#loja'].includes(h)) { e.preventDefault(); showProducts(); }
    if (['#contato','#contact'].includes(h)) { e.preventDefault(); showContact(); }
    if (['#carrinho','#cart'].includes(h)) { e.preventDefault(); showCart(); }
    if (h === '#admin' || a.hasAttribute('data-open-admin')) { e.preventDefault(); showAdmin(); }
  });

  attachPhoneMask();
  tweakCheckoutUI();
  hideStaticCatalogButtons();
  installAdminShortcuts();

  // atualiza link do WhatsApp da página Contato conforme config
  try {
    const w = window.__CONFIG__?.WHATSAPP || WHATSAPP_NUMBER;
    const a = document.getElementById('contact-whatsapp');
    if (a) a.href = `https://wa.me/${w}`;
  } catch {}
}

document.addEventListener('DOMContentLoaded', initializeApp);
