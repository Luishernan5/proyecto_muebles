"use strict";

const { sql, getPool } = require("../config/database");

async function listar() {
    const pool = await getPool();
    const result = await pool
        .request()
        .query(
            `SELECT id_categoria, nombre, descripcion, imagen_url
       FROM Categorias
       ORDER BY nombre`
        );
    return result.recordset;
}

module.exports = { listar };
