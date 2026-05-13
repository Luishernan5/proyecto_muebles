let carrito = [];

/* =========================
   AGREGAR PRODUCTO
========================= */

function agregarProducto(nombre, precio, imagen) {

    carrito.push({
        nombre,
        precio,
        imagen
    });

    Swal.fire({
        icon: 'success',
        title: 'Producto agregado',
        text: nombre,
        timer: 1200,
        showConfirmButton: false
    });

    actualizarCarrito();
}

/* =========================
   ACTUALIZAR CARRITO
========================= */

function actualizarCarrito() {

    let lista = document.getElementById("lista-carrito");

    lista.innerHTML = "";

    let subtotal = 0;

    carrito.forEach((producto, index) => {

        subtotal += producto.precio;

        lista.innerHTML += `

        <div class="card mb-3 border-0 shadow-sm">

            <div class="row g-0 align-items-center">

                <div class="col-4">

                    <img src="${producto.imagen}"
                        class="img-fluid rounded-start">

                </div>

                <div class="col-8">

                    <div class="card-body py-2">

                        <h6 class="fw-bold mb-1">

                            ${producto.nombre}

                        </h6>

                        <p class="mb-1 text-warning fw-bold">

                            $${producto.precio}

                        </p>

                        <button class="btn btn-sm btn-danger"
                            onclick="eliminarProducto(${index})">

                            <i class="fa fa-trash"></i>

                        </button>

                    </div>

                </div>

            </div>

        </div>

        `;
    });

    let iva = subtotal * 0.16;

    let total = subtotal + iva;

    document.getElementById("subtotal").innerText =
        subtotal.toFixed(2);

    document.getElementById("iva").innerText =
        iva.toFixed(2);

    document.getElementById("total").innerText =
        total.toFixed(2);

    document.getElementById("contador").innerText =
        carrito.length;

    if(carrito.length === 0){

        lista.innerHTML = `
            <p class="text-muted">
                Tu carrito está vacío.
            </p>
        `;
    }
}

/* =========================
   ELIMINAR PRODUCTO
========================= */

function eliminarProducto(index){

    carrito.splice(index, 1);

    actualizarCarrito();

    Swal.fire({
        icon: 'info',
        title: 'Producto eliminado',
        timer: 1000,
        showConfirmButton: false
    });
}

/* =========================
   VACIAR CARRITO
========================= */

function vaciarCarrito(){

    carrito = [];

    actualizarCarrito();

    Swal.fire({
        icon: 'warning',
        title: 'Carrito vaciado',
        timer: 1000,
        showConfirmButton: false
    });
}

/* =========================
   FINALIZAR COMPRA
========================= */

function finalizarCompra(){

    if(carrito.length === 0){

        Swal.fire({
            icon: 'warning',
            title: 'Tu carrito está vacío'
        });

        return;
    }

    Swal.fire({
        icon: 'success',
        title: 'Compra realizada',
        text: 'Gracias por tu compra'
    });

    carrito = [];

    actualizarCarrito();
}