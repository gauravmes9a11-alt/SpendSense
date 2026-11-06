-- SpendSense Non-Destructive Authentication & RBAC Migration
-- Adds role ENUM and password_hash columns to existing users table.
-- Preserves existing user IDs, data, and relational integrity.

-- 1. Add role column if not already present
SET @col_role_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
);
SET @sql_add_role = IF(@col_role_exists = 0, 
    'ALTER TABLE users ADD COLUMN role ENUM(\'ADMIN\', \'CUSTOMER\') NOT NULL DEFAULT \'CUSTOMER\' AFTER email', 
    'SELECT "role column already exists"'
);
PREPARE stmt FROM @sql_add_role;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Add password_hash column if not already present
SET @col_pwd_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'
);
SET @sql_add_pwd = IF(@col_pwd_exists = 0, 
    'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER role', 
    'SELECT "password_hash column already exists"'
);
PREPARE stmt FROM @sql_add_pwd;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
