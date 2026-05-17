"use strict";

const { sql, getPool } = require("../config/database");
const { AppError } = require("../utils/errors");
const env = require("../config/env");

const STOCK_MIN = env.stockMin;
const STOCK_CEILING = env.stockCeilingPerProduct;

function esRolAdmin(rol) {
    return String(rol || "").toLowerCase() === "admin";
}

function maxLineaCarrito(rol) {
    const r = String(rol || "").toLowerCase();
    return r === "admin" ? env.cartMaxAdmin : env.cartMaxClient;
}

async function resumenStock(idProducto, transaction) {
    const pool = await getPool();
    const req = transaction ? new sql.Request(transaction) : pool.request();
    req.input("id", sql.Int, idProducto);
    const r = await req.query(
        `SELECT
          s.cantidad AS stock,
          ISNULL((
            SELECT SUM(c.cantidad) FROM Carrito c WHERE c.id_producto = @id
          ), 0) AS reservado
        FROM Stock s
        WHERE s.id_producto = @id`
    );
    const row = r.recordset[0];
    if (!row) {
        throw new AppError(
            "Producto sin inventario registrado",
            400,
            "NO_STOCK_ROW"
        );
    }
    const stock = Number(row.stock);
    const reservado = Number(row.reservado);
    return { stock, reservado, disponible: stock - reservado };
}

async function obtenerLinea(idCarrito, sesionId, transaction) {
    const pool = await getPool();
    const req = transaction ? new sql.Request(transaction) : pool.request();
    req.input("id", sql.Int, idCarrito);
    req.input("sesion", sql.NVarChar(100), sesionId);
    const r = await req.query(
        `SELECT id_carrito, id_producto, cantidad, sesion_id
     FROM Carrito
     WHERE id_carrito = @id AND sesion_id = @sesion`
    );
    return r.recordset[0] || null;
}

async function lineaSesionProducto(sesionId, idProducto, transaction) {
    const pool = await getPool();
    const req = transaction ? new sql.Request(transaction) : pool.request();
    req.input("sesion", sql.NVarChar(100), sesionId);
    req.input("prod", sql.Int, idProducto);
    const r = await req.query(
        `SELECT TOP 1 id_carrito, cantidad
     FROM Carrito
     WHERE sesion_id = @sesion AND id_producto = @prod`
    );
    return r.recordset[0] || null;
}

function validarCantidadEntera(cantidad, campo = "cantidad") {
    const n = parseInt(cantidad, 10);
    if (Number.isNaN(n) || n < 1) {
        throw new AppError(
            `${campo} debe ser un entero mayor o igual a 1`,
            400,
            "INVALID_QUANTITY"
        );
    }
    return n;
}

function maxPermitidoSesion({ stock, reservado, cantidadActualLinea }) {
    // Evitar que las sesiones reserven todo el stock dejando menos de STOCK_MIN.
    // Permitimos como máximo que la suma de reservas llegue a `stock - STOCK_MIN`.
    const permitido = stock - (reservado - cantidadActualLinea) - STOCK_MIN;
    return Math.max(0, permitido);
}

async function agregarItem(sesionId, idProducto, cantidad, rolUsuario) {
    const maxLinea = maxLineaCarrito(rolUsuario);
    const id = parseInt(idProducto, 10);
    if (Number.isNaN(id) || id < 1) {
        throw new AppError("id_producto inválido", 400, "INVALID_PRODUCT");
    }
    const q = validarCantidadEntera(cantidad);
    if (q > maxLinea) {
        throw new AppError(
            `No puedes agregar más de ${maxLinea} unidades por producto`,
            400,
            "MAX_QUANTITY_EXCEEDED"
        );
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const reqLock = new sql.Request(transaction);
        reqLock.input("prod", sql.Int, id);
        const lockRes = await reqLock.query(
            `SELECT s.cantidad FROM Stock s WITH (UPDLOCK, ROWLOCK)
      INNER JOIN Productos p ON p.id_producto = s.id_producto AND p.activo = 1
      WHERE s.id_producto = @prod`
        );
        if (!lockRes.recordset.length) {
            throw new AppError(
                "Producto no encontrado o inactivo",
                404,
                "PRODUCT_NOT_FOUND"
            );
        }

        const { stock, reservado } = await resumenStock(id, transaction);
        const existente = await lineaSesionProducto(sesionId, id, transaction);
        const actualLinea = existente ? Number(existente.cantidad) : 0;
        const nueva = actualLinea + q;

        // Para administradores, no permitir que la cantidad en carrito haga que
        // el inventario final supere STOCK_CEILING. Calculamos el máximo permitido
        // como el mínimo entre `maxLinea` (límite por sesión/rol) y el espacio
        // restante hasta `STOCK_CEILING` considerando la línea actual.
        let maxPerm;
        if (esRolAdmin(rolUsuario)) {
            const espacioHastaTope = STOCK_CEILING - stock;
            // Nuevo máximo absoluto en la línea = actualLinea + espacioHastaTope
            const maxPorTecho = actualLinea + Math.max(0, espacioHastaTope);
            maxPerm = Math.min(maxLinea, maxPorTecho);
        } else {
            maxPerm = maxPermitidoSesion({
                stock,
                reservado,
                cantidadActualLinea: actualLinea,
            });
        }
        if (nueva > maxPerm) {
            const code = esRolAdmin(rolUsuario) ? "MAX_LINEA" : "INSUFFICIENT_STOCK";
            const status = esRolAdmin(rolUsuario) ? 400 : 409;
            const msg = esRolAdmin(rolUsuario)
                ? `Cantidad no válida: la línea no puede superar ${maxPerm} unidades (tope por inventario y rol).`
                : `No se pueden agregar más unidades: máximo permitido ahora ${maxPerm}.`;
            throw new AppError(msg, status, code);
        }
        if (nueva > maxLinea) {
            throw new AppError(
                `La cantidad en carrito no puede superar ${maxLinea} por producto`,
                400,
                "MAX_LINEA"
            );
        }

        if (existente) {
            const reqU = new sql.Request(transaction);
            reqU.input("id", sql.Int, existente.id_carrito);
            reqU.input("nueva", sql.Int, nueva);
            await reqU.query(
                `UPDATE Carrito SET cantidad = @nueva
         WHERE id_carrito = @id`
            );
        } else {
            const reqI = new sql.Request(transaction);
            reqI.input("sesion", sql.NVarChar(100), sesionId);
            reqI.input("prod", sql.Int, id);
            reqI.input("q", sql.Int, q);
            await reqI.query(
                `INSERT INTO Carrito (id_producto, cantidad, sesion_id)
         VALUES (@prod, @q, @sesion)`
            );
        }

        await transaction.commit();
        return listarCarrito(sesionId, rolUsuario);
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

async function actualizarCantidad(idCarrito, sesionId, cantidad, rolUsuario) {
    const maxLinea = maxLineaCarrito(rolUsuario);
    const nueva = validarCantidadEntera(cantidad);
    if (nueva > maxLinea) {
        throw new AppError(
            `Máximo ${maxLinea} unidades por producto en carrito`,
            400,
            "MAX_LINEA"
        );
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const linea = await obtenerLinea(idCarrito, sesionId, transaction);
        if (!linea) {
            throw new AppError("Línea de carrito no encontrada", 404, "LINE_NOT_FOUND");
        }
        const idProd = Number(linea.id_producto);
        const actual = Number(linea.cantidad);

        const reqLock = new sql.Request(transaction);
        reqLock.input("prod", sql.Int, idProd);
        await reqLock.query(
            `SELECT cantidad FROM Stock WITH (UPDLOCK, ROWLOCK) WHERE id_producto = @prod`
        );

        const { stock, reservado } = await resumenStock(idProd, transaction);
        // Igual que en agregarItem: para admin respetar STOCK_CEILING
        let maxPerm;
        if (esRolAdmin(rolUsuario)) {
            const espacioHastaTope = STOCK_CEILING - stock;
            const maxPorTecho = actual + Math.max(0, espacioHastaTope);
            maxPerm = Math.min(maxLinea, maxPorTecho);
        } else {
            maxPerm = maxPermitidoSesion({
                stock,
                reservado,
                cantidadActualLinea: actual,
            });
        }
        if (nueva > maxPerm) {
            const code = esRolAdmin(rolUsuario) ? "MAX_LINEA" : "INSUFFICIENT_STOCK";
            const status = esRolAdmin(rolUsuario) ? 400 : 409;
            const msg = esRolAdmin(rolUsuario)
                ? `Cantidad no válida. Máximo ${maxPerm} unidades por producto en carrito de abasto.`
                : `Cantidad no válida. Máximo permitido ahora: ${maxPerm}.`;
            throw new AppError(msg, status, code);
        }

        const req2 = new sql.Request(transaction);
        req2.input("id", sql.Int, idCarrito);
        req2.input("n", sql.Int, nueva);
        await req2.query(
            `UPDATE Carrito SET cantidad = @n WHERE id_carrito = @id`
        );

        await transaction.commit();
        return listarCarrito(sesionId, rolUsuario);
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

async function eliminarLinea(idCarrito, sesionId, rolUsuario) {
    const pool = await getPool();
    const result = await pool
        .request()
        .input("id", sql.Int, idCarrito)
        .input("sesion", sql.NVarChar(100), sesionId)
        .query(
            `DELETE FROM Carrito WHERE id_carrito = @id AND sesion_id = @sesion`
        );
    if (result.rowsAffected[0] === 0) {
        throw new AppError("Línea no encontrada", 404, "LINE_NOT_FOUND");
    }
    return listarCarrito(sesionId, rolUsuario);
}

async function vaciar(sesionId, rolUsuario) {
    const pool = await getPool();
    await pool
        .request()
        .input("sesion", sql.NVarChar(100), sesionId)
        .query(`DELETE FROM Carrito WHERE sesion_id = @sesion`);
    return listarCarrito(sesionId, rolUsuario);
}

function advertenciasDesdeLineas(lineas) {
    // Solo mantenemos un arreglo vacío para no mostrar alertas de stock bajo.
    // La validación real de compra la hace el checkout contra el stock de la BD.
    return [];
}

async function listarCarrito(sesionId, rolUsuario) {
    const maxLinea = maxLineaCarrito(rolUsuario);
    const pool = await getPool();
    const result = await pool
        .request()
        .input("sesion", sql.NVarChar(100), sesionId)
        .query(
            `SELECT
        c.id_carrito,
        c.id_producto,
        c.cantidad,
        p.nombre,
        p.precio,
        p.imagen_url,
        s.cantidad AS stock,
        ISNULL(r.reservado, 0) AS reservado,
        (s.cantidad - ISNULL(r.reservado, 0)) AS disponible_global
      FROM Carrito c
      INNER JOIN Productos p ON p.id_producto = c.id_producto
      INNER JOIN Stock s ON s.id_producto = c.id_producto
      OUTER APPLY (
        SELECT SUM(x.cantidad) AS reservado
        FROM Carrito x
        WHERE x.id_producto = c.id_producto
      ) r
      WHERE c.sesion_id = @sesion
            ORDER BY c.id_carrito`
        );

    const lineas = result.recordset.map((row) => {
        const stock = Number(row.stock);
        const reservado = Number(row.reservado);
        const cantidad = Number(row.cantidad);
        const disponible_global = stock - reservado;
        let max_linea;
        if (esRolAdmin(rolUsuario)) {
            const espacioHastaTope = STOCK_CEILING - stock;
            const maxPorTecho = cantidad + Math.max(0, espacioHastaTope);
            max_linea = Math.min(maxLinea, maxPorTecho);
        } else {
            max_linea = Math.min(
                maxLinea,
                maxPermitidoSesion({
                    stock,
                    reservado,
                    cantidadActualLinea: cantidad,
                })
            );
        }
        return {
            id_carrito: Number(row.id_carrito),
            id_producto: Number(row.id_producto),
            cantidad,
            nombre: row.nombre,
            precio: Number(row.precio),
            imagen_url: row.imagen_url || "",
            stock,
            reservado,
            disponible_global,
            max_en_carrito: max_linea,
        };
    });

    const subtotal = lineas.reduce((s, L) => s + L.precio * L.cantidad, 0);
    const iva = Math.round(subtotal * 0.16 * 100) / 100;
    const total = Math.round((subtotal + iva) * 100) / 100;

    return {
        lineas,
        subtotal,
        iva,
        total,
        warnings: esRolAdmin(rolUsuario) ? [] : advertenciasDesdeLineas(lineas),
    };
}

async function obtenerRemisionPedido(idPedido, sesionId) {
    const pedido = parseInt(idPedido, 10);
    if (Number.isNaN(pedido) || pedido < 1) {
        throw new AppError("ID de pedido inválido", 400, "INVALID_ORDER_ID");
    }

    const pool = await getPool();
    const req = pool.request();
    req.input("idPedido", sql.Int, pedido);
    req.input("sesionId", sql.NVarChar(100), sesionId || null);

    const r = await req.query(
        `SELECT
            p.id_pedido,
            p.total,
            p.estado,
            p.sesion_id,
            p.fecha_pedido,
            dp.id_producto,
            pr.nombre,
            dp.cantidad,
            dp.precio_unitario
         FROM Pedidos p
         INNER JOIN DetallePedido dp ON dp.id_pedido = p.id_pedido
         INNER JOIN Productos pr ON pr.id_producto = dp.id_producto
         WHERE p.id_pedido = @idPedido
           AND (@sesionId IS NULL OR p.sesion_id = @sesionId)
         ORDER BY dp.id_detalle ASC`
    );

    if (!r.recordset || !r.recordset.length) {
        throw new AppError(
            "No se encontró la nota de remisión solicitada",
            404,
            "ORDER_NOT_FOUND"
        );
    }

    const cabecera = r.recordset[0];
    const items = r.recordset.map((row) => ({
        id_producto: Number(row.id_producto),
        nombre: row.nombre,
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
        importe: Math.round(Number(row.cantidad) * Number(row.precio_unitario) * 100) / 100,
    }));

    const subtotal = items.reduce((acc, item) => acc + item.importe, 0);
    const iva = Math.round(subtotal * 0.16 * 100) / 100;
    const total = Math.round((subtotal + iva) * 100) / 100;

    return {
        id_pedido: Number(cabecera.id_pedido),
        fecha_pedido: cabecera.fecha_pedido,
        estado: cabecera.estado,
        sesion_id: cabecera.sesion_id,
        subtotal,
        iva,
        total,
        items,
    };
}

async function cancelarPedido(idPedido, sesionId) {
    const pedido = parseInt(idPedido, 10);
    const sesion = String(sesionId || "").trim();

    if (Number.isNaN(pedido) || pedido < 1) {
        throw new AppError("ID de pedido inválido", 400, "INVALID_ORDER_ID");
    }
    if (!sesion) {
        throw new AppError("Sesión inválida", 400, "INVALID_SESSION");
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const reqPedido = new sql.Request(transaction);
        reqPedido.input("idPedido", sql.Int, pedido);
        reqPedido.input("sesionId", sql.NVarChar(100), sesion);
        const pedidoRes = await reqPedido.query(
            `SELECT id_pedido, estado, sesion_id
             FROM Pedidos WITH (UPDLOCK, HOLDLOCK)
             WHERE id_pedido = @idPedido
               AND sesion_id = @sesionId`
        );

        if (!pedidoRes.recordset.length) {
            throw new AppError(
                "No se encontró el pedido solicitado",
                404,
                "ORDER_NOT_FOUND"
            );
        }

        const pedidoRow = pedidoRes.recordset[0];
        if (String(pedidoRow.estado || "").toLowerCase() === "cancelado") {
            throw new AppError(
                "El pedido ya fue cancelado",
                409,
                "ORDER_ALREADY_CANCELLED"
            );
        }

        const detallesRes = await new sql.Request(transaction)
            .input("idPedido", sql.Int, pedido)
            .query(
                `SELECT id_producto, cantidad
                 FROM DetallePedido
                 WHERE id_pedido = @idPedido`
            );

        if (!detallesRes.recordset.length) {
            throw new AppError(
                "El pedido no tiene detalle para cancelar",
                400,
                "ORDER_EMPTY"
            );
        }

        const hasMovRes = await new sql.Request(transaction).query(
            `SELECT CASE WHEN OBJECT_ID(N'dbo.MovimientosStock', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_mov`
        );
        const registrarMovimientos = Number(hasMovRes.recordset[0].has_mov) === 1;

        for (const detalle of detallesRes.recordset) {
            const idProducto = Number(detalle.id_producto);
            const cantidad = Number(detalle.cantidad);

            const lockStockReq = new sql.Request(transaction);
            lockStockReq.input("prod", sql.Int, idProducto);
            const stockRow = await lockStockReq.query(
                `SELECT cantidad
                 FROM Stock WITH (UPDLOCK, ROWLOCK)
                 WHERE id_producto = @prod`
            );

            if (!stockRow.recordset.length) {
                throw new AppError(
                    `Producto #${idProducto} no tiene registro de stock.`,
                    400,
                    "NO_STOCK_RECORD"
                );
            }

            const updStockReq = new sql.Request(transaction);
            updStockReq.input("prod", sql.Int, idProducto);
            updStockReq.input("q", sql.Int, cantidad);
            await updStockReq.query(
                `UPDATE Stock
                 SET cantidad = cantidad + @q,
                     fecha_actualizacion = GETDATE()
                 WHERE id_producto = @prod`
            );

            if (registrarMovimientos) {
                const movReq = new sql.Request(transaction);
                movReq.input("prod", sql.Int, idProducto);
                movReq.input("q", sql.Int, cantidad);
                movReq.input("ref", sql.Int, pedido);
                movReq.input(
                    "com",
                    sql.NVarChar(255),
                    `Cancelación pedido #${pedido}`
                );
                await movReq.query(
                    `INSERT INTO MovimientosStock (id_producto, tipo, cantidad, id_referencia, comentario)
                     VALUES (@prod, N'ajuste', @q, @ref, @com)`
                );
            }
        }

        await new sql.Request(transaction)
            .input("idPedido", sql.Int, pedido)
            .query(
                `UPDATE Pedidos
                 SET estado = N'cancelado'
                 WHERE id_pedido = @idPedido`
            );

        await transaction.commit();
        return {
            ok: true,
            id_pedido: pedido,
            estado: "cancelado",
            message: "El pedido fue cancelado y el stock fue devuelto.",
        };
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

async function checkoutAbasto(sesionId, idAdmin) {
    // Validaciones iniciales
    if (!sesionId || sesionId.length === 0) {
        throw new AppError("Sesión inválida", 400, "INVALID_SESSION");
    }
    if (!idAdmin || isNaN(parseInt(idAdmin, 10))) {
        throw new AppError("ID de administrador inválido", 400, "INVALID_ADMIN");
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const warnings = [];

        // Verificar si existen las tablas necesarias
        const reqSchema = await new sql.Request(transaction).query(
            `SELECT CASE WHEN OBJECT_ID(N'dbo.MovimientosStock', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_mov`
        );
        const integrarMov = Number(reqSchema.recordset[0].has_mov) === 1;

        // Obtener líneas del carrito
        const req0 = new sql.Request(transaction);
        req0.input("sesion", sql.NVarChar(100), sesionId);
        const lines = await req0.query(
            `SELECT c.id_carrito, c.id_producto, c.cantidad, p.precio AS precio_unitario
       FROM Carrito c WITH (UPDLOCK, HOLDLOCK)
       INNER JOIN Productos p ON p.id_producto = c.id_producto AND p.activo = 1
       WHERE c.sesion_id = @sesion`
        );

        if (!lines.recordset || lines.recordset.length === 0) {
            throw new AppError("El carrito está vacío", 400, "EMPTY_CART");
        }

        // Procesar cada línea del carrito
        for (const row of lines.recordset) {
            const idProd = Number(row.id_producto);
            const qty = Number(row.cantidad);

            // Validar datos
            if (isNaN(idProd) || isNaN(qty) || qty < 1) {
                throw new AppError(
                    `Datos inválidos en carrito: producto ${idProd}, cantidad ${qty}`,
                    400,
                    "INVALID_CART_DATA"
                );
            }

            // Obtener o crear registro de Stock
            const reqChk = new sql.Request(transaction);
            reqChk.input("prod", sql.Int, idProd);
            const chk = await reqChk.query(
                `SELECT cantidad FROM Stock WITH (UPDLOCK, ROWLOCK) WHERE id_producto = @prod`
            );

            if (!chk.recordset || chk.recordset.length === 0) {
                const reqInsStock = new sql.Request(transaction);
                reqInsStock.input("prod", sql.Int, idProd);
                await reqInsStock.query(
                    `INSERT INTO Stock (id_producto, cantidad, fecha_actualizacion)
           VALUES (@prod, 0, GETDATE())`
                );
            }

            // Calcular cantidad a agregar — regla estricta: si la cantidad solicitada
            // supera el espacio disponible hasta el tope, se rechaza toda la operación.
            const currentQty = chk.recordset && chk.recordset.length > 0
                ? Number(chk.recordset[0].cantidad)
                : 0;
            const remaining = STOCK_CEILING - currentQty;
            if (qty > remaining) {
                throw new AppError(
                    `No se pueden agregar más unidades: el stock máximo por producto es ${STOCK_CEILING} unidades.`,
                    409,
                    "ABASTO_STOCK_CAP"
                );
            }
            const appliedQty = qty; // aceptamos la cantidad completa cuando hay espacio

            // Actualizar Stock
            const req1 = new sql.Request(transaction);
            req1.input("prod", sql.Int, idProd);
            req1.input("q", sql.Int, appliedQty);
            req1.input("cap", sql.Int, STOCK_CEILING);
            const upd = await req1.query(
                `UPDATE Stock
         SET cantidad = cantidad + @q,
             fecha_actualizacion = GETDATE()
         WHERE id_producto = @prod
           AND cantidad + @q <= @cap`
            );

            if (upd.rowsAffected[0] === 0) {
                throw new AppError(
                    `No se pudo registrar el abasto: el producto #${idProd} superaría el inventario máximo permitido (${STOCK_CEILING} uds.). Reduce la cantidad o ajusta STOCK_CEILING_PER_PRODUCT.`,
                    409,
                    "ABASTO_STOCK_CAP"
                );
            }

            // Registrar movimiento si existe tabla
            if (integrarMov) {
                try {
                    const rM = new sql.Request(transaction);
                    rM.input("prod", sql.Int, idProd);
                    rM.input("q", sql.Int, appliedQty);
                    rM.input(
                        "com",
                        sql.NVarChar(255),
                        idAdmin
                            ? `Abasto vía carrito (admin usuario ${idAdmin})`
                            : "Abasto vía carrito (admin)"
                    );
                    await rM.query(
                        `INSERT INTO MovimientosStock (id_producto, tipo, cantidad, comentario)
           VALUES (@prod, N'compra_admin', @q, @com)`
                    );
                } catch (movErr) {
                    const num = movErr.number || movErr.originalError?.info?.number;
                    const msg = (movErr.message || "").toUpperCase();
                    
                    // FK error: tabla tiene restricciones, pero stock se actualizó correctamente
                    if (num === 547 || msg.includes("FOREIGN KEY") || msg.includes("FK")) {
                        warnings.push(
                            `Producto #${idProd}: stock actualizado (+${appliedQty} uds.), pero no se pudo registrar en histórico de movimientos. (Base de datos: restricción de integridad)`
                        );
                    } else if (num === 2627 || msg.includes("UNIQUE")) {
                        // Constraint UNIQUE: quizás ya existe registro
                        warnings.push(
                            `Producto #${idProd}: stock actualizado, pero no se pudo registrar movimiento (ya existe).`
                        );
                    } else {
                        // Error desconocido: falla la transacción
                        throw movErr;
                    }
                }
            }
        }

        // Vaciar carrito
        const reqDel = new sql.Request(transaction);
        reqDel.input("sesion", sql.NVarChar(100), sesionId);
        await reqDel.query(`DELETE FROM Carrito WHERE sesion_id = @sesion`);

        await transaction.commit();
        return {
            ok: true,
            modo: "abasto_admin",
            message:
                "Abasto registrado: el inventario aumentó según el carrito y quedó vacío.",
            warnings,
        };
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

/**
 * Venta al público (invitado o cliente): descuenta stock y opcionalmente registra pedido.
 * Los administradores no pueden usar este flujo (deben usar checkoutAbasto).
 */
async function checkoutCompra(sesionId, usuario) {
    if (usuario && esRolAdmin(usuario.rol)) {
        throw new AppError(
            "Las compras de cliente no aplican a una sesión de administrador. Usa el apartado de abasto y POST /api/carrito/abasto.",
            403,
            "USE_ABASTO_ENDPOINT"
        );
    }

    const idCliente =
        usuario && String(usuario.rol || "").toLowerCase() === "cliente"
            ? usuario.id_usuario
            : null;

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const reqSchema = await new sql.Request(transaction).query(
            `SELECT
          CASE WHEN OBJECT_ID(N'dbo.Pedidos', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_ped,
          CASE WHEN OBJECT_ID(N'dbo.DetallePedido', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_det,
          CASE WHEN OBJECT_ID(N'dbo.MovimientosStock', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_mov`
        );
        const sch = reqSchema.recordset[0];
        const integrarPedidos =
            Number(sch.has_ped) === 1 &&
            Number(sch.has_det) === 1 &&
            Number(sch.has_mov) === 1;

        const req0 = new sql.Request(transaction);
        req0.input("sesion", sql.NVarChar(100), sesionId);
        const lines = await req0.query(
            `SELECT c.id_carrito, c.id_producto, c.cantidad, p.precio AS precio_unitario
       FROM Carrito c WITH (UPDLOCK, HOLDLOCK)
       INNER JOIN Productos p ON p.id_producto = c.id_producto AND p.activo = 1
       WHERE c.sesion_id = @sesion`
        );

        if (!lines.recordset.length) {
            throw new AppError("El carrito está vacío", 400, "EMPTY_CART");
        }

        const subtotal = lines.recordset.reduce(function (s, row) {
            return (
                s +
                Number(row.cantidad) * Number(row.precio_unitario || 0)
            );
        }, 0);
        const iva = Math.round(subtotal * 0.16 * 100) / 100;
        const total = Math.round((subtotal + iva) * 100) / 100;

        let idPedido = null;

        if (integrarPedidos) {
            const colQ = await new sql.Request(transaction).query(
                `SELECT c.name, c.is_nullable
         FROM sys.columns c
         WHERE c.object_id = OBJECT_ID(N'dbo.Pedidos')
           AND c.name IN (N'sesion_id', N'id_usuario')`
            );
            const colMap = {};
            colQ.recordset.forEach(function (r) {
                colMap[r.name] = r.is_nullable === true;
            });
            const tieneSesion = Object.prototype.hasOwnProperty.call(
                colMap,
                "sesion_id"
            );
            const usuarioNullable = colMap.id_usuario === true;

            if (!idCliente && !usuarioNullable) {
                throw new AppError(
                    "Debes iniciar sesión como cliente para finalizar la compra.",
                    403,
                    "LOGIN_REQUIRED"
                );
            }
            if (!idCliente && !tieneSesion) {
                throw new AppError(
                    "Falta columna Pedidos.sesion_id para compras de invitado. Ejecuta database/002_pedidos_invitado.sql",
                    500,
                    "DB_CONFIG"
                );
            }

            const rIns = new sql.Request(transaction);
            rIns.input("total", sql.Decimal(10, 2), total);

            let insSql;
            if (tieneSesion && idCliente) {
                rIns.input("uid", sql.Int, idCliente);
                rIns.input("sesion", sql.NVarChar(100), sesionId);
                insSql =
                    `INSERT INTO Pedidos (id_usuario, total, estado, sesion_id)
           OUTPUT INSERTED.id_pedido AS id_pedido
           VALUES (@uid, @total, N'completado', @sesion)`;
            } else if (tieneSesion && !idCliente) {
                rIns.input("sesion", sql.NVarChar(100), sesionId);
                insSql =
                    `INSERT INTO Pedidos (id_usuario, total, estado, sesion_id)
           OUTPUT INSERTED.id_pedido AS id_pedido
           VALUES (NULL, @total, N'completado', @sesion)`;
            } else {
                rIns.input("uid", sql.Int, idCliente);
                insSql =
                    `INSERT INTO Pedidos (id_usuario, total, estado)
           OUTPUT INSERTED.id_pedido AS id_pedido
           VALUES (@uid, @total, N'completado')`;
            }

            const insP = await rIns.query(insSql);
            idPedido = Number(insP.recordset[0].id_pedido);
        }

        for (const row of lines.recordset) {
            const idProd = Number(row.id_producto);
            const qty = Number(row.cantidad);
            const precioUnit = Number(row.precio_unitario || 0);

            const reqChkProd = new sql.Request(transaction);
            reqChkProd.input("prod", sql.Int, idProd);
            const chkProd = await reqChkProd.query(
                `SELECT cantidad FROM Stock WHERE id_producto = @prod`
            );
            if (!chkProd.recordset.length) {
                throw new AppError(
                    `Producto #${idProd} no tiene registro de stock.`,
                    400,
                    "NO_STOCK_RECORD"
                );
            }

            const req1 = new sql.Request(transaction);
            req1.input("prod", sql.Int, idProd);
            req1.input("q", sql.Int, qty);
            req1.input("minStock", sql.Int, STOCK_MIN);
            const upd = await req1.query(
                `UPDATE Stock
         SET cantidad = cantidad - @q,
             fecha_actualizacion = GETDATE()
         WHERE id_producto = @prod
           AND cantidad - @q >= @minStock`
            );
            if (upd.rowsAffected[0] === 0) {
                throw new AppError(
                    `No se pudo completar la venta: el stock de uno de los productos ya no alcanza (debe quedar al menos ${STOCK_MIN} unidad).`,
                    409,
                    "CHECKOUT_STOCK"
                );
            }

            if (integrarPedidos && idPedido != null) {
                const rD = new sql.Request(transaction);
                rD.input("pid", sql.Int, idPedido);
                rD.input("prod", sql.Int, idProd);
                rD.input("q", sql.Int, qty);
                rD.input("pu", sql.Decimal(10, 2), precioUnit);
                await rD.query(
                    `INSERT INTO DetallePedido (id_pedido, id_producto, cantidad, precio_unitario)
           VALUES (@pid, @prod, @q, @pu)`
                );

                const rM = new sql.Request(transaction);
                rM.input("prod", sql.Int, idProd);
                rM.input("q", sql.Int, qty);
                rM.input("ref", sql.Int, idPedido);
                rM.input(
                    "com",
                    sql.NVarChar(255),
                    "Venta pedido #" + idPedido
                );
                await rM.query(
                    `INSERT INTO MovimientosStock (id_producto, tipo, cantidad, id_referencia, comentario)
           VALUES (@prod, N'venta', @q, @ref, @com)`
                );
            }
        }

        const reqDel = new sql.Request(transaction);
        reqDel.input("sesion", sql.NVarChar(100), sesionId);
        await reqDel.query(`DELETE FROM Carrito WHERE sesion_id = @sesion`);

        await transaction.commit();
        return {
            ok: true,
            modo: "venta_cliente",
            id_pedido: idPedido,
            message: integrarPedidos
                ? "Compra registrada: pedido, inventario y movimientos de stock actualizados."
                : "Compra registrada. El inventario se actualizó y el carrito quedó vacío.",
        };
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

module.exports = {
    agregarItem,
    actualizarCantidad,
    eliminarLinea,
    vaciar,
    listarCarrito,
    obtenerRemisionPedido,
    cancelarPedido,
    checkoutCompra,
    checkoutAbasto,
};
