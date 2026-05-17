/**
 * Muestra stock real por producto (API) con semáforo de 3 colores.
 * Rojo = bajo, naranja = medio, verde = alto.
 */
(function () {
    "use strict";

    function apiRoot() {
        var raw =
            typeof window.PVM_API !== "undefined" && window.PVM_API
                ? String(window.PVM_API)
                : "/api";
        return raw.replace(/\/$/, "");
    }

    function niveles() {
        var cfg = window.PVM_STOCK_NIVELES || {};
        return {
            altoMin: typeof cfg.altoMin === "number" ? cfg.altoMin : 15,
            medioMin: typeof cfg.medioMin === "number" ? cfg.medioMin : 4,
        };
    }

    function cantidadTotal(p) {
        if (!p || typeof p.stock !== "number" || isNaN(p.stock)) {
            return 0;
        }
        return Math.max(0, p.stock);
    }

    function nivelParaCantidad(total) {
        var u = niveles();
        if (total >= u.altoMin) return "alto";
        if (total >= u.medioMin) return "medio";
        return "bajo";
    }

    function textoUnidad(n, singular, plural) {
        return n === 1 ? singular : plural;
    }

    function idDesdeOnclick(el) {
        if (!el || !el.getAttribute) return null;
        var oc = el.getAttribute("onclick") || "";
        var m = oc.match(/agregarCarrito\s*\(\s*(\d+)\s*\)/);
        return m ? parseInt(m[1], 10) : null;
    }

    function resolverIdProducto(stockEl) {
        var n = stockEl;
        for (var i = 0; i < 18 && n; i++) {
            if (n.classList && n.classList.contains("categoria-card")) {
                return null;
            }
            if (
                n.classList &&
                (n.classList.contains("producto-card") ||
                    n.classList.contains("modal-content"))
            ) {
                var nodes = n.querySelectorAll("[onclick*='agregarCarrito']");
                for (var j = 0; j < nodes.length; j++) {
                    var id = idDesdeOnclick(nodes[j]);
                    if (id != null) return id;
                }
                return null;
            }
            n = n.parentElement;
        }
        return null;
    }

    function inyectarEstilos() {
        if (document.getElementById("pvm-stock-niveles-style")) return;
        var s = document.createElement("style");
        s.id = "pvm-stock-niveles-style";
        s.textContent =
            "p.stock.stock--alto{color:#146c43!important;font-weight:600;background:rgba(25,135,84,.12)!important;border-radius:.5rem;padding:.45rem .65rem;display:inline-flex;align-items:center;gap:.45rem;margin-bottom:.75rem;}" +
            "p.stock.stock--medio{color:#b26a00!important;font-weight:600;background:rgba(255,193,7,.14)!important;border-radius:.5rem;padding:.45rem .65rem;display:inline-flex;align-items:center;gap:.45rem;margin-bottom:.75rem;}" +
            "p.stock.stock--bajo{color:#b02a37!important;font-weight:600;background:rgba(220,53,69,.12)!important;border-radius:.5rem;padding:.45rem .65rem;display:inline-flex;align-items:center;gap:.45rem;margin-bottom:.75rem;}" +
            "p.stock.stock--alto i,p.stock.stock--medio i,p.stock.stock--bajo i{font-size:1rem;}" +
            "p.stock .pvm-stock-num{font-weight:800;}";
        document.head.appendChild(s);
    }

    function textoStock(total, nivel) {
        if (total <= 0) {
            return '<i class="fa-solid fa-circle-xmark"></i> Sin unidades disponibles';
        }
        var icon =
            nivel === "alto"
                ? "fa-boxes-stacked"
                : nivel === "medio"
                  ? "fa-triangle-exclamation"
                  : "fa-circle-exclamation";
        var leyenda = nivel === "alto" ? "Buen inventario" : "Inventario";
        return (
            '<i class="fa-solid ' +
            icon +
            '"></i> ' +
            leyenda +
            ': <span class="pvm-stock-num">' +
            total +
            "</span> " +
            textoUnidad(total, "unidad total", "unidades totales")
        );
    }

    function aplicarMapa(mapa) {
        var lista = document.querySelectorAll("p.stock");
        for (var i = 0; i < lista.length; i++) {
            var el = lista[i];
            var id = resolverIdProducto(el);
            if (id == null) continue;
            var prod = mapa[id];
            if (!prod) continue;
            var total = cantidadTotal(prod);
            var nivel = nivelParaCantidad(total);
            el.classList.remove("stock--alto", "stock--medio", "stock--bajo");
            el.classList.add("stock--" + nivel);
            el.innerHTML = textoStock(total, nivel);
            el.setAttribute("data-pvm-stock-n", String(total));
        }
    }

    function mensajeFalloProductos(status, body) {
        var code = body && body.error && body.error.code;
        var msg = body && body.error && body.error.message;
        var base =
            msg ||
            "No se pudo cargar el inventario desde el servidor (HTTP " +
                (status || "?") +
                ").";
        if (code) {
            return base + " [" + code + "]";
        }
        if (status === 400) {
            return (
                base +
                " Revisa la URL de la API (window.PVM_API) o los parámetros enviados."
            );
        }
        if (status === 0 || status >= 500) {
            return (
                base +
                " Comprueba que el backend esté en ejecución y la base de datos accesible."
            );
        }
        return base;
    }

    function notificarErrorStock(texto) {
        if (window.__pvmStockErrorShown) return;
        window.__pvmStockErrorShown = true;
        if (typeof Swal !== "undefined") {
            Swal.fire({
                icon: "warning",
                title: "Inventario en vivo",
                text: texto,
                confirmButtonColor: "#c9a227",
            });
            return;
        }
        try {
            console.warn("[PVM stock-tienda]", texto);
        } catch (e) {
            /* ignore */
        }
    }

    async function refrescarStockDesdeApi() {
        inyectarEstilos();
        try {
            var r = await fetch(apiRoot() + "/productos", {
                credentials: "same-origin",
            });
            var text = await r.text();
            var body = {};
            try {
                body = text ? JSON.parse(text) : {};
            } catch (e) {
                body = { raw: text };
            }
            if (!r.ok) {
                notificarErrorStock(mensajeFalloProductos(r.status, body));
                return;
            }
            var arr = [];
            if (body && Array.isArray(body.data)) arr = body.data;
            else if (Array.isArray(body)) arr = body;
            else if (body && body.productos && Array.isArray(body.productos)) {
                arr = body.productos;
            }
            var mapa = {};
            for (var i = 0; i < arr.length; i++) {
                var p = arr[i];
                var id = p.id_producto != null ? p.id_producto : p.id;
                if (id != null) mapa[id] = p;
            }
            aplicarMapa(mapa);
        } catch (e) {
            notificarErrorStock(
                "Error de red al consultar productos: " +
                    (e && e.message ? e.message : "desconocido")
            );
        }
    }

    async function init() {
        await refrescarStockDesdeApi();

        window.addEventListener("pvm:stock-refresh", function () {
            void refrescarStockDesdeApi();
        });

        window.setInterval(function () {
            void refrescarStockDesdeApi();
        }, 12000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            void init();
        });
    } else {
        void init();
    }
})();
