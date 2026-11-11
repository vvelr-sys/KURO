-- ============================================================
-- SECTION 1: EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SECTION 2: ENUMS
-- ============================================================

-- Roles: Admin, Manager, Staff, Kitchen, Cashier (Section 2.1)
CREATE TYPE user_role AS ENUM (
    'admin',
    'manager',
    'staff',
    'kitchen',
    'cashier'
);

-- Dining table status (A2/BR-038: available, occupied, cleaning)
CREATE TYPE table_status AS ENUM (
    'available',
    'occupied',
    'cleaning'
);

-- Session lifecycle 6-state machine (B10/BR-037)
CREATE TYPE session_status AS ENUM (
    'draft',
    'active',
    'expired',
    'closing',
    'billed',
    'closed'
);

-- Order item status (Section 3.4/A4)
CREATE TYPE order_item_status AS ENUM (
    'submitted',
    'accepted',
    'cooking',
    'ready',
    'served',
    'cancelled'
);

-- Menu availability status (A3/OI-019)
CREATE TYPE menu_availability AS ENUM (
    'available',
    'manual_off',
    'auto_off'
);

-- Payment methods (Section 3.7/OI-020)
CREATE TYPE payment_method AS ENUM (
    'cash',
    'promptpay'
);

-- Payment attempt status (A7/FR-043)
CREATE TYPE payment_attempt_status AS ENUM (
    'pending_verification',
    'rejected',
    'failed'
);

-- Stock movement types (Section 6.2 Data Dictionary)
CREATE TYPE stock_movement_type AS ENUM (
    'actual_consumption',
    'stock_count_adjustment',
    'cancellation_return',
    'kitchen_waste',
    'manual_restock'
);

-- Stock count review status (Section 6.3 Data Dictionary)
CREATE TYPE stock_count_status AS ENUM (
    'pending_review',
    'approved',
    'rejected'
);

-- ============================================================
-- SECTION 3: TABLES (28 TABLES AS PER DATA DICTIONARY v1.7)
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles (Extends Supabase auth.users)
-- ------------------------------------------------------------
CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   VARCHAR(100) NOT NULL,
    role        user_role NOT NULL DEFAULT 'staff',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. audit_logs (NFR-012, NFR-022, BR-036)
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action         VARCHAR(100) NOT NULL,
    target_entity  VARCHAR(50) NOT NULL,
    target_id      VARCHAR(100),
    payload_before JSONB,
    payload_after  JSONB,
    reason         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. app_settings (System Configuration)
-- ------------------------------------------------------------
CREATE TABLE app_settings (
    key         VARCHAR(50) PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. dining_tables (BR-001: 20 Tables)
-- ------------------------------------------------------------
CREATE TABLE dining_tables (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number VARCHAR(10) NOT NULL UNIQUE,
    capacity     INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
    status       table_status NOT NULL DEFAULT 'available',
    qr_code_url  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. packages (Buffet packages with duration_minutes - B9)
-- ------------------------------------------------------------
CREATE TABLE packages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(100) NOT NULL,
    adult_price      NUMERIC(10,2) NOT NULL CHECK (adult_price >= 0),
    child_price      NUMERIC(10,2) NOT NULL CHECK (child_price >= 0),
    free_price       NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (free_price >= 0),
    duration_minutes INT NOT NULL DEFAULT 90 CHECK (duration_minutes > 0),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 6. sessions (Customer service session lifecycle & snapshots)
-- ------------------------------------------------------------
CREATE TABLE sessions (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id                UUID NOT NULL REFERENCES packages(id),
    status                    session_status NOT NULL DEFAULT 'draft',
    -- PIN stored as bcrypt hash (NFR-006); pin_plain removed - security risk
    pin_hash                  VARCHAR(255) NOT NULL,
    failed_pin_attempts       INT NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
    is_locked                 BOOLEAN NOT NULL DEFAULT false,
    adult_guest_count         INT NOT NULL DEFAULT 0 CHECK (adult_guest_count >= 0),
    child_guest_count         INT NOT NULL DEFAULT 0 CHECK (child_guest_count >= 0),
    free_guest_count          INT NOT NULL DEFAULT 0 CHECK (free_guest_count >= 0),
    adult_price_snapshot      NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (adult_price_snapshot >= 0),
    child_price_snapshot      NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (child_price_snapshot >= 0),
    free_price_snapshot       NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (free_price_snapshot >= 0),
    duration_minutes_snapshot INT NOT NULL DEFAULT 90 CHECK (duration_minutes_snapshot > 0),
    guest_count_locked_at     TIMESTAMPTZ,
    package_price_locked_at   TIMESTAMPTZ,              -- set by trigger on draft→active (SRS §10.3, C-02)
    started_at                TIMESTAMPTZ,
    expires_at                TIMESTAMPTZ,
    closed_at                 TIMESTAMPTZ,
    created_by                UUID NOT NULL REFERENCES profiles(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. session_tables (Session to Table assignment & history)
-- ------------------------------------------------------------
CREATE TABLE session_tables (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    table_id       UUID NOT NULL REFERENCES dining_tables(id),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at    TIMESTAMPTZ,
    transferred_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Partial Unique Indexes for Session-Table consistency (Section 10.3)
CREATE UNIQUE INDEX idx_unique_active_session_per_table 
    ON session_tables(table_id) 
    WHERE is_active = true;

CREATE UNIQUE INDEX idx_unique_active_table_per_session 
    ON session_tables(session_id) 
    WHERE is_active = true;

-- ------------------------------------------------------------
-- 8. qr_access_tokens (JWT/Tokens for customer order web app)
-- ------------------------------------------------------------
CREATE TABLE qr_access_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 9. qr_pin_attempts (Brute-force protection logs - FR-016)
-- ------------------------------------------------------------
CREATE TABLE qr_pin_attempts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    is_successful BOOLEAN NOT NULL,
    client_ip     VARCHAR(50),
    user_agent    TEXT,
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 10. categories (Menu Categories)
-- ------------------------------------------------------------
CREATE TABLE categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 11. menu_items (Catalog & Manual/Auto Availability)
-- ------------------------------------------------------------
CREATE TABLE menu_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id         UUID NOT NULL REFERENCES categories(id),
    name                VARCHAR(150) NOT NULL,
    description         TEXT,
    image_url           TEXT,
    extra_price         NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (extra_price >= 0),
    availability_status menu_availability NOT NULL DEFAULT 'available',
    disabled_reason     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 12. package_menu_items (Package item inclusion mapping)
-- ------------------------------------------------------------
CREATE TABLE package_menu_items (
    package_id   UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    is_included  BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (package_id, menu_item_id)
);

-- ------------------------------------------------------------
-- 13. menu_item_options (Customizations e.g. spicy levels)
-- ------------------------------------------------------------
CREATE TABLE menu_item_options (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id      UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    option_group_name VARCHAR(100) NOT NULL,
    option_name       VARCHAR(100) NOT NULL,
    additional_price  NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (additional_price >= 0),
    is_active         BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- 14. ingredients (Raw materials & Current Stock)
-- ------------------------------------------------------------
CREATE TABLE ingredients (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(100) NOT NULL,
    unit              VARCHAR(20) NOT NULL,
    current_stock     NUMERIC(12,3) NOT NULL DEFAULT 0.000 CHECK (current_stock >= 0),
    minimum_threshold NUMERIC(12,3) NOT NULL DEFAULT 0.000 CHECK (minimum_threshold >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 15. menu_ingredients (Bill of Materials - Recipe)
-- ------------------------------------------------------------
CREATE TABLE menu_ingredients (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id      UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    ingredient_id     UUID NOT NULL REFERENCES ingredients(id),
    quantity_required NUMERIC(10,3) NOT NULL CHECK (quantity_required > 0),
    UNIQUE (menu_item_id, ingredient_id)
);

-- ------------------------------------------------------------
-- 16. orders (Order header)
-- ------------------------------------------------------------
CREATE TABLE orders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    order_number VARCHAR(30) NOT NULL UNIQUE,
    order_source VARCHAR(20) NOT NULL DEFAULT 'customer_qr'
        CHECK (order_source IN ('customer_qr', 'staff')),
    created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 17. order_items (Kitchen items & Item-level lifecycle)
-- ------------------------------------------------------------
CREATE TABLE order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id        UUID NOT NULL REFERENCES menu_items(id),
    quantity            INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (unit_price_snapshot >= 0),
    status              order_item_status NOT NULL DEFAULT 'submitted',
    cancelled_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cancelled_reason    TEXT,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 18. order_item_options (Selected options snapshot)
-- ------------------------------------------------------------
CREATE TABLE order_item_options (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id        UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    menu_item_option_id  UUID NOT NULL REFERENCES menu_item_options(id),
    option_price_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (option_price_snapshot >= 0)
);

-- ------------------------------------------------------------
-- 19. bills (Single bill per session - FR-042/BR-019)
-- ------------------------------------------------------------
CREATE TABLE bills (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id               UUID NOT NULL UNIQUE REFERENCES sessions(id),
    bill_number              VARCHAR(30) NOT NULL UNIQUE,
    buffet_subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (buffet_subtotal >= 0),
    extra_items_subtotal     NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (extra_items_subtotal >= 0),
    leftover_penalty_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (leftover_penalty_subtotal >= 0),
    discount_amount          NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    discount_reason          TEXT,
    discount_approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    total_amount             NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    vat_amount               NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (vat_amount >= 0),
    status                   VARCHAR(20) NOT NULL DEFAULT 'unpaid'
        CHECK (status IN ('unpaid', 'paid')),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at                  TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 20. bill_items (Itemized breakdown in receipt)
-- ------------------------------------------------------------
CREATE TABLE bill_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id     UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    item_type   VARCHAR(30) NOT NULL,
    description VARCHAR(200) NOT NULL,
    quantity    NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price  NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL
);

-- ------------------------------------------------------------
-- 21. payments (Settled transaction - 1:1 with bill, full amount)
-- ------------------------------------------------------------
CREATE TABLE payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id        UUID NOT NULL UNIQUE REFERENCES bills(id),
    payment_method payment_method NOT NULL,
    amount_paid    NUMERIC(10,2) NOT NULL CHECK (amount_paid >= 0),
    status         VARCHAR(20) NOT NULL DEFAULT 'settled'
        CHECK (status IN ('settled')),
    verified_by    UUID NOT NULL REFERENCES profiles(id),
    verified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 22. payment_attempts (PromptPay slip verification logs - A7)
-- ------------------------------------------------------------
CREATE TABLE payment_attempts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id          UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    payment_method   payment_method NOT NULL,
    attempt_status   payment_attempt_status NOT NULL,
    rejection_reason TEXT,
    slip_reference   VARCHAR(100),
    attempted_by     UUID NOT NULL REFERENCES profiles(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 23. leftover_records (Weighed leftover meat penalty - FR-053/054)
-- ------------------------------------------------------------
CREATE TABLE leftover_records (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id           UUID NOT NULL UNIQUE REFERENCES sessions(id),
    bill_id              UUID REFERENCES bills(id) ON DELETE SET NULL,
    weight_grams         INT NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
    penalty_rate_per_100g NUMERIC(10,2) NOT NULL DEFAULT 100.00 CHECK (penalty_rate_per_100g >= 0),
    penalty_amount       NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (penalty_amount >= 0),
    weighed_by           UUID NOT NULL REFERENCES profiles(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 24. stock_counts (Daily stock counts post-closing - FR-060/064)
-- ------------------------------------------------------------
CREATE TABLE stock_counts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    count_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    status           stock_count_status NOT NULL DEFAULT 'pending_review',
    counted_by       UUID NOT NULL REFERENCES profiles(id),
    approved_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 25. stock_count_items (Item level discrepancies)
-- ------------------------------------------------------------
CREATE TABLE stock_count_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_count_id     UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    ingredient_id      UUID NOT NULL REFERENCES ingredients(id),
    system_stock       NUMERIC(12,3) NOT NULL,
    counted_stock      NUMERIC(12,3) NOT NULL,
    discrepancy        NUMERIC(12,3) NOT NULL,
    adjustment_reason  TEXT
);

-- ------------------------------------------------------------
-- 26. stock_movements (Stock Ledger with direct order_items FK)
-- ------------------------------------------------------------
CREATE TABLE stock_movements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id  UUID NOT NULL REFERENCES ingredients(id),
    order_item_id  UUID REFERENCES order_items(id) ON DELETE SET NULL,
    stock_count_id UUID REFERENCES stock_counts(id) ON DELETE SET NULL,
    movement_type  stock_movement_type NOT NULL,
    quantity       NUMERIC(12,3) NOT NULL,
    balance_after  NUMERIC(12,3) NOT NULL,
    reason         TEXT,
    created_by     UUID NOT NULL REFERENCES profiles(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicate consumption deduction (NFR-010)
CREATE UNIQUE INDEX idx_unique_order_item_consumption 
    ON stock_movements(order_item_id, ingredient_id) 
    WHERE movement_type = 'actual_consumption';

-- ------------------------------------------------------------
-- 27. usage_rates (Estimated consumption rates per guest - FR-035)
-- ------------------------------------------------------------
CREATE TABLE usage_rates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id                  UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    ingredient_id               UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    estimated_grams_per_adult   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    estimated_grams_per_child   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    -- Free-tier guests (<120 cm) typically consume a negligible amount;
    -- default is 0 but kept for completeness (M-02 resolution).
    estimated_grams_per_free    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (package_id, ingredient_id)
);

-- ------------------------------------------------------------
-- 28. head_usage_estimates (Session estimated consumption analysis)
-- ------------------------------------------------------------
CREATE TABLE head_usage_estimates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ingredient_id      UUID NOT NULL REFERENCES ingredients(id),
    estimated_quantity NUMERIC(12,3) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, ingredient_id)       -- G-03: prevent duplicate estimation rows
);

-- ============================================================
-- SECTION 4: FUNCTIONS & TRIGGERS
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helper function to get current user role
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_my_role()
RETURNS user_role AS $$
    SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2. Generic updated_at timestamp refresher
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_dining_tables_updated_at BEFORE UPDATE ON dining_tables FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_packages_updated_at BEFORE UPDATE ON packages FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_menu_items_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_ingredients_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ------------------------------------------------------------
-- 3. Lock & Protect Session Snapshot (FR-059, FR-061, BR-027, BR-031)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_protect_session_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- If session is active or beyond, prevent editing guest counts or snapshot prices
    IF OLD.status != 'draft' THEN
        IF NEW.adult_guest_count != OLD.adult_guest_count OR
           NEW.child_guest_count != OLD.child_guest_count OR
           NEW.free_guest_count != OLD.free_guest_count OR
           NEW.adult_price_snapshot != OLD.adult_price_snapshot OR
           NEW.child_price_snapshot != OLD.child_price_snapshot OR
           NEW.free_price_snapshot != OLD.free_price_snapshot OR
           NEW.duration_minutes_snapshot != OLD.duration_minutes_snapshot THEN
            RAISE EXCEPTION 'Session guest count and price snapshots are strictly immutable once active (FR-059, FR-061).';
        END IF;
    END IF;

    -- Also set package_price_locked_at when transitioning from draft to active (C-02 / SRS §10.3)
    IF OLD.status = 'draft' AND NEW.status = 'active' THEN
        NEW.started_at = COALESCE(NEW.started_at, now());
        NEW.guest_count_locked_at = now();
        NEW.package_price_locked_at = now();
        NEW.expires_at = NEW.started_at + (NEW.duration_minutes_snapshot || ' minutes')::interval;
    END IF;

    -- When session closed, record closed_at
    IF OLD.status != 'closed' AND NEW.status = 'closed' THEN
        NEW.closed_at = COALESCE(NEW.closed_at, now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_session_snapshot
BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION fn_protect_session_snapshot();

-- ------------------------------------------------------------
-- 4. Calculate Leftover Penalty Automatically (FR-054)
-- Formula: CEILING(weight_grams / 100.0) * 100.00
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calc_leftover_penalty()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.weight_grams > 0 THEN
        NEW.penalty_amount = CEIL(NEW.weight_grams / 100.0) * NEW.penalty_rate_per_100g;
    ELSE
        NEW.penalty_amount = 0.00;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_leftover_penalty
BEFORE INSERT OR UPDATE ON leftover_records
FOR EACH ROW EXECUTE FUNCTION fn_calc_leftover_penalty();

-- ------------------------------------------------------------
-- 5. Auto-calculate VAT on bills (C-03 / BR-018)
-- Formula: vat_amount = ROUND(total_amount * 7 / 107, 2)
-- Inclusive VAT 7% — extracted from total, not added on top.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calc_bill_vat()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate vat_amount whenever total_amount changes
    NEW.vat_amount := ROUND(NEW.total_amount * 7.0 / 107.0, 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_bill_vat
BEFORE INSERT OR UPDATE OF total_amount ON bills
FOR EACH ROW EXECUTE FUNCTION fn_calc_bill_vat();

-- ------------------------------------------------------------
-- 5. Deduct Stock on Kitchen Order Item Acceptance (FR-033, BR-011)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_deduct_stock_on_accepted()
RETURNS TRIGGER AS $$
DECLARE
    rec RECORD;
    v_qty_needed NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_actor UUID;
BEGIN
    -- Only trigger when status transitions to 'accepted'
    IF OLD.status = 'submitted' AND NEW.status = 'accepted' THEN
        -- C-01 fix: require authenticated actor; do not fall back to cancelled_by
        v_actor := auth.uid();
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Kitchen acceptance requires an authenticated user (auth.uid() is NULL).';
        END IF;

        FOR rec IN
            SELECT mi.ingredient_id, mi.quantity_required, i.current_stock
            FROM menu_ingredients mi
            JOIN ingredients i ON i.id = mi.ingredient_id
            WHERE mi.menu_item_id = NEW.menu_item_id
            FOR UPDATE OF i
        LOOP
            v_qty_needed := rec.quantity_required * NEW.quantity;

            IF rec.current_stock < v_qty_needed THEN
                RAISE EXCEPTION 'Insufficient stock for ingredient % (available: %, needed: %)', 
                    rec.ingredient_id, rec.current_stock, v_qty_needed;
            END IF;

            v_new_stock := rec.current_stock - v_qty_needed;

            -- Deduct stock
            UPDATE ingredients
            SET current_stock = v_new_stock
            WHERE id = rec.ingredient_id;

            -- Insert Stock Movement ledger
            INSERT INTO stock_movements (
                ingredient_id,
                order_item_id,
                movement_type,
                quantity,
                balance_after,
                reason,
                created_by
            ) VALUES (
                rec.ingredient_id,
                NEW.id,
                'actual_consumption',
                -v_qty_needed,
                v_new_stock,
                'Kitchen order accepted: ' || NEW.id,
                v_actor          -- C-01: always a valid authenticated UUID
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_deduct_stock_on_accepted
AFTER UPDATE OF status ON order_items
FOR EACH ROW EXECUTE FUNCTION fn_deduct_stock_on_accepted();

-- ------------------------------------------------------------
-- 7. Revoke QR Tokens when Session closes (C-04 / NFR-008 / BR-030 / OI-012)
-- All active tokens for the session become invalid immediately.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_revoke_qr_on_session_close()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != 'closed' AND NEW.status = 'closed' THEN
        UPDATE qr_access_tokens
        SET is_revoked = true,
            expires_at = now()
        WHERE session_id = NEW.id
          AND is_revoked = false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_revoke_qr_on_session_close
AFTER UPDATE OF status ON sessions
FOR EACH ROW EXECUTE FUNCTION fn_revoke_qr_on_session_close();

-- ------------------------------------------------------------
-- 6. Table Status Synchronization (A2/BR-038)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_table_status_on_assign()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true THEN
        UPDATE dining_tables SET status = 'occupied' WHERE id = NEW.table_id;
    ELSIF OLD.is_active = true AND NEW.is_active = false THEN
        -- When table is released (transferred or session closed), set to cleaning
        UPDATE dining_tables SET status = 'cleaning' WHERE id = NEW.table_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_table_status_on_assign
AFTER INSERT OR UPDATE OF is_active ON session_tables
FOR EACH ROW EXECUTE FUNCTION fn_sync_table_status_on_assign();

-- ============================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all 28 tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_pin_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leftover_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE head_usage_estimates ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 1. Profiles
-- ------------------------------------------------------------
CREATE POLICY "profiles_select_all_staff" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (fn_my_role() = 'admin');

-- ------------------------------------------------------------
-- 2. Admin Superuser Access (FR-065, BR-036)
-- ------------------------------------------------------------
CREATE POLICY "admin_full_dining_tables" ON dining_tables FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_packages" ON packages FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_categories" ON categories FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_menu_items" ON menu_items FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_package_menu" ON package_menu_items FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_menu_options" ON menu_item_options FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_ingredients" ON ingredients FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_menu_ingredients" ON menu_ingredients FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_full_app_settings" ON app_settings FOR ALL USING (fn_my_role() = 'admin');
CREATE POLICY "admin_select_audit_logs" ON audit_logs FOR SELECT USING (fn_my_role() = 'admin');

-- ------------------------------------------------------------
-- 3. Manager Daily Operations
-- ------------------------------------------------------------
CREATE POLICY "manager_manage_menu" ON menu_items FOR ALL USING (fn_my_role() IN ('admin', 'manager'));
CREATE POLICY "manager_manage_packages" ON packages FOR ALL USING (fn_my_role() IN ('admin', 'manager'));
CREATE POLICY "manager_manage_ingredients" ON ingredients FOR ALL USING (fn_my_role() IN ('admin', 'manager'));
CREATE POLICY "manager_stock_counts" ON stock_counts FOR ALL USING (fn_my_role() IN ('admin', 'manager'));
CREATE POLICY "manager_stock_count_items" ON stock_count_items FOR ALL USING (fn_my_role() IN ('admin', 'manager'));
CREATE POLICY "manager_read_movements" ON stock_movements FOR SELECT USING (fn_my_role() IN ('admin', 'manager'));
CREATE POLICY "manager_insert_movements" ON stock_movements FOR INSERT WITH CHECK (fn_my_role() IN ('admin', 'manager'));

-- ------------------------------------------------------------
-- 4. Staff Operations (Tables, Sessions, Leftover Weighing)
-- ------------------------------------------------------------
CREATE POLICY "staff_read_tables" ON dining_tables FOR SELECT USING (true);
CREATE POLICY "staff_update_tables" ON dining_tables FOR UPDATE USING (fn_my_role() IN ('admin', 'manager', 'staff'));
CREATE POLICY "staff_manage_sessions" ON sessions FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'staff'));
CREATE POLICY "staff_manage_session_tables" ON session_tables FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'staff'));
CREATE POLICY "staff_manage_leftover" ON leftover_records FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'staff'));

-- ------------------------------------------------------------
-- 5. Kitchen Operations (Orders, Items, Status Updates)
-- ------------------------------------------------------------
CREATE POLICY "kitchen_read_orders" ON orders FOR SELECT USING (true);
CREATE POLICY "kitchen_read_items" ON order_items FOR SELECT USING (true);
CREATE POLICY "kitchen_update_items" ON order_items FOR UPDATE USING (fn_my_role() IN ('admin', 'manager', 'kitchen', 'staff'));

-- ------------------------------------------------------------
-- 6. Cashier Operations (Bills, Payments, Attempts)
-- ------------------------------------------------------------
CREATE POLICY "cashier_manage_bills" ON bills FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'cashier'));
CREATE POLICY "cashier_manage_bill_items" ON bill_items FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'cashier'));
CREATE POLICY "cashier_manage_payments" ON payments FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'cashier'));
CREATE POLICY "cashier_manage_attempts" ON payment_attempts FOR ALL USING (fn_my_role() IN ('admin', 'manager', 'cashier'));

-- ------------------------------------------------------------
-- 7. Public & Customer Ordering Access (Via Table QR / Tokens)
-- ------------------------------------------------------------
CREATE POLICY "customer_view_active_menu" ON menu_items FOR SELECT USING (availability_status = 'available');
CREATE POLICY "customer_view_categories" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "customer_insert_orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "customer_insert_order_items" ON order_items FOR INSERT WITH CHECK (true);

-- ============================================================
-- SECTION 6: REALTIME SUBSCRIPTIONS
-- ============================================================
-- Add live-updating tables to Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE dining_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE bills;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;

-- ============================================================
-- END OF MIGRATION SCRIPT v1.7
-- ============================================================
