/*
  PuntoVentaMuebles — compatibilidad con pedidos de invitado (carrito por sesión).
  Ejecuta esto si creaste Pedidos con id_usuario NOT NULL y sin sesion_id.

  Permite:
  - id_usuario NULL cuando compra quien no ha iniciado sesión (se usa sesion_id).
  - Cliente logueado: id_usuario relleno; sesion_id opcional para trazabilidad.
*/

USE PuntoVentaMuebles;
GO

IF COL_LENGTH(N'dbo.Pedidos', N'sesion_id') IS NULL
BEGIN
    ALTER TABLE dbo.Pedidos ADD sesion_id NVARCHAR(100) NULL;
END
GO

DECLARE @fk SYSNAME;
SELECT @fk = fk.name
FROM sys.foreign_keys AS fk
WHERE fk.parent_object_id = OBJECT_ID(N'dbo.Pedidos')
  AND fk.referenced_object_id = OBJECT_ID(N'dbo.Usuarios');

IF @fk IS NOT NULL
    EXEC(N'ALTER TABLE dbo.Pedidos DROP CONSTRAINT ' + QUOTENAME(@fk) + N';');
GO

ALTER TABLE dbo.Pedidos ALTER COLUMN id_usuario INT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_Pedidos_Usuarios'
      AND parent_object_id = OBJECT_ID(N'dbo.Pedidos')
)
BEGIN
    ALTER TABLE dbo.Pedidos WITH CHECK
    ADD CONSTRAINT FK_Pedidos_Usuarios
        FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios (id_usuario);
END
GO
