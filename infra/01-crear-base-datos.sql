-- Crea la base de datos compartida del sistema.
-- Las TABLAS no se crean aqui: cada microservicio crea las suyas al arrancar,
-- mediante inicializarEsquema() en su capa de acceso a datos.
--
-- Uso (PowerShell, con el contenedor ya levantado y "healthy").
-- Nota: desde Git Bash la ruta /opt/... se corrompe por la conversion de
-- rutas de MSYS; usar PowerShell o anteponer MSYS_NO_PATHCONV=1.
--
--   docker exec asilo-sqlserver /opt/mssql-tools18/bin/sqlcmd `
--     -S localhost -U sa -P 'TU_PASSWORD' -C `
--     -Q "IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name='AsiloCabezaAlgodon') CREATE DATABASE AsiloCabezaAlgodon;"

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = 'AsiloCabezaAlgodon')
BEGIN
    CREATE DATABASE AsiloCabezaAlgodon;
END
GO
