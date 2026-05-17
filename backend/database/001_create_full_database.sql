/*
Comando: 001_create_full_database.sql
Descripción: Script completo para crear la base de datos "PuntoVentaMuebles"
Instrucciones: Abrir en SSMS y ejecutar por secciones. Requiere permisos de administrador (sa).
*/

USE master;
GO

IF DB_ID(N'PuntoVentaMuebles') IS NOT NULL
BEGIN
    ALTER DATABASE PuntoVentaMuebles SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE PuntoVentaMuebles;
END
GO

-- Crear base con archivos en ruta por defecto del servidor (ajusta si es necesario)
CREATE DATABASE PuntoVentaMuebles;
GO

USE PuntoVentaMuebles;
GO

/* ======================
   TABLAS PRINCIPALES
   ====================== */

-- Usuarios
CREATE TABLE dbo.Usuarios (
    id_usuario      INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    nombre          NVARCHAR(100) NOT NULL,
    email           NVARCHAR(255) NOT NULL,
    [contraseña]    NVARCHAR(255) NOT NULL,
    rol             NVARCHAR(20) NOT NULL CONSTRAINT DF_Usuarios_rol DEFAULT (N'cliente'),
    activo          BIT NOT NULL CONSTRAINT DF_Usuarios_activo DEFAULT (1),
    fecha_registro  DATETIME2(0) NOT NULL CONSTRAINT DF_Usuarios_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.Usuarios ADD CONSTRAINT UQ_Usuarios_email UNIQUE (email);
ALTER TABLE dbo.Usuarios ADD CONSTRAINT CK_Usuarios_rol CHECK (rol IN (N'admin', N'cliente'));
GO

-- Categorias
CREATE TABLE dbo.Categorias (
    id_categoria    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    nombre          NVARCHAR(120) NOT NULL,
    descripcion     NVARCHAR(500) NULL,
    imagen_url      NVARCHAR(500) NULL,
    fecha_creacion  DATETIME2(0) NOT NULL CONSTRAINT DF_Categorias_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.Categorias ADD CONSTRAINT UQ_Categorias_nombre UNIQUE (nombre);
GO

-- Productos
CREATE TABLE dbo.Productos (
    id_producto     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    nombre          NVARCHAR(200) NOT NULL,
    descripcion     NVARCHAR(2000) NULL,
    precio          DECIMAL(10,2) NOT NULL,
    id_categoria    INT NOT NULL,
    imagen_url      NVARCHAR(500) NULL,
    activo          BIT NOT NULL CONSTRAINT DF_Productos_activo DEFAULT (1),
    fecha_creacion  DATETIME2(0) NOT NULL CONSTRAINT DF_Productos_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.Productos ADD CONSTRAINT CK_Productos_precio CHECK (precio >= 0);
GO

-- Stock: 1 fila por producto (PK = id_producto)
CREATE TABLE dbo.Stock (
    id_producto          INT NOT NULL PRIMARY KEY,
    cantidad             INT NOT NULL CONSTRAINT DF_Stock_cantidad DEFAULT (0),
    fecha_actualizacion  DATETIME2(0) NOT NULL CONSTRAINT DF_Stock_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.Stock ADD CONSTRAINT CK_Stock_cantidad CHECK (cantidad >= 0);
GO

-- Carrito
CREATE TABLE dbo.Carrito (
    id_carrito       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_producto      INT NOT NULL,
    cantidad         INT NOT NULL,
    sesion_id        NVARCHAR(100) NOT NULL,
    fecha_agregado   DATETIME2(0) NOT NULL CONSTRAINT DF_Carrito_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.Carrito ADD CONSTRAINT CK_Carrito_cantidad CHECK (cantidad > 0);
GO

-- Pedidos
CREATE TABLE dbo.Pedidos (
    id_pedido        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_usuario       INT NULL,
    total            DECIMAL(10,2) NOT NULL,
    estado           NVARCHAR(20) NOT NULL CONSTRAINT DF_Pedidos_estado DEFAULT (N'completado'),
    sesion_id        NVARCHAR(100) NULL,
    fecha_pedido     DATETIME2(0) NOT NULL CONSTRAINT DF_Pedidos_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.Pedidos ADD CONSTRAINT CK_Pedidos_total CHECK (total >= 0);
ALTER TABLE dbo.Pedidos ADD CONSTRAINT CK_Pedidos_estado CHECK (estado IN (N'pendiente', N'completado', N'cancelado'));
GO

-- DetallePedido
CREATE TABLE dbo.DetallePedido (
    id_detalle        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_pedido         INT NOT NULL,
    id_producto       INT NOT NULL,
    cantidad          INT NOT NULL,
    precio_unitario   DECIMAL(10,2) NOT NULL
);
GO
ALTER TABLE dbo.DetallePedido ADD CONSTRAINT CK_DetallePedido_cantidad CHECK (cantidad > 0);
ALTER TABLE dbo.DetallePedido ADD CONSTRAINT CK_DetallePedido_precio CHECK (precio_unitario >= 0);
GO

-- MovimientosStock
CREATE TABLE dbo.MovimientosStock (
    id_movimiento     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_producto       INT NOT NULL,
    tipo              NVARCHAR(20) NOT NULL,
    cantidad          INT NOT NULL,
    id_referencia     INT NULL,
    comentario        NVARCHAR(255) NULL,
    fecha_movimiento  DATETIME2(0) NOT NULL CONSTRAINT DF_Movimientos_fecha DEFAULT (SYSDATETIME())
);
GO
ALTER TABLE dbo.MovimientosStock ADD CONSTRAINT CK_Movimiento_tipo CHECK (tipo IN (N'ajuste', N'compra_admin', N'venta'));
ALTER TABLE dbo.MovimientosStock ADD CONSTRAINT CK_Movimientos_cantidad CHECK (cantidad > 0);
GO

/* ======================
   RELACIONES (FOREIGN KEYS)
   ====================== */

ALTER TABLE dbo.Productos
ADD CONSTRAINT FK_Productos_Categorias FOREIGN KEY (id_categoria) REFERENCES dbo.Categorias(id_categoria);
GO

ALTER TABLE dbo.Stock
ADD CONSTRAINT FK_Stock_Productos FOREIGN KEY (id_producto) REFERENCES dbo.Productos(id_producto);
GO

ALTER TABLE dbo.Carrito
ADD CONSTRAINT FK_Carrito_Productos FOREIGN KEY (id_producto) REFERENCES dbo.Productos(id_producto);
GO

ALTER TABLE dbo.Pedidos
ADD CONSTRAINT FK_Pedidos_Usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios(id_usuario);
GO

ALTER TABLE dbo.DetallePedido
ADD CONSTRAINT FK_DetallePedido_Pedidos FOREIGN KEY (id_pedido) REFERENCES dbo.Pedidos(id_pedido);
GO

ALTER TABLE dbo.DetallePedido
ADD CONSTRAINT FK_DetallePedido_Productos FOREIGN KEY (id_producto) REFERENCES dbo.Productos(id_producto);
GO

ALTER TABLE dbo.MovimientosStock
ADD CONSTRAINT FK_Movimientos_Producto FOREIGN KEY (id_producto) REFERENCES dbo.Productos(id_producto);
GO

ALTER TABLE dbo.MovimientosStock
ADD CONSTRAINT FK_Movimientos_ReferenciaPedidos FOREIGN KEY (id_referencia) REFERENCES dbo.Pedidos(id_pedido);
GO

/* ======================
   ÍNDICES Y ÚNICOS
   ====================== */

CREATE UNIQUE INDEX UX_Carrito_sesion_producto ON dbo.Carrito(sesion_id, id_producto);
CREATE INDEX IX_Carrito_producto ON dbo.Carrito(id_producto);
CREATE INDEX IX_Stock_producto ON dbo.Stock(id_producto);
CREATE INDEX IX_Pedidos_usuario_fecha ON dbo.Pedidos(id_usuario, fecha_pedido DESC);
CREATE INDEX IX_DetallePedido_pedido ON dbo.DetallePedido(id_pedido);
CREATE INDEX IX_MovimientosStock_producto_fecha ON dbo.MovimientosStock(id_producto, fecha_movimiento DESC);
GO

/* ======================
   DATOS DE EJEMPLO COMPLETOS
   ====================== */

-- Categorías base
INSERT INTO dbo.Categorias (nombre, descripcion, imagen_url) VALUES
(N'Camas', N'Muebles para descanso', NULL),
(N'Comedor', N'Muebles de comedor', NULL),
(N'Muebles', N'Muebles para hogar y oficina', NULL),
(N'Accesorios', N'Accesorios y complementos', NULL);
GO

-- Productos: catálogo de ejemplo (más completo)
-- Auto-generated products + stock from frontend pages
SET NOCOUNT ON;
GO
/* Ensure categories exist (insert only if missing) */
IF NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE nombre = N'Camas')
BEGIN
    INSERT INTO dbo.Categorias (nombre) VALUES (N'Camas');
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE nombre = N'Comedor')
BEGIN
    INSERT INTO dbo.Categorias (nombre) VALUES (N'Comedor');
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Categorias WHERE nombre = N'Muebles')
BEGIN
    INSERT INTO dbo.Categorias (nombre) VALUES (N'Muebles');
END
GO

-- Insert Productos with explicit ids so frontend IDs match
SET IDENTITY_INSERT dbo.Productos ON;
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (1, N'Cama Individual Nova', NULL, 4999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/individual/Cama1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (2, N'Cama Individual Luxury', NULL, 5699.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/individual/Cama2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (3, N'Cama Individual Premium', NULL, 6299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/individual/Cama3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (4, N'Cama Individual Deluxe', NULL, 6999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/individual/Cama4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (5, N'Cama Individual Infinity', NULL, 7499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/individual/Cama5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (6, N'King Size Nova', NULL, 10999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/king_size/Cama1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (7, N'King Size Luxury', NULL, 11999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/king_size/Cama2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (8, N'King Size Premium', NULL, 12999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/king_size/Cama3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (9, N'King Size Deluxe', NULL, 13999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/king_size/Cama4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (10, N'King Size Infinity', NULL, 14999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/king_size/Cama5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (11, N'Cama Matrimonial Nova', NULL, 7999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/matrimonial/Cama1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (12, N'Cama Matrimonial Luxury', NULL, 8699.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/matrimonial/Cama2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (13, N'Cama Matrimonial Premium', NULL, 9299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/matrimonial/Cama3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (14, N'Cama Matrimonial Deluxe', NULL, 9999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/matrimonial/Cama4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (15, N'Cama Matrimonial Infinity', NULL, 10999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Camas'), N'../../img/camas/matrimonial/Cama5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (16, N'Comedor Esencial', NULL, 18499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Comedor%20familiar/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (17, N'Comedor Nova', NULL, 22499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Comedor%20familiar/2.1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (18, N'Comedor Deluxe', NULL, 28999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Comedor%20familiar/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (19, N'Comedor Harmony', NULL, 24999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Comedor%20familiar/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (20, N'Comedor Infinity', NULL, 31999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Comedor%20familiar/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (21, N'Mesa centro Nordic', NULL, 4999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Mesa%20de%20Centro/1.webp', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (22, N'Mesa centro Line', NULL, 5499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Mesa%20de%20Centro/3.webp', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (23, N'Mesa centro Alba', NULL, 6299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Mesa%20de%20Centro/4.1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (24, N'Mesa centro Lux', NULL, 5999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Mesa%20de%20Centro/5.2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (25, N'Mesa centro Oslo', NULL, 5799.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Mesa%20de%20Centro/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (26, N'Silla Verona', NULL, 1299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20comedor/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (27, N'Silla Roma', NULL, 1399.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20comedor/2.1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (28, N'Silla Milan', NULL, 1499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20comedor/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (29, N'Silla Torino', NULL, 1599.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20comedor/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (30, N'Silla Venecia', NULL, 1699.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20comedor/3.3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (31, N'Silla Compact', NULL, 999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20individual/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (32, N'Silla Basic', NULL, 1099.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20individual/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (33, N'Silla Urban', NULL, 1199.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20individual/3.1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (34, N'Silla Soft', NULL, 1299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20individual/5.1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (35, N'Silla Flex', NULL, 1399.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20individual/1.2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (36, N'Silla Pro Seat', NULL, 3499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20gamer%20-escritorio/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (37, N'Silla Apex', NULL, 3899.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20gamer%20-escritorio/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (38, N'Silla Nitro', NULL, 4299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20gamer%20-escritorio/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (39, N'Silla Phantom', NULL, 4599.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20gamer%20-escritorio/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (40, N'Silla Elite', NULL, 4999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Comedor'), N'../../img/Comedor/Sillas/silla%20gamer%20-escritorio/3.4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (41, N'Alacena Moderna Premium', NULL, 8999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/alacenas/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (42, N'Alacena Luxury', NULL, 10499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/alacenas/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (43, N'Alacena Classic', NULL, 7999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/alacenas/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (44, N'Alacena Deluxe', NULL, 11999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/alacenas/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (45, N'Alacena Infinity', NULL, 14999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/alacenas/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (46, N'Buró Elegance', NULL, 2999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/buros/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (47, N'Buró Luxury', NULL, 3499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/buros/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (48, N'Buró Classic', NULL, 2799.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/buros/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (49, N'Buró Deluxe', NULL, 3999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/buros/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (50, N'Buró Infinity', NULL, 4499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/buros/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (51, N'Closet Elegance', NULL, 9999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/closets/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (52, N'Closet Luxury', NULL, 11499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/closets/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (53, N'Closet Premium', NULL, 12999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/closets/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (54, N'Closet Deluxe', NULL, 13999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/closets/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (55, N'Closet Infinity', NULL, 14999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/closets/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (56, N'Estante Elegance', NULL, 2999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/estantes/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (57, N'Estante Luxury', NULL, 3499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/estantes/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (58, N'Estante Premium', NULL, 3999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/estantes/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (59, N'Estante Deluxe', NULL, 4499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/estantes/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (60, N'Estante Infinity', NULL, 4999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/estantes/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (61, N'Mueble TV Elegance', NULL, 5999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/muebles_tv/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (62, N'Mueble TV Luxury', NULL, 6999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/muebles_tv/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (63, N'Mueble TV Premium', NULL, 7999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/muebles_tv/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (64, N'Mueble TV Deluxe', NULL, 8999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/muebles_tv/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (65, N'Mueble TV Infinity', NULL, 9999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/muebles_tv/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (66, N'Tocador Elegance', NULL, 5499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/tocadores/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (67, N'Tocador Luxury', NULL, 6399.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/tocadores/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (68, N'Tocador Premium', NULL, 7299.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/tocadores/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (69, N'Tocador Deluxe', NULL, 8499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/tocadores/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (70, N'Tocador Infinity', NULL, 9499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/tocadores/5.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (71, N'Escritorio Elegance', NULL, 4999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/escritorios/1.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (72, N'Escritorio Luxury', NULL, 5999.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/escritorios/2.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (73, N'Escritorio Premium', NULL, 6499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/escritorios/3.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (74, N'Escritorio Deluxe', NULL, 7499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/escritorios/4.jpg', 1);
INSERT INTO dbo.Productos (id_producto, nombre, descripcion, precio, id_categoria, imagen_url, activo) VALUES (75, N'Escritorio Infinity', NULL, 8499.00, (SELECT TOP 1 id_categoria FROM dbo.Categorias WHERE nombre = N'Muebles'), N'../../img/muebles/escritorios/5.jpg', 1);
SET IDENTITY_INSERT dbo.Productos OFF;
GO

DECLARE @StockInicial INT = 0; -- ajusta este valor si necesitas un stock base distinto
-- Stock inicial para cada producto (no se fija 10 por producto; se usa una sola configuración)
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 1) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (1, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 2) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (2, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 3) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (3, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 4) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (4, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 5) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (5, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 6) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (6, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 7) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (7, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 8) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (8, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 9) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (9, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 10) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (10, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 11) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (11, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 12) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (12, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 13) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (13, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 14) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (14, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 15) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (15, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 16) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (16, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 17) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (17, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 18) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (18, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 19) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (19, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 20) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (20, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 21) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (21, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 22) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (22, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 23) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (23, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 24) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (24, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 25) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (25, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 26) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (26, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 27) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (27, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 28) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (28, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 29) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (29, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 30) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (30, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 31) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (31, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 32) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (32, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 33) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (33, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 34) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (34, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 35) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (35, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 36) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (36, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 37) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (37, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 38) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (38, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 39) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (39, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 40) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (40, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 41) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (41, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 42) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (42, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 43) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (43, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 44) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (44, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 45) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (45, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 46) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (46, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 47) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (47, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 48) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (48, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 49) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (49, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 50) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (50, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 51) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (51, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 52) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (52, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 53) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (53, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 54) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (54, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 55) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (55, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 56) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (56, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 57) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (57, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 58) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (58, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 59) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (59, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 60) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (60, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 61) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (61, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 62) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (62, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 63) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (63, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 64) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (64, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 65) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (65, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 66) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (66, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 67) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (67, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 68) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (68, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 69) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (69, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 70) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (70, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 71) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (71, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 72) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (72, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 73) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (73, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 74) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (74, @StockInicial);
IF NOT EXISTS (SELECT 1 FROM dbo.Stock WHERE id_producto = 75) INSERT INTO dbo.Stock (id_producto, cantidad) VALUES (75, @StockInicial);
GO

-- Fix identity seed for Productos
DBCC CHECKIDENT ('dbo.Productos', RESEED, 75);


-- Usuarios de ejemplo (admin + clientes)
-- Admin password: admin123 -> bcrypt hash (cost 10)
INSERT INTO dbo.Usuarios (nombre, email, [contraseña], rol, activo) VALUES
(N'Administrador', N'admin@local', N'$2a$10$Gr.eBw2TJpmSQiVYBZb1xOsq/942K8IXVa9yB10FCF7nK5FcN/4dC', N'admin', 1),
(N'Cliente Demo', N'cliente@local', N'$2a$10$Gr.eBw2TJpmSQiVYBZb1xOsq/942K8IXVa9yB10FCF7nK5FcN/4dC', N'cliente', 1);
GO

-- Opcional: ejemplos de carrito (por sesión)
INSERT INTO dbo.Carrito (id_producto, cantidad, sesion_id)
VALUES
( (SELECT TOP 1 id_producto FROM dbo.Productos WHERE nombre LIKE '%Nova%'), 1, 'session-demo-1'),
( (SELECT TOP 1 id_producto FROM dbo.Productos WHERE nombre LIKE '%Silla%'), 2, 'session-demo-1');
GO

/* ======================
   MOVIMIENTOS / PEDIDOS DE EJEMPLO
   ====================== */

-- Declarar variable para pedido
DECLARE @pid INT;

-- Insertar pedido de prueba para cliente
INSERT INTO dbo.Pedidos (id_usuario, total, estado, sesion_id)
VALUES (2, 3248.00, N'completado', NULL);

SET @pid = SCOPE_IDENTITY(); -- id_pedido insertado

-- Añadir detalle de pedido (si existe producto)
INSERT INTO dbo.DetallePedido (id_pedido, id_producto, cantidad, precio_unitario)
SELECT @pid, p.id_producto, 2, p.precio FROM dbo.Productos p WHERE p.nombre LIKE '%Silla%' AND id_producto <= 3;
GO

-- MovimientosStock de ejemplo
DECLARE @pid_movimiento INT;
SET @pid_movimiento = (SELECT TOP 1 id_pedido FROM dbo.Pedidos WHERE total = 3248.00);
INSERT INTO dbo.MovimientosStock (id_producto, tipo, cantidad, id_referencia, comentario)
SELECT p.id_producto, N'venta', 2, @pid_movimiento, N'Venta de ejemplo' FROM dbo.Productos p WHERE p.nombre LIKE '%Silla%' AND id_producto <= 3;
GO

/* ======================
   VERIFICACIONES
   ====================== */
SELECT DB_NAME() AS base_actual;
SELECT COUNT(*) AS tablas_usuario FROM sys.tables;
SELECT (SELECT COUNT(*) FROM dbo.Usuarios) AS usuarios, (SELECT COUNT(*) FROM dbo.Productos) AS productos, (SELECT COUNT(*) FROM dbo.Stock) AS stock_rows;
GO

/* FIN DEL SCRIPT */
