-- ESP Servicing & Invoicing ERP - Initial Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'employee');
CREATE TYPE product_type AS ENUM ('physical_item', 'service');
CREATE TYPE tax_type AS ENUM ('intra_state', 'inter_state');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');
CREATE TYPE stock_adjustment_reason AS ENUM ('manual_correction', 'purchase_received', 'damaged', 'returned', 'other');
CREATE TYPE visit_frequency AS ENUM ('monthly', 'quarterly', 'half_yearly', 'yearly', 'custom');
CREATE TYPE job_type AS ENUM ('installation', 'maintenance', 'repair', 'amc_visit');
CREATE TYPE job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE notification_type AS ENUM ('low_stock', 'amc_expiry', 'invoice_overdue', 'general');

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session store (connect-pg-simple)
CREATE TABLE session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_session_expire ON session (expire);

-- Org settings (singleton)
CREATE TABLE org_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL DEFAULT '',
  address_line TEXT NOT NULL DEFAULT '',
  state VARCHAR(100) NOT NULL DEFAULT '',
  state_code VARCHAR(10) NOT NULL DEFAULT '',
  gstin VARCHAR(20) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  logo_url TEXT,
  bank_details TEXT NOT NULL DEFAULT '',
  invoice_number_prefix VARCHAR(50) NOT NULL DEFAULT 'INV-',
  invoice_number_seq INTEGER NOT NULL DEFAULT 1,
  invoice_terms TEXT NOT NULL DEFAULT '',
  amc_reminder_days JSONB NOT NULL DEFAULT '[60, 15]',
  default_low_stock_threshold NUMERIC(14, 2) NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  gstin VARCHAR(20),
  billing_address TEXT NOT NULL DEFAULT '',
  billing_state VARCHAR(100) NOT NULL DEFAULT '',
  billing_state_code VARCHAR(10) NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  shipping_state VARCHAR(100) NOT NULL DEFAULT '',
  shipping_state_code VARCHAR(10) NOT NULL DEFAULT '',
  same_as_billing BOOLEAN NOT NULL DEFAULT true,
  email VARCHAR(255),
  contact_person VARCHAR(255),
  mobile VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON customers (name);
CREATE INDEX idx_customers_gstin ON customers (gstin);
CREATE INDEX idx_customers_active ON customers (is_active);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  product_type product_type NOT NULL DEFAULT 'physical_item',
  hsn_sac_code VARCHAR(20) NOT NULL DEFAULT '',
  unit VARCHAR(50) NOT NULL DEFAULT 'Nos',
  rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 18,
  category VARCHAR(100),
  stock_quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(14, 2),
  low_stock_alert_sent_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_name ON products (name);
CREATE INDEX idx_products_active ON products (is_active);

-- Stock adjustments
CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products (id),
  user_id UUID NOT NULL REFERENCES users (id),
  reason stock_adjustment_reason NOT NULL,
  quantity_change NUMERIC(14, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_adjustments_product ON stock_adjustments (product_id);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers (id),
  status invoice_status NOT NULL DEFAULT 'draft',
  tax_type tax_type NOT NULL,
  reverse_charge BOOLEAN NOT NULL DEFAULT false,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  -- Customer snapshots
  customer_name VARCHAR(255) NOT NULL,
  customer_gstin VARCHAR(20),
  billing_address TEXT NOT NULL DEFAULT '',
  billing_state VARCHAR(100) NOT NULL DEFAULT '',
  billing_state_code VARCHAR(10) NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  shipping_state VARCHAR(100) NOT NULL DEFAULT '',
  shipping_state_code VARCHAR(10) NOT NULL DEFAULT '',
  customer_email VARCHAR(255),
  contact_person VARCHAR(255),
  customer_mobile VARCHAR(20),
  -- Totals
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cgst_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sgst_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  igst_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_in_words TEXT NOT NULL DEFAULT '',
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
  terms_and_conditions TEXT NOT NULL DEFAULT '',
  source_job_id UUID,
  created_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_number ON invoices (invoice_number);
CREATE INDEX idx_invoices_customer ON invoices (customer_id);
CREATE INDEX idx_invoices_status ON invoices (status);

-- Invoice line items
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  product_id UUID REFERENCES products (id),
  product_name VARCHAR(255) NOT NULL,
  hsn_sac_code VARCHAR(20) NOT NULL DEFAULT '',
  unit VARCHAR(50) NOT NULL DEFAULT 'Nos',
  quantity NUMERIC(14, 2) NOT NULL DEFAULT 1,
  rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 18,
  taxable_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  igst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items (invoice_id);

-- Invoice payments
CREATE TABLE invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL,
  payment_mode VARCHAR(50) NOT NULL DEFAULT 'cash',
  reference_no VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_payments_invoice ON invoice_payments (invoice_id);

-- AMC contracts
CREATE TABLE amc_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_number VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers (id),
  product_id UUID REFERENCES products (id),
  equipment_description TEXT,
  origin_invoice_id UUID REFERENCES invoices (id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  contract_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  visit_frequency visit_frequency NOT NULL DEFAULT 'yearly',
  custom_frequency_days INTEGER,
  notes TEXT,
  last_reminder_sent_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_amc_contracts_customer ON amc_contracts (customer_id);
CREATE INDEX idx_amc_contracts_end_date ON amc_contracts (end_date);

-- Service jobs
CREATE TABLE service_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers (id),
  site_location TEXT NOT NULL DEFAULT '',
  job_type job_type NOT NULL DEFAULT 'maintenance',
  amc_contract_id UUID REFERENCES amc_contracts (id),
  assigned_to UUID REFERENCES users (id),
  scheduled_date DATE,
  completed_date DATE,
  status job_status NOT NULL DEFAULT 'scheduled',
  description TEXT,
  generated_invoice_id UUID REFERENCES invoices (id),
  created_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_jobs_customer ON service_jobs (customer_id);
CREATE INDEX idx_service_jobs_status ON service_jobs (status);

-- Job line items
CREATE TABLE job_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES service_jobs (id) ON DELETE CASCADE,
  product_id UUID REFERENCES products (id),
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14, 2) NOT NULL DEFAULT 1,
  rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_job_line_items_job ON job_line_items (job_id);

-- Add FK from invoices to service_jobs after service_jobs exists
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_source_job
  FOREIGN KEY (source_job_id) REFERENCES service_jobs (id);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users (id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES users (id),
  type notification_type NOT NULL DEFAULT 'general',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id);
CREATE INDEX idx_notifications_unread ON notifications (is_read);
