-- SOLYNK Initial Database Schema
-- Created: 2026-05-15

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== USERS TABLE =====
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supabase_uid UUID UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    type VARCHAR(20) DEFAULT 'homeowner' CHECK (type IN ('homeowner', 'installer', 'admin')),
    plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'installer', 'enterprise')),
    plan_expires_at TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    phone VARCHAR(30),
    location VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_supabase ON users(supabase_uid);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ===== PROJECTS TABLE =====
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    system_type VARCHAR(20) DEFAULT 'hybrid' CHECK (system_type IN ('offgrid', 'hybrid', 'gridtie')),
    battery_type VARCHAR(20) DEFAULT 'lithium' CHECK (battery_type IN ('leadacid', 'agm', 'gel', 'lithium')),
    battery_voltage INT DEFAULT 48 CHECK (battery_voltage IN (12, 24, 48)),
    backup_hours DECIMAL(4,1) DEFAULT 24.0,
    peak_sun_hours DECIMAL(4,1) DEFAULT 5.5,
    panel_wattage INT DEFAULT 550,
    inverter_eff DECIMAL(5,2) DEFAULT 95.00,
    system_losses DECIMAL(5,2) DEFAULT 15.00,
    ambient_temp DECIMAL(4,1) DEFAULT 30.0,
    temp_coefficient DECIMAL(5,2) DEFAULT -0.40,
    wiring_loss DECIMAL(5,2) DEFAULT 2.00,
    soiling_loss DECIMAL(5,2) DEFAULT 3.00,
    total_demand_wh DECIMAL(10,2),
    peak_load_w DECIMAL(10,2),
    battery_ah DECIMAL(10,2),
    battery_wh DECIMAL(10,2),
    panel_count INT,
    array_size_w DECIMAL(10,2),
    daily_generation_wh DECIMAL(10,2),
    inverter_size_w DECIMAL(10,2),
    controller_a DECIMAL(10,2),
    autonomy_days DECIMAL(4,2),
    total_cost DECIMAL(12,2),
    is_public BOOLEAN DEFAULT FALSE,
    tags TEXT[],
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived', 'shared')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(system_type);

-- ===== APPLIANCES TABLE =====
CREATE TABLE IF NOT EXISTS appliances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    quantity INT DEFAULT 1 CHECK (quantity > 0),
    watts DECIMAL(8,2) NOT NULL CHECK (watts > 0),
    hours_per_day DECIMAL(4,1) NOT NULL CHECK (hours_per_day > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appliances_project ON appliances(project_id);

-- ===== INSTALLERS TABLE =====
CREATE TABLE IF NOT EXISTS installers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(2),
    zip VARCHAR(20),
    service_radius INT DEFAULT 50,
    description TEXT,
    website TEXT,
    logo_url TEXT,
    years_experience INT DEFAULT 0,
    projects_completed INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_premium BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP,
    rating DECIMAL(2,1) DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
    review_count INT DEFAULT 0,
    services JSONB DEFAULT '[]',
    certifications JSONB DEFAULT '[]',
    portfolio_urls JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'suspended')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_installers_state ON installers(state);
CREATE INDEX IF NOT EXISTS idx_installers_status ON installers(status);
CREATE INDEX IF NOT EXISTS idx_installers_rating ON installers(rating DESC);
CREATE INDEX IF NOT EXISTS idx_installers_services ON installers USING GIN(services);

-- ===== INSTALLER REVIEWS TABLE =====
CREATE TABLE IF NOT EXISTS installer_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    installer_id UUID NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    body TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_installer ON installer_reviews(installer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON installer_reviews(user_id);

-- ===== QUOTE REQUESTS TABLE =====
CREATE TABLE IF NOT EXISTS quote_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    installer_id UUID NOT NULL REFERENCES installers(id),
    project_id UUID REFERENCES projects(id),
    message TEXT,
    preferred_date DATE,
    budget_range VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'quoted', 'accepted', 'declined', 'expired')),
    response_message TEXT,
    quote_amount DECIMAL(12,2),
    quote_valid_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotes_user ON quote_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_installer ON quote_requests(installer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quote_requests(status);

-- ===== REPORTS TABLE =====
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('system_design', 'financial', 'bom', 'roi_analysis', 'permit')),
    format VARCHAR(10) DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'json')),
    file_url TEXT,
    file_size INT,
    pages INT,
    sections JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed', 'deleted')),
    generated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

-- ===== SUBSCRIPTIONS TABLE =====
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    plan VARCHAR(20) NOT NULL CHECK (plan IN ('free', 'premium', 'installer', 'enterprise')),
    billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
    price DECIMAL(8,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(20),
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'expired')),
    trial_ends_at TIMESTAMP,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancelled_at TIMESTAMP,
    projects_used INT DEFAULT 0,
    calculations_used INT DEFAULT 0,
    reports_used INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ===== CALCULATION LOGS TABLE =====
CREATE TABLE IF NOT EXISTS calculation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    total_demand_wh DECIMAL(10,2),
    peak_load_w DECIMAL(10,2),
    system_type VARCHAR(20),
    results JSONB NOT NULL,
    execution_time_ms INT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calc_logs_user ON calculation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_calc_logs_created ON calculation_logs(created_at DESC);

-- ===== ACTIVITY LOGS TABLE =====
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    entity_type VARCHAR(30) NOT NULL,
    entity_id UUID,
    action VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

-- ===== TRIGGER: Update updated_at =====
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_installers_updated_at ON installers;
CREATE TRIGGER update_installers_updated_at BEFORE UPDATE ON installers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
