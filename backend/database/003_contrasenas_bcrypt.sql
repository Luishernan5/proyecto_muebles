/*
  Contraseñas insertadas en texto plano NO funcionan con el login de la API
  (se guarda y compara con bcrypt).

  Ejecuta esto en PuntoVentaMuebles DESPUÉS de tus INSERT manuales, para:
  - admin@muebles.com  → contraseña: admin123
  - cliente@muebles.com → contraseña: cliente123
*/

USE PuntoVentaMuebles;
GO

UPDATE dbo.Usuarios
SET [contraseña] = N'$2a$10$QifTf0Onhl3eNw.sDO5/Se0dAT3DXx05KFqg2mfJiLwpy7hny1ZM2'
WHERE LOWER(LTRIM(RTRIM(email))) = N'admin@muebles.com';
GO

UPDATE dbo.Usuarios
SET [contraseña] = N'$2a$10$k04Fi1DTIqAY7D8.OnEnBOhNn5x.3Y9N6Sxu1/US1VzgVw2DqbqQm'
WHERE LOWER(LTRIM(RTRIM(email))) = N'cliente@muebles.com';
GO
