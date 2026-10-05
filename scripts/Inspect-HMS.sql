-- Run in SSMS as an authorized HMS administrator. Read-only metadata only.
SELECT @@SERVERNAME AS server_name, DB_NAME() AS selected_database,
       SERVERPROPERTY('IsIntegratedSecurityOnly') AS windows_auth_only;
SELECT name, is_disabled FROM sys.sql_logins WHERE name = 'lis-user';
-- Select the actual HMS database in the query dropdown before continuing.
SELECT dp.name AS database_user, sp.name AS mapped_login
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON dp.sid = sp.sid
WHERE dp.name = 'lis-user';
SELECT s.name AS schema_name, o.name AS object_name, c.name AS column_name,
       ty.name AS data_type, c.max_length, c.is_nullable
FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE o.name IN ('Patient_reg', 'Patient_InformationMaster', 'LisPatientLookup')
ORDER BY s.name, o.name, c.column_id;
SELECT OBJECT_NAME(f.parent_object_id) AS child_table,
       COL_NAME(f.parent_object_id, f.parent_column_id) AS child_column,
       OBJECT_NAME(f.referenced_object_id) AS parent_table,
       COL_NAME(f.referenced_object_id, f.referenced_column_id) AS parent_column
FROM sys.foreign_key_columns f
WHERE OBJECT_NAME(f.parent_object_id) IN ('Patient_reg','Patient_InformationMaster');
