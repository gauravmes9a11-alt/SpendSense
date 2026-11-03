-- SpendSense: beginner-friendly MySQL setup
-- Run this file once. Sample INSERT statements may duplicate data if rerun.

CREATE DATABASE IF NOT EXISTS spendsense;
USE spendsense;

CREATE TABLE IF NOT EXISTS users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS categories (
    category_id INT PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS merchants (
    merchant_id INT PRIMARY KEY AUTO_INCREMENT,
    merchant_name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    merchant_id INT NOT NULL,
    subscription_name VARCHAR(100) NOT NULL,
    monthly_price DECIMAL(10,2) NOT NULL,
    last_used DATE,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    merchant_id INT NOT NULL,
    category_id INT NOT NULL,
    transaction_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    transaction_type ENUM('EXPENSE','INCOME') DEFAULT 'EXPENSE',
    description VARCHAR(150),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE TABLE IF NOT EXISTS transaction_embeddings (
    transaction_id INT PRIMARY KEY,
    embedding_model VARCHAR(80) NOT NULL,
    dimensions INT NOT NULL,
    embedding JSON NOT NULL,
    text_content VARCHAR(500) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_logs (
    usage_id INT PRIMARY KEY AUTO_INCREMENT,
    subscription_id INT NOT NULL,
    used_on DATE NOT NULL,
    note VARCHAR(150),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id)
);

-- Sample data for demonstration
INSERT IGNORE INTO users (user_id, name, email) VALUES
(1, 'Gaurav Demo', 'gaurav.demo@example.com'),
(2, 'Harshitha Demo', 'harshitha.demo@example.com');

INSERT IGNORE INTO categories (category_id, category_name) VALUES
(1, 'Food'), (2, 'Transport'), (3, 'Entertainment'),
(4, 'Software'), (5, 'Salary');

INSERT INTO merchants (merchant_id, merchant_name) VALUES
(1, 'StreamFlix'), (2, 'CloudTools'),
(3, 'Fresh Basket'), (4, 'Metro Transit'), (5, 'Demo Employer')
ON DUPLICATE KEY UPDATE merchant_name = VALUES(merchant_name);

INSERT INTO subscriptions
(subscription_id, user_id, merchant_id, subscription_name, monthly_price, last_used)
VALUES
(1, 1, 1, 'StreamFlix Premium', 799.00, '2026-08-15'),
(2, 1, 2, 'CloudTools Pro', 499.00, '2026-10-18')
ON DUPLICATE KEY UPDATE monthly_price = VALUES(monthly_price);

INSERT INTO transactions
(user_id, merchant_id, category_id, transaction_date, amount, transaction_type, description)
VALUES
(1, 3, 1, '2026-09-03', 650.00, 'EXPENSE', 'Groceries'),
(1, 4, 2, '2026-09-05', 180.00, 'EXPENSE', 'Metro fare'),
(1, 1, 3, '2026-09-10', 799.00, 'EXPENSE', 'StreamFlix payment'),
(1, 2, 4, '2026-09-12', 499.00, 'EXPENSE', 'CloudTools payment'),
(1, 5, 5, '2026-09-30', 45000.00, 'INCOME', 'Monthly salary'),
(1, 3, 1, '2026-10-03', 720.00, 'EXPENSE', 'Groceries'),
(1, 4, 2, '2026-10-05', 200.00, 'EXPENSE', 'Metro fare');

INSERT INTO usage_logs (subscription_id, used_on, note) VALUES
(1, '2026-08-15', 'Watched a show'),
(2, '2026-10-18', 'Used for coursework');

-- Check the tables and sample data
SHOW TABLES;
SELECT * FROM users;
SELECT * FROM transactions;

-- Report 1: spending total by category
SELECT c.category_name, SUM(t.amount) AS total_spent
FROM transactions t
JOIN categories c ON c.category_id = t.category_id
WHERE t.user_id = 1 AND t.transaction_type = 'EXPENSE'
GROUP BY c.category_name
ORDER BY total_spent DESC;

-- Report 2: spending by merchant
SELECT m.merchant_name, SUM(t.amount) AS total_spent
FROM transactions t
JOIN merchants m ON m.merchant_id = t.merchant_id
WHERE t.user_id = 1 AND t.transaction_type = 'EXPENSE'
GROUP BY m.merchant_name
ORDER BY total_spent DESC;

-- Report 3: subscriptions that have not been used for 30 days
SELECT subscription_name, monthly_price, last_used
FROM subscriptions
WHERE user_id = 1
  AND (last_used IS NULL OR last_used < DATE_SUB(CURDATE(), INTERVAL 30 DAY));

-- Report 4: monthly spending by category
SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
       c.category_name, SUM(t.amount) AS total_spent
FROM transactions t
JOIN categories c ON c.category_id = t.category_id
WHERE t.user_id = 1 AND t.transaction_type = 'EXPENSE'
GROUP BY month, c.category_name
ORDER BY month, total_spent DESC;
