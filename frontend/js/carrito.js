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
        // Preferir el mensaje enviado por el servidor cuando exista, y añadir el código.
        if (base && base !== "Error desconocido") {
            return c ? base + " (" + c + ")" : base;
        }
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

    function stockCeiling() {
        var n = parseInt(window.PVM_STOCK_CEILING, 10);
        if (!isNaN(n) && n > 0) {
            return n;
        }
        return 50;
    }

    function encontrarElementoProducto(idProducto) {
        var selector = '[onclick*="agregarCarrito(' + idProducto + ')"]';
        var trigger = document.querySelector(selector);
        if (!trigger) {
            return null;
        }
        var node = trigger;
        for (var i = 0; i < 8 && node; i++) {
            if (
                node.classList &&
                (node.classList.contains("producto-card") ||
                    node.classList.contains("modal-content") ||
                    node.classList.contains("card"))
            ) {
                return node;
            }
            node = node.parentElement;
        }
        return trigger;
    }

    function stockVisibleDeProducto(idProducto) {
        var el = encontrarElementoProducto(idProducto);
        if (!el) {
            return null;
        }
        var pStock = el.querySelector("p.stock");
        if (!pStock) {
            return null;
        }
        var total = parseInt(pStock.getAttribute("data-pvm-stock-n"), 10);
        var disponible = parseInt(pStock.getAttribute("data-pvm-stock-disponible"), 10);
        if (Number.isNaN(total)) {
            total = null;
        }
        if (Number.isNaN(disponible)) {
            disponible = null;
        }
        return {
            total: total,
            disponible: disponible,
        };
    }

    function stockMin() {
        var n = parseInt(window.PVM_STOCK_MIN, 10);
        if (!isNaN(n) && n >= 0) {
            return n;
        }
        return 1;
    }

    function validarAbastoAntesDeEnviar(items) {
        if (!esModoAbasto() || !Array.isArray(items) || !items.length) {
            return null;
        }
        var ceiling = stockCeiling();
        for (var i = 0; i < items.length; i++) {
            var line = items[i] || {};
            var stock = parseInt(line.stock, 10);
            var cantidad = parseInt(line.cantidad, 10);
            if (isNaN(stock) || isNaN(cantidad)) {
                continue;
            }
            if (stock + cantidad > ceiling) {
                return {
                    ok: false,
                    title: "No se pudo registrar el abasto",
                    message:
                        "No se pueden agregar más unidades: el stock máximo por producto es " +
                        ceiling +
                        " unidades.",
                };
            }
        }
        return null;
    }

    function validarCompraClienteAntesDeEnviar(items) {
        if (esModoAbasto() || !Array.isArray(items) || !items.length) {
            return null;
        }
        for (var i = 0; i < items.length; i++) {
            var line = items[i] || {};
            var stock = parseInt(line.stock, 10);
            var cantidad = parseInt(line.cantidad, 10);
            var nombre = String(line.nombre || "producto");
            if (isNaN(stock) || isNaN(cantidad)) {
                continue;
            }
            if (cantidad >= stock) {
                return {
                    title: "No se pudo finalizar la compra",
                    message:
                        "No se pudo completar la venta: \"" +
                        nombre +
                        "\" debe dejar al menos 1 unidad en inventario. Solo hay " +
                        stock +
                        " unidad(es) en total.",
                };
            }
        }
        return null;
    }

    function formatoPrecio(n) {
        return Number(n).toLocaleString("es-MX", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function normalizarWhatsAppNumero(raw) {
        return String(raw || "").replace(/\D+/g, "");
    }

    function construirNotaRemision(items, dataCarrito, dataRespuesta) {
        var lines = [];
        var fecha = new Date();
        var folio = dataRespuesta && dataRespuesta.id_pedido != null ? String(dataRespuesta.id_pedido) : "PENDIENTE";
        var subtotal = dataCarrito && dataCarrito.subtotal != null ? Number(dataCarrito.subtotal) : 0;
        var iva = dataCarrito && dataCarrito.iva != null ? Number(dataCarrito.iva) : Math.round(subtotal * 0.16 * 100) / 100;
        var total = dataCarrito && dataCarrito.total != null ? Number(dataCarrito.total) : Math.round((subtotal + iva) * 100) / 100;

        lines.push("Punto Venta Muebles");
        lines.push("Nota de remisión");
        lines.push("Folio: " + folio);
        lines.push("Fecha: " + fecha.toLocaleString("es-MX"));
        lines.push("");

        (Array.isArray(items) ? items : []).forEach(function (linea) {
            var nombre = String(linea.nombre || "Producto");
            var cantidad = Number(linea.cantidad || 0);
            var precio = Number(linea.precio || 0);
            var importe = Math.round((cantidad * precio) * 100) / 100;
            lines.push("- " + nombre + " x" + cantidad + " = $" + formatoPrecio(importe) + " MXN");
        });

        lines.push("");
        lines.push("Subtotal: $" + formatoPrecio(subtotal) + " MXN");
        lines.push("IVA (16%): $" + formatoPrecio(iva) + " MXN");
        lines.push("Total a pagar: $" + formatoPrecio(total) + " MXN");
        lines.push("");
        lines.push("Gracias por tu compra.");

        return {
            texto: lines.join("\n"),
            subtotal: subtotal,
            iva: iva,
            total: total,
            folio: folio,
        };
    }

    function normalizarTelefonoWhatsAppInput(raw) {
        var base = String(raw || "").replace(/\D+/g, "");
        if (!base) {
            return "";
        }
        if (base.length === 10) {
            return "52" + base;
        }
        if (base.length >= 11 && base.length <= 15) {
            return base;
        }
        return "";
    }

    var pvmPublicConfigPromise = null;

    function obtenerConfigPublica() {
        if (pvmPublicConfigPromise) {
            return pvmPublicConfigPromise;
        }
        pvmPublicConfigPromise = request("/auth/public-config", { method: "GET" })
            .then(function (resp) {
                return resp && resp.data ? resp.data : {};
            })
            .catch(function () {
                return {};
            });
        return pvmPublicConfigPromise;
    }

    async function enviarRemisionPorWhatsApp(idPedido, telefono) {
        var numero = normalizarTelefonoWhatsAppInput(telefono);
        var payload = {};
        if (numero) {
            payload.telefono = numero;
        }
        return request("/carrito/remision/" + idPedido + "/whatsapp", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    async function obtenerPdfRemisionBlob(idPedido) {
        var resp = await fetch(apiRoot() + "/carrito/remision/" + idPedido + "/pdf", {
            method: "GET",
            headers: {
                "X-Session-Id": getSessionId(),
            },
        });
        if (!resp.ok) {
            var txt = await resp.text();
            throw new Error(txt || "No se pudo generar la nota de remisión.");
        }
        return resp.blob();
    }

    async function compartirRemisionDesdeNavegador(idPedido, telefono, notaTexto) {
        var blob = await obtenerPdfRemisionBlob(idPedido);
        var archivo = new File([blob], "nota-remision-" + idPedido + ".pdf", {
            type: "application/pdf",
        });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [archivo] })) {
            await navigator.share({
                title: "Nota de remisión #" + idPedido,
                text:
                    "Nota de remisión en PDF" +
                    (telefono ? " para " + telefono : "") +
                    ".\n\n" +
                    (notaTexto || ""),
                files: [archivo],
            });
            return true;
        }

        var telefonoNorm = normalizarTelefonoWhatsAppInput(telefono);
        var shareText = encodeURIComponent(
            (notaTexto || "") +
                "\n\nNo fue posible enviar el archivo automáticamente desde este navegador. " +
                "Abre la nota de remisión desde el enlace y compártela por WhatsApp."
        );
        var pdfUrl = apiRoot() + "/carrito/remision/" + idPedido + "/pdf";
        var waFallback = telefonoNorm
            ? "https://wa.me/" + telefonoNorm + "?text=" + shareText + "%0A%0A" + encodeURIComponent(pdfUrl)
            : "https://api.whatsapp.com/send?text=" + shareText + "%0A%0A" + encodeURIComponent(pdfUrl);

        window.open(waFallback, "_blank", "noopener,noreferrer");
        return false;
    }

    async function pedirEmailYEnviarRemision(idPedido) {
        const { value: email, dismiss } = await Swal.fire({
            icon: 'question',
            title: 'Enviar nota de remisión',
            input: 'email',
            inputPlaceholder: 'tu@correo.com',
            inputLabel: 'Ingresa tu correo para recibir la nota de remisión',
            showCancelButton: true,
            confirmButtonText: 'Enviar',
            confirmButtonColor: '#25d366',
            cancelButtonText: 'Cancelar',
            inputValidator: function (value) {
                if (!value) return 'Por favor ingresa un correo válido';
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    return 'Por favor ingresa un correo válido';
                }
            },
        });

        if (dismiss) {
            if (dismiss === Swal.DismissReason.cancel) {
                const confirmacion = await Swal.fire({
                    icon: 'warning',
                    title: '¿Cancelar la compra?',
                    text: 'Si continúas, el pedido se anulará y el stock se devolverá al inventario.',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, cancelar compra',
                    cancelButtonText: 'No, mantener compra',
                    confirmButtonColor: '#dc3545',
                    cancelButtonColor: '#6c757d',
                });

                if (confirmacion.isConfirmed) {
                    await cancelarCompraYRestaurarStock(idPedido);
                }
            }
            return;
        }
        if (!email) return;

        try {
            toastSwal({
                icon: 'info',
                title: 'Enviando...',
                text: 'Un momento, estamos enviando tu nota de remisión',
                showConfirmButton: false,
                allowOutsideClick: false,
            });

            const response = await fetch(apiRoot() + '/carrito/remision/' + idPedido + '/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': getSessionId(),
                },
                body: JSON.stringify({ email: email }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw { code: response.status, message: err.message || 'Error desconocido' };
            }

            toastSwal({
                icon: 'success',
                title: '¡Enviado!',
                text: 'La nota de remisión fue enviada a ' + email + '. Por favor revisa tu bandeja de entrada.',
                confirmButtonColor: '#c9a227',
            });
        } catch (err) {
            toastSwal({
                icon: 'error',
                title: 'No se pudo enviar',
                text: mensajeErrorApi(err),
                confirmButtonColor: '#c9a227',
            });
        }
    }

    async function cancelarCompraYRestaurarStock(idPedido) {
        try {
            toastSwal({
                icon: 'info',
                title: 'Cancelando compra...',
                text: 'Restaurando el stock del pedido.',
                showConfirmButton: false,
                allowOutsideClick: false,
            });

            const cancelUrl = apiRoot() + '/carrito/remision/' + idPedido + '/cancelar';
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller
                ? setTimeout(function () {
                    try {
                        controller.abort();
                    } catch (e) {
                        /* ignore */
                    }
                }, 15000)
                : null;

            const response = await fetch(cancelUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': getSessionId(),
                },
                body: '{}',
                signal: controller ? controller.signal : undefined,
            }).finally(function () {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            });

            const payload = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || !payload.ok) {
                throw {
                    code: response.status,
                    message: (payload && payload.error && payload.error.message) || 'No se pudo cancelar la compra',
                };
            }

            try {
                if (typeof Swal !== 'undefined' && Swal.close) {
                    Swal.close();
                }
            } catch (e) {
                /* ignore */
            }

            toastSwal({
                icon: 'success',
                title: 'Compra cancelada',
                text: 'El pedido fue anulado y el stock regresó al inventario.',
                confirmButtonColor: '#c9a227',
            });
        } catch (err) {
            try {
                if (typeof Swal !== 'undefined' && Swal.close) {
                    Swal.close();
                }
            } catch (e) {
                /* ignore */
            }
            toastSwal({
                icon: 'error',
                title: 'No se pudo cancelar',
                text: mensajeErrorApi(err),
                confirmButtonColor: '#c9a227',
            });
        }
    }

    async function enviarRemisionSinPrompt(idPedido) {
        try {
            toastSwal({
                icon: "info",
                title: "Enviando remisión",
                text: "Por favor espera...",
                showConfirmButton: false,
                allowOutsideClick: false,
            });

            await enviarRemisionPorWhatsApp(idPedido, "");
            toastSwal({
                icon: "success",
                title: "Remisión enviada",
                text: "La nota de remisión fue enviada por WhatsApp.",
                confirmButtonColor: "#c9a227",
            });
        } catch (err) {
            toastSwal({
                icon: "error",
                title: "No se pudo enviar",
                text: mensajeErrorApi(err),
                confirmButtonColor: "#c9a227",
            });
        }
    }

    function pedirTelefonoParaRemision(idPedido) {
        if (typeof Swal === "undefined") {
            return Promise.resolve();
        }

        return obtenerConfigPublica().then(function (cfg) {
            if (cfg && cfg.whatsappDefaultRecipientFixed) {
                return enviarRemisionSinPrompt(idPedido);
            }

            return Swal.fire({
            icon: "question",
            title: "Enviar nota por WhatsApp",
            html:
                '<div style="text-align:left">' +
                '<p class="mb-2">Escribe el número de teléfono con lada al que se enviará la nota de remisión en PDF.</p>' +
                '<p class="small text-muted mb-0">Si escribes 10 dígitos, se asumirá México automáticamente.</p>' +
                '</div>',
            input: "tel",
            inputPlaceholder: "5215512345678",
            inputAttributes: {
                inputmode: "tel",
                autocomplete: "tel",
                maxlength: "15",
            },
            showCancelButton: true,
            confirmButtonText: "Enviar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#25d366",
            cancelButtonColor: "#6c757d",
            allowOutsideClick: false,
            inputValidator: function (value) {
                if (!normalizarTelefonoWhatsAppInput(value)) {
                    return "Ingresa un número válido con lada.";
                }
                return null;
            },
        }).then(async function (result) {
            if (!result.isConfirmed) {
                return;
            }

            var telefono = normalizarTelefonoWhatsAppInput(result.value);
            return enviarRemisionConConfirmacion(idPedido, telefono);
        });
        });
    }

    async function enviarRemisionConConfirmacion(idPedido, telefono) {
        try {
            toastSwal({
                icon: "info",
                title: "Enviando remisión",
                text: "Por favor espera...",
                showConfirmButton: false,
                allowOutsideClick: false,
            });

            await enviarRemisionPorWhatsApp(idPedido, telefono);
            toastSwal({
                icon: "success",
                title: "Remisión enviada",
                text: "La nota de remisión fue enviada por WhatsApp.",
                confirmButtonColor: "#c9a227",
            });
        } catch (err) {
            toastSwal({
                icon: "error",
                title: "No se pudo enviar",
                text: mensajeErrorApi(err),
                confirmButtonColor: "#c9a227",
            });
        }
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

        // Asegurarnos de que cualquier loader previo de Swal esté oculto antes
        // de abrir una nueva alerta. Evita que quede el spinner activo.
        try {
            if (typeof Swal.hideLoading === "function") {
                Swal.hideLoading();
            }
        } catch (e) {
            /* ignore */
        }

        prepararFocoParaSwal();

        var cfg = Object.assign({}, opts || {});
        var debugSwal = Boolean(window.PVM_DEBUG_SWAL);

        function openSwalNow() {
            try {
                if (typeof Swal.close === "function") {
                    Swal.close();
                }
            } catch (e) {
                /* ignore */
            }
            try {
                if (typeof Swal.hideLoading === "function") {
                    Swal.hideLoading();
                }
            } catch (e) {
                /* ignore */
            }

            console.debug("toastSwal: opening Swal now (cleanup previous) ", cfg && cfg.title);

            // aggressive cleanup of any leftover loaders / attributes
            try {
                document.querySelectorAll('.swal2-loader').forEach(function (n) {
                    if (n && n.parentNode) {
                        n.parentNode.removeChild(n);
                    }
                });
            } catch (e) {
                /* ignore */
            }
            try {
                document.querySelectorAll('.swal2-popup').forEach(function (p) {
                    try {
                        p.removeAttribute && p.removeAttribute('data-loading');
                        p.removeAttribute && p.removeAttribute('aria-busy');
                        var btns = p.querySelectorAll && p.querySelectorAll('button');
                        if (btns && btns.forEach) {
                            btns.forEach(function (b) {
                                try {
                                    b.disabled = false;
                                } catch (e2) {}
                            });
                        }
                        var loader = p.querySelector && p.querySelector('.swal2-loader');
                        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
                    } catch (e3) {
                        /* ignore */
                    }
                });
            } catch (e) {
                /* ignore */
            }

            // remove empty containers left behind
            try {
                document.querySelectorAll('.swal2-container').forEach(function (c) {
                    try {
                        if (!c.querySelector('.swal2-popup') && c.parentNode) {
                            c.parentNode.removeChild(c);
                        }
                    } catch (e4) {
                        /* ignore */
                    }
                });
            } catch (e) {
                /* ignore */
            }

            return new Promise(function (resolve) {
                var maxWait = 500;
                var waited = 0;
                var interval = 40;

                var checkGone = function () {
                    // SweetAlert2 uses .swal2-container and .swal2-popup
                    var existing = document.querySelector('.swal2-container') || document.querySelector('.swal2-popup');
                    if (!existing) {
                        // small extra delay to ensure cleanup
                        return setTimeout(function () {
                            try {
                                var p = Swal.fire(cfg);
                                resolve(p);
                            } catch (e) {
                                resolve(Promise.reject(e));
                            }
                        }, 40);
                    }
                    waited += interval;
                    if (waited >= maxWait) {
                        // give up waiting and open anyway
                        try {
                            var p2 = Swal.fire(cfg);
                            resolve(p2);
                        } catch (e2) {
                            resolve(Promise.reject(e2));
                        }
                        return;
                    }
                    setTimeout(checkGone, interval);
                };

                // Start checking after forcing close/hide above
                setTimeout(checkGone, 20);
            });
        }
        var prevWillOpen = cfg.willOpen;
        var prevDidOpen = cfg.didOpen;
        var prevDidClose = cfg.didClose;

        cfg.returnFocus = false;
        cfg.willOpen = function (popup) {
            if (debugSwal) console.debug("toastSwal: willOpen", cfg && cfg.title);
            prepararFocoParaSwal();
            if (typeof prevWillOpen === "function") {
                try {
                    prevWillOpen(popup);
                } catch (e) {
                    if (debugSwal) console.error("toastSwal: prevWillOpen threw", e);
                }
            }
        };
        cfg.didOpen = function (popup) {
            if (debugSwal) console.debug("toastSwal: didOpen", cfg && cfg.title);
            if (typeof Swal.getConfirmButton === "function") {
                var btn = Swal.getConfirmButton();
                if (!tryFocus(btn) && popup) {
                    tryFocus(popup);
                }
            }
            if (typeof prevDidOpen === "function") {
                try {
                    prevDidOpen(popup);
                } catch (e) {
                    if (debugSwal) console.error("toastSwal: prevDidOpen threw", e);
                }
            }
        };
        cfg.didClose = function (popup) {
            if (debugSwal) console.debug("toastSwal: didClose", cfg && cfg.title);
            restaurarFocoTrasSwal();
            if (typeof prevDidClose === "function") {
                try {
                    prevDidClose(popup);
                } catch (e) {
                    if (debugSwal) console.error("toastSwal: prevDidClose threw", e);
                }
            }
        };

        var canvas = document.getElementById("carritoCanvas");
        var canvasAbierto =
            canvas &&
            canvas.classList &&
            canvas.classList.contains("show");

        if (!canvasAbierto) {
            return openSwalNow();
        }

        return new Promise(function (resolve) {
            var ejecutado = false;
            var abrir = function () {
                if (ejecutado) {
                    return;
                }
                ejecutado = true;
                if (debugSwal) console.debug("toastSwal: deferred abrir() running", cfg && cfg.title);
                openSwalNow().then(function (p) {
                    resolve(p);
                });
            };

            try {
                canvas.addEventListener("hidden.bs.offcanvas", abrir, { once: true });
            } catch (e0) {
                /* ignore */
            }

            cerrarCarritoControlado();
            setTimeout(abrir, 500);
        });
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
                if (body && body.ok === false) {
                    var msgOkFalse =
                        (body.error && body.error.message) ||
                        "La operación no pudo completarse.";
                    var errOkFalse = new Error(msgOkFalse);
                    errOkFalse.status = res.status;
                    errOkFalse.body = body;
                    errOkFalse.meta = body.error && body.error.meta ? body.error.meta : null;
                    errOkFalse.code =
                        body.error && body.error.code
                            ? String(body.error.code)
                            : undefined;
                    throw errOkFalse;
                }
                if (!res.ok) {
                    var msg =
                        (body.error && body.error.message) ||
                        "Error " + res.status;
                    var err = new Error(msg);
                    err.status = res.status;
                    err.body = body;
                    err.meta = body.error && body.error.meta ? body.error.meta : null;
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
                            var meta = err && err.meta ? err.meta : null;
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
                                    '" data-stock="' + L.stock + '" data-reservado="' + L.reservado + '" data-disponible="' + (L.disponible_global) + '" data-cantidad="' + L.cantidad + '" data-max-en-carrito="' + maxC + '">' +
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

    function stockDisponibleEnCarrito(idCarrito) {
        var el = document.querySelector('[data-id-carrito="' + idCarrito + '"]');
        if (!el) {
            return null;
        }
        var actual = parseInt(el.getAttribute("data-cantidad"), 10);
        var stock = parseInt(el.getAttribute("data-stock"), 10);
        var reservado = parseInt(el.getAttribute("data-reservado"), 10);
        var disponible_global = parseInt(el.getAttribute("data-disponible"), 10);
        var maxEnLinea = parseInt(el.getAttribute("data-max-en-carrito"), 10);

        if (Number.isNaN(actual) || Number.isNaN(stock) || Number.isNaN(reservado)) {
            return null;
        }

        if (esModoAbasto()) {
            if (Number.isNaN(maxEnLinea)) {
                maxEnLinea = stockCeiling();
            }
            return Math.max(0, maxEnLinea - actual);
        }

        // Para clientes: seguir la misma regla que el backend (maxPermitidoSesion):
        // permitido = stock - (reservado - cantidadActualLinea) - STOCK_MIN
        var minStock = stockMin();
        var permitido = stock - (reservado - actual) - minStock;
        if (Number.isNaN(permitido)) return null;
        return Math.max(0, permitido);
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

        var stockInfo = stockVisibleDeProducto(id);
        if (stockInfo) {
            if (esModoAbasto()) {
                var actual = stockInfo.total != null ? stockInfo.total : null;
                if (actual != null && actual + qty > stockCeiling()) {
                    toastSwal({
                        icon: "warning",
                        title: "Tope de inventario",
                        text:
                            "No se pueden agregar más unidades: el stock máximo por producto es " +
                            stockCeiling() +
                            " unidades.",
                        confirmButtonColor: "#c9a227",
                    });
                    return;
                }
            } else {
                var disponible =
                    stockInfo.disponible != null
                        ? stockInfo.disponible
                        : stockInfo.total;
                if (disponible != null && qty > disponible) {
                    toastSwal({
                        icon: "warning",
                        title: "Stock insuficiente",
                        text:
                            "Solo hay " +
                            disponible +
                            " unidad(es) disponibles para este producto.",
                        confirmButtonColor: "#c9a227",
                    });
                    return;
                }
            }
        }

        request("/carrito/items", {
            method: "POST",
            body: JSON.stringify({
                id_producto: id,
                cantidad: qty,
            }),
        })
            .then(function (resp) {
                var warnings =
                    resp && resp.data && Array.isArray(resp.data.warnings)
                        ? resp.data.warnings
                        : [];
                // Si el servidor devuelve warnings en un 200, mostrar advertencia.
                if (warnings.length) {
                    toastSwal({
                        icon: "warning",
                        title: "Aviso de inventario",
                        text: warnings[0],
                        confirmButtonColor: "#c9a227",
                    });
                    actualizarCarrito();
                    return;
                }

                // Respuesta exitosa sin warnings: indicar éxito y refrescar carrito.
                toastSwal({
                    icon: "success",
                    title: esModoAbasto() ? "Línea de abasto agregada" : "Producto agregado",
                    timer: 1200,
                    showConfirmButton: false,
                });
                actualizarCarrito();
            })
            .catch(function (err) {
                var code = err.code ? String(err.code) : "";
                var isMaxLinea = code === "MAX_LINEA" || code === "MAX_QUANTITY_EXCEEDED" || code === "ABASTO_STOCK_CAP";
                var isInsuffStock = code === "INSUFFICIENT_STOCK";
                var icon = isMaxLinea || isInsuffStock ? "warning" : "error";
                var title = isMaxLinea
                    ? "Límite de cantidad alcanzado"
                    : isInsuffStock
                    ? "Stock insuficiente"
                    : "No se pudo agregar";
                var message = isMaxLinea
                    ? (err.message || "No puedes agregar más unidades de este producto. Ya alcanzaste el máximo permitido por el sistema.")
                    : isInsuffStock
                    ? (err.message || "No hay suficiente stock disponible para esa cantidad.")
                    : mensajeErrorApi(err);
                // Mostrar única advertencia/err del servidor (no éxitos parciales)
                toastSwal({
                    icon: icon,
                    title: title,
                    text: message,
                    confirmButtonColor: "#c9a227",
                });
                // Refrescar carrito para asegurar estado consistente (sin cambios aplicados si hubo error)
                actualizarCarrito();
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
        var actual = null;
        if (line) {
            var ac = parseInt(line.getAttribute('data-cantidad'), 10);
            actual = Number.isNaN(ac) ? null : ac;
        }
        if (actual == null) {
            // Fallback to previous regex parsing if data attribute missing
            var text = line ? line.textContent : "";
            var m = text.match(/×\s*(\d+)/);
            actual = m ? parseInt(m[1], 10) : 1;
        }
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

    // Evitar peticiones concurrentes por línea de carrito
    var _pvm_inflight = {};

    window.establecerCantidadLinea = function (idCarrito, cantidad) {
        var id = parseInt(idCarrito, 10);
        var c = parseInt(cantidad, 10);
        if (isNaN(id) || isNaN(c) || c < 1) {
            return;
        }
        // Evitar peticiones concurrentes para la misma línea
        if (_pvm_inflight[id]) return;

        var disponible = stockDisponibleEnCarrito(id);
        if (disponible != null) {
            var el = document.querySelector('[data-id-carrito="' + id + '"]');
            var actualLocal = el ? parseInt(el.getAttribute("data-cantidad"), 10) : null;
            if (Number.isNaN(actualLocal)) {
                actualLocal = null;
            }
            // disponible representa unidades adicionales que se pueden añadir
            // Si conocemos el actual, calculamos el máximo absoluto permitido
            if (actualLocal != null) {
                var maxAbs = actualLocal + Number(disponible);
                if (c > maxAbs) {
                    // Si estamos en modo abasto (admin), informar explícitamente del tope de inventario.
                    if (esModoAbasto()) {
                        toastSwal({
                            icon: "warning",
                            title: "Tope de inventario",
                            text: "No se pueden agregar más unidades: el stock máximo por producto es " + stockCeiling() + " unidades.",
                            confirmButtonColor: "#c9a227",
                        });
                        return;
                    }
                    // Para clientes, clamp silenciosamente.
                    c = maxAbs;
                }
                if (c === actualLocal) {
                    // nada que hacer
                    return;
                }
            } else {
                // Si no conocemos el actual localmente, y la petición solicita más de lo disponible,
                // clamp a disponible (en caso de que el backend espere cantidad absoluta)
                if (c > Number(disponible)) {
                    c = Number(disponible);
                }
            }
        }
        // Deshabilitar controles en la línea mientras la petición está en curso
        var lineEl = document.querySelector('[data-id-carrito="' + id + '"]');
        if (lineEl) {
            _pvm_inflight[id] = true;
            var buttons = lineEl.querySelectorAll('button');
            buttons.forEach(function (b) {
                try { b.disabled = true; } catch (e) { /* ignore */ }
            });
        }

        request("/carrito/items/" + id, {
            method: "PATCH",
            body: JSON.stringify({ cantidad: c }),
        })
            .then(function () {
                actualizarCarrito();
                if (lineEl) {
                    delete _pvm_inflight[id];
                    var buttons2 = lineEl.querySelectorAll('button');
                    buttons2.forEach(function (b) {
                        try { b.disabled = false; } catch (e) { /* ignore */ }
                    });
                }
            })
            .catch(function (err) {
                // Error recibido del servidor al actualizar cantidad
                toastSwal({
                    icon: "warning",
                    title: "No se pudo actualizar",
                    text: err.message,
                    confirmButtonColor: "#c9a227",
                });
                actualizarCarrito();
                if (lineEl) {
                    delete _pvm_inflight[id];
                    var buttons3 = lineEl.querySelectorAll('button');
                    buttons3.forEach(function (b) {
                        try { b.disabled = false; } catch (e) { /* ignore */ }
                    });
                }
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

                var avisoAbasto = validarAbastoAntesDeEnviar(items);
                if (avisoAbasto) {
                    toastSwal({
                        icon: "warning",
                        title: avisoAbasto.title,
                        text: avisoAbasto.message,
                        confirmButtonColor: "#c9a227",
                    });
                    return;
                }

                var avisoCompra = validarCompraClienteAntesDeEnviar(items);
                if (avisoCompra) {
                    toastSwal({
                        icon: "warning",
                        title: avisoCompra.title,
                        text: avisoCompra.message,
                        confirmButtonColor: "#c9a227",
                    });
                    return;
                }
                
                // Mostrar indicador de procesamiento SIN usar showLoading (evita estados atascados).
                toastSwal({
                    icon: "info",
                    title: "Procesando",
                    text: esModoAbasto() ? "Registrando entrada a inventario..." : "Finalizando compra...",
                    allowOutsideClick: false,
                    showConfirmButton: false
                });

                var resp = await request(path, { method: "POST", body: "{}" });
                var d = resp.data || {};
                var msg = d.message || "Operación registrada.";
                var titulo = "Listo";
                var warnings = Array.isArray(d.warnings) ? d.warnings : [];
                if (d.modo === "abasto_admin") {
                    titulo = "Abasto registrado correctamente";
                } else if (d.modo === "venta_cliente") {
                    titulo = "Compra realizada";
                } else if (esModoAbasto()) {
                    titulo = "Abasto registrado";
                } else {
                    titulo = "Compra realizada";
                }
                try {
                    if (typeof Swal !== "undefined") {
                        try { Swal.hideLoading && Swal.hideLoading(); } catch (e) {}
                        try { Swal.close && Swal.close(); } catch (e) {}
                    }
                } catch (e) {
                    /* ignore */
                }

                toastSwal({
                    icon: warnings.length ? "warning" : "success",
                    title: titulo,
                    text: msg,
                    confirmButtonColor: "#c9a227",
                    allowOutsideClick: true,
                    didClose: function () {
                        actualizarCarrito();
                        if (esModoAbasto()) {
                            emitirStockRefresh();
                        } else if (d.id_pedido) {
                            setTimeout(function () {
                                pedirEmailYEnviarRemision(d.id_pedido);
                            }, 120);
                        }
                    }
                });
            } catch (err) {
                var st = err.status;
                var code = err.code ? String(err.code) : "";
                var baseMsg = mensajeErrorApi(err);
                
                var icon = "error";
                var tituloErr = esModoAbasto()
                    ? "No se pudo registrar el abasto"
                    : "No se pudo finalizar la compra";

                if (code === "AUTH_REQUIRED") {
                    tituloErr = "Autenticación requerida";
                    baseMsg = "Debes iniciar sesión como administrador para registrar abasto.";
                    icon = "warning";
                } else if (code === "ADMIN_ONLY") {
                    tituloErr = "Permiso denegado";
                    baseMsg = "Solo administradores pueden registrar abasto. Inicia sesión con cuenta admin.";
                    icon = "warning";
                } else if (code === "EMPTY_CART") {
                    tituloErr = "Carrito vacío";
                    baseMsg = esModoAbasto() 
                        ? "El carrito de abasto está vacío. Agrega productos." 
                        : "El carrito está vacío. Agrega productos.";
                    icon = "info";
                } else if (code === "USE_ABASTO_ENDPOINT") {
                    tituloErr = "Flujo incorrecto";
                    baseMsg = "Como administrador, usa el carrito de abasto.";
                    icon = "warning";
                } else if (code === "INVALID_SESSION" || code === "SESSION_REQUIRED") {
                    tituloErr = "Error de sesión";
                    baseMsg = "Se perdió la sesión del carrito. Recarga la página e intenta nuevamente.";
                    icon = "warning";
                } else if (st === 409) {
                    icon = "warning";
                    baseMsg = baseMsg || "No se pudo completar la operación por un conflicto de inventario.";
                } else if (st === 403) {
                    icon = "warning";
                    tituloErr = "Permiso denegado";
                } else if (st === 400) {
                    baseMsg = baseMsg || "Datos inválidos. Verifica que el carrito sea válido.";
                }

                var meta = err.meta || null;
                // No mostrar objetos de error detallados en consola para el usuario final.
                // Guardamos información mínima si se desea habilitar logging remoto.

                if (meta && typeof meta === "object") {
                    var detalles = [];
                    if (meta.constraint) {
                        detalles.push("Constraint: " + meta.constraint);
                    }
                    if (meta.table) {
                        detalles.push("Tabla: " + meta.table);
                    }
                    if (meta.column) {
                        detalles.push("Columna: " + meta.column);
                    }
                    if (meta.sqlNumber) {
                        detalles.push("SQL: " + meta.sqlNumber);
                    }
                    if (detalles.length) {
                        baseMsg += "<br><br><small style=\"opacity:.85\">" +
                            escapeHtml(detalles.join(" | ")) +
                            "</small>";
                    }
                }

                toastSwal({
                    icon: icon,
                    title: tituloErr,
                    html: '<div style="text-align:left; word-wrap: break-word;">' + baseMsg + '</div>',
                    confirmButtonColor: "#c9a227",
                    confirmButtonText: "Entendido",
                    allowOutsideClick: true
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

        var activo = document.activeElement;
        if (activo && canvas.contains(activo) && typeof activo.blur === "function") {
            try {
                activo.blur();
            } catch (e0) {
                /* ignore */
            }
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
            ensureModalFocusSentinel(),
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
                if (tryFocus(target)) {
                    return;
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
    var pvmCarritoPreCloseInstalled = false;

    function congelarFocusablesCanvas(canvas) {
        if (!canvas || typeof canvas.querySelectorAll !== "function") {
            return;
        }
        var focusables = canvas.querySelectorAll(
            'a, button, input, select, textarea, [tabindex]'
        );
        focusables.forEach(function (el) {
            if (!el || typeof el.setAttribute !== "function") {
                return;
            }
            if (!el.hasAttribute("data-pvm-prev-tabindex")) {
                var prev = el.getAttribute("tabindex");
                el.setAttribute(
                    "data-pvm-prev-tabindex",
                    prev == null ? "__none__" : String(prev)
                );
            }
            el.setAttribute("tabindex", "-1");
        });
    }

    function restaurarFocusablesCanvas(canvas) {
        if (!canvas || typeof canvas.querySelectorAll !== "function") {
            return;
        }
        var conEstado = canvas.querySelectorAll("[data-pvm-prev-tabindex]");
        conEstado.forEach(function (el) {
            var prev = el.getAttribute("data-pvm-prev-tabindex");
            if (prev === "__none__") {
                el.removeAttribute("tabindex");
            } else {
                el.setAttribute("tabindex", prev || "-1");
            }
            el.removeAttribute("data-pvm-prev-tabindex");
        });
    }

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
            ensureModalFocusSentinel() ||
            document.getElementById("btn-cerrar-admin") ||
            document.body
        );
    }

    function focusOutsideCanvas(canvas) {
        var target = getSafeFocusTarget(canvas);
        if (target && typeof target.focus === "function" && tryFocus(target)) {
            return;
        }
        var sentinel = ensureModalFocusSentinel();
        if (tryFocus(sentinel)) {
            return;
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

    function reforzarSalidaFoco(canvas) {
        if (!canvas) {
            return;
        }
        setTimeout(function () {
            var ae = document.activeElement;
            if (ae && typeof canvas.contains === "function" && canvas.contains(ae)) {
                if (typeof ae.blur === "function") {
                    try {
                        ae.blur();
                    } catch (e0) {
                        /* ignore */
                    }
                }
                focusOutsideCanvas(canvas);
            }
        }, 0);
    }

    function cerrarCarritoControlado() {
        var canvas = document.getElementById("carritoCanvas");
        if (!canvas) {
            return;
        }

        moverFocoAntesCerrarCarrito();
        focusOutsideCanvas(canvas);
        reforzarSalidaFoco(canvas);
        congelarFocusablesCanvas(canvas);

        if (canvas && typeof canvas.setAttribute === "function") {
            try {
                canvas.setAttribute("inert", "");
            } catch (e) {
                /* ignore */
            }
        }

        if (typeof bootstrap !== "undefined" && bootstrap.Offcanvas) {
            var inst = bootstrap.Offcanvas.getInstance(canvas);
            if (!inst && typeof bootstrap.Offcanvas.getOrCreateInstance === "function") {
                inst = bootstrap.Offcanvas.getOrCreateInstance(canvas);
            }
            if (inst) {
                inst.hide();
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
            restaurarFocusablesCanvas(canvas);
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
            reforzarSalidaFoco(canvas);
            congelarFocusablesCanvas(canvas);
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
            restaurarFocusablesCanvas(canvas);
            focusOutsideCanvas(canvas);
        };

        document.addEventListener("show.bs.offcanvas", manejarShow, true);
        document.addEventListener("shown.bs.offcanvas", manejarShown, true);
        document.addEventListener("hide.bs.offcanvas", manejarHide, true);
        document.addEventListener("hidden.bs.offcanvas", manejarHidden, true);
    }

    function instalarFocoPrevioAlCerrarCarrito() {
        if (pvmCarritoPreCloseInstalled) {
            return;
        }
        pvmCarritoPreCloseInstalled = true;

        document.addEventListener(
            "click",
            function (ev) {
                var target = ev.target;
                if (!target) {
                    return;
                }
                var dismiss = target.closest
                    ? target.closest('#carritoCanvas [data-bs-dismiss="offcanvas"]')
                    : null;
                var canvas = document.getElementById("carritoCanvas");
                if (dismiss && canvas) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (typeof ev.stopImmediatePropagation === "function") {
                        ev.stopImmediatePropagation();
                    }
                    cerrarCarritoControlado();
                }
            },
            true
        );

        document.addEventListener(
            "keydown",
            function (ev) {
                if (ev.key !== "Escape") {
                    return;
                }
                var canvas = document.getElementById("carritoCanvas");
                if (!canvas) {
                    return;
                }
                var ae = document.activeElement;
                if (ae && typeof canvas.contains === "function" && canvas.contains(ae)) {
                    cerrarCarritoControlado();
                }
            },
            true
        );
    }

    window.pvmVolverAtras = function () {
        var el = document.getElementById("carritoCanvas");
        if (window.history.length > 1) {
            if (el && typeof bootstrap !== "undefined" && bootstrap.Offcanvas) {
                var volverEjecutado = false;
                var navegar = function () {
                    if (volverEjecutado) {
                        return;
                    }
                    volverEjecutado = true;
                    window.history.back();
                };

                try {
                    el.addEventListener("hidden.bs.offcanvas", navegar, { once: true });
                } catch (e0) {
                    /* ignore */
                }

                cerrarCarritoControlado();
                setTimeout(navegar, 450);
                return;
            }

            moverFocoAntesCerrarCarrito();
            focusOutsideCanvas(el || null);
            window.history.back();
            return;
        }

        if (typeof bootstrap !== "undefined" && el) {
            var inst = bootstrap.Offcanvas.getInstance(el);
            if (inst) {
                moverFocoAntesCerrarCarrito();
                focusOutsideCanvas(el);
                inst.hide();
            }
        }
    };

    function injectCartBackButton() {
        // Deshabilitado: este botón retenía foco dentro del offcanvas en algunos
        // cierres y disparaba el warning de aria-hidden.
        return;
    }

    function initCartUi() {
        injectCartBackButton();
        instalarFocoAlOcultarCarrito();
        instalarFocoPrevioAlCerrarCarrito();
        aplicarUiCarritoPorContexto();
        actualizarCarrito();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCartUi);
    } else {
        initCartUi();
    }
})();

