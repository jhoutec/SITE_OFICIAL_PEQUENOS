<!-- config.js -->
<script>
  window.__CONFIG__ = {
    // 🔗 URL da API backend no Render
    API_URL: "https://site-oficial-pequenos.onrender.com",

    // 📞 Número do WhatsApp para checkout
    WHATSAPP_NUMBER: "5538992076130",

    // 🔑 Chaves de armazenamento local
    CART_KEY: "pp_cart",
    STORAGE_KEY: "pp_products_v4",   // controla cache de produtos
    ORDER_KEY: "pp_orders_v1",
    CHECKOUT_INFO_KEY: "pp_checkout_info_v1",

    // 📦 Catálogo remoto (fallback se não puxar do banco)
    REMOTE_CATALOG_URL: "products.json",

    // ⚠️ Quantidade mínima para alerta de baixo estoque
    LOW_STOCK_THRESHOLD: 5
  };
</script>
