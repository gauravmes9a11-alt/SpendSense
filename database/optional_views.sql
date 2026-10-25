-- SpendSense optional views. NOT run automatically; the app never changes your schema.
-- Run this in MySQL Workbench only if the app tells you a view is missing.
USE spendsense;

-- 1) v_unused_subscriptions
--    The Subscriptions > Unused tab uses this view when it exists. If you skip it,
--    the app computes the same rule live from `subscriptions` and `usage_logs` (and says so).
--    Rule: ACTIVE subscriptions with no recorded use, or last use older than 30 days.
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

-- 2) v_recurring_payment_candidates (TEMPLATE ONLY)
--    You already created this view. Do not run the statement below unless the view is missing.
--    The Recurring Payments page shows whatever columns your view returns. For the best result,
--    include user_id and merchant_id: the app uses them to mark candidates that match a real subscription.
--
-- CREATE VIEW v_recurring_payment_candidates AS
-- SELECT user_id, merchant_id, merchant_name,
--        previous_date, previous_amount, current_date_paid, current_amount,
--        DATEDIFF(current_date_paid, previous_date) AS days_between,
--        ROUND(current_amount - previous_amount, 2) AS amount_difference,
--        CASE WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 6 AND 8 THEN 'WEEKLY'
--             WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 27 AND 33 THEN 'MONTHLY'
--             WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 85 AND 95 THEN 'QUARTERLY'
--             WHEN DATEDIFF(current_date_paid, previous_date) BETWEEN 360 AND 370 THEN 'YEARLY'
--             ELSE 'IRREGULAR' END AS detected_pattern
-- FROM (
--   SELECT t.user_id, t.merchant_id, m.merchant_name,
--          LAG(t.transaction_date) OVER w AS previous_date, LAG(t.amount) OVER w AS previous_amount,
--          t.transaction_date AS current_date_paid, t.amount AS current_amount
--   FROM transactions t JOIN merchants m ON m.merchant_id = t.merchant_id
--   WHERE t.transaction_type = 'EXPENSE'
--   WINDOW w AS (PARTITION BY t.user_id, t.merchant_id ORDER BY t.transaction_date)
-- ) x
-- WHERE previous_date IS NOT NULL;
