INSERT INTO agents (name, email, twilio_identity, is_available)
VALUES
  ('Alice Johnson', 'alice@example.com', 'alice_johnson', true),
  ('Marcus Lee', 'marcus@example.com', 'marcus_lee', false)
ON CONFLICT(email) DO NOTHING;

INSERT INTO contacts (name, phone_number, company, email, notes)
VALUES
  ('Jordan Rivera', '+15551230001', 'Northwind', 'jordan@northwind.test', 'Interested in a demo'),
  ('Priya Shah', '+15551230002', 'Acme Labs', 'priya@acmelabs.test', 'Follow up next week'),
  ('Daniel Brooks', '+15551230003', 'Summit Health', 'daniel@summithealth.test', 'Prefers morning calls')
ON CONFLICT(phone_number) DO NOTHING;
