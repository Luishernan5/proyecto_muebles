/**
 * Punto Venta Muebles — carrito con API Node + SQL Server
 *
 * Config (opcional):
 *   window.PVM_API = '/api';
 *   window.PVM_IMAGEN_POR_PRODUCTO = { 1: '/img/mi-foto.jpg', ... }; // sobrescribe miniaturas
 *
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
            var s = localStorage.getItem(SESSION_KEY);
            if (s && s.length >= 8) {
                return s;
            }
            s =
                typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : "pvm-" + Date.now() + "-" + Math.random().toString(36).slice(2);
            localStorage.setItem(SESSION_KEY, s);
            return s;
        } catch (e) {
            return "pvm-fallback-" + Date.now();
        }
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

    function toastSwal(opts) {
        if (typeof Swal === "undefined") {
            return;
        }
        Swal.fire(opts);
    }

    function mostrarAdvertencias(warnings) {
        if (!warnings || !warnings.length || typeof Swal === "undefined") {
            return;
        }
        warnings.forEach(function (w) {
            Swal.fire({
                icon: "warning",
                title: "Aviso de inventario",
                text: w,
                timer: 4200,
                showConfirmButton: true,
                confirmButtonColor: "#c9a227",
            });
        });
    }

    var JWT_KEY = "pvm_jwt";

    function request(path, options) {
        var url = apiRoot() + path;
        var opts = options || {};
        opts.headers = opts.headers || {};
        opts.headers["X-Session-Id"] = getSessionId();
        opts.headers["Content-Type"] =
            opts.headers["Content-Type"] || "application/json";
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
        var lista = document.getElementById("lista-carrito");
        var subtotalEl = document.getElementById("subtotal");
        var ivaEl = document.getElementById("iva");
        var totalEl = document.getElementById("total");
        var contadores = document.querySelectorAll("[data-carrito-contador]");

        request("/carrito", { method: "GET" })
            .then(function (resp) {
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
                        '<p class="text-muted text-center py-4 mb-0">Tu carrito está vacío.</p>';
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
                            '<p class="small text-muted mb-2">En inventario: ' +
                            L.stock +
                            " · Libres (no reservadas): " +
                            L.disponible_global +
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
                            '<span class="small text-muted">Máx. en carrito: ' +
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
            })
            .catch(function (err) {
                if (lista) {
                    lista.innerHTML =
                        '<p class="text-danger small mb-0">No se pudo cargar el carrito. ¿Está el servidor en marcha? (' +
                        escapeHtml(err.message) +
                        ")</p>";
                }
                toastSwal({
                    icon: "error",
                    title: "Error de conexión",
                    text: err.message,
                    confirmButtonColor: "#c9a227",
                });
            });
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
                    title: "Producto agregado",
                    timer: 1200,
                    showConfirmButton: false,
                });
                actualizarCarrito();
            })
            .catch(function (err) {
                toastSwal({
                    icon: err.status === 409 ? "warning" : "error",
                    title: "No se pudo agregar",
                    text: err.message,
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
        request("/carrito/checkout", { method: "POST", body: "{}" })
            .then(function (resp) {
                var msg =
                    (resp.data && resp.data.message) || "Compra registrada.";
                toastSwal({
                    icon: "success",
                    title: "Compra realizada",
                    text: msg,
                    confirmButtonColor: "#c9a227",
                });
                actualizarCarrito();
            })
            .catch(function (err) {
                toastSwal({
                    icon: "error",
                    title: "No se pudo finalizar",
                    text: err.message,
                    confirmButtonColor: "#c9a227",
                });
            });
    };

    /**
     * Bootstrap aplica aria-hidden al cerrar el offcanvas; el foco debe estar fuera antes.
     * Un listener solo en el panel puede correr en el mismo orden que el interno de Bootstrap;
     * por eso se usa captura en document y se devuelve el foco al disparador del carrito.
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

        var toggle =
            document.querySelector(
                'button.carrito-flotante[data-bs-target="#carritoCanvas"]'
            ) ||
            document.querySelector(
                '[data-bs-toggle="offcanvas"][data-bs-target="#carritoCanvas"]'
            );

        if (
            toggle &&
            !canvas.contains(toggle) &&
            typeof toggle.focus === "function"
        ) {
            try {
                toggle.focus({ preventScroll: true });
            } catch (e1) {
                try {
                    toggle.focus();
                } catch (e2) {
                    /* ignore */
                }
            }
        }

        ae = document.activeElement;
        if (
            ae &&
            canvas.contains(ae) &&
            typeof ae.blur === "function"
        ) {
            ae.blur();
        }
    }

    var pvmCarritoHideFocusInstalled = false;

    function instalarFocoAlOcultarCarrito() {
        if (pvmCarritoHideFocusInstalled) {
            return;
        }
        pvmCarritoHideFocusInstalled = true;
        document.addEventListener(
            "hide.bs.offcanvas",
            function (ev) {
                var t = ev.target;
                if (!t || t.id !== "carritoCanvas") {
                    return;
                }
                moverFocoAntesCerrarCarrito();
            },
            true
        );
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
        actualizarCarrito();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCartUi);
    } else {
        initCartUi();
    }
})();
