// config.js — Netlify (front) + Render (backend) + Supabase (DB)
(() => {
  const isLocal =
    ["localhost", "127.0.0.1"].includes(location.hostname) ||
    /^192\.168\./.test(location.hostname);

  const DEFAULT_API_LOCAL  = "http://localhost:8000";
  const DEFAULT_API_RENDER = "https://site-oficial-pequenos.onrender.com"; // Render

  // Permite trocar API por querystring (?api=https://minha-api)
  const qs = new URLSearchParams(location.search);
  const apiFromQuery = qs.get("api");

  // Override salvo (útil para testes)
  const apiFromStore = localStorage.getItem("pp_api_url");

  const API_URL = apiFromQuery || apiFromStore || (isLocal ? DEFAULT_API_LOCAL : DEFAULT_API_RENDER);

  window.__CONFIG__ = {
    BRAND: "Pequenos Passos",

    // Backend principal
    API_URL,

    // WhatsApp (checkout/contato)
    WHATSAPP: "5538992076130",

    // Desliga o catálogo estático (pode deletar products.json do front)
    REMOTE_CATALOG_URL: null,

    // Recursos
    FEATURES: { VIDEO: true, CART: true, ORDERS: true },

    // Chaves de storage (use estas no app.js)
    KEYS: {
      CART: "pp_cart",
      PRODUCTS: "pp_products_v5",
      ORDERS: "pp_orders_v2",
      CHECKOUT_INFO: "pp_checkout_info_v1",
    },

    // Estoque
    STOCK: { LOW_THRESHOLD: 5 },

    // Supabase (NUNCA usar service_role no front)
    SUPABASE_URL: "https://rlhonhncwcsiqqvgahve.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaG9uaG5jd2NzaXFxdmdhaHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMTU1OTMsImV4cCI6MjA3MjY5MTU5M30.M6YfoveByk__Y4WiOFNW8o6E-UHnbuG3UEv1zHpYKzU",
    SUPABASE_BUCKET: "media",

    // Helpers de override (opcional)
    setApiUrl(url) {
      if (!url) return;
      localStorage.setItem("pp_api_url", url);
      this.API_URL = url;
      console.info("[CONFIG] API_URL setado:", url);
    },
    clearApiUrl() {
      localStorage.removeItem("pp_api_url");
      this.API_URL = isLocal ? DEFAULT_API_LOCAL : DEFAULT_API_RENDER;
      console.info("[CONFIG] API_URL padrão:", this.API_URL);
    },
  };

  console.info("[CONFIG] API_URL em uso:", window.__CONFIG__.API_URL);
})();
