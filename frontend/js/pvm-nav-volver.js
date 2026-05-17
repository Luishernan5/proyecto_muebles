/**
 * Barra "Volver" en páginas de categorías (pages/camas|comedor|muebles).
 * Hub: vuelve al inicio. Subpágina: vuelve al listado de la categoría.
 */
(function () {
    "use strict";

    function detectar() {
        var path = (window.location.pathname || "").replace(/\\/g, "/");
        var m = path.match(/pages\/(camas|comedor|muebles)\/([^/?#]+)$/i);
        if (!m) {
            var href = (window.location.href || "").replace(/\\/g, "/");
            m = href.match(/pages\/(camas|comedor|muebles)\/([^/?#]+)$/i);
        }
        if (!m) {
            return null;
        }
        return {
            section: m[1].toLowerCase(),
            file: decodeURIComponent(m[2]).toLowerCase(),
        };
    }

    function baseHref() {
        var b = window.PVM_BASE_PATH;
        if (typeof b === "string" && b.length) {
            return b.replace(/\/?$/, "/");
        }
        return "/";
    }

    function asegurarEstilos() {
        if (document.getElementById("pvm-nav-volver-style")) {
            return;
        }
        var st = document.createElement("style");
        st.id = "pvm-nav-volver-style";
        st.textContent =
            "#pvm-volver-categoria{background:#0d0d0d;border-bottom:1px solid rgba(255,255,255,.12);position:sticky;top:0;z-index:1030}" +
            "#pvm-volver-categoria .pvm-volver-categoria__link{color:#f0f0f0;text-decoration:none;font-weight:500;font-size:.9rem;display:inline-flex;align-items:center}" +
            "#pvm-volver-categoria .pvm-volver-categoria__link:hover{color:#ffc107}";
        document.head.appendChild(st);
    }

    function insertarBarra() {
        var info = detectar();
        if (!info) {
            return;
        }

        var hubs = {
            camas: "camas.html",
            comedor: "comedor.html",
            muebles: "muebles.html",
        };
        var hubFile = hubs[info.section];
        if (!hubFile) {
            return;
        }

        var isHub = info.file === hubFile.toLowerCase();
        var href;
        if (window.location.protocol === "file:") {
            href = isHub ? "../../index.html" : hubFile;
        } else {
            var root = baseHref();
            href = isHub ? root : root + "pages/" + info.section + "/" + hubFile;
        }
        var texto = isHub
            ? "Volver al inicio"
            : info.section === "camas"
              ? "Volver a Camas"
              : info.section === "comedor"
                ? "Volver a Comedor"
                : "Volver a Muebles";

        if (document.getElementById("pvm-volver-categoria")) {
            return;
        }

        asegurarEstilos();

        var bar = document.createElement("div");
        bar.id = "pvm-volver-categoria";
        bar.className = "pvm-volver-categoria";
        bar.setAttribute("role", "navigation");
        bar.setAttribute("aria-label", "Navegación secundaria");
        bar.innerHTML =
            '<div class="container py-2">' +
            '<a href="' +
            href +
            '" class="pvm-volver-categoria__link">' +
            '<i class="fa-solid fa-arrow-left me-2" aria-hidden="true"></i>' +
            texto +
            "</a></div>";

        var nav = document.querySelector("nav.navbar");
        if (nav && nav.parentNode) {
            nav.parentNode.insertBefore(bar, nav);
        } else {
            document.body.insertBefore(bar, document.body.firstChild);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", insertarBarra);
    } else {
        insertarBarra();
    }

    // Asegurar un único enlace de 'Iniciar sesión' en páginas cliente (no admin).
    function insertarLoginLinkSiFalta() {
        try {
            var path = (window.location.pathname || "").replace(/\\/g, "/");
            if (/^\/pages\/admin\//i.test(path)) return;
            var nav = document.querySelector("nav.navbar");
            if (!nav) return;
            // buscar links existentes hacia login cliente
            var exists = nav.querySelector('a[href="/pages/login.html"], a[href="pages/login.html"], a[href="../login.html"], a[href="/login.html"], a[href="login.html"]');
            if (exists) return;
            var cont = nav.querySelector('.container') || nav;
            var a = document.createElement('a');
            a.href = '/pages/login.html';
            a.className = 'btn btn-outline-light btn-sm ms-auto';
            a.textContent = 'Iniciar sesión';
            // intentar insertar al final del contenedor
            cont.appendChild(a);
        } catch (e) {
            /* ignore */
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", insertarLoginLinkSiFalta);
    } else {
        insertarLoginLinkSiFalta();
    }
})();
