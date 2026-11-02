-- SpendSense Master Database Script
-- PES University - DBMS Experiential Learning Level 3 MiniProject
-- Team: Gaurav (PES1UG24AM104) & Harshitha B T (PES1UG24AM118)
-- Target: MySQL 8.0+

CREATE DATABASE IF NOT EXISTS spendsense;
USE spendsense;

SET FOREIGN_KEY_CHECKS = 0;
DROP TRIGGER IF EXISTS trg_track_price_change;
DROP TRIGGER IF EXISTS trg_flag_large_transaction;
DROP FUNCTION IF EXISTS fn_annualized_cost;
DROP PROCEDURE IF EXISTS sp_monthly_category_report;
DROP PROCEDURE IF EXISTS sp_detect_price_drift;
DROP VIEW IF EXISTS v_monthly_category_spending;
DROP VIEW IF EXISTS v_unused_subscriptions;
DROP VIEW IF EXISTS v_recurring_payment_candidates;
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

-- 1. USERS TABLE (Includes Role-Based Access Control: ADMIN vs CUSTOMER)
CREATE TABLE users (
    user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role ENUM('ADMIN', 'CUSTOMER') NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. CATEGORIES TABLE
CREATE TABLE categories (
    category_id INT PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(60) NOT NULL UNIQUE,
    category_type ENUM('EXPENSE','INCOME') NOT NULL DEFAULT 'EXPENSE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. MERCHANTS TABLE
CREATE TABLE merchants (
    merchant_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    merchant_name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. RECURRING GROUPS TABLE
CREATE TABLE recurring_groups (
    recurring_group_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    merchant_id BIGINT NOT NULL,
    group_name VARCHAR(120) NOT NULL,
    expected_amount DECIMAL(12,2) NOT NULL,
    billing_cycle ENUM('WEEKLY','MONTHLY','QUARTERLY','YEARLY') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_rg_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_rg_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT chk_rg_amount CHECK (expected_amount >= 0),
    UNIQUE KEY uq_rg_user_merchant_name (user_id, merchant_id, group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE subscriptions (
    subscription_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    merchant_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    subscription_name VARCHAR(120) NOT NULL,
    current_price DECIMAL(10,2) NOT NULL,
    billing_cycle ENUM('WEEKLY','MONTHLY','QUARTERLY','YEARLY') NOT NULL,
    started_on DATE NOT NULL,
    status ENUM('ACTIVE','PAUSED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    last_used_on DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_sub_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_sub_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT chk_sub_price CHECK (current_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. TRANSACTIONS TABLE
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
    source ENUM('MANUAL','IMPORT','SUBSCRIPTION') NOT NULL DEFAULT 'MANUAL',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_tx_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tx_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id) ON DELETE SET NULL,
    CONSTRAINT chk_tx_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. SUBSCRIPTION PRICE HISTORY TABLE
CREATE TABLE subscription_price_history (
    price_history_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    subscription_id BIGINT NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    change_source ENUM('MANUAL','IMPORT','NOTIFICATION') NOT NULL DEFAULT 'MANUAL',
    CONSTRAINT fk_sph_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
    CONSTRAINT chk_sph_old_price CHECK (old_price >= 0),
    CONSTRAINT chk_sph_new_price CHECK (new_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. USAGE LOGS TABLE
CREATE TABLE usage_logs (
    usage_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    subscription_id BIGINT NOT NULL,
    used_on DATE NOT NULL,
    usage_type ENUM('MANUAL','AUTO_DETECTED') NOT NULL DEFAULT 'MANUAL',
    note VARCHAR(255) NULL,
    CONSTRAINT fk_ul_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. ANOMALY FLAGS TABLE
CREATE TABLE anomaly_flags (
    anomaly_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    transaction_id BIGINT NULL,
    subscription_id BIGINT NULL,
    anomaly_type ENUM('UNUSUAL_SPENDING','PRICE_DRIFT','LOW_USAGE_HIGH_COST') NOT NULL,
    severity ENUM('LOW','MEDIUM','HIGH') NOT NULL,
    status ENUM('OPEN','REVIEWED','DISMISSED') NOT NULL DEFAULT 'OPEN',
    explanation TEXT NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_af_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_af_tx FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    CONSTRAINT fk_af_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. ALERTS TABLE
CREATE TABLE alerts (
    alert_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    anomaly_id BIGINT NULL,
    alert_title VARCHAR(120) NOT NULL,
    alert_message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_alt_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_alt_anomaly FOREIGN KEY (anomaly_id) REFERENCES anomaly_flags(anomaly_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =========================================================================
CREATE INDEX idx_tx_user_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_tx_category ON transactions(category_id);
CREATE INDEX idx_tx_merchant ON transactions(merchant_id);
CREATE INDEX idx_sub_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_anomaly_user_status ON anomaly_flags(user_id, status);

-- =========================================================================
-- VIEWS
-- =========================================================================

-- View 1: Monthly category spending summary
CREATE OR REPLACE VIEW v_monthly_category_spending AS
SELECT t.user_id, c.category_name,
       DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
       ROUND(SUM(t.amount), 2) AS total_spending,
       COUNT(*) AS transaction_count
FROM transactions t
JOIN categories c ON c.category_id = t.category_id
WHERE t.transaction_type = 'EXPENSE'
GROUP BY t.user_id, c.category_name, DATE_FORMAT(t.transaction_date, '%Y-%m');

-- View 2: Unused subscriptions (no usage in last 30 days)
CREATE OR REPLACE VIEW v_unused_subscriptions AS
SELECT s.subscription_id, s.user_id, s.subscription_name, m.merchant_name,
       s.current_price, s.billing_cycle,
       x.last_used_on,
       DATEDIFF(CURDATE(), x.last_used_on) AS days_since_last_use
FROM subscriptions s
JOIN merchants m ON m.merchant_id = s.merchant_id
JOIN (
    SELECT s2.subscription_id,
           NULLIF(GREATEST(COALESCE(s2.last_used_on, '0001-01-01'),
                           COALESCE(MAX(ul.used_on), '0001-01-01')), '0001-01-01') AS last_used_on
    FROM subscriptions s2
    LEFT JOIN usage_logs ul ON ul.subscription_id = s2.subscription_id
    GROUP BY s2.subscription_id, s2.last_used_on
) x ON x.subscription_id = s.subscription_id
WHERE s.status = 'ACTIVE'
  AND (x.last_used_on IS NULL OR x.last_used_on < DATE_SUB(CURDATE(), INTERVAL 30 DAY));

-- View 3: Recurring payment candidates using Window Function LAG()
CREATE OR REPLACE VIEW v_recurring_payment_candidates AS
SELECT user_id, merchant_id, merchant_name,
       previous_date, previous_amount, current_date_paid, current_amount,
       DATEDIFF(current_date_paid, previous_date) AS days_between,
       ROUND(current_amount - previous_amount, 2) AS amount_difference,
       CASE WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 6 AND 8 THEN 'WEEKLY'
            WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 27 AND 33 THEN 'MONTHLY'
            WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 85 AND 95 THEN 'QUARTERLY'
            WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 360 AND 370 THEN 'YEARLY'
            ELSE 'IRREGULAR' END AS detected_pattern
FROM (
  SELECT t.user_id, t.merchant_id, m.merchant_name,
         LAG(t.transaction_date) OVER w AS previous_date,
         LAG(t.amount) OVER w AS previous_amount,
         t.transaction_date AS current_date_paid,
         t.amount AS current_amount
  FROM transactions t 
  JOIN merchants m ON m.merchant_id = t.merchant_id
  WHERE t.transaction_type = 'EXPENSE'
  WINDOW w AS (PARTITION BY t.user_id, t.merchant_id ORDER BY t.transaction_date)
) x
WHERE previous_date IS NOT NULL;

-- =========================================================================
-- STORED FUNCTIONS & PROCEDURES
-- =========================================================================

-- Stored Function: Calculate annualized cost based on billing cycle
DELIMITER //
CREATE FUNCTION fn_annualized_cost(p_price DECIMAL(10,2), p_cycle VARCHAR(20))
RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE v_annual DECIMAL(10,2);
    CASE p_cycle
        WHEN 'WEEKLY' THEN SET v_annual = p_price * 52;
        WHEN 'MONTHLY' THEN SET v_annual = p_price * 12;
        WHEN 'QUARTERLY' THEN SET v_annual = p_price * 4;
        WHEN 'YEARLY' THEN SET v_annual = p_price;
        ELSE SET v_annual = p_price * 12;
    END CASE;
    RETURN v_annual;
END//

-- Stored Procedure 1: Monthly category report for user
CREATE PROCEDURE sp_monthly_category_report(IN p_user_id BIGINT)
BEGIN
    SELECT category_name, month, total_spending, transaction_count
    FROM v_monthly_category_spending
    WHERE user_id = p_user_id
    ORDER BY month DESC, total_spending DESC;
END//

-- Stored Procedure 2: Detect price drift above a percentage threshold
CREATE PROCEDURE sp_detect_price_drift(IN p_user_id BIGINT, IN p_threshold_percent DECIMAL(5,2))
BEGIN
    SELECT s.subscription_name, m.merchant_name,
           p.old_price, p.new_price, p.changed_at,
           ROUND(p.new_price - p.old_price, 2) AS price_diff,
           ROUND(100 * (p.new_price - p.old_price) / NULLIF(p.old_price, 0), 2) AS pct_change
    FROM subscription_price_history p
    JOIN subscriptions s ON s.subscription_id = p.subscription_id
    JOIN merchants m ON m.merchant_id = s.merchant_id
    WHERE s.user_id = p_user_id
      AND (100 * (p.new_price - p.old_price) / NULLIF(p.old_price, 0)) >= p_threshold_percent
    ORDER BY p.changed_at DESC;
END//

-- =========================================================================
-- TRIGGERS (Automated Business Logic)
-- =========================================================================

-- Trigger 1: Automatically log subscription price changes into history
CREATE TRIGGER trg_track_price_change
AFTER UPDATE ON subscriptions
FOR EACH ROW
BEGIN
    IF OLD.current_price <> NEW.current_price THEN
        INSERT INTO subscription_price_history (subscription_id, old_price, new_price, change_source)
        VALUES (NEW.subscription_id, OLD.current_price, NEW.current_price, 'MANUAL');
    END IF;
END//

-- Trigger 2: Flag large transaction (> Rs 10,000) as anomaly automatically
CREATE TRIGGER trg_flag_large_transaction
AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'EXPENSE' AND NEW.amount >= 10000.00 THEN
        INSERT INTO anomaly_flags (user_id, transaction_id, anomaly_type, severity, explanation)
        VALUES (NEW.user_id, NEW.transaction_id, 'UNUSUAL_SPENDING', 'HIGH',
                CONCAT('High value expense recorded: Rs ', NEW.amount, ' - requires user confirmation.'));
    END IF;
END//

DELIMITER ;

-- =========================================================================
-- SEED DATA INSERTION
-- =========================================================================

-- Users (Harshitha & Gaurav with Roles)
INSERT INTO users (user_id, full_name, email, role) VALUES
(1, 'Gaurav Demo', 'gaurav.demo@example.com', 'ADMIN'),
(2, 'Harshitha Demo', 'harshitha.demo@example.com', 'CUSTOMER');

-- Categories
INSERT INTO categories (category_id, category_name, category_type) VALUES
(1, 'Streaming & Entertainment', 'EXPENSE'),
(2, 'Developer Tools & Cloud', 'EXPENSE'),
(3, 'Productivity & Office', 'EXPENSE'),
(4, 'Health & Fitness', 'EXPENSE'),
(5, 'Food & Dining', 'EXPENSE'),
(6, 'Salary & Direct Deposit', 'INCOME');

-- Merchants
INSERT INTO merchants (merchant_id, merchant_name, normalized_name) VALUES
(1, 'StreamFlix', 'streamflix'),
(2, 'CloudTools', 'cloudtools'),
(3, 'WorkSpace Pro', 'workspacepro'),
(4, 'FitPulse Gym', 'fitpulsegym'),
(5, 'Fresh Basket Supermarket', 'freshbasketsupermarket'),
(6, 'Demo Employer Corp', 'demoemployercorp');

-- Subscriptions
INSERT INTO subscriptions (subscription_id, user_id, merchant_id, category_id, subscription_name, current_price, billing_cycle, started_on, status, last_used_on) VALUES
(1, 1, 1, 1, 'StreamFlix Premium 4K', 799.00, 'MONTHLY', '2026-01-10', 'ACTIVE', '2026-10-28'),
(2, 1, 2, 2, 'CloudTools Developer Tier', 499.00, 'MONTHLY', '2026-02-15', 'ACTIVE', '2026-10-29'),
(3, 1, 3, 3, 'WorkSpace Pro Annual', 2400.00, 'YEARLY', '2026-03-01', 'ACTIVE', '2026-09-01'),
(4, 1, 4, 4, 'FitPulse All-Access Pass', 1500.00, 'MONTHLY', '2026-04-01', 'ACTIVE', '2026-08-10'),
(5, 2, 1, 1, 'StreamFlix Standard', 499.00, 'MONTHLY', '2026-05-15', 'ACTIVE', '2026-10-30');

-- Subscription Price History
INSERT INTO subscription_price_history (subscription_id, old_price, new_price, changed_at, change_source) VALUES
(1, 649.00, 799.00, '2026-08-01 00:00:00', 'IMPORT'),
(2, 399.00, 499.00, '2026-09-01 00:00:00', 'IMPORT');

-- Usage Logs
INSERT INTO usage_logs (subscription_id, used_on, usage_type, note) VALUES
(1, '2026-10-28', 'AUTO_DETECTED', 'Streaming session 2 hrs'),
(2, '2026-10-29', 'MANUAL', 'API debugging session'),
(3, '2026-09-01', 'MANUAL', 'Annual document review'),
(4, '2026-08-10', 'AUTO_DETECTED', 'Gym turnstile check-in');

-- Transactions
INSERT INTO transactions (user_id, merchant_id, category_id, subscription_id, transaction_date, amount, transaction_type, description, source) VALUES
(1, 6, 6, NULL, '2026-08-31', 65000.00, 'INCOME', 'Monthly Salary Credit', 'IMPORT'),
(1, 1, 1, 1, '2026-09-01', 799.00, 'EXPENSE', 'StreamFlix Auto-Renewal', 'SUBSCRIPTION'),
(1, 2, 2, 2, '2026-09-02', 499.00, 'EXPENSE', 'CloudTools Subscription', 'SUBSCRIPTION'),
(1, 5, 5, NULL, '2026-09-05', 1250.00, 'EXPENSE', 'Groceries and Snacks', 'MANUAL'),
(1, 4, 4, 4, '2026-09-10', 1500.00, 'EXPENSE', 'FitPulse Membership', 'SUBSCRIPTION'),
(1, 5, 5, NULL, '2026-09-20', 850.00, 'EXPENSE', 'Fresh Fruits & Veggies', 'MANUAL'),
(1, 6, 6, NULL, '2026-09-30', 65000.00, 'INCOME', 'Monthly Salary Credit', 'IMPORT'),
(1, 1, 1, 1, '2026-10-01', 799.00, 'EXPENSE', 'StreamFlix Auto-Renewal', 'SUBSCRIPTION'),
(1, 2, 2, 2, '2026-10-02', 499.00, 'EXPENSE', 'CloudTools Subscription', 'SUBSCRIPTION'),
(1, 5, 5, NULL, '2026-10-08', 2100.00, 'EXPENSE', 'Supermarket monthly essentials', 'MANUAL'),
(1, 4, 4, 4, '2026-10-10', 1500.00, 'EXPENSE', 'FitPulse Membership', 'SUBSCRIPTION'),
(1, 5, 5, NULL, '2026-10-22', 950.00, 'EXPENSE', 'Weekly Grocery Store', 'MANUAL'),
(1, 6, 6, NULL, '2026-10-31', 65000.00, 'INCOME', 'Monthly Salary Credit', 'IMPORT'),
(1, 1, 1, 1, '2026-11-01', 799.00, 'EXPENSE', 'StreamFlix Auto-Renewal', 'SUBSCRIPTION'),
(1, 2, 2, 2, '2026-11-02', 499.00, 'EXPENSE', 'CloudTools Subscription', 'SUBSCRIPTION'),
(2, 6, 6, NULL, '2026-10-31', 75000.00, 'INCOME', 'Monthly Salary Credit', 'IMPORT'),
(2, 1, 1, 5, '2026-11-01', 499.00, 'EXPENSE', 'StreamFlix Standard Renewal', 'SUBSCRIPTION'),
(2, 5, 5, NULL, '2026-11-01', 3400.00, 'EXPENSE', 'Weekend Family Dinner & Grocery', 'MANUAL');

-- Anomaly Flags & Alerts
INSERT INTO anomaly_flags (user_id, transaction_id, subscription_id, anomaly_type, severity, status, explanation) VALUES
(1, 2, 1, 'PRICE_DRIFT', 'MEDIUM', 'OPEN', 'StreamFlix monthly charge increased from Rs 649 to Rs 799 (+23.11%).'),
(1, NULL, 4, 'LOW_USAGE_HIGH_COST', 'HIGH', 'OPEN', 'FitPulse Gym subscription costs Rs 1,500/month but has no logged check-ins in > 80 days.');

INSERT INTO alerts (user_id, anomaly_id, alert_title, alert_message) VALUES
(1, 1, 'Subscription price increased', 'StreamFlix increased from Rs 649 to Rs 799. Review your plan.'),
(1, 2, 'Subscription may be unused', 'No recent gym visits recorded for FitPulse. Consider cancelling to save Rs 1,500/month.');

-- Verification Smoke Test
SELECT 'Users' AS entity, COUNT(*) AS total FROM users
UNION ALL SELECT 'Categories', COUNT(*) FROM categories
UNION ALL SELECT 'Merchants', COUNT(*) FROM merchants
UNION ALL SELECT 'Subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'Transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'Price History', COUNT(*) FROM subscription_price_history
UNION ALL SELECT 'Usage Logs', COUNT(*) FROM usage_logs
UNION ALL SELECT 'Anomalies', COUNT(*) FROM anomaly_flags
UNION ALL SELECT 'Alerts', COUNT(*) FROM alerts;
