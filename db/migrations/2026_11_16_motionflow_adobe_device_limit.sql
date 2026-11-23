-- Run after deploying the Adobe two-device limit. Keep the two most recently
-- used active Adobe device sessions for each account.
UPDATE cep_devices AS device
JOIN (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY COALESCE(last_seen_at, created_at) DESC, id DESC
    ) AS seat
  FROM cep_devices
  WHERE client = 'motionflow-adobe' AND revoked_at IS NULL
) AS ranked ON ranked.id = device.id
SET device.revoked_at = NOW()
WHERE ranked.seat > 2 AND device.revoked_at IS NULL;
