/**
 * Punto Venta Muebles — carrito con API Node + SQL Server
 *
 * Config (opcional):
 *   window.PVM_API = '/api';
 *   window.PVM_APP_CONTEXT = 'tienda_cliente' | 'tienda_admin' (panel abasto; si eres admin por JWT también se usa abasto en catálogo).
 *   window.PVM_IMAGEN_POR_PRODUCTO = { 1: '/img/mi-foto.jpg', ... };
 *
 * Finalizar: POST /api/carrito/compra (cliente/invitado) o POST /api/carrito/abasto (admin).
 * API pública:
 *   agregarCarrito(idProducto [, cantidad])
 *   eliminarProducto(idCarrito)
 *   cambiarCantidadLinea(idCarrito, delta)
 *   establecerCantidadLinea(idCarrito, cantidad)
 *   actualizarCarrito()
 *   vaciarCarrito()
 *   pvmVolverAtras() — regresa con history.back() o cierra el carrito
 */

(function () {
    "use strict";

    var SESSION_KEY = "pvm_session_id_v2";
    var JWT_KEY = "pvm_jwt";
    var SESSION_MIN = 8;
    var SESSION_MAX = 100;

    /** Miniaturas reales (mismas rutas que en las páginas HTML). Rutas absolutas desde la raíz del sitio. */
    var IMG = "/img/";
    var IMAGEN_POR_PRODUCTO = {
        1: IMG + "camas/individual/Cama1.jpg",
        2: IMG + "camas/individual/Cama2.jpg",
        3: IMG + "camas/individual/Cama3.jpg",
        4: IMG + "camas/individual/Cama4.jpg",
        5: IMG + "camas/individual/Cama5.jpg",
        6: IMG + "camas/king_size/Cama1.jpg",
        7: IMG + "camas/king_size/Cama2.jpg",
        8: IMG + "camas/king_size/Cama3.jpg",
        9: IMG + "camas/king_size/Cama4.jpg",
        10: IMG + "camas/king_size/Cama5.jpg",
        11: IMG + "camas/matrimonial/Cama1.jpg",
        12: IMG + "camas/matrimonial/Cama2.jpg",
        13: IMG + "camas/matrimonial/Cama3.jpg",
        14: IMG + "camas/matrimonial/Cama4.jpg",
        15: IMG + "camas/matrimonial/Cama5.jpg",
        16: IMG + "Comedor/Comedor%20familiar/1.jpg",
        17: IMG + "Comedor/Mesa%20de%20Centro/1.webp",
        18: IMG + "Comedor/Sillas/silla%20comedor/1.jpg",
        19: IMG + "Comedor/Mesa%20de%20Centro/4.1.jpg",
        20: IMG + "Comedor/Comedor%20familiar/5.jpg",
        21: IMG + "muebles/alacenas/1.jpg",
        22: IMG + "muebles/alacenas/2.jpg",
        23: IMG + "muebles/alacenas/3.jpg",
        24: IMG + "muebles/alacenas/4.jpg",
        25: IMG + "muebles/alacenas/5.jpg",
        26: IMG + "muebles/buros/1.jpg",
        27: IMG + "muebles/buros/2.jpg",
        28: IMG + "muebles/buros/3.jpg",
        29: IMG + "muebles/buros/4.jpg",
        30: IMG + "muebles/buros/5.jpg",
        31: IMG + "muebles/closets/1.jpg",
        32: IMG + "muebles/closets/2.jpg",
        33: IMG + "muebles/closets/3.jpg",
        34: IMG + "muebles/closets/4.jpg",
        35: IMG + "muebles/closets/5.jpg",
        36: IMG + "muebles/escritorios/1.jpg",
        37: IMG + "muebles/escritorios/2.jpg",
        38: IMG + "muebles/escritorios/3.jpg",
        39: IMG + "muebles/escritorios/4.jpg",
        40: IMG + "muebles/escritorios/5.jpg",
        41: IMG + "muebles/estantes/1.jpg",
        42: IMG + "muebles/estantes/2.jpg",
        43: IMG + "muebles/estantes/3.jpg",
        44: IMG + "muebles/estantes/4.jpg",
        45: IMG + "muebles/estantes/5.jpg",
        46: IMG + "muebles/muebles_tv/1.jpg",
        47: IMG + "muebles/muebles_tv/2.jpg",
        48: IMG + "muebles/muebles_tv/3.jpg",
        49: IMG + "muebles/muebles_tv/4.jpg",
        50: IMG + "muebles/muebles_tv/5.jpg",
        51: IMG + "muebles/tocadores/1.jpg",
        52: IMG + "muebles/tocadores/2.jpg",
        53: IMG + "muebles/tocadores/3.jpg",
        54: IMG + "muebles/tocadores/4.jpg",
        55: IMG + "muebles/tocadores/5.jpg",
    };

    function apiRoot() {
        var raw =
            typeof window.PVM_API !== "undefined" && window.PVM_API
                ? String(window.PVM_API)
                : "/api";
        return raw.replace(/\/$/, "");
    }

    function getSessionId() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            var s = raw ? String(raw).trim() : "";
            if (s.length >= SESSION_MIN && s.length <= SESSION_MAX) {
                return s;
            }
            if (s) {
                try {
                    localStorage.removeItem(SESSION_KEY);
                } catch (e2) {
                    /* ignore */
                }
            }
            s =
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : "pvm-" + Date.now() + "-" + Math.random().toString(36).slice(2);
            if (s.length > SESSION_MAX) {
                s = s.slice(0, SESSION_MAX);
            }
            localStorage.setItem(SESSION_KEY, s);
            return s;
        } catch (e) {
            var fb = "pvm-fallback-" + Date.now();
            return fb.length > SESSION_MAX ? fb.slice(0, SESSION_MAX) : fb;
        }
    }

    function rolDesdeJwt() {
        try {
            var tok = localStorage.getItem(JWT_KEY);
            if (!tok) return "";
            var parts = tok.split(".");
            if (parts.length < 2) return "";
            var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4) b64 += "=";
            var j = JSON.parse(atob(b64));
            return String(j.rol || "").toLowerCase();
        } catch (e) {
            return "";
        }
    }

    function appContext() {
        return String(window.PVM_APP_CONTEXT || "tienda_cliente").toLowerCase();
    }

    /** Carrito de abasto: panel admin explícito o sesión JWT con rol admin (p. ej. catálogo enlazado). */
    function esModoAbasto() {
        if (appContext() === "tienda_admin") {
            return true;
        }
        return rolDesdeJwt() === "admin";
    }

    var MSJ_CODIGO_API = {
        SESSION_REQUIRED:
            "El servidor no recibió el identificador de sesión del carrito. Recarga la página o borra datos del sitio para este dominio y vuelve a intentar.",
        SESSION_INVALID:
            "El identificador de sesión guardado no es válido (debe tener entre 8 y 100 caracteres). Se ha generado uno nuevo; vuelve a intentar.",
        EMPTY_CART: "El carrito está vacío. Agrega productos antes de finalizar.",
        USE_ABASTO_ENDPOINT:
            "Como administrador debes usar el apartado de abasto y el botón de entrada a inventario.",
        FORBIDDEN: "No tienes permiso para esta acción. Inicia sesión con la cuenta adecuada.",
        LOGIN_REQUIRED: "Inicia sesión como cliente para completar la compra.",
        INVALID_PRODUCT: "Producto no válido. Revisa el id del artículo.",
        INVALID_QUANTITY: "Cantidad no válida.",
        MAX_LINEA: "Superaste el máximo de unidades permitidas por producto en el carrito.",
        MAX_QUANTITY_EXCEEDED:
            "La cantidad supera el máximo permitido por producto en el carrito.",
        INSUFFICIENT_STOCK: "No hay suficiente stock disponible para esa cantidad.",
        CHECKOUT_STOCK: "No se pudo completar la venta por falta de inventario.",
        ABASTO_STOCK_CAP: "El abasto superaría el inventario máximo permitido. Reduce cantidades.",
    };

    function mensajeErrorApi(err) {
        var c = err && err.code ? String(err.code) : "";
        var base = err && err.message ? String(err.message) : "Error desconocido";
        if (c && MSJ_CODIGO_API[c]) {
            return MSJ_CODIGO_API[c] + " (" + c + ")";
        }
        if (c) {
            return base + " [" + c + "]";
        }
        if (err && err.status) {
            if (err.status === 400 && !c) {
                return (
                    base +
                    " Si el problema continúa, recarga la página o revisa que el servidor esté en marcha. (HTTP 400)"
                );
            }
            return base + " (HTTP " + err.status + ")";
        }
        return base;
    }

    function formatoPrecio(n) {
        return Number(n).toLocaleString("es-MX", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/"/g, "&quot;");
    }

    function ensureModalFocusSentinel() {
        var sentinel = document.getElementById("pvm-modal-focus-sentinel");
        if (sentinel) {
            return sentinel;
        }
        sentinel = document.createElement("button");
        sentinel.type = "button";
        sentinel.id = "pvm-modal-focus-sentinel";
        sentinel.tabIndex = -1;
        sentinel.style.position = "fixed";
        sentinel.style.width = "1px";
        sentinel.style.height = "1px";
        sentinel.style.padding = "0";
        sentinel.style.border = "0";
        sentinel.style.overflow = "hidden";
        sentinel.style.clip = "rect(0 0 0 0)";
        sentinel.style.whiteSpace = "nowrap";
        sentinel.style.left = "-9999px";
        sentinel.style.top = "0";
        if (document.body) {
            document.body.appendChild(sentinel);
        }
        return sentinel;
    }

    function tryFocus(el) {
        if (!el || typeof el.focus !== "function") {
            return false;
        }
        try {
            el.focus({ preventScroll: true });
            return true;
        } catch (e1) {
            try {
                el.focus();
                return true;
            } catch (e2) {
                return false;
            }
        }
    }

    function prepararFocoParaSwal() {
        var canvas = document.getElementById("carritoCanvas");
        var ae = document.activeElement;
        var focoEnCanvas = Boolean(
            canvas &&
                ae &&
                typeof canvas.contains === "function" &&
                canvas.contains(ae)
        );

        if (focoEnCanvas) {
            if (ae && typeof ae.blur === "function") {
                try {
                    ae.blur();
                } catch (e0) {
                    /* ignore */
                }
            }

            var targetFuera =
                document.querySelector(
                    'button.carrito-flotante[data-bs-target="#carritoCanvas"]'
                ) ||
                document.querySelector(
                    '[data-bs-toggle="offcanvas"][data-bs-target="#carritoCanvas"]'
                ) ||
                document.getElementById("btn-cerrar-admin") ||
                ensureModalFocusSentinel() ||
                document.body;

            tryFocus(targetFuera);

            if (canvas && !canvas.hasAttribute("inert")) {
                canvas.setAttribute("inert", "");
                canvas.setAttribute("data-pvm-swal-inert", "1");
            }
            return;
        }

        var app = document.getElementById("pvm-admin-app");
        if (app && ae && typeof app.contains === "function" && app.contains(ae)) {
            tryFocus(ensureModalFocusSentinel() || document.body);
        }
    }

    function restaurarFocoTrasSwal() {
        var canvas = document.getElementById("carritoCanvas");
        if (!canvas) {
            return;
        }
        if (canvas.getAttribute("data-pvm-swal-inert") === "1") {
            canvas.removeAttribute("data-pvm-swal-inert");
            canvas.removeAttribute("inert");
        }
    }

    function toastSwal(opts) {
        if (typeof Swal === "undefined") {
            return;
        }
        prepararFocoParaSwal();

        var cfg = Object.assign({}, opts || {});
        var prevWillOpen = cfg.willOpen;
        var prevDidOpen = cfg.didOpen;
        var prevDidClose = cfg.didClose;

        cfg.returnFocus = false;
        cfg.willOpen = function (popup) {
            prepararFocoParaSwal();
            if (typeof prevWillOpen === "function") {
                prevWillOpen(popup);
            }
        };
        cfg.didOpen = function (popup) {
            if (typeof Swal.getConfirmButton === "function") {
                var btn = Swal.getConfirmButton();
                if (!tryFocus(btn) && popup) {
                    tryFocus(popup);
                }
            }
            if (typeof prevDidOpen === "function") {
                prevDidOpen(popup);
            }
        };
        cfg.didClose = function (popup) {
            restaurarFocoTrasSwal();
            if (typeof prevDidClose === "function") {
                prevDidClose(popup);
            }
        };

        return Swal.fire(cfg);
    }

    function mostrarAdvertencias(warnings) {
        if (!warnings || !warnings.length || typeof Swal === "undefined") {
            return;
        }
        warnings.forEach(function (w) {
            toastSwal({
                icon: "warning",
                title: "Aviso de inventario",
                text: w,
                timer: 4200,
                showConfirmButton: true,
                confirmButtonColor: "#c9a227",
            });
        });
    }

    function emitirStockRefresh() {
        try {
            window.dispatchEvent(new CustomEvent("pvm:stock-refresh"));
        } catch (e) {
            /* ignore */
        }
    }

    function aplicarUiCarritoPorContexto() {
        try {
            var canvas = document.getElementById("carritoCanvas");
            if (esModoAbasto()) {
                document.body.classList.add("pvm-tienda-admin");
                document.body.classList.remove("pvm-tienda-cliente");
                if (!canvas) {
                    return;
                }
                var h = canvas.querySelector(".offcanvas-header h4");
                if (h) {
                    h.innerHTML =
                        '<i class="fa-solid fa-dolly"></i> Carrito de abasto';
                }
                var btnFin = canvas.querySelector(
                    'button[onclick="finalizarCompra()"]'
                );
                if (btnFin) {
                    btnFin.textContent = "Registrar entrada a inventario";
                }
            } else {
                document.body.classList.add("pvm-tienda-cliente");
                document.body.classList.remove("pvm-tienda-admin");
            }
        } catch (e) {
            /* ignore */
        }
    }

    function request(path, options, intentoRetry) {
        var url = apiRoot() + path;
        var opts = options ? Object.assign({}, options) : {};
        opts.headers = Object.assign({}, opts.headers || {});
        opts.headers["X-Session-Id"] = getSessionId();
        var metodo = String(opts.method || "GET").toUpperCase();
        if (metodo !== "GET" && metodo !== "HEAD") {
            opts.headers["Content-Type"] =
                opts.headers["Content-Type"] || "application/json";
        }
        try {
            var tok = localStorage.getItem(JWT_KEY);
            if (tok && tok.length > 10) {
                opts.headers.Authorization = "Bearer " + tok;
            }
        } catch (e) {
            /* ignore */
        }
        return fetch(url, opts).then(function (res) {
            return res.text().then(function (text) {
                var body;
                try {
                    body = text ? JSON.parse(text) : {};
                } catch (e) {
                    body = { raw: text };
                }
                if (!res.ok) {
                    var msg =
                        (body.error && body.error.message) ||
                        "Error " + res.status;
                    var err = new Error(msg);
                    err.status = res.status;
                    err.body = body;
                    err.code =
                        body.error && body.error.code
                            ? String(body.error.code)
                            : undefined;
                    var reintentar =
                        !intentoRetry &&
                        (err.code === "SESSION_INVALID" ||
                            err.code === "SESSION_REQUIRED");
                    if (reintentar) {
                        try {
                            localStorage.removeItem(SESSION_KEY);
                        } catch (e3) {
                            /* ignore */
                        }
                        return request(path, options, true);
                    }
                    throw err;
                }
                return body;
            });
        });
    }

    function imagenSrc(imagenUrl, idProducto) {
        var mapa =
            typeof window.PVM_IMAGEN_POR_PRODUCTO === "object" &&
            window.PVM_IMAGEN_POR_PRODUCTO
                ? window.PVM_IMAGEN_POR_PRODUCTO
                : IMAGEN_POR_PRODUCTO;
        var id = parseInt(idProducto, 10);
        if (!isNaN(id) && mapa[id]) {
            return mapa[id];
        }
        if (!imagenUrl) {
            return "";
        }
        if (/^https?:\/\//i.test(imagenUrl)) {
            return imagenUrl;
        }
        var p = String(imagenUrl).replace(/^\//, "");
        if (p.indexOf("..") !== -1) {
            return "";
        }
        return "/" + p;
    }

    window.actualizarCarrito = function () {
        void (async function () {
            var lista = document.getElementById("lista-carrito");
            var subtotalEl = document.getElementById("subtotal");
            var ivaEl = document.getElementById("iva");
            var totalEl = document.getElementById("total");
            var contadores = document.querySelectorAll("[data-carrito-contador]");

            try {
                var resp = await request("/carrito", { method: "GET" });
                var data = resp.data || {};
                var lineas = data.lineas || [];
                var subtotal = data.subtotal != null ? data.subtotal : 0;
                var iva = data.iva != null ? data.iva : 0;
                var total = data.total != null ? data.total : 0;

                if (subtotalEl) {
                    subtotalEl.textContent = formatoPrecio(subtotal);
                }
                if (ivaEl) {
                    ivaEl.textContent = formatoPrecio(iva);
                }
                if (totalEl) {
                    totalEl.textContent = formatoPrecio(total);
                }

                var count = lineas.reduce(function (a, L) {
                    return a + (L.cantidad || 0);
                }, 0);
                contadores.forEach(function (el) {
                    el.textContent = String(count);
                });

                var legacy = document.getElementById("contador");
                if (legacy && !legacy.hasAttribute("data-carrito-contador")) {
                    legacy.textContent = String(count);
                }

                if (!lista) {
                    return;
                }

                if (lineas.length === 0) {
                    lista.innerHTML =
                        '<p class="text-muted text-center py-4 mb-0">' +
                        (esModoAbasto()
                            ? "Tu carrito de abasto está vacío."
                            : "Tu carrito está vacío.") +
                        "</p>";
                    return;
                }

                lista.innerHTML = lineas
                    .map(function (L) {
                        var imgUrl = imagenSrc(L.imagen_url, L.id_producto);
                        var idC = L.id_carrito;
                        var phId = "pvm-cart-ph-" + idC;
                        var imgBlock = imgUrl
                            ? '<div class="cart-thumb-wrap flex-shrink-0 position-relative" style="width:72px;height:72px;min-width:72px">' +
                              '<img src="' +
                              escapeHtml(imgUrl) +
                              '" alt="" class="cart-thumb rounded-2 position-absolute top-0 start-0 w-100 h-100" style="object-fit:cover" onerror="this.classList.add(\'d-none\');var el=document.getElementById(\'' +
                              phId +
                              '\');if(el){el.classList.remove(\'d-none\');el.classList.add(\'d-flex\');}">' +
                              '<div id="' +
                              phId +
                              '" class="cart-thumb-placeholder rounded-2 align-items-center justify-content-center d-none position-absolute top-0 start-0 w-100 h-100"><i class="fa-solid fa-couch" aria-hidden="true"></i></div></div>'
                            : '<div class="cart-thumb-placeholder flex-shrink-0 rounded-2 d-flex align-items-center justify-content-center" style="width:72px;height:72px;min-width:72px"><i class="fa-solid fa-couch" aria-hidden="true"></i></div>';
                        var maxC = L.max_en_carrito != null ? L.max_en_carrito : 30;
                        var metaLinea = esModoAbasto()
                            ? "Stock actual: " +
                              L.stock +
                              " uds. · Con esta entrada: " +
                              (L.stock + L.cantidad) +
                              " uds. (respeta tope del servidor)"
                            : "En inventario: " +
                              L.stock +
                              " · Libres (no reservadas): " +
                              L.disponible_global;
                        var maxLabel = esModoAbasto()
                            ? "Máx. por línea (abasto): "
                            : "Máx. en carrito: ";
                        return (
                            '<div class="card border-0 shadow-sm mb-3 cart-line" data-id-carrito="' +
                            idC +
                            '">' +
                            '<div class="card-body p-3">' +
                            '<div class="d-flex gap-3 align-items-center">' +
                            imgBlock +
                            '<div class="flex-grow-1 min-w-0">' +
                            '<h6 class="fw-bold mb-1 text-truncate">' +
                            escapeHtml(L.nombre) +
                            "</h6>" +
                            '<p class="precio mb-1">$' +
                            formatoPrecio(L.precio) +
                            ' <span class="text-muted small fw-normal">MXN</span> × ' +
                            L.cantidad +
                            "</p>" +
                            '<p class="small text-muted mb-2">' +
                            metaLinea +
                            "</p>" +
                            '<div class="d-flex flex-wrap align-items-center gap-2">' +
                            '<div class="btn-group" role="group" aria-label="Cantidad">' +
                            '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="cambiarCantidadLinea(' +
                            idC +
                            ",-1)\" aria-label=\"Menos\">−</button>" +
                            '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="cambiarCantidadLinea(' +
                            idC +
                            ",1)\" aria-label=\"Más\">+</button>" +
                            "</div>" +
                            '<span class="small text-muted">' +
                            maxLabel +
                            maxC +
                            "</span>" +
                            '<button type="button" class="btn btn-sm btn-outline-danger ms-auto" onclick="eliminarProducto(' +
                            idC +
                            ')" aria-label="Eliminar del carrito">' +
                            '<i class="fa-solid fa-trash"></i></button>' +
                            "</div></div></div></div></div>"
                        );
                    })
                    .join("");
            } catch (err) {
                if (lista) {
                    lista.innerHTML =
                        '<p class="text-danger small mb-0">No se pudo cargar el carrito. (' +
                        escapeHtml(mensajeErrorApi(err)) +
                        ")</p>";
                }
                toastSwal({
                    icon: "error",
                    title: "Error de conexión",
                    text: mensajeErrorApi(err),
                    confirmButtonColor: "#c9a227",
                });
            }
        })();
    };

    function esIdProducto(v) {
        if (typeof v === "number" && Number.isInteger(v) && v > 0) {
            return true;
        }
        if (typeof v === "string" && /^\d+$/.test(v.trim())) {
            return parseInt(v.trim(), 10) > 0;
        }
        return false;
    }

    /**
     * @param {number|string} idProducto
     * @param {number} [cantidad]
     */
    window.agregarCarrito = function (idProducto, cantidad) {
        if (!esIdProducto(idProducto)) {
            toastSwal({
                icon: "error",
                title: "Acción no válida",
                html:
                    "Debes usar el <strong>id de producto</strong> numérico de la base de datos.<br>Ejemplo: <code>agregarCarrito(1)</code>",
                confirmButtonColor: "#c9a227",
            });
            return;
        }
        var id = parseInt(String(idProducto), 10);
        var qty = cantidad != null ? parseInt(cantidad, 10) : 1;
        if (isNaN(qty) || qty < 1) {
            qty = 1;
        }

        request("/carrito/items", {
            method: "POST",
            body: JSON.stringify({
                id_producto: id,
                cantidad: qty,
            }),
        })
            .then(function (resp) {
                if (resp.data && resp.data.warnings && resp.data.warnings.length) {
                    mostrarAdvertencias(resp.data.warnings);
                }
                toastSwal({
                    icon: "success",
                    title: esModoAbasto()
                        ? "Línea de abasto agregada"
                        : "Producto agregado",
                    timer: 1200,
                    showConfirmButton: false,
                });
                actualizarCarrito();
            })
            .catch(function (err) {
                toastSwal({
                    icon: err.status === 409 ? "warning" : "error",
                    title: "No se pudo agregar",
                    text: mensajeErrorApi(err),
                    confirmButtonColor: "#c9a227",
                });
            });
    };

    window.eliminarProducto = function (idCarrito) {
        var id = parseInt(idCarrito, 10);
        if (isNaN(id)) {
            return;
        }
        request("/carrito/items/" + id, { method: "DELETE" })
            .then(function () {
                toastSwal({
                    icon: "info",
                    title: "Producto eliminado",
                    timer: 1000,
                    showConfirmButton: false,
                });
                actualizarCarrito();
            })
            .catch(function (err) {
                toastSwal({
                    icon: "error",
                    title: "Error",
                    text: err.message,
                    confirmButtonColor: "#c9a227",
                });
            });
    };

    window.cambiarCantidadLinea = function (idCarrito, delta) {
        var id = parseInt(idCarrito, 10);
        var d = parseInt(delta, 10);
        if (isNaN(id) || isNaN(d) || d === 0) {
            return;
        }
        var line = document.querySelector('[data-id-carrito="' + id + '"]');
        var text = line ? line.textContent : "";
        var m = text.match(/×\s*(\d+)/);
        var actual = m ? parseInt(m[1], 10) : 1;
        var nueva = actual + d;
        if (nueva < 1) {
            toastSwal({
                icon: "warning",
                title: "Cantidad mínima 1",
                text: "Usa la papelera para quitar el producto.",
                timer: 2000,
                showConfirmButton: false,
            });
            return;
        }
        establecerCantidadLinea(id, nueva);
    };

    window.establecerCantidadLinea = function (idCarrito, cantidad) {
        var id = parseInt(idCarrito, 10);
        var c = parseInt(cantidad, 10);
        if (isNaN(id) || isNaN(c) || c < 1) {
            return;
        }
        request("/carrito/items/" + id, {
            method: "PATCH",
            body: JSON.stringify({ cantidad: c }),
        })
            .then(function () {
                actualizarCarrito();
            })
            .catch(function (err) {
                toastSwal({
                    icon: "warning",
                    title: "No se pudo actualizar",
                    text: err.message,
                    confirmButtonColor: "#c9a227",
                });
                actualizarCarrito();
            });
    };

    window.vaciarCarrito = function () {
        request("/carrito", { method: "DELETE" })
            .then(function () {
                toastSwal({
                    icon: "warning",
                    title: "Carrito vaciado",
                    timer: 1000,
                    showConfirmButton: false,
                });
                actualizarCarrito();
            })
            .catch(function (err) {
                toastSwal({
                    icon: "error",
                    title: "Error",
                    text: err.message,
                    confirmButtonColor: "#c9a227",
                });
            });
    };

    window.finalizarCompra = function () {
        void (async function () {
            var path = esModoAbasto() ? "/carrito/abasto" : "/carrito/compra";
            try {
                var cartaRes = await request("/carrito", { method: "GET" });
                var dCart = cartaRes && cartaRes.data ? cartaRes.data : {};
                var items = Array.isArray(dCart.items)
                    ? dCart.items
                    : Array.isArray(dCart.lineas)
                      ? dCart.lineas
                      : [];
                if (!items || items.length === 0) {
                    toastSwal({
                        icon: "info",
                        title: "Carrito vacío",
                        text: "Agrega productos al carrito antes de finalizar.",
                        confirmButtonColor: "#c9a227",
                    });
                    return;
                }
                
                var resp = await request(path, { method: "POST", body: "{}" });
                var d = resp.data || {};
                var msg = d.message || "Operación registrada.";
                var titulo = "Listo";
                var warnings = Array.isArray(d.warnings) ? d.warnings : [];
                if (d.modo === "abasto_admin") {
                    titulo = "Abasto registrado";
                } else if (d.modo === "venta_cliente") {
                    titulo = "Compra realizada";
                } else if (esModoAbasto()) {
                    titulo = "Abasto registrado";
                } else {
                    titulo = "Compra realizada";
                }
                toastSwal({
                    icon: warnings.length ? "warning" : "success",
                    title: titulo,
                    text: msg,
                    confirmButtonColor: "#c9a227",
                });
                if (warnings.length) {
                    mostrarAdvertencias(warnings);
                }
                actualizarCarrito();
                if (esModoAbasto()) {
                    emitirStockRefresh();
                }
            } catch (err) {
                var st = err.status;
                var icon = st === 409 || st === 403 ? "warning" : "error";
                var tituloErr = esModoAbasto()
                    ? "No se pudo registrar el abasto"
                    : "No se pudo finalizar la compra";
                if (err.code === "USE_ABASTO_ENDPOINT") {
                    tituloErr = "Flujo incorrecto";
                    icon = "warning";
                }
                toastSwal({
                    icon: icon,
                    title: tituloErr,
                    text: mensajeErrorApi(err),
                    confirmButtonColor: "#c9a227",
                });
            }
        })();
    };

    /**
     * Bootstrap aplica aria-hidden al cerrar el offcanvas; el foco debe estar fuera antes.
     * Esto previene el error de accesibilidad: "blocked aria-hidden on an element because its
     * descendant retained focus". Movemos el foco al botón de cierre o al disparador antes de
     * que Bootstrap aplique aria-hidden.
     */
    function moverFocoAntesCerrarCarrito() {
        var canvas = document.getElementById("carritoCanvas");
        if (!canvas) {
            return;
        }

        var ae = document.activeElement;
        if (
            !ae ||
            typeof canvas.contains !== "function" ||
            !canvas.contains(ae)
        ) {
            return;
        }

        var prioridad = [
            document.querySelector(
                'button.carrito-flotante[data-bs-target="#carritoCanvas"]'
            ),
            document.querySelector(
                '[data-bs-toggle="offcanvas"][data-bs-target="#carritoCanvas"]'
            ),
            document.querySelector("[data-bs-toggle='collapse']"),
            document.body
        ];

        for (var i = 0; i < prioridad.length; i++) {
            var target = prioridad[i];
            if (
                target &&
                !canvas.contains(target) &&
                typeof target.focus === "function"
            ) {
                try {
                    target.focus({ preventScroll: true });
                    return;
                } catch (e1) {
                    try {
                        target.focus();
                        return;
                    } catch (e2) {
                        /* ignore */
                    }
                }
            }
        }

        var ae = document.activeElement;
        if (
            ae &&
            canvas.contains(ae) &&
            typeof ae.blur === "function"
        ) {
            ae.blur();
        }
    }

    var pvmCarritoHideFocusInstalled = false;
    var pvmCarritoLastFocus = null;

    function getSafeFocusTarget(canvas) {
        if (pvmCarritoLastFocus && typeof pvmCarritoLastFocus.focus === "function") {
            if (!canvas || (typeof canvas.contains === "function" && !canvas.contains(pvmCarritoLastFocus))) {
                return pvmCarritoLastFocus;
            }
        }

        return (
            document.querySelector(
                'button.carrito-flotante[data-bs-target="#carritoCanvas"]'
            ) ||
            document.querySelector(
                '[data-bs-toggle="offcanvas"][data-bs-target="#carritoCanvas"]'
            ) ||
            document.getElementById("btn-cerrar-admin") ||
            document.body
        );
    }

    function focusOutsideCanvas(canvas) {
        var target = getSafeFocusTarget(canvas);
        if (target && typeof target.focus === "function") {
            try {
                target.focus({ preventScroll: true });
                return;
            } catch (e1) {
                try {
                    target.focus();
                    return;
                } catch (e2) {
                    /* ignore */
                }
            }
        }
        if (typeof document.body.focus === "function") {
            try {
                document.body.setAttribute("tabindex", "-1");
                document.body.focus({ preventScroll: true });
            } catch (e3) {
                /* ignore */
            }
        }
    }

    function instalarFocoAlOcultarCarrito() {
        if (pvmCarritoHideFocusInstalled) {
            return;
        }
        pvmCarritoHideFocusInstalled = true;
        var canvas = document.getElementById("carritoCanvas");
        if (!canvas) {
            return;
        }

        var manejarShow = function (ev) {
            var t = ev.target;
            if (!t || t.id !== "carritoCanvas") {
                return;
            }
            if (canvas && typeof canvas.removeAttribute === "function") {
                try {
                    canvas.removeAttribute("inert");
                } catch (e) {
                    /* ignore */
                }
            }
        };

        var manejarShown = function (ev) {
            var t = ev.target;
            if (!t || t.id !== "carritoCanvas") {
                return;
            }
            var ae = document.activeElement;
            if (ae && ae !== document.body && (!canvas.contains || !canvas.contains(ae))) {
                pvmCarritoLastFocus = ae;
            }
        };

        var manejarHide = function (ev) {
            var t = ev.target;
            if (!t || t.id !== "carritoCanvas") {
                return;
            }
            // Move focus out before Bootstrap toggles aria-hidden.
            moverFocoAntesCerrarCarrito();
            focusOutsideCanvas(canvas);
            if (canvas && typeof canvas.setAttribute === "function") {
                try {
                    canvas.setAttribute("inert", "");
                } catch (e) {
                    /* ignore */
                }
            }
        };

        var manejarHidden = function (ev) {
            var t = ev.target;
            if (!t || t.id !== "carritoCanvas") {
                return;
            }
            focusOutsideCanvas(canvas);
        };

        document.addEventListener("show.bs.offcanvas", manejarShow, true);
        document.addEventListener("shown.bs.offcanvas", manejarShown, true);
        document.addEventListener("hide.bs.offcanvas", manejarHide, true);
        document.addEventListener("hidden.bs.offcanvas", manejarHidden, true);
    }

    window.pvmVolverAtras = function () {
        if (window.history.length > 1) {
            moverFocoAntesCerrarCarrito();
            window.history.back();
            return;
        }
        var el = document.getElementById("carritoCanvas");
        if (typeof bootstrap !== "undefined" && el) {
            var inst = bootstrap.Offcanvas.getInstance(el);
            if (inst) {
                moverFocoAntesCerrarCarrito();
                inst.hide();
            }
        }
    };

    function injectCartBackButton() {
        var canvas = document.getElementById("carritoCanvas");
        if (!canvas) {
            return;
        }
        var header = canvas.querySelector(".offcanvas-header");
        if (!header || header.querySelector("[data-pvm-volver]")) {
            return;
        }
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-pvm-volver", "1");
        btn.className = "btn btn-outline-secondary btn-sm me-2";
        btn.setAttribute("aria-label", "Regresar a la página anterior");
        btn.innerHTML =
            '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Volver';
        btn.addEventListener("click", function (ev) {
            ev.preventDefault();
            window.pvmVolverAtras();
        });
        header.insertBefore(btn, header.firstChild);
    }

    function initCartUi() {
        injectCartBackButton();
        instalarFocoAlOcultarCarrito();
        aplicarUiCarritoPorContexto();
        actualizarCarrito();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCartUi);
    } else {
        initCartUi();
    }
})();
