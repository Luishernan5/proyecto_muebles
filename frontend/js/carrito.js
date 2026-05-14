/**
 * Punto Venta Muebles — carrito global (JavaScript puro + localStorage + SweetAlert2)
 *
 * API pública:
 *   agregarCarrito(nombre, precio [, imagen] [, stock])
 *   eliminarProducto(index)
 *   actualizarCarrito()
 *   vaciarCarrito()
 *   finalizarCompra()
 */

(function () {
    "use strict";

    var STORAGE_KEY = "pvm_carrito_v1";
    var carrito = [];

    function normalizarPrecio(precio) {
        if (typeof precio === "number" && !isNaN(precio)) {
            return precio;
        }
        if (typeof precio === "string") {
            var n = parseFloat(String(precio).replace(/[^0-9.]/g, ""));
            return isNaN(n) ? 0 : n;
        }
        return 0;
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

    function guardarCarrito() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(carrito));
        } catch (e) {
            /* sin espacio o modo privado */
        }
    }

    function cargarCarrito() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                carrito = parsed.map(function (p) {
                    return {
                        nombre: p.nombre || "Producto",
                        precio: normalizarPrecio(p.precio),
                        imagen: p.imagen || "",
                        stock: p.stock != null ? p.stock : "Disponible",
                    };
                });
            }
        } catch (e) {
            carrito = [];
        }
    }

    function toastSwal(opts) {
        if (typeof Swal === "undefined") {
            return;
        }
        Swal.fire(opts);
    }

    /**
     * @param {string} nombre
     * @param {number|string} precio
     * @param {string} [imagen] URL de miniatura
     * @param {number|string} [stock] 0 = agotado; omitir = disponible
     */
    window.agregarCarrito = function (nombre, precio, imagen, stock) {
        var precioNum = normalizarPrecio(precio);
        if (stock === 0 || stock === "0") {
            toastSwal({
                icon: "warning",
                title: "Producto agotado",
                text: nombre,
                timer: 1600,
                showConfirmButton: false,
            });
            return;
        }
        carrito.push({
            nombre: nombre,
            precio: precioNum,
            imagen: typeof imagen === "string" ? imagen : "",
            stock: stock != null && stock !== "" ? stock : "Disponible",
        });
        guardarCarrito();
        toastSwal({
            icon: "success",
            title: "Producto agregado",
            text: nombre,
            timer: 1200,
            showConfirmButton: false,
        });
        actualizarCarrito();
    };

    window.eliminarProducto = function (index) {
        if (index < 0 || index >= carrito.length) {
            return;
        }
        carrito.splice(index, 1);
        guardarCarrito();
        actualizarCarrito();
        toastSwal({
            icon: "info",
            title: "Producto eliminado",
            timer: 1000,
            showConfirmButton: false,
        });
    };

    window.vaciarCarrito = function () {
        if (carrito.length === 0) {
            toastSwal({
                icon: "info",
                title: "Tu carrito ya está vacío",
                timer: 1000,
                showConfirmButton: false,
            });
            return;
        }
        carrito = [];
        guardarCarrito();
        actualizarCarrito();
        toastSwal({
            icon: "warning",
            title: "Carrito vaciado",
            timer: 1000,
            showConfirmButton: false,
        });
    };

    window.finalizarCompra = function () {
        if (carrito.length === 0) {
            toastSwal({ icon: "warning", title: "Tu carrito está vacío" });
            return;
        }
        var subtotal = carrito.reduce(function (s, p) {
            return s + normalizarPrecio(p.precio);
        }, 0);
        var iva = subtotal * 0.16;
        var total = subtotal + iva;
        var lines = carrito
            .map(function (p) {
                return (
                    escapeHtml(p.nombre) +
                    " — $" +
                    formatoPrecio(p.precio) +
                    " MXN"
                );
            })
            .join("<br>");

        toastSwal({
            icon: "success",
            title: "Compra realizada",
            html:
                '<p class="mb-2 text-start">Gracias por comprar en <strong>Punto Venta Muebles</strong>.</p>' +
                '<div class="text-start small mb-2">' +
                lines +
                "</div>" +
                '<p class="fw-bold mb-0">Subtotal: $' +
                formatoPrecio(subtotal) +
                " MXN<br>" +
                "IVA (16%): $" +
                formatoPrecio(iva) +
                " MXN<br>" +
                "Total: $" +
                formatoPrecio(total) +
                " MXN</p>",
            confirmButtonColor: "#c9a227",
        });

        carrito = [];
        guardarCarrito();
        actualizarCarrito();
    };

    window.actualizarCarrito = function () {
        var lista = document.getElementById("lista-carrito");
        var subtotalEl = document.getElementById("subtotal");
        var ivaEl = document.getElementById("iva");
        var totalEl = document.getElementById("total");
        var contadores = document.querySelectorAll("[data-carrito-contador]");

        var subtotal = carrito.reduce(function (s, p) {
            return s + normalizarPrecio(p.precio);
        }, 0);
        var iva = subtotal * 0.16;
        var total = subtotal + iva;

        if (subtotalEl) {
            subtotalEl.textContent = formatoPrecio(subtotal);
        }
        if (ivaEl) {
            ivaEl.textContent = formatoPrecio(iva);
        }
        if (totalEl) {
            totalEl.textContent = formatoPrecio(total);
        }

        var count = carrito.length;
        contadores.forEach(function (el) {
            el.textContent = String(count);
        });

        var legacy = document.getElementById("contador");
        if (
            legacy &&
            !legacy.hasAttribute("data-carrito-contador")
        ) {
            legacy.textContent = String(count);
        }

        if (!lista) {
            return;
        }

        if (carrito.length === 0) {
            lista.innerHTML =
                '<p class="text-muted text-center py-4 mb-0">Tu carrito está vacío.</p>';
            return;
        }

        lista.innerHTML = carrito
            .map(function (p, i) {
                var imgBlock = p.imagen
                    ? '<img src="' +
                      escapeHtml(p.imagen) +
                      '" alt="" class="cart-thumb rounded-2 flex-shrink-0">'
                    : '<div class="cart-thumb-placeholder flex-shrink-0"><i class="fa-solid fa-couch" aria-hidden="true"></i></div>';
                return (
                    '<div class="card border-0 shadow-sm mb-3 cart-line">' +
                    '<div class="card-body p-3 d-flex gap-3 align-items-center">' +
                    imgBlock +
                    '<div class="flex-grow-1 min-w-0">' +
                    '<h6 class="fw-bold mb-1 text-truncate">' +
                    escapeHtml(p.nombre) +
                    "</h6>" +
                    '<p class="precio mb-2">$' +
                    formatoPrecio(p.precio) +
                    ' <span class="text-muted small fw-normal">MXN</span></p>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarProducto(' +
                    i +
                    ')" aria-label="Eliminar del carrito">' +
                    '<i class="fa-solid fa-trash"></i></button>' +
                    "</div></div></div>"
                );
            })
            .join("");
    };

    cargarCarrito();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", actualizarCarrito);
    } else {
        actualizarCarrito();
    }
})();
