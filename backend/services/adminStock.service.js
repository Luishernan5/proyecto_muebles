"use strict";

const { sql, getPool } = require("../config/database");
const { AppError } = require("../utils/errors");

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

        const req1 = new sql.Request(transaction);
        req1.input("prod", sql.Int, id);
        req1.input("d", sql.Int, d);
        const upd = await req1.query(
            `UPDATE Stock
       SET cantidad = cantidad + @d,
           fecha_actualizacion = GETDATE()
       WHERE id_producto = @prod AND cantidad + @d >= 0`
        );
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
            const rM = new sql.Request(transaction);
            rM.input("prod", sql.Int, id);
            rM.input("tipo", sql.NVarChar(20), tipo);
            rM.input("cant", sql.Int, cantMov);
            rM.input("com", sql.NVarChar(255), com);
            await rM.query(
                `INSERT INTO MovimientosStock (id_producto, tipo, cantidad, id_referencia, comentario)
         VALUES (@prod, @tipo, @cant, NULL, @com)`
            );
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
        };
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
}

module.exports = { ajustarStock };
