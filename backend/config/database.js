"use strict";

const sql = require("mssql");
const { db } = require("./env");

let poolPromise;

function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool({
            server: db.server,
            user: db.user,
            password: db.password,
            database: db.database,
            options: db.options,
            pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
        }).connect();
    }
    return poolPromise;
}

async function query(text, inputs) {
    const pool = await getPool();
    const request = pool.request();
    if (inputs) {
        for (const [key, def] of Object.entries(inputs)) {
            request.input(key, def.type, def.value);
        }
    }
    return request.query(text);
}

module.exports = { sql, getPool, query };
