"use strict";

const { sql, getPool } = require("../config/database");
const { AppError } = require("../utils/errors");
const env = require("../config/env");

const STOCK_MIN = env.stockMin;

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
    return stock - (reservado - cantidadActualLinea);
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

        const maxPerm = maxPermitidoSesion({
            stock,
            reservado,
            cantidadActualLinea: actualLinea,
        });
        if (nueva > maxPerm) {
            const puedeAgregar = Math.max(0, maxPerm - actualLinea);
            throw new AppError(
                `Stock insuficiente (incluye unidades ya reservadas en otros carritos). Puedes agregar como máximo ${puedeAgregar} unidad(es) más.`,
                409,
                "INSUFFICIENT_STOCK"
            );
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
                `UPDATE Carrito SET cantidad = @nueva, fecha_agregado = GETDATE()
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
        const maxPerm = maxPermitidoSesion({
            stock,
            reservado,
            cantidadActualLinea: actual,
        });
        if (nueva > maxPerm) {
            throw new AppError(
                `Cantidad no válida. Máximo permitido ahora: ${maxPerm}.`,
                409,
                "INSUFFICIENT_STOCK"
            );
        }

        const req2 = new sql.Request(transaction);
        req2.input("id", sql.Int, idCarrito);
        req2.input("n", sql.Int, nueva);
        await req2.query(
            `UPDATE Carrito SET cantidad = @n, fecha_agregado = GETDATE() WHERE id_carrito = @id`
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
    const warnings = [];
    for (const L of lineas) {
        if (L.disponible_global <= 3 && L.disponible_global > 0) {
            warnings.push(
                `Pocas unidades disponibles de «${L.nombre}» (${L.disponible_global} libres en total).`
            );
        }
        if (L.disponible_global === 0) {
            warnings.push(`«${L.nombre}» está totalmente reservado en carritos.`);
        }
    }
    return warnings;
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
      ORDER BY c.fecha_agregado`
        );

    const lineas = result.recordset.map((row) => {
        const stock = Number(row.stock);
        const reservado = Number(row.reservado);
        const cantidad = Number(row.cantidad);
        const disponible_global = stock - reservado;
        const max_linea = Math.min(
            maxLinea,
            maxPermitidoSesion({
                stock,
                reservado,
                cantidadActualLinea: cantidad,
            })
        );
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
        warnings: advertenciasDesdeLineas(lineas),
    };
}

async function checkout(sesionId, idUsuarioCliente) {
    const idCliente =
        idUsuarioCliente != null &&
        !Number.isNaN(parseInt(String(idUsuarioCliente), 10))
            ? parseInt(String(idUsuarioCliente), 10)
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
    checkout,
};
