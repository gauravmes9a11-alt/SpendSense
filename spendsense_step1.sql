-- SpendSense DBMS Mini Project - Step 1
-- Target: MySQL 8.0+
-- Run this script in MySQL Workbench or the mysql command-line client.

CREATE DATABASE IF NOT EXISTS spendsense;
USE spendsense;

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS v_monthly_category_spending;
DROP PROCEDURE IF EXISTS sp_monthly_category_report;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS anomaly_flags;
DROP TABLE IF EXISTS usage_logs;
DROP TABLE IF EXISTS subscription_price_history;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS recurring_groups;
DROP TABLE IF EXISTS merchants;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE categories (
    category_id INT PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(60) NOT NULL UNIQUE,
    category_type ENUM('EXPENSE','INCOME') NOT NULL DEFAULT 'EXPENSE'
) ENGINE=InnoDB;

CREATE TABLE merchants (
    merchant_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE recurring_groups (
    recurring_group_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    merchant_id BIGINT NOT NULL,
    group_name VARCHAR(120) NOT NULL,
    expected_amount DECIMAL(12,2) NOT NULL,
    billing_cycle ENUM('WEEKLY','MONTHLY','QUARTERLY','YEARLY') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_rg_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_rg_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
    CONSTRAINT chk_rg_amount CHECK (expected_amount >= 0),
    UNIQUE KEY uq_rg_user_merchant_name (user_id, merchant_id, group_name)
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
    subscription_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    merchant_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    recurring_group_id BIGINT NULL,
    subscription_name VARCHAR(120) NOT NULL,
    current_price DECIMAL(12,2) NOT NULL,
    billing_cycle ENUM('WEEKLY','MONTHLY','QUARTERLY','YEARLY') NOT NULL,
    started_on DATE NOT NULL,
    status ENUM('ACTIVE','PAUSED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    last_used_on DATE NULL,
    CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_sub_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
    CONSTRAINT fk_sub_category FOREIGN KEY (category_id) REFERENCES categories(category_id),
    CONSTRAINT fk_sub_group FOREIGN KEY (recurring_group_id) REFERENCES recurring_groups(recurring_group_id),
    CONSTRAINT chk_sub_price CHECK (current_price >= 0),
    INDEX idx_sub_user_status (user_id, status)
) ENGINE=InnoDB;

CREATE TABLE transactions (
    transaction_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    merchant_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    subscription_id BIGINT NULL,
    transaction_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    transaction_type ENUM('EXPENSE','INCOME') NOT NULL DEFAULT 'EXPENSE',
    description VARCHAR(255) NULL,
    source ENUM('MANUAL','CSV_IMPORT','SUBSCRIPTION') NOT NULL DEFAULT 'MANUAL',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_tx_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
    CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES categories(category_id),
    CONSTRAINT fk_tx_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id),
    CONSTRAINT chk_tx_amount CHECK (amount >= 0),
    INDEX idx_tx_user_date (user_id, transaction_date),
    INDEX idx_tx_category_date (category_id, transaction_date),
    INDEX idx_tx_merchant_date (merchant_id, transaction_date)
) ENGINE=InnoDB;

CREATE TABLE subscription_price_history (
    price_history_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    subscription_id BIGINT NOT NULL,
    old_price DECIMAL(12,2) NOT NULL,
    new_price DECIMAL(12,2) NOT NULL,
    changed_at DATE NOT NULL,
    change_source ENUM('DETECTED_PAYMENT','USER_REPORTED','SYSTEM_UPDATE') NOT NULL DEFAULT 'DETECTED_PAYMENT',
    CONSTRAINT fk_price_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id),
    CONSTRAINT chk_old_price CHECK (old_price >= 0),
    CONSTRAINT chk_new_price CHECK (new_price >= 0),
    INDEX idx_price_subscription_date (subscription_id, changed_at)
) ENGINE=InnoDB;

CREATE TABLE usage_logs (
    usage_log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    subscription_id BIGINT NOT NULL,
    used_on DATE NOT NULL,
    usage_type VARCHAR(60) NOT NULL DEFAULT 'GENERAL',
    notes VARCHAR(255) NULL,
    CONSTRAINT fk_usage_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id),
    INDEX idx_usage_subscription_date (subscription_id, used_on)
) ENGINE=InnoDB;

CREATE TABLE anomaly_flags (
    anomaly_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    transaction_id BIGINT NULL,
    subscription_id BIGINT NULL,
    anomaly_type ENUM('UNUSUAL_SPENDING','PRICE_DRIFT','LOW_USAGE_HIGH_COST') NOT NULL,
    severity ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
    explanation VARCHAR(500) NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('OPEN','REVIEWED','DISMISSED') NOT NULL DEFAULT 'OPEN',
    CONSTRAINT fk_anom_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_anom_tx FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
    CONSTRAINT fk_anom_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id),
    INDEX idx_anom_user_status (user_id, status)
) ENGINE=InnoDB;

CREATE TABLE alerts (
    alert_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    anomaly_id BIGINT NULL,
    alert_title VARCHAR(150) NOT NULL,
    alert_message VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_alert_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_alert_anomaly FOREIGN KEY (anomaly_id) REFERENCES anomaly_flags(anomaly_id),
    INDEX idx_alert_user_read (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- Seed data: synthetic examples for project demonstration only.
INSERT INTO users (full_name, email) VALUES
('Gaurav Demo', 'gaurav.demo@example.com'),
('Harshitha Demo', 'harshitha.demo@example.com');

INSERT INTO categories (category_name, category_type) VALUES
('Food', 'EXPENSE'),
('Transport', 'EXPENSE'),
('Entertainment', 'EXPENSE'),
('Software', 'EXPENSE'),
('Shopping', 'EXPENSE'),
('Salary', 'INCOME');

INSERT INTO merchants (merchant_name, normalized_name) VALUES
('StreamFlix', 'streamflix'),
('CloudTools', 'cloudtools'),
('Fresh Basket', 'fresh_basket'),
('Metro Transit', 'metro_transit'),
('Acme Employer', 'acme_employer'),
('GameBox', 'gamebox');

INSERT INTO recurring_groups (user_id, merchant_id, group_name, expected_amount, billing_cycle) VALUES
(1, 1, 'StreamFlix monthly plan', 799.00, 'MONTHLY'),
(1, 2, 'CloudTools monthly plan', 499.00, 'MONTHLY'),
(1, 6, 'GameBox monthly plan', 299.00, 'MONTHLY');

INSERT INTO subscriptions
(user_id, merchant_id, category_id, recurring_group_id, subscription_name, current_price, billing_cycle, started_on, status, last_used_on)
VALUES
(1, 1, 3, 1, 'StreamFlix Premium', 799.00, 'MONTHLY', '2025-01-10', 'ACTIVE', '2026-08-15'),
(1, 2, 4, 2, 'CloudTools Pro', 499.00, 'MONTHLY', '2025-03-01', 'ACTIVE', '2026-10-18'),
(1, 6, 3, 3, 'GameBox Plus', 299.00, 'MONTHLY', '2025-05-01', 'ACTIVE', '2026-06-01');

INSERT INTO transactions
(user_id, merchant_id, category_id, subscription_id, transaction_date, amount, transaction_type, description, source)
VALUES
(1, 3, 1, NULL, '2026-07-03', 650.00, 'EXPENSE', 'Groceries', 'MANUAL'),
(1, 3, 1, NULL, '2026-07-15', 720.00, 'EXPENSE', 'Groceries', 'MANUAL'),
(1, 4, 2, NULL, '2026-07-18', 180.00, 'EXPENSE', 'Metro card', 'MANUAL'),
(1, 1, 3, 1, '2026-07-10', 649.00, 'EXPENSE', 'StreamFlix billing', 'SUBSCRIPTION'),
(1, 2, 4, 2, '2026-07-01', 499.00, 'EXPENSE', 'CloudTools billing', 'SUBSCRIPTION'),
(1, 6, 3, 3, '2026-07-05', 299.00, 'EXPENSE', 'GameBox billing', 'SUBSCRIPTION'),
(1, 3, 1, NULL, '2026-08-04', 700.00, 'EXPENSE', 'Groceries', 'MANUAL'),
(1, 3, 1, NULL, '2026-08-17', 680.00, 'EXPENSE', 'Groceries', 'MANUAL'),
(1, 4, 2, NULL, '2026-08-20', 200.00, 'EXPENSE', 'Metro card', 'MANUAL'),
(1, 1, 3, 1, '2026-08-10', 649.00, 'EXPENSE', 'StreamFlix billing', 'SUBSCRIPTION'),
(1, 2, 4, 2, '2026-08-01', 499.00, 'EXPENSE', 'CloudTools billing', 'SUBSCRIPTION'),
(1, 6, 3, 3, '2026-08-05', 299.00, 'EXPENSE', 'GameBox billing', 'SUBSCRIPTION'),
(1, 3, 1, NULL, '2026-09-04', 850.00, 'EXPENSE', 'Groceries', 'MANUAL'),
(1, 3, 1, NULL, '2026-09-17', 780.00, 'EXPENSE', 'Groceries', 'MANUAL'),
(1, 4, 2, NULL, '2026-09-20', 190.00, 'EXPENSE', 'Metro card', 'MANUAL'),
(1, 1, 3, 1, '2026-09-10', 799.00, 'EXPENSE', 'StreamFlix price changed', 'SUBSCRIPTION'),
(1, 2, 4, 2, '2026-09-01', 499.00, 'EXPENSE', 'CloudTools billing', 'SUBSCRIPTION'),
(1, 6, 3, 3, '2026-09-05', 299.00, 'EXPENSE', 'GameBox billing', 'SUBSCRIPTION'),
(1, 5, 6, NULL, '2026-09-30', 45000.00, 'INCOME', 'Monthly salary', 'MANUAL'),
(2, 3, 1, NULL, '2026-09-12', 500.00, 'EXPENSE', 'Groceries', 'MANUAL');

INSERT INTO subscription_price_history (subscription_id, old_price, new_price, changed_at, change_source) VALUES
(1, 649.00, 799.00, '2026-09-10', 'DETECTED_PAYMENT');

INSERT INTO usage_logs (subscription_id, used_on, usage_type, notes) VALUES
(1, '2026-07-15', 'VIDEO', 'Watched a show'),
(1, '2026-08-15', 'VIDEO', 'Watched a show'),
(2, '2026-10-18', 'WORK', 'Used for project'),
(3, '2026-06-01', 'GAME', 'Last recorded use');

INSERT INTO anomaly_flags (user_id, transaction_id, subscription_id, anomaly_type, severity, explanation) VALUES
(1, 16, 1, 'PRICE_DRIFT', 'MEDIUM', 'StreamFlix charge increased from Rs 649 to Rs 799 (about 23.1%).'),
(1, NULL, 3, 'LOW_USAGE_HIGH_COST', 'MEDIUM', 'No recent usage is recorded for GameBox Plus; review whether it is still needed.');

INSERT INTO alerts (user_id, anomaly_id, alert_title, alert_message) VALUES
(1, 1, 'Subscription price increased', 'StreamFlix increased from Rs 649 to Rs 799. Review the new price.'),
(1, 2, 'Subscription may be unused', 'No recent usage is recorded for GameBox Plus. Review before the next renewal.');

-- Report 1: average monthly spending by category (expenses only).
SELECT c.category_name,
       DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
       ROUND(AVG(t.amount), 2) AS average_transaction_amount,
       ROUND(SUM(t.amount), 2) AS total_spending,
       COUNT(*) AS transaction_count
FROM transactions t
JOIN categories c ON c.category_id = t.category_id
WHERE t.user_id = 1
  AND t.transaction_type = 'EXPENSE'
GROUP BY c.category_name, DATE_FORMAT(t.transaction_date, '%Y-%m')
ORDER BY month, total_spending DESC;

-- Report 2: highest-spending merchants.
SELECT m.merchant_name, ROUND(SUM(t.amount), 2) AS total_spent,
       COUNT(*) AS transaction_count
FROM transactions t
JOIN merchants m ON m.merchant_id = t.merchant_id
WHERE t.user_id = 1 AND t.transaction_type = 'EXPENSE'
GROUP BY m.merchant_id, m.merchant_name
ORDER BY total_spent DESC;

-- Report 3: subscription price drift and percentage change.
SELECT s.subscription_name, p.old_price, p.new_price, p.changed_at,
       ROUND(p.new_price - p.old_price, 2) AS increase_amount,
       ROUND(100 * (p.new_price - p.old_price) / NULLIF(p.old_price, 0), 2) AS increase_percent
FROM subscription_price_history p
JOIN subscriptions s ON s.subscription_id = p.subscription_id
WHERE s.user_id = 1
ORDER BY p.changed_at DESC;

-- Report 4: subscriptions with no recorded usage in the last 30 days.
-- The reference date is CURDATE(); for repeatable demo results, change it to a fixed date if needed.
SELECT s.subscription_name, s.current_price, s.billing_cycle, s.last_used_on,
       DATEDIFF(CURDATE(), s.last_used_on) AS days_since_last_recorded_use
FROM subscriptions s
WHERE s.user_id = 1
  AND s.status = 'ACTIVE'
  AND (s.last_used_on IS NULL OR s.last_used_on < DATE_SUB(CURDATE(), INTERVAL 30 DAY))
ORDER BY s.current_price DESC;

-- Report 5: window function LAG() to inspect month-to-month subscription charges.
WITH monthly_charges AS (
    SELECT subscription_id,
           DATE_FORMAT(transaction_date, '%Y-%m-01') AS billing_month,
           SUM(amount) AS month_charge
    FROM transactions
    WHERE user_id = 1 AND transaction_type = 'EXPENSE' AND subscription_id IS NOT NULL
    GROUP BY subscription_id, DATE_FORMAT(transaction_date, '%Y-%m-01')
),
charge_comparison AS (
    SELECT subscription_id, billing_month, month_charge,
           LAG(month_charge) OVER (PARTITION BY subscription_id ORDER BY billing_month) AS previous_month_charge
    FROM monthly_charges
)
SELECT s.subscription_name, cc.billing_month, cc.previous_month_charge, cc.month_charge,
       ROUND(cc.month_charge - cc.previous_month_charge, 2) AS change_amount
FROM charge_comparison cc
JOIN subscriptions s ON s.subscription_id = cc.subscription_id
ORDER BY s.subscription_name, cc.billing_month;

-- View: reusable monthly category report.
CREATE OR REPLACE VIEW v_monthly_category_spending AS
SELECT t.user_id, c.category_name,
       DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
       ROUND(SUM(t.amount), 2) AS total_spending,
       COUNT(*) AS transaction_count
FROM transactions t
JOIN categories c ON c.category_id = t.category_id
WHERE t.transaction_type = 'EXPENSE'
GROUP BY t.user_id, c.category_name, DATE_FORMAT(t.transaction_date, '%Y-%m');

-- Stored procedure: monthly category report for a chosen user.
DELIMITER //
CREATE PROCEDURE sp_monthly_category_report(IN p_user_id BIGINT)
BEGIN
    SELECT category_name, month, total_spending, transaction_count
    FROM v_monthly_category_spending
    WHERE user_id = p_user_id
    ORDER BY month, total_spending DESC;
END//
DELIMITER ;

-- Final smoke tests:
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'merchants', COUNT(*) FROM merchants
UNION ALL SELECT 'recurring_groups', COUNT(*) FROM recurring_groups
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'subscription_price_history', COUNT(*) FROM subscription_price_history
UNION ALL SELECT 'usage_logs', COUNT(*) FROM usage_logs
UNION ALL SELECT 'anomaly_flags', COUNT(*) FROM anomaly_flags
UNION ALL SELECT 'alerts', COUNT(*) FROM alerts;

-- Test stored procedure:
CALL sp_monthly_category_report(1);
