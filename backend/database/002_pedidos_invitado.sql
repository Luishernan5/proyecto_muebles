/*
  PuntoVentaMuebles — compatibilidad con pedidos de invitado (carrito por sesión).
  Permite: id_usuario NULL cuando compra quien no ha iniciado sesión (usa sesion_id).
*/

USE PuntoVentaMuebles;
GO

-- Agregar columna sesion_id si no existe
IF COL_LENGTH(N'dbo.Pedidos', N'sesion_id') IS NULL
BEGIN
    ALTER TABLE dbo.Pedidos ADD sesion_id NVARCHAR(100) NULL;
END
GO

-- Eliminar FK si existe
DECLARE @ConstraintName NVARCHAR(MAX);
SET @ConstraintName = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE TABLE_NAME = 'Pedidos' AND REFERENCED_TABLE_NAME = 'Usuarios'
);

IF @ConstraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Pedidos DROP CONSTRAINT ' + @ConstraintName);
GO

ALTER TABLE dbo.Pedidos ALTER COLUMN id_usuario INT NULL;
GO

-- Recrear FK
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'FK_Pedidos_Usuarios'
)
    ALTER TABLE dbo.Pedidos ADD CONSTRAINT FK_Pedidos_Usuarios
        FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios (id_usuario);
END
GO