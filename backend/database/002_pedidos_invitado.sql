USE PuntoVentaMuebles;

IF COL_LENGTH(N'dbo.Pedidos', N'sesion_id') IS NULL
BEGIN
    ALTER TABLE dbo.Pedidos ADD sesion_id NVARCHAR(100) NULL;
END;

DECLARE @fk SYSNAME;

SELECT TOP (1) @fk = fk.name
FROM sys.foreign_keys AS fk
WHERE fk.parent_object_id = OBJECT_ID(N'dbo.Pedidos')
  AND fk.referenced_object_id = OBJECT_ID(N'dbo.Usuarios')
  AND fk.name = N'FK_Pedidos_Usuarios';

IF @fk IS NOT NULL
BEGIN
    DECLARE @sql NVARCHAR(MAX);
    SET @sql = N'ALTER TABLE dbo.Pedidos DROP CONSTRAINT ' + QUOTENAME(@fk);
    EXEC sys.sp_executesql @sql;
END;

ALTER TABLE dbo.Pedidos ALTER COLUMN id_usuario INT NULL;

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
END;