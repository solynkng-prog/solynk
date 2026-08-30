-- SOLYNK Demo Data
-- Insert sample installers and users for development

-- Demo admin user (configure the matching Supabase Auth user separately)
INSERT INTO users (id, supabase_uid, email, name, type, plan, status, email_verified)
VALUES 
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'admin@solynk.com', 'Admin User', 'admin', 'enterprise', 'active', true)
ON CONFLICT (email) DO NOTHING;

-- Demo installers
INSERT INTO installers (id, company_name, contact_name, email, phone, city, state, zip, description, years_experience, projects_completed, is_verified, is_premium, is_featured, rating, review_count, services, certifications, status)
VALUES 
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'GreenTech Solar Solutions', 'Sarah Mitchell', 'contact@greentechsolar.com', '(619) 555-0101', 'San Diego', 'CA', '92101', 'Award-winning solar installer specializing in high-efficiency residential and commercial systems.', 12, 340, true, true, true, 4.9, 127, '["residential", "commercial", "battery"]', '["NABCEP Certified", "Licensed Contractor C-46", "BBB A+ Rating"]', 'verified'),

  ('b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a23', 'SunPower Professional', 'Robert Taylor', 'info@sunpowerpro.com', '(512) 555-0102', 'Austin', 'TX', '78701', 'Texas-based solar experts focusing on off-grid and backup power solutions.', 8, 210, true, false, false, 4.7, 89, '["residential", "offgrid"]', '["NABCEP Certified", "Licensed Electrician"]', 'verified'),

  ('b3eebc99-9c0b-4ef8-bb6d-6bb9bd380a24', 'SolarMax Energy Systems', 'David Hernandez', 'sales@solarmax.com', '(602) 555-0103', 'Phoenix', 'AZ', '85001', 'Arizona's largest residential solar installer with industry-leading warranties.', 15, 520, true, true, true, 4.8, 203, '["residential", "commercial", "battery"]', '["NABCEP Certified", "Arizona ROC Licensed", "Enphase Master Installer"]', 'verified'),

  ('b4eebc99-9c0b-4ef8-bb6d-6bb9bd380a25', 'EcoVolt Solar & Electric', 'Jenny Roberts', 'hello@ecovolt.com', '(303) 555-0104', 'Denver', 'CO', '80201', 'Colorado's off-grid specialists for mountain cabins and remote properties.', 6, 145, true, false, false, 4.6, 67, '["residential", "offgrid", "battery"]', '["NABCEP Certified", "Colorado Master Electrician"]', 'verified'),

  ('b5eebc99-9c0b-4ef8-bb6d-6bb9bd380a26', 'Coastal Solar Company', 'Patricia Nguyen', 'team@coastalsolar.com', '(305) 555-0105', 'Miami', 'FL', '33101', 'Florida's hurricane-ready solar specialist with 140+ mph wind resistance.', 10, 280, true, false, false, 4.5, 94, '["residential", "commercial", "battery"]', '["Florida Solar Contractor", "Wind Mitigation Certified"]', 'verified'),

  ('b6eebc99-9c0b-4ef8-bb6d-6bb9bd380a27', 'NY Solar Works LLC', 'Rachel Green', 'quotes@nysolarworks.com', '(718) 555-0106', 'Brooklyn', 'NY', '11201', 'NYC's premier solar installer specializing in urban flat roof commercial installations.', 11, 410, true, true, true, 4.8, 156, '["residential", "commercial", "battery"]', '["NYC Licensed Contractor", "NABCEP Certified", "ConEdison Approved"]', 'verified');

-- Demo reviews
INSERT INTO installer_reviews (installer_id, user_id, rating, title, body, is_verified)
VALUES 
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 5, 'Exceptional Service', 'The team was professional, on time, and our system is performing 15% above estimates.', true),
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 5, 'Best Decision', 'GreenTech handled everything including permits. System paid for itself in 6 years.', true),
  ('b3eebc99-9c0b-4ef8-bb6d-6bb9bd380a24', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 5, 'Consistently Excellent', 'Third system they've installed for our family. Outstanding across three different homes.', true);
