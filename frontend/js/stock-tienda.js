/**
 * Muestra stock real por producto (API) con semáforo: mucho = verde, medio = naranja, poco = rojo.
 * Opcional: window.PVM_STOCK_NIVELES = { altoMin: 15, medioMin: 4 };
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

    function cantidadMostrada(p) {
        if (!p) return 0;
        if (typeof p.disponible === "number" && !isNaN(p.disponible)) {
            return Math.max(0, p.disponible);
        }
        if (typeof p.stock === "number" && !isNaN(p.stock)) {
            return Math.max(0, p.stock);
        }
        return 0;
    }

    function nivelParaCantidad(n) {
        var u = niveles();
        if (n <= 0) return "bajo";
        if (n >= u.altoMin) return "alto";
        if (n >= u.medioMin) return "medio";
        return "bajo";
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
            "p.stock.stock--medio{color:#b45309!important;font-weight:600;background:rgba(245,158,11,.18)!important;border-radius:.5rem;padding:.45rem .65rem;display:inline-flex;align-items:center;gap:.45rem;margin-bottom:.75rem;}" +
            "p.stock.stock--bajo{color:#b42318!important;font-weight:600;background:rgba(220,53,69,.12)!important;border-radius:.5rem;padding:.45rem .65rem;display:inline-flex;align-items:center;gap:.45rem;margin-bottom:.75rem;}" +
            "p.stock.stock--alto i,p.stock.stock--medio i,p.stock.stock--bajo i{font-size:1rem;}" +
            "p.stock .pvm-stock-num{font-weight:800;}";
        document.head.appendChild(s);
    }

    function textoStock(n, nivel) {
        if (n <= 0) {
            return (
                '<i class="fa-solid fa-circle-xmark"></i> Sin unidades disponibles'
            );
        }
        var icon =
            nivel === "alto"
                ? "fa-boxes-stacked"
                : nivel === "medio"
                  ? "fa-triangle-exclamation"
                  : "fa-circle-exclamation";
        var leyenda =
            nivel === "alto"
                ? "Buen inventario"
                : nivel === "medio"
                  ? "Inventario medio"
                  : "Pocas unidades";
        return (
            '<i class="fa-solid ' +
            icon +
            '"></i> ' +
            leyenda +
            ': <span class="pvm-stock-num">' +
            n +
            "</span> uds. disponibles"
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
            var n = cantidadMostrada(prod);
            var nivel = nivelParaCantidad(n);
            el.classList.remove("stock--alto", "stock--medio", "stock--bajo");
            el.classList.add("stock--" + nivel);
            el.innerHTML = textoStock(n, nivel);
            el.setAttribute("data-pvm-stock-n", String(n));
        }
    }

    function init() {
        inyectarEstilos();
        fetch(apiRoot() + "/productos", { credentials: "same-origin" })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function (body) {
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
            })
            .catch(function () {
                /* deja el texto estático de la página */
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
