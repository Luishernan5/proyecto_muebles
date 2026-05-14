"use strict";

class AppError extends Error {
    constructor(message, statusCode = 400, code = "ERROR") {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
    }
}

module.exports = { AppError };
