"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const app = require("./app");
const { port } = require("./config/env");

app.listen(port, () => {
    console.log(`Servidor en http://localhost:${port}`);
    console.log(`Frontend estático + API /api`);
});
