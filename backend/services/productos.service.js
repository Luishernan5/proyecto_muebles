"use strict";

const { sql, getPool } = require("../config/database");
const { AppError } = require("../utils/errors");

async function listar({ idCategoria } = {}) {
    const pool = await getPool();
    const request = pool.request();
    let where = "WHERE p.activo = 1";
    if (idCategoria != null && idCategoria !== "") {
        request.input("idCategoria", sql.Int, parseInt(idCategoria, 10));
        where += " AND p.id_categoria = @idCategoria";
    }
    const result = await request.query(
        `SELECT
          p.id_producto,
          p.nombre,
          p.descripcion,
          p.precio,
          p.id_categoria,
          p.imagen_url,
          c.nombre AS categoria_nombre,
          s.cantidad AS stock,
          ISNULL(r.reservado, 0) AS reservado,
          (s.cantidad - ISNULL(r.reservado, 0)) AS disponible
        FROM Productos p
        INNER JOIN Categorias c ON c.id_categoria = p.id_categoria
        INNER JOIN Stock s ON s.id_producto = p.id_producto
        OUTER APPLY (
          SELECT SUM(cantidad) AS reservado FROM Carrito WHERE id_producto = p.id_producto
        ) r
        ${where}
        ORDER BY c.nombre, p.nombre`
    );
    return result.recordset.map((row) => ({
        ...row,
        precio: Number(row.precio),
        stock: Number(row.stock),
        reservado: Number(row.reservado),
        disponible: Number(row.disponible),
    }));
}

async function obtenerPorId(idProducto) {
    const id = parseInt(idProducto, 10);
    if (Number.isNaN(id) || id < 1) {
        throw new AppError("id_producto inválido", 400, "INVALID_ID");
    }
    const pool = await getPool();
    const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query(
            `SELECT
          p.id_producto,
          p.nombre,
          p.descripcion,
          p.precio,
          p.id_categoria,
          p.imagen_url,
          c.nombre AS categoria_nombre,
          s.cantidad AS stock,
          ISNULL(r.reservado, 0) AS reservado,
          (s.cantidad - ISNULL(r.reservado, 0)) AS disponible
        FROM Productos p
        INNER JOIN Categorias c ON c.id_categoria = p.id_categoria
        INNER JOIN Stock s ON s.id_producto = p.id_producto
        OUTER APPLY (
          SELECT SUM(cantidad) AS reservado FROM Carrito WHERE id_producto = p.id_producto
        ) r
        WHERE p.id_producto = @id AND p.activo = 1`
        );
    const row = result.recordset[0];
    if (!row) {
        throw new AppError("Producto no encontrado", 404, "PRODUCT_NOT_FOUND");
    }
    return {
        ...row,
        precio: Number(row.precio),
        stock: Number(row.stock),
        reservado: Number(row.reservado),
        disponible: Number(row.disponible),
    };
}

module.exports = { listar, obtenerPorId };
