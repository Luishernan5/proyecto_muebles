"use strict";

const { sql, getPool } = require("../config/database");
const { AppError } = require("../utils/errors");
const env = require("../config/env");

/**
 * Suma (o resta) unidades al inventario. Solo administradores.
 * Registra en MovimientosStock si la tabla existe (tipo compra_admin / ajuste).
 */
async function ajustarStock(idProducto, delta, comentario, idAdmin) {
    const id = parseInt(idProducto, 10);
    const d = parseInt(delta, 10);
    if (Number.isNaN(id) || id < 1) {
        throw new AppError("id_producto inválido", 400, "INVALID_PRODUCT");
    }
    if (Number.isNaN(d) || d === 0) {
        throw new AppError(
            "delta debe ser un entero distinto de cero",
            400,
            "INVALID_DELTA"
        );
    }

    const tipo = d > 0 ? "compra_admin" : "ajuste";
    const cantMov = Math.abs(d);
    const com =
        String(comentario || "").trim().slice(0, 240) ||
        (idAdmin ? `Ajuste admin (usuario ${idAdmin})` : "Ajuste admin");

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const warnings = [];
        const req0 = new sql.Request(transaction);
        req0.input("prod", sql.Int, id);
        const chk = await req0.query(
            `SELECT s.cantidad
       FROM Stock s
       INNER JOIN Productos p ON p.id_producto = s.id_producto AND p.activo = 1
       WHERE s.id_producto = @prod`
        );
        if (!chk.recordset.length) {
            throw new AppError("Producto o stock no encontrado", 404, "NOT_FOUND");
        }

        const cap = env.stockCeilingPerProduct;
        const currentQty = Number(chk.recordset[0].cantidad || 0);
        let upd;
        if (d > 0) {
            const space = cap - currentQty;
            if (space <= 0) {
                throw new AppError(
                    `No se pueden agregar más unidades: el stock máximo por producto es ${cap} unidades.`,
                    409,
                    "ABASTO_STOCK_CAP"
                );
            }
            if (d > space) {
                throw new AppError(
                    `No se pueden agregar más unidades: el stock máximo por producto es ${cap} unidades. Espacio disponible: ${space}.`,
                    409,
                    "ABASTO_STOCK_CAP"
                );
            }
            const reqPos = new sql.Request(transaction);
            reqPos.input("prod", sql.Int, id);
            reqPos.input("d", sql.Int, d);
            reqPos.input("cap", sql.Int, cap);
            upd = await reqPos.query(
                `UPDATE Stock
       SET cantidad = cantidad + @d,
           fecha_actualizacion = GETDATE()
       WHERE id_producto = @prod
         AND cantidad + @d >= 0
         AND cantidad + @d <= @cap`
            );
        } else {
            const reqNeg = new sql.Request(transaction);
            reqNeg.input("prod", sql.Int, id);
            reqNeg.input("d", sql.Int, d);
            upd = await reqNeg.query(
                `UPDATE Stock
       SET cantidad = cantidad + @d,
           fecha_actualizacion = GETDATE()
       WHERE id_producto = @prod AND cantidad + @d >= 0`
            );
        }
        if (upd.rowsAffected[0] === 0) {
            throw new AppError(
                "El ajuste dejaría el inventario en negativo",
                409,
                "STOCK_NEGATIVE"
            );
        }

        const chkMov = await new sql.Request(transaction).query(
            `SELECT CASE WHEN OBJECT_ID(N'dbo.MovimientosStock', N'U') IS NOT NULL THEN 1 ELSE 0 END AS t`
        );
        if (Number(chkMov.recordset[0].t) === 1) {
            try {
                const rM = new sql.Request(transaction);
                rM.input("prod", sql.Int, id);
                rM.input("tipo", sql.NVarChar(20), tipo);
                rM.input("cant", sql.Int, cantMov);
                rM.input("com", sql.NVarChar(255), com);
                await rM.query(
                    `INSERT INTO MovimientosStock (id_producto, tipo, cantidad, comentario)
         VALUES (@prod, @tipo, @cant, @com)`
                );
            } catch (movErr) {
                const num = movErr.number || movErr.originalError?.info?.number;
                if (num === 547 || movErr.message?.includes("FOREIGN KEY")) {
                    warnings.push(
                        "El inventario se actualizó, pero no se pudo registrar el movimiento histórico por una restricción de base de datos."
                    );
                } else {
                    throw movErr;
                }
            }
        }

        const req2 = new sql.Request(transaction);
        req2.input("prod", sql.Int, id);
        const out = await req2.query(
            `SELECT cantidad FROM Stock WHERE id_producto = @prod`
        );

        await transaction.commit();
        return {
            id_producto: id,
            cantidad: Number(out.recordset[0].cantidad),
            warnings,
        };
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

module.exports = { ajustarStock };
