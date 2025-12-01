

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'system_admin',
    'branch_system_admin',
    'regional_manager',
    'admin',
    'dispenser',
    'doctor'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role" "public"."app_role", "p_branch_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN 
    INSERT INTO public.users (id, email, name, phone, status) 
    SELECT au.id, au.email, au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'phone', 'active' 
    FROM auth.users au WHERE au.id = p_user_id; 
  END IF; 
  
  INSERT INTO public.user_roles (user_id, role, branch_id) 
  VALUES (p_user_id, p_role, p_branch_id) 
  ON CONFLICT (user_id, role) DO UPDATE SET branch_id = EXCLUDED.branch_id; 
  
  RETURN TRUE; 
EXCEPTION WHEN OTHERS THEN 
  RETURN FALSE; 
END; 
$$;


ALTER FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role" "public"."app_role", "p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_modify_data"("_user_id" "uuid", "_branch_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('admin', 'system_admin', 'regional_manager', 'branch_system_admin', 'dispenser')
    -- Note: doctors are NOT included here, so they cannot modify data
  ) 
$$;


ALTER FUNCTION "public"."can_modify_data"("_user_id" "uuid", "_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_permissions"() RETURNS TABLE("user_id" "uuid", "roles" "text"[], "can_manage_weekly_tasks" boolean, "can_manage_emergency_assignments" boolean, "can_manage_whatsapp_notifications" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT 
    auth.uid() as user_id,
    ARRAY_AGG(ur.role::text) as roles,
    public.has_role(auth.uid(), 'system_admin') OR 
    public.has_role(auth.uid(), 'regional_manager') OR 
    public.has_role(auth.uid(), 'admin') as can_manage_weekly_tasks,
    public.has_role(auth.uid(), 'system_admin') OR 
    public.has_role(auth.uid(), 'regional_manager') OR 
    public.has_role(auth.uid(), 'admin') as can_manage_emergency_assignments,
    public.has_role(auth.uid(), 'system_admin') OR 
    public.has_role(auth.uid(), 'regional_manager') OR 
    public.has_role(auth.uid(), 'admin') as can_manage_whatsapp_notifications
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  GROUP BY ur.user_id;
$$;


ALTER FUNCTION "public"."check_user_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."distribute_tasks_mathematically"() RETURNS TABLE("task_id" "uuid", "product_name" "text", "expiry_date" "date", "assigned_month" bigint, "assigned_year" bigint, "assigned_week" bigint, "assigned_day" bigint, "priority" "text", "dispenser_id" "uuid", "dispenser_name" "text", "task_rank" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_date_val DATE := CURRENT_DATE;
    current_month INTEGER := EXTRACT(MONTH FROM current_date_val);
    current_year INTEGER := EXTRACT(YEAR FROM current_date_val);
BEGIN
    RETURN QUERY
    WITH 
    -- Step 2: Filter valid tasks (no expired, no past months)
    valid_tasks AS (
        SELECT 
            wt.id as task_id,
            wt.title as product_name,
            wt.due_date::DATE as expiry_date,
            wt.priority,
            wt.assigned_to as dispenser_id,
            u.name as dispenser_name,
            CASE 
                WHEN wt.priority = 'urgent' THEN 4
                WHEN wt.priority = 'high' THEN 3
                WHEN wt.priority = 'medium' THEN 2
                ELSE 1
            END as priority_score
        FROM public.weekly_tasks wt
        LEFT JOIN public.users u ON wt.assigned_to = u.id
        WHERE wt.status NOT IN ('cancelled')
          AND wt.due_date::DATE >= current_date_val
          AND (
               EXTRACT(YEAR FROM wt.due_date) > current_year 
               OR (
                   EXTRACT(YEAR FROM wt.due_date) = current_year 
                   AND EXTRACT(MONTH FROM wt.due_date) >= current_month
               )
          )
    ),
    
    -- Step 3: Sort by expiry ASC, priority DESC
    sorted_tasks AS (
        SELECT 
            vt.task_id,
            vt.product_name,
            vt.expiry_date,
            vt.priority,
            vt.dispenser_id,
            vt.dispenser_name,
            vt.priority_score,
            ROW_NUMBER() OVER (
                ORDER BY 
                    vt.expiry_date ASC,
                    vt.priority_score DESC,
                    vt.task_id
            ) as task_rank
        FROM valid_tasks vt
    ),
    
    -- Step 4: Map using mathematical equations
    distributed_tasks AS (
        SELECT 
            st.task_id,
            st.product_name,
            st.expiry_date,
            st.priority,
            st.dispenser_id,
            st.dispenser_name,
            st.task_rank,
            
            ((st.task_rank - 1) % 28) + 1 as assigned_day,
            CEIL((((st.task_rank - 1) % 28) + 1)::DECIMAL / 7)::BIGINT as assigned_week,  -- FIXED: Cast to BIGINT
            FLOOR((st.task_rank - 1)::DECIMAL / 28)::BIGINT as month_offset,  -- FIXED: Cast to BIGINT
            
            ((current_month - 1 + FLOOR((st.task_rank - 1)::DECIMAL / 28)::BIGINT) % 12) + 1 as assigned_month,  -- FIXED: Cast to BIGINT
            current_year + FLOOR((current_month - 1 + FLOOR((st.task_rank - 1)::DECIMAL / 28)::BIGINT)::DECIMAL / 12)::BIGINT as assigned_year  -- FIXED: Cast to BIGINT
            
        FROM sorted_tasks st
    )
    
    SELECT 
        dt.task_id,
        dt.product_name,
        dt.expiry_date,
        dt.assigned_month,
        dt.assigned_year,
        dt.assigned_week,
        dt.assigned_day,
        dt.priority,
        dt.dispenser_id,
        dt.dispenser_name,
        dt.task_rank
    FROM distributed_tasks dt
    ORDER BY dt.assigned_year, dt.assigned_month, dt.assigned_week, dt.assigned_day;
END;
$$;


ALTER FUNCTION "public"."distribute_tasks_mathematically"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."distribute_tasks_mathematically"() IS 'Mathematically distributes tasks: filter valid, sort by expiry+priority, map to calendar (1/day, 7/week, 28/month, overflow → future months)';



CREATE OR REPLACE FUNCTION "public"."get_all_tasks_for_month"("p_year" integer, "p_month" integer, "p_week" integer DEFAULT NULL::integer, "p_dispenser_id" "uuid" DEFAULT NULL::"uuid", "p_task_type" "text" DEFAULT NULL::"text") RETURNS TABLE("task_id" "uuid", "product_name" "text", "expiry_date" "date", "week_number" integer, "day_number" integer, "task_status" "text", "priority" "text", "risk_level" "text", "value" numeric, "is_overdue" boolean, "urgency_status" "text", "task_type" "text", "quantity" integer, "dispenser_name" "text", "branch_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Set search_path for security
    PERFORM set_config('search_path', '', true);
    
    RETURN QUERY
    SELECT 
        cdtv.task_id,
        cdtv.product_name,
        cdtv.expiry_date,
        cdtv.week_number,
        cdtv.day_number,
        cdtv.task_status,
        cdtv.priority,
        cdtv.risk_level,
        cdtv.value,
        cdtv.is_overdue,
        cdtv.urgency_status,
        cdtv.task_type,
        cdtv.quantity,
        cdtv.dispenser_name,
        cdtv.branch_name
    FROM public.complete_dispenser_tasks_view cdtv
    WHERE cdtv.expiry_year = p_year
      AND cdtv.expiry_month = p_month
      AND (p_week IS NULL OR cdtv.week_number = p_week)
      AND (p_dispenser_id IS NULL OR cdtv.dispenser_id = p_dispenser_id)
      AND (p_task_type IS NULL OR cdtv.task_type = p_task_type)
    ORDER BY cdtv.dispenser_name, cdtv.week_number, cdtv.day_number, cdtv.calculated_priority_score DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_tasks_for_month"("p_year" integer, "p_month" integer, "p_week" integer, "p_dispenser_id" "uuid", "p_task_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_all_tasks_for_month"("p_year" integer, "p_month" integer, "p_week" integer, "p_dispenser_id" "uuid", "p_task_type" "text") IS 'Get all tasks for a specific month/week with optional dispenser and task type filtering (admin view)';



CREATE OR REPLACE FUNCTION "public"."get_dispenser_tasks_for_month"("p_dispenser_id" "uuid", "p_year" integer, "p_month" integer, "p_week" integer DEFAULT NULL::integer, "p_task_type" "text" DEFAULT NULL::"text") RETURNS TABLE("task_id" "uuid", "product_name" "text", "expiry_date" "date", "week_number" integer, "day_number" integer, "task_status" "text", "priority" "text", "risk_level" "text", "value" numeric, "is_overdue" boolean, "urgency_status" "text", "task_type" "text", "quantity" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Set search_path for security
    PERFORM set_config('search_path', '', true);
    
    RETURN QUERY
    SELECT 
        cdtv.task_id,
        cdtv.product_name,
        cdtv.expiry_date,
        cdtv.week_number,
        cdtv.day_number,
        cdtv.task_status,
        cdtv.priority,
        cdtv.risk_level,
        cdtv.value,
        cdtv.is_overdue,
        cdtv.urgency_status,
        cdtv.task_type,
        cdtv.quantity
    FROM public.complete_dispenser_tasks_view cdtv
    WHERE cdtv.dispenser_id = p_dispenser_id
      AND cdtv.expiry_year = p_year
      AND cdtv.expiry_month = p_month
      AND (p_week IS NULL OR cdtv.week_number = p_week)
      AND (p_task_type IS NULL OR cdtv.task_type = p_task_type)
    ORDER BY cdtv.week_number, cdtv.day_number, cdtv.calculated_priority_score DESC;
END;
$$;


ALTER FUNCTION "public"."get_dispenser_tasks_for_month"("p_dispenser_id" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_task_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_dispenser_tasks_for_month"("p_dispenser_id" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_task_type" "text") IS 'Get tasks for a specific dispenser and month/week with optional task type filtering';



CREATE OR REPLACE FUNCTION "public"."get_week_number"("input_date" "date") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    IF input_date IS NULL THEN 
        RETURN NULL; 
    END IF;
    -- Handle edge case for first day of month (ensure minimum week 1)
    RETURN GREATEST(1, CEIL(EXTRACT(DAY FROM input_date) / 7.0)::INTEGER);
END;
$$;


ALTER FUNCTION "public"."get_week_number"("input_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role", "_branch_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND (
      role = 'system_admin' 
      OR role = 'regional_manager' 
      OR role = 'dispenser'  -- Dispensers have basic access
      OR role = 'doctor'     -- Doctors have same access as dispensers
      OR (role = _role AND (branch_id = _branch_id OR _branch_id IS NULL OR role IN ('regional_manager', 'system_admin')))
    )
  ) 
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role", "_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_is_high_value"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.is_high_value := (NEW.unit_price * NEW.quantity) >= 100000;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_is_high_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_auth_user_to_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_name TEXT;
  user_phone TEXT;
  user_role public.app_role;
  user_branch_id UUID;
  branch_id_text TEXT;
BEGIN
  user_name := NEW.raw_user_meta_data ->> 'name';
  user_phone := NEW.raw_user_meta_data ->> 'phone';
  user_role := (NEW.raw_user_meta_data ->> 'role')::public.app_role;
  branch_id_text := NEW.raw_user_meta_data ->> 'branch_id';

  INSERT INTO public.users (id, email, name, phone)
  VALUES (NEW.id, NEW.email, user_name, user_phone)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, public.users.name),
      phone = COALESCE(EXCLUDED.phone, public.users.phone);

  IF user_role IS NOT NULL THEN
    IF user_role IN ('system_admin', 'regional_manager') THEN
      user_branch_id := NULL;
    ELSE
      IF branch_id_text IS NULL OR branch_id_text = '' THEN
        RAISE EXCEPTION 'A branch is required for the role of "%", but was not provided.', user_role;
      END IF;
      user_branch_id := branch_id_text::uuid;
    END IF;

    INSERT INTO public.user_roles (user_id, role, branch_id)
    VALUES (NEW.id, user_role, user_branch_id)
    ON CONFLICT (user_id, role) DO UPDATE
    SET branch_id = EXCLUDED.branch_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_auth_user_to_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stock_item_attributes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ 
BEGIN 
  NEW.days_to_expiry := EXTRACT(DAY FROM (NEW.expiry_date - NOW())); 
  NEW.value := NEW.quantity * NEW.unit_price; 
  IF NEW.days_to_expiry <= 30 THEN 
    NEW.risk_level := 'high'; 
  ELSIF NEW.days_to_expiry <= 90 THEN 
    NEW.risk_level := 'medium'; 
  ELSE 
    NEW.risk_level := 'low'; 
  END IF; 
  RETURN NEW; 
END; 
$$;


ALTER FUNCTION "public"."update_stock_item_attributes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stock_item_risk_level"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.days_to_expiry := EXTRACT(DAY FROM (NEW.expiry_date - NOW())); 
  NEW.value := NEW.quantity * NEW.unit_price; 
  
  -- UNIFORM RANGES
  IF NEW.days_to_expiry <= 30 THEN 
    NEW.risk_level := 'critical'; 
  ELSIF NEW.days_to_expiry <= 60 THEN 
    NEW.risk_level := 'high';
  ELSIF NEW.days_to_expiry <= 90 THEN 
    NEW.risk_level := 'medium-high';
  ELSIF NEW.days_to_expiry <= 120 THEN 
    NEW.risk_level := 'medium-high';
  ELSIF NEW.days_to_expiry <= 180 THEN 
    NEW.risk_level := 'medium';
  ELSIF NEW.days_to_expiry <= 365 THEN 
    NEW.risk_level := 'low';
  ELSE 
    NEW.risk_level := 'very-low';
  END IF;
  
  NEW.last_updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_stock_item_risk_level"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."branch_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_stock_value" numeric(10,2) DEFAULT 0,
    "items_expired" integer DEFAULT 0,
    "items_near_expiry" integer DEFAULT 0,
    "emergency_assignments" integer DEFAULT 0,
    "tasks_completed" integer DEFAULT 0,
    "dispensers_active" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."branch_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "region" "text",
    "manager_id" "uuid",
    "address" "text",
    "phone" "text",
    "email" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "branches_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_item_id" "uuid" NOT NULL,
    "dispenser_id" "uuid" NOT NULL,
    "assigned_quantity" integer NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "deadline" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "emergency_assignments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."emergency_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_name" "text" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "expiry_date" "date" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "assigned_to" "uuid",
    "assignment_strategy" "text",
    "date_assigned" timestamp with time zone,
    "deadline" timestamp with time zone,
    "emergency_declared_at" timestamp with time zone,
    "emergency_declared_by" "uuid",
    "is_emergency" boolean DEFAULT false,
    "priority" "text",
    "priority_score" integer,
    "risk_level" "text",
    "days_to_expiry" integer,
    "quantity_moved" integer DEFAULT 0,
    "value" numeric(10,2),
    "is_high_value" boolean DEFAULT false,
    "last_updated_at" timestamp with time zone,
    "last_updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'assigned'::"text", 'moved'::"text", 'expired'::"text", 'disposed'::"text", 'out_of_stock'::"text", 'low_stock'::"text", 'active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."stock_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "phone" "text",
    "status" "text" DEFAULT 'active'::"text",
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assigned_to" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "due_date" timestamp with time zone NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "whatsapp_sent" boolean DEFAULT false,
    "whatsapp_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "product_name" "text",
    "expiry_date" "date",
    "risk_level" "text" DEFAULT 'medium'::"text",
    "quantity" integer DEFAULT 1,
    "week_number" integer,
    "month_year" "text",
    "task_date" "date",
    CONSTRAINT "weekly_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "weekly_tasks_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "weekly_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."weekly_tasks" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."complete_dispenser_tasks_view" WITH ("security_invoker"='on') AS
 WITH "weekly_tasks_data" AS (
         SELECT "wt"."id" AS "task_id",
            "wt"."title" AS "product_name",
            "wt"."description",
            "wt"."assigned_to" AS "dispenser_id",
            "wt"."assigned_by",
            ("wt"."due_date")::"date" AS "expiry_date",
            "wt"."priority",
            "wt"."status" AS "task_status",
            "wt"."whatsapp_sent",
            ("wt"."whatsapp_sent_at")::"text" AS "whatsapp_sent_at",
            "wt"."created_at" AS "task_created_at",
            "wt"."updated_at" AS "task_updated_at",
            EXTRACT(year FROM ("wt"."due_date")::"date") AS "expiry_year",
            EXTRACT(month FROM ("wt"."due_date")::"date") AS "expiry_month",
            "public"."get_week_number"(("wt"."due_date")::"date") AS "week_number",
            EXTRACT(day FROM ("wt"."due_date")::"date") AS "day_of_month",
                CASE EXTRACT(dow FROM ("wt"."due_date")::"date")
                    WHEN 0 THEN 7
                    WHEN 1 THEN 1
                    WHEN 2 THEN 2
                    WHEN 3 THEN 3
                    WHEN 4 THEN 4
                    WHEN 5 THEN 5
                    WHEN 6 THEN 6
                    ELSE NULL::integer
                END AS "day_number",
            'weekly_task'::"text" AS "task_type",
            1 AS "quantity",
            (0)::numeric(10,2) AS "unit_price",
            (0)::numeric(10,2) AS "value",
            'medium'::"text" AS "risk_level",
            0 AS "days_to_expiry",
            false AS "is_high_value",
            false AS "is_emergency",
            NULL::"uuid" AS "branch_id",
            NULL::"text" AS "branch_name",
            NULL::"uuid" AS "stock_item_id",
            "u_dispenser"."name" AS "dispenser_name",
            "u_dispenser"."email" AS "dispenser_email",
            "u_dispenser"."phone" AS "dispenser_phone",
            "u_assigned_by"."name" AS "assigned_by_name",
                CASE
                    WHEN ("wt"."priority" = 'urgent'::"text") THEN 4
                    WHEN ("wt"."priority" = 'high'::"text") THEN 3
                    WHEN ("wt"."priority" = 'medium'::"text") THEN 2
                    ELSE 1
                END AS "calculated_priority_score",
                CASE
                    WHEN ((("wt"."due_date")::"date" < CURRENT_DATE) AND ("wt"."status" <> ALL (ARRAY['completed'::"text", 'cancelled'::"text"]))) THEN true
                    ELSE false
                END AS "is_overdue",
            COALESCE((("wt"."due_date")::"date" - CURRENT_DATE), 0) AS "days_until_deadline"
           FROM (("public"."weekly_tasks" "wt"
             LEFT JOIN "public"."users" "u_dispenser" ON (("wt"."assigned_to" = "u_dispenser"."id")))
             LEFT JOIN "public"."users" "u_assigned_by" ON (("wt"."assigned_by" = "u_assigned_by"."id")))
          WHERE (("wt"."status" <> 'cancelled'::"text") AND (("wt"."due_date")::"date" >= CURRENT_DATE))
        ), "emergency_assignments_data" AS (
         SELECT "ea"."id" AS "task_id",
            COALESCE("si"."product_name", 'Unknown Product'::"text") AS "product_name",
            ''::"text" AS "description",
            "ea"."dispenser_id",
            "ea"."assigned_by",
            "si"."expiry_date",
            COALESCE("si"."priority", 'medium'::"text") AS "priority",
            "ea"."status" AS "task_status",
            false AS "whatsapp_sent",
            NULL::"text" AS "whatsapp_sent_at",
            "ea"."created_at" AS "task_created_at",
            "ea"."updated_at" AS "task_updated_at",
            EXTRACT(year FROM "si"."expiry_date") AS "expiry_year",
            EXTRACT(month FROM "si"."expiry_date") AS "expiry_month",
            "public"."get_week_number"("si"."expiry_date") AS "week_number",
            EXTRACT(day FROM "si"."expiry_date") AS "day_of_month",
                CASE EXTRACT(dow FROM "si"."expiry_date")
                    WHEN 0 THEN 7
                    WHEN 1 THEN 1
                    WHEN 2 THEN 2
                    WHEN 3 THEN 3
                    WHEN 4 THEN 4
                    WHEN 5 THEN 5
                    WHEN 6 THEN 6
                    ELSE NULL::integer
                END AS "day_number",
            'emergency_assignment'::"text" AS "task_type",
            "ea"."assigned_quantity" AS "quantity",
            COALESCE("si"."unit_price", (0)::numeric(10,2)) AS "unit_price",
            COALESCE("si"."value", (0)::numeric(10,2)) AS "value",
            COALESCE("si"."risk_level", 'medium'::"text") AS "risk_level",
            COALESCE("si"."days_to_expiry", 0) AS "days_to_expiry",
            COALESCE("si"."is_high_value", false) AS "is_high_value",
            COALESCE("si"."is_emergency", false) AS "is_emergency",
            "si"."branch_id",
            COALESCE("b"."name", 'Unknown Branch'::"text") AS "branch_name",
            "si"."id" AS "stock_item_id",
            "u_dispenser"."name" AS "dispenser_name",
            "u_dispenser"."email" AS "dispenser_email",
            "u_dispenser"."phone" AS "dispenser_phone",
            "u_assigned_by"."name" AS "assigned_by_name",
                CASE
                    WHEN (COALESCE("si"."days_to_expiry", 0) <= 7) THEN 4
                    WHEN (COALESCE("si"."days_to_expiry", 0) <= 14) THEN 3
                    WHEN (COALESCE("si"."days_to_expiry", 0) <= 30) THEN 2
                    ELSE 1
                END AS "calculated_priority_score",
                CASE
                    WHEN ((("ea"."deadline")::"date" < CURRENT_DATE) AND ("ea"."status" <> ALL (ARRAY['completed'::"text", 'cancelled'::"text"]))) THEN true
                    ELSE false
                END AS "is_overdue",
            COALESCE((("ea"."deadline")::"date" - CURRENT_DATE), 0) AS "days_until_deadline"
           FROM (((("public"."emergency_assignments" "ea"
             LEFT JOIN "public"."stock_items" "si" ON (("ea"."stock_item_id" = "si"."id")))
             LEFT JOIN "public"."branches" "b" ON (("si"."branch_id" = "b"."id")))
             LEFT JOIN "public"."users" "u_dispenser" ON (("ea"."dispenser_id" = "u_dispenser"."id")))
             LEFT JOIN "public"."users" "u_assigned_by" ON (("ea"."assigned_by" = "u_assigned_by"."id")))
          WHERE (("ea"."status" <> 'cancelled'::"text") AND ("si"."expiry_date" >= CURRENT_DATE))
        ), "combined_tasks" AS (
         SELECT "weekly_tasks_data"."task_id",
            "weekly_tasks_data"."product_name",
            "weekly_tasks_data"."description",
            "weekly_tasks_data"."dispenser_id",
            "weekly_tasks_data"."assigned_by",
            "weekly_tasks_data"."expiry_date",
            "weekly_tasks_data"."priority",
            "weekly_tasks_data"."task_status",
            "weekly_tasks_data"."whatsapp_sent",
            "weekly_tasks_data"."whatsapp_sent_at",
            "weekly_tasks_data"."task_created_at",
            "weekly_tasks_data"."task_updated_at",
            "weekly_tasks_data"."expiry_year",
            "weekly_tasks_data"."expiry_month",
            "weekly_tasks_data"."week_number",
            "weekly_tasks_data"."day_of_month",
            "weekly_tasks_data"."day_number",
            "weekly_tasks_data"."task_type",
            "weekly_tasks_data"."quantity",
            "weekly_tasks_data"."unit_price",
            "weekly_tasks_data"."value",
            "weekly_tasks_data"."risk_level",
            "weekly_tasks_data"."days_to_expiry",
            "weekly_tasks_data"."is_high_value",
            "weekly_tasks_data"."is_emergency",
            "weekly_tasks_data"."branch_id",
            "weekly_tasks_data"."branch_name",
            "weekly_tasks_data"."stock_item_id",
            "weekly_tasks_data"."dispenser_name",
            "weekly_tasks_data"."dispenser_email",
            "weekly_tasks_data"."dispenser_phone",
            "weekly_tasks_data"."assigned_by_name",
            "weekly_tasks_data"."calculated_priority_score",
            "weekly_tasks_data"."is_overdue",
            "weekly_tasks_data"."days_until_deadline"
           FROM "weekly_tasks_data"
        UNION ALL
         SELECT "emergency_assignments_data"."task_id",
            "emergency_assignments_data"."product_name",
            "emergency_assignments_data"."description",
            "emergency_assignments_data"."dispenser_id",
            "emergency_assignments_data"."assigned_by",
            "emergency_assignments_data"."expiry_date",
            "emergency_assignments_data"."priority",
            "emergency_assignments_data"."task_status",
            "emergency_assignments_data"."whatsapp_sent",
            "emergency_assignments_data"."whatsapp_sent_at",
            "emergency_assignments_data"."task_created_at",
            "emergency_assignments_data"."task_updated_at",
            "emergency_assignments_data"."expiry_year",
            "emergency_assignments_data"."expiry_month",
            "emergency_assignments_data"."week_number",
            "emergency_assignments_data"."day_of_month",
            "emergency_assignments_data"."day_number",
            "emergency_assignments_data"."task_type",
            "emergency_assignments_data"."quantity",
            "emergency_assignments_data"."unit_price",
            "emergency_assignments_data"."value",
            "emergency_assignments_data"."risk_level",
            "emergency_assignments_data"."days_to_expiry",
            "emergency_assignments_data"."is_high_value",
            "emergency_assignments_data"."is_emergency",
            "emergency_assignments_data"."branch_id",
            "emergency_assignments_data"."branch_name",
            "emergency_assignments_data"."stock_item_id",
            "emergency_assignments_data"."dispenser_name",
            "emergency_assignments_data"."dispenser_email",
            "emergency_assignments_data"."dispenser_phone",
            "emergency_assignments_data"."assigned_by_name",
            "emergency_assignments_data"."calculated_priority_score",
            "emergency_assignments_data"."is_overdue",
            "emergency_assignments_data"."days_until_deadline"
           FROM "emergency_assignments_data"
        ), "combined_with_urgency" AS (
         SELECT "c"."task_id",
            "c"."product_name",
            "c"."description",
            "c"."dispenser_id",
            "c"."assigned_by",
            "c"."expiry_date",
            "c"."priority",
            "c"."task_status",
            "c"."whatsapp_sent",
            "c"."whatsapp_sent_at",
            "c"."task_created_at",
            "c"."task_updated_at",
            "c"."expiry_year",
            "c"."expiry_month",
            "c"."week_number",
            "c"."day_of_month",
            "c"."day_number",
            "c"."task_type",
            "c"."quantity",
            "c"."unit_price",
            "c"."value",
            "c"."risk_level",
            "c"."days_to_expiry",
            "c"."is_high_value",
            "c"."is_emergency",
            "c"."branch_id",
            "c"."branch_name",
            "c"."stock_item_id",
            "c"."dispenser_name",
            "c"."dispenser_email",
            "c"."dispenser_phone",
            "c"."assigned_by_name",
            "c"."calculated_priority_score",
            "c"."is_overdue",
            "c"."days_until_deadline",
                CASE
                    WHEN "c"."is_overdue" THEN 'overdue'::"text"
                    WHEN ("c"."days_until_deadline" <= 1) THEN 'urgent'::"text"
                    WHEN ("c"."days_until_deadline" <= 3) THEN 'due_soon'::"text"
                    ELSE 'normal'::"text"
                END AS "urgency_status"
           FROM "combined_tasks" "c"
        )
 SELECT "task_id",
    "product_name",
    "description",
    "quantity",
    "unit_price",
    "expiry_date",
    "task_status",
    "priority",
    "risk_level",
    "days_to_expiry",
    "value",
    "is_high_value",
    "is_emergency",
    "task_type",
    "dispenser_id",
    "assigned_by",
    "task_created_at",
    "task_updated_at",
    "whatsapp_sent",
    "whatsapp_sent_at",
    "expiry_year",
    "expiry_month",
    "week_number",
    "day_of_month",
    "day_number",
    "branch_id",
    "branch_name",
    "dispenser_name",
    "dispenser_email",
    "dispenser_phone",
    "assigned_by_name",
    "calculated_priority_score",
    "is_overdue",
    "days_until_deadline",
    "stock_item_id",
        CASE
            WHEN ("expiry_date" IS NOT NULL) THEN "to_char"(("expiry_date")::timestamp with time zone, 'YYYY-MM'::"text")
            ELSE NULL::"text"
        END AS "expiry_month_string",
    ('Week '::"text" || COALESCE(("week_number")::"text", 'N/A'::"text")) AS "week_display",
        CASE
            WHEN ("expiry_date" IS NOT NULL) THEN "to_char"(("expiry_date")::timestamp with time zone, 'FMDay'::"text")
            ELSE NULL::"text"
        END AS "day_name",
        CASE
            WHEN ("expiry_date" IS NOT NULL) THEN "to_char"(("expiry_date")::timestamp with time zone, 'FMMonth YYYY'::"text")
            ELSE NULL::"text"
        END AS "month_year_display",
    "urgency_status",
        CASE
            WHEN ("task_status" = 'completed'::"text") THEN 'completed'::"text"
            WHEN ("task_status" = 'in_progress'::"text") THEN 'in_progress'::"text"
            WHEN "is_overdue" THEN 'overdue'::"text"
            WHEN ("urgency_status" = 'urgent'::"text") THEN 'urgent'::"text"
            ELSE 'pending'::"text"
        END AS "display_status"
   FROM "combined_with_urgency"
  WHERE (("expiry_date" >= CURRENT_DATE) AND (("expiry_year" > EXTRACT(year FROM CURRENT_DATE)) OR (("expiry_year" = EXTRACT(year FROM CURRENT_DATE)) AND ("expiry_month" >= EXTRACT(month FROM CURRENT_DATE)))))
  ORDER BY "expiry_year", "expiry_month", "week_number", "day_number", "calculated_priority_score" DESC, "value" DESC;


ALTER VIEW "public"."complete_dispenser_tasks_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."complete_dispenser_tasks_view" IS 'Complete view combining weekly_tasks and emergency_assignments with stock_items for comprehensive dispenser task management';



CREATE OR REPLACE VIEW "public"."dispenser_tasks_summary" WITH ("security_invoker"='on') AS
 SELECT "dispenser_id",
    "dispenser_name",
    "branch_name",
    "expiry_year",
    "expiry_month",
    "week_number",
    "task_type",
    "count"(*) AS "total_tasks",
    "count"(*) FILTER (WHERE ("task_status" = 'pending'::"text")) AS "pending_tasks",
    "count"(*) FILTER (WHERE ("task_status" = 'in_progress'::"text")) AS "in_progress_tasks",
    "count"(*) FILTER (WHERE ("task_status" = 'completed'::"text")) AS "completed_tasks",
    "count"(*) FILTER (WHERE ("is_overdue" = true)) AS "overdue_tasks",
    "count"(*) FILTER (WHERE ("urgency_status" = 'urgent'::"text")) AS "urgent_tasks",
    "count"(*) FILTER (WHERE ("task_type" = 'weekly_task'::"text")) AS "weekly_tasks_count",
    "count"(*) FILTER (WHERE ("task_type" = 'emergency_assignment'::"text")) AS "emergency_tasks_count",
    "sum"("value") AS "total_value",
    "avg"("days_to_expiry") AS "avg_days_to_expiry",
    "min"("expiry_date") AS "earliest_expiry",
    "max"("expiry_date") AS "latest_expiry"
   FROM "public"."complete_dispenser_tasks_view"
  GROUP BY "dispenser_id", "dispenser_name", "branch_name", "expiry_year", "expiry_month", "week_number", "task_type"
  ORDER BY "expiry_year", "expiry_month", "week_number", "dispenser_name", "task_type";


ALTER VIEW "public"."dispenser_tasks_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."dispenser_tasks_summary" IS 'Summary statistics for all dispenser tasks grouped by dispenser, month, week, and task type';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "branch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."dispensers_view" AS
 SELECT DISTINCT "u"."id",
    "u"."name" AS "dispenser",
    "u"."phone",
    "u"."email",
    "b"."name" AS "branch",
    "u"."status",
    "ur"."role",
    "ur"."branch_id",
    "u"."created_at",
    "u"."updated_at",
    COALESCE(( SELECT
                CASE
                    WHEN ("count"(*) = 0) THEN (0)::numeric
                    ELSE ((("count"(*) FILTER (WHERE ("si"."status" = 'completed'::"text")))::numeric / ("count"(*))::numeric) * (100)::numeric)
                END AS "case"
           FROM "public"."stock_items" "si"
          WHERE ("si"."assigned_to" = "u"."id")), (0)::numeric) AS "performance_score"
   FROM (("public"."users" "u"
     JOIN "public"."user_roles" "ur" ON (("u"."id" = "ur"."user_id")))
     LEFT JOIN "public"."branches" "b" ON (("ur"."branch_id" = "b"."id")))
  WHERE ("ur"."role" = 'dispenser'::"public"."app_role")
  ORDER BY "u"."name";


ALTER VIEW "public"."dispensers_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dormant_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" integer NOT NULL,
    "product_name" "text" NOT NULL,
    "excess_value" numeric(10,2) NOT NULL,
    "excess_qty" integer NOT NULL,
    "sales" integer DEFAULT 0 NOT NULL,
    "days" integer NOT NULL,
    "classification" "text" NOT NULL,
    "branch_id" "uuid",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dormant_stock_classification_check" CHECK (("classification" = ANY (ARRAY['OTC'::"text", 'POM'::"text", 'POM/OTC'::"text"])))
);


ALTER TABLE "public"."dormant_stock" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."high_value_items_monthly_summary" AS
 SELECT "to_char"(("si"."expiry_date")::timestamp with time zone, 'YYYY-MM'::"text") AS "expiry_month",
    "si"."branch_id",
    "b"."name" AS "branch_name",
    "sum"("si"."value") AS "total_high_value",
    "count"("si"."id") AS "number_of_high_value_items"
   FROM ("public"."stock_items" "si"
     JOIN "public"."branches" "b" ON (("si"."branch_id" = "b"."id")))
  WHERE ("si"."is_high_value" = true)
  GROUP BY ("to_char"(("si"."expiry_date")::timestamp with time zone, 'YYYY-MM'::"text")), "si"."branch_id", "b"."name"
  ORDER BY ("to_char"(("si"."expiry_date")::timestamp with time zone, 'YYYY-MM'::"text")), "b"."name";


ALTER VIEW "public"."high_value_items_monthly_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."mathematical_dispenser_tasks_view" WITH ("security_invoker"='on') AS
 SELECT "task_id",
    "product_name",
    "expiry_date",
    "assigned_month",
    "assigned_year",
    "assigned_week",
    "assigned_day",
    "priority",
    "dispenser_id",
    "dispenser_name",
    "task_rank",
    EXTRACT(year FROM "expiry_date") AS "expiry_year",
    EXTRACT(month FROM "expiry_date") AS "expiry_month",
        CASE
            WHEN (("expiry_date" - CURRENT_DATE) <= 7) THEN 'critical'::"text"
            WHEN (("expiry_date" - CURRENT_DATE) <= 14) THEN 'high'::"text"
            WHEN (("expiry_date" - CURRENT_DATE) <= 30) THEN 'medium'::"text"
            ELSE 'low'::"text"
        END AS "risk_level",
    ("expiry_date" - CURRENT_DATE) AS "days_to_expiry",
    'pending'::"text" AS "task_status",
    "to_char"(("expiry_date")::timestamp with time zone, 'YYYY-MM'::"text") AS "expiry_month_string",
    ('Week '::"text" || ("assigned_week")::"text") AS "week_display",
    "to_char"(("expiry_date")::timestamp with time zone, 'FMDay'::"text") AS "day_name",
    "to_char"(("expiry_date")::timestamp with time zone, 'FMMonth YYYY'::"text") AS "month_year_display",
        CASE
            WHEN ("priority" = 'urgent'::"text") THEN 4
            WHEN ("priority" = 'high'::"text") THEN 3
            WHEN ("priority" = 'medium'::"text") THEN 2
            ELSE 1
        END AS "calculated_priority_score"
   FROM "public"."distribute_tasks_mathematically"() "dt"("task_id", "product_name", "expiry_date", "assigned_month", "assigned_year", "assigned_week", "assigned_day", "priority", "dispenser_id", "dispenser_name", "task_rank");


ALTER VIEW "public"."mathematical_dispenser_tasks_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."mathematical_dispenser_tasks_view" IS 'Dispenser tasks view with expiry-aware daily/weekly/monthly mapping';



CREATE OR REPLACE VIEW "public"."mathematical_dispenser_summary" WITH ("security_invoker"='on') AS
 SELECT "assigned_year",
    "assigned_month",
    "assigned_week",
    "dispenser_id",
    "dispenser_name",
    "count"(*) AS "total_tasks",
    "count"(*) FILTER (WHERE ("priority" = 'urgent'::"text")) AS "urgent_tasks",
    "count"(*) FILTER (WHERE ("priority" = 'high'::"text")) AS "high_tasks",
    "count"(*) FILTER (WHERE ("priority" = 'medium'::"text")) AS "medium_tasks",
    "count"(*) FILTER (WHERE ("priority" = 'low'::"text")) AS "low_tasks",
    "count"(*) FILTER (WHERE ("risk_level" = 'critical'::"text")) AS "critical_tasks",
    "count"(*) FILTER (WHERE ("risk_level" = 'high'::"text")) AS "high_risk_tasks",
    "min"("expiry_date") AS "earliest_expiry",
    "max"("expiry_date") AS "latest_expiry"
   FROM "public"."mathematical_dispenser_tasks_view"
  GROUP BY "assigned_year", "assigned_month", "assigned_week", "dispenser_id", "dispenser_name"
  ORDER BY "assigned_year", "assigned_month", "assigned_week", "dispenser_name";


ALTER VIEW "public"."mathematical_dispenser_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."mathematical_dispenser_summary" IS 'Summary statistics view for dispenser tasks';



CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid",
    "parent_id" "uuid",
    "is_public" boolean DEFAULT true,
    "recipient_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "message" "text" NOT NULL,
    "type" "text",
    "stock_item_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stock_items_view" AS
 SELECT "si"."id",
    "si"."product_name",
    "si"."quantity",
    "si"."unit_price",
    "si"."expiry_date",
    "b"."name" AS "branch",
    "si"."status",
    "si"."assigned_to",
    "si"."assignment_strategy",
    "si"."date_assigned",
    "si"."deadline",
    "si"."emergency_declared_at",
    "si"."emergency_declared_by",
    "si"."is_emergency",
    "si"."priority",
    "si"."priority_score",
    "si"."risk_level",
    "si"."days_to_expiry",
    "si"."quantity_moved",
    "si"."value",
    "si"."is_high_value",
    "si"."last_updated_at",
    "si"."last_updated_by",
    "si"."created_at",
    "si"."updated_at",
    "u"."name" AS "assigned_to_name",
    "u"."email" AS "assigned_to_email"
   FROM (("public"."stock_items" "si"
     LEFT JOIN "public"."branches" "b" ON (("si"."branch_id" = "b"."id")))
     LEFT JOIN "public"."users" "u" ON (("si"."assigned_to" = "u"."id")));


ALTER VIEW "public"."stock_items_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movement_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_item_id" "uuid",
    "movement_type" "text",
    "quantity_moved" integer NOT NULL,
    "from_branch_id" "uuid",
    "to_branch_id" "uuid",
    "for_dispenser" "uuid",
    "moved_by" "uuid",
    "movement_date" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stock_movement_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stock_movement_history_view" AS
 SELECT "smh"."id",
    "smh"."movement_date",
    "smh"."movement_type",
    "smh"."quantity_moved",
    "smh"."notes",
    "si"."product_name",
    "from_b"."name" AS "from_branch",
    "to_b"."name" AS "to_branch",
    "u_moved"."name" AS "moved_by",
    "u_disp"."name" AS "for_dispenser"
   FROM ((((("public"."stock_movement_history" "smh"
     LEFT JOIN "public"."stock_items" "si" ON (("smh"."stock_item_id" = "si"."id")))
     LEFT JOIN "public"."branches" "from_b" ON (("smh"."from_branch_id" = "from_b"."id")))
     LEFT JOIN "public"."branches" "to_b" ON (("smh"."to_branch_id" = "to_b"."id")))
     LEFT JOIN "public"."users" "u_moved" ON (("smh"."moved_by" = "u_moved"."id")))
     LEFT JOIN "public"."users" "u_disp" ON (("smh"."for_dispenser" = "u_disp"."id")));


ALTER VIEW "public"."stock_movement_history_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."unified_assignments_view" AS
 SELECT "wt"."id",
    'weekly_task'::"text" AS "source_type",
    "wt"."title" AS "display_name",
    "wt"."description",
    "wt"."assigned_to",
    "wt"."assigned_by",
    "wt"."due_date" AS "date_field",
    "wt"."priority",
    "wt"."status",
    "wt"."whatsapp_sent",
    "wt"."whatsapp_sent_at",
    "wt"."created_at",
    "wt"."updated_at",
    "assigned_user"."name" AS "assigned_user_name",
    "assigned_user"."phone" AS "assigned_user_phone",
    "assigned_by_user"."name" AS "assigned_by_user_name",
    "si"."product_name",
    "si"."quantity",
    "si"."unit_price",
    "si"."expiry_date",
    "si"."branch_id",
    "b"."name" AS "branch_name",
        CASE
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '30 days'::interval)) THEN 'critical'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '60 days'::interval)) THEN 'high'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '90 days'::interval)) THEN 'medium-high'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '120 days'::interval)) THEN 'medium-high'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '180 days'::interval)) THEN 'medium'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '365 days'::interval)) THEN 'low'::"text"
            ELSE 'very-low'::"text"
        END AS "risk_level"
   FROM (((("public"."weekly_tasks" "wt"
     LEFT JOIN "public"."users" "assigned_user" ON (("wt"."assigned_to" = "assigned_user"."id")))
     LEFT JOIN "public"."users" "assigned_by_user" ON (("wt"."assigned_by" = "assigned_by_user"."id")))
     LEFT JOIN "public"."stock_items" "si" ON ((("wt"."title" ~~ (('%'::"text" || "si"."product_name") || '%'::"text")) OR ("wt"."description" ~~ (('%'::"text" || "si"."product_name") || '%'::"text")))))
     LEFT JOIN "public"."branches" "b" ON (("si"."branch_id" = "b"."id")))
UNION ALL
 SELECT "si"."id",
    'assigned_product'::"text" AS "source_type",
    "si"."product_name" AS "display_name",
    "concat"('Product assignment: ', "si"."product_name", ' (Qty: ', "si"."quantity", ', Price: ', "si"."unit_price", ')') AS "description",
    "si"."assigned_to",
    NULL::"uuid" AS "assigned_by",
    "si"."expiry_date" AS "date_field",
    'medium'::"text" AS "priority",
    "si"."status",
    false AS "whatsapp_sent",
    NULL::timestamp with time zone AS "whatsapp_sent_at",
    "si"."created_at",
    "si"."updated_at",
    "assigned_user"."name" AS "assigned_user_name",
    "assigned_user"."phone" AS "assigned_user_phone",
    NULL::"text" AS "assigned_by_user_name",
    "si"."product_name",
    "si"."quantity",
    "si"."unit_price",
    "si"."expiry_date",
    "si"."branch_id",
    "b"."name" AS "branch_name",
        CASE
            WHEN ("si"."expiry_date" <= (CURRENT_DATE + '30 days'::interval)) THEN 'critical'::"text"
            WHEN ("si"."expiry_date" <= (CURRENT_DATE + '60 days'::interval)) THEN 'high'::"text"
            WHEN ("si"."expiry_date" <= (CURRENT_DATE + '90 days'::interval)) THEN 'medium-high'::"text"
            WHEN ("si"."expiry_date" <= (CURRENT_DATE + '120 days'::interval)) THEN 'medium-high'::"text"
            WHEN ("si"."expiry_date" <= (CURRENT_DATE + '180 days'::interval)) THEN 'medium'::"text"
            WHEN ("si"."expiry_date" <= (CURRENT_DATE + '365 days'::interval)) THEN 'low'::"text"
            ELSE 'very-low'::"text"
        END AS "risk_level"
   FROM (("public"."stock_items" "si"
     LEFT JOIN "public"."users" "assigned_user" ON (("si"."assigned_to" = "assigned_user"."id")))
     LEFT JOIN "public"."branches" "b" ON (("si"."branch_id" = "b"."id")))
  WHERE ("si"."assigned_to" IS NOT NULL)
  ORDER BY 7;


ALTER VIEW "public"."unified_assignments_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_permissions_debug" AS
 SELECT "u"."id" AS "user_id",
    "u"."name",
    "u"."email",
    "array_agg"(("ur"."role")::"text") AS "roles",
    "public"."has_role"("u"."id", 'system_admin'::"public"."app_role") AS "is_system_admin",
    "public"."has_role"("u"."id", 'admin'::"public"."app_role") AS "is_admin",
    "public"."has_role"("u"."id", 'regional_manager'::"public"."app_role") AS "is_regional_manager"
   FROM ("public"."users" "u"
     LEFT JOIN "public"."user_roles" "ur" ON (("u"."id" = "ur"."user_id")))
  GROUP BY "u"."id", "u"."name", "u"."email";


ALTER VIEW "public"."user_permissions_debug" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."users_with_roles" AS
 SELECT "u"."id" AS "user_id",
    "u"."name",
    "u"."email",
    "u"."phone",
    "u"."status",
    "ur"."role",
    "ur"."branch_id",
    "b"."name" AS "branch_name"
   FROM (("public"."users" "u"
     LEFT JOIN "public"."user_roles" "ur" ON (("u"."id" = "ur"."user_id")))
     LEFT JOIN "public"."branches" "b" ON (("ur"."branch_id" = "b"."id")))
  ORDER BY "u"."name";


ALTER VIEW "public"."users_with_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."users_with_roles_and_branches" AS
SELECT
    NULL::"uuid" AS "user_id",
    NULL::"text" AS "name",
    NULL::"text" AS "email",
    NULL::"text" AS "phone",
    NULL::"text" AS "status",
    NULL::timestamp with time zone AS "last_login",
    NULL::"text" AS "roles",
    NULL::"text" AS "branches";


ALTER VIEW "public"."users_with_roles_and_branches" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."weekly_assignments_view" AS
 SELECT "wt"."id",
    "wt"."title",
    "wt"."description",
    "wt"."assigned_to",
    "wt"."assigned_by",
    "wt"."due_date",
    "wt"."priority",
    "wt"."status",
    "wt"."whatsapp_sent",
    "wt"."whatsapp_sent_at",
    "wt"."created_at",
    "wt"."updated_at",
    "assigned_user"."name" AS "assigned_user_name",
    "assigned_user"."phone" AS "assigned_user_phone",
    "assigned_by_user"."name" AS "assigned_by_user_name",
    "si"."product_name",
    "si"."quantity",
    "si"."unit_price",
    "si"."expiry_date",
    "si"."branch_id",
    "b"."name" AS "branch_name",
        CASE
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '30 days'::interval)) THEN 'critical'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '60 days'::interval)) THEN 'high'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '90 days'::interval)) THEN 'medium-high'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '120 days'::interval)) THEN 'medium-high'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '180 days'::interval)) THEN 'medium'::"text"
            WHEN ("wt"."due_date" <= (CURRENT_DATE + '365 days'::interval)) THEN 'low'::"text"
            ELSE 'very-low'::"text"
        END AS "risk_level"
   FROM (((("public"."weekly_tasks" "wt"
     LEFT JOIN "public"."users" "assigned_user" ON (("wt"."assigned_to" = "assigned_user"."id")))
     LEFT JOIN "public"."users" "assigned_by_user" ON (("wt"."assigned_by" = "assigned_by_user"."id")))
     LEFT JOIN "public"."stock_items" "si" ON ((("wt"."title" ~~ (('%'::"text" || "si"."product_name") || '%'::"text")) OR ("wt"."description" ~~ (('%'::"text" || "si"."product_name") || '%'::"text")))))
     LEFT JOIN "public"."branches" "b" ON (("si"."branch_id" = "b"."id")))
  ORDER BY "wt"."due_date";


ALTER VIEW "public"."weekly_assignments_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_phone" "text" NOT NULL,
    "message_content" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "twilio_sid" "text",
    "error_message" "text",
    "related_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    CONSTRAINT "whatsapp_notifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."whatsapp_notifications" OWNER TO "postgres";


ALTER TABLE ONLY "public"."branch_performance"
    ADD CONSTRAINT "branch_performance_branch_id_period_start_period_end_key" UNIQUE ("branch_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."branch_performance"
    ADD CONSTRAINT "branch_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dormant_stock"
    ADD CONSTRAINT "dormant_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_assignments"
    ADD CONSTRAINT "emergency_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movement_history"
    ADD CONSTRAINT "stock_movement_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_tasks"
    ADD CONSTRAINT "weekly_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_notifications"
    ADD CONSTRAINT "whatsapp_notifications_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_dormant_stock_branch_id" ON "public"."dormant_stock" USING "btree" ("branch_id");



CREATE INDEX "idx_dormant_stock_classification" ON "public"."dormant_stock" USING "btree" ("classification");



CREATE INDEX "idx_dormant_stock_created_at" ON "public"."dormant_stock" USING "btree" ("created_at");



CREATE INDEX "idx_dormant_stock_product_id" ON "public"."dormant_stock" USING "btree" ("product_id");



CREATE INDEX "idx_emergency_assignments_dispenser_deadline" ON "public"."emergency_assignments" USING "btree" ("dispenser_id", "deadline") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "idx_emergency_assignments_dispenser_id" ON "public"."emergency_assignments" USING "btree" ("dispenser_id");



CREATE INDEX "idx_emergency_assignments_dispenser_status" ON "public"."emergency_assignments" USING "btree" ("dispenser_id", "status");



CREATE INDEX "idx_emergency_assignments_stock_item_id" ON "public"."emergency_assignments" USING "btree" ("stock_item_id");



CREATE INDEX "idx_notes_created_at" ON "public"."notes" USING "btree" ("created_at");



CREATE INDEX "idx_notes_created_by" ON "public"."notes" USING "btree" ("created_by");



CREATE INDEX "idx_notes_is_public" ON "public"."notes" USING "btree" ("is_public");



CREATE INDEX "idx_notes_parent_id" ON "public"."notes" USING "btree" ("parent_id");



CREATE INDEX "idx_notes_recipient_id" ON "public"."notes" USING "btree" ("recipient_id");



CREATE INDEX "idx_stock_items_assigned_to" ON "public"."stock_items" USING "btree" ("assigned_to");



CREATE INDEX "idx_stock_items_branch_expiry" ON "public"."stock_items" USING "btree" ("branch_id", "expiry_date");



CREATE INDEX "idx_stock_items_expiry" ON "public"."stock_items" USING "btree" ("expiry_date");



CREATE INDEX "idx_stock_items_expiry_branch" ON "public"."stock_items" USING "btree" ("expiry_date", "branch_id") WHERE ("expiry_date" IS NOT NULL);



CREATE INDEX "idx_user_roles_user_role" ON "public"."user_roles" USING "btree" ("user_id", "role");



CREATE INDEX "idx_weekly_tasks_assigned_by" ON "public"."weekly_tasks" USING "btree" ("assigned_by");



CREATE INDEX "idx_weekly_tasks_assigned_to" ON "public"."weekly_tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_weekly_tasks_assigned_to_due_date" ON "public"."weekly_tasks" USING "btree" ("assigned_to", "due_date");



CREATE INDEX "idx_weekly_tasks_dispenser_due_date" ON "public"."weekly_tasks" USING "btree" ("assigned_to", "due_date") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "idx_weekly_tasks_due_date" ON "public"."weekly_tasks" USING "btree" ("due_date");



CREATE INDEX "idx_weekly_tasks_status" ON "public"."weekly_tasks" USING "btree" ("status");



CREATE INDEX "idx_whatsapp_notifications_recipient_phone" ON "public"."whatsapp_notifications" USING "btree" ("recipient_phone");



CREATE INDEX "idx_whatsapp_notifications_status" ON "public"."whatsapp_notifications" USING "btree" ("status");



CREATE OR REPLACE VIEW "public"."users_with_roles_and_branches" AS
 SELECT "u"."id" AS "user_id",
    "u"."name",
    "u"."email",
    "u"."phone",
    "u"."status",
    "u"."last_login",
    "string_agg"(("ur"."role")::"text", ', '::"text") AS "roles",
    "string_agg"("b"."name", ', '::"text") AS "branches"
   FROM (("public"."users" "u"
     LEFT JOIN "public"."user_roles" "ur" ON (("u"."id" = "ur"."user_id")))
     LEFT JOIN "public"."branches" "b" ON (("ur"."branch_id" = "b"."id")))
  GROUP BY "u"."id";



CREATE OR REPLACE TRIGGER "trg_set_is_high_value" BEFORE INSERT OR UPDATE ON "public"."stock_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_is_high_value"();



CREATE OR REPLACE TRIGGER "trg_update_stock_item_attributes" BEFORE INSERT OR UPDATE OF "expiry_date", "quantity", "unit_price" ON "public"."stock_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_stock_item_attributes"();



CREATE OR REPLACE TRIGGER "update_emergency_assignments_updated_at" BEFORE UPDATE ON "public"."emergency_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notes_updated_at" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stock_items_updated_at" BEFORE UPDATE ON "public"."stock_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_weekly_tasks_updated_at" BEFORE UPDATE ON "public"."weekly_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."branch_performance"
    ADD CONSTRAINT "branch_performance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."dormant_stock"
    ADD CONSTRAINT "dormant_stock_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."emergency_assignments"
    ADD CONSTRAINT "emergency_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."emergency_assignments"
    ADD CONSTRAINT "emergency_assignments_dispenser_id_fkey" FOREIGN KEY ("dispenser_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."emergency_assignments"
    ADD CONSTRAINT "emergency_assignments_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_emergency_declared_by_fkey" FOREIGN KEY ("emergency_declared_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_movement_history"
    ADD CONSTRAINT "stock_movement_history_for_dispenser_fkey" FOREIGN KEY ("for_dispenser") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_movement_history"
    ADD CONSTRAINT "stock_movement_history_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."stock_movement_history"
    ADD CONSTRAINT "stock_movement_history_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."stock_movement_history"
    ADD CONSTRAINT "stock_movement_history_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id");



ALTER TABLE ONLY "public"."stock_movement_history"
    ADD CONSTRAINT "stock_movement_history_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_tasks"
    ADD CONSTRAINT "weekly_tasks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."weekly_tasks"
    ADD CONSTRAINT "weekly_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id");



CREATE POLICY "Admins and managers can view users" ON "public"."users" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role")));



CREATE POLICY "Admins can manage all WhatsApp notifications" ON "public"."whatsapp_notifications" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all emergency assignments" ON "public"."emergency_assignments" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all stock movements" ON "public"."stock_movement_history" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all weekly tasks" ON "public"."weekly_tasks" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all branches" ON "public"."branches" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all user roles" ON "public"."user_roles" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "All authenticated users can view stock items" ON "public"."stock_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "All authenticated users can view stock movements" ON "public"."stock_movement_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow all operations for authenticated users" ON "public"."notes" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated users to read stock items" ON "public"."stock_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow users to insert their own user record" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow users to update their own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow users to view their own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Anyone can read public notes" ON "public"."notes" FOR SELECT USING (("is_public" = true));



CREATE POLICY "Authenticated users can insert public notes" ON "public"."notes" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("is_public" = true) AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Authenticated users can insert stock movements" ON "public"."stock_movement_history" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can send private messages" ON "public"."notes" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("is_public" = false) AND ("auth"."uid"() = "created_by") AND ("recipient_id" IS NOT NULL)));



CREATE POLICY "Branch system admins can manage WhatsApp notifications for thei" ON "public"."whatsapp_notifications" USING ("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role"));



CREATE POLICY "Branch system admins can manage emergency assignments for their" ON "public"."emergency_assignments" USING (("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role") AND ("stock_item_id" IN ( SELECT "stock_items"."id"
   FROM "public"."stock_items"
  WHERE ("stock_items"."branch_id" IN ( SELECT "user_roles"."branch_id"
           FROM "public"."user_roles"
          WHERE ("user_roles"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Branch system admins can manage roles in their branch" ON "public"."user_roles" USING ("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role", "branch_id"));



CREATE POLICY "Branch system admins can manage stock movements for their branc" ON "public"."stock_movement_history" USING (("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role") AND (("from_branch_id" IN ( SELECT "user_roles"."branch_id"
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = "auth"."uid"()))) OR ("to_branch_id" IN ( SELECT "user_roles"."branch_id"
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Branch system admins can manage their branch" ON "public"."branches" USING ("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role", "id"));



CREATE POLICY "Branch system admins can manage weekly tasks for their branch" ON "public"."weekly_tasks" USING (("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role") AND ("assigned_to" IN ( SELECT "u"."id"
   FROM ("public"."users" "u"
     JOIN "public"."user_roles" "ur" ON (("u"."id" = "ur"."user_id")))
  WHERE ("ur"."branch_id" IN ( SELECT "user_roles"."branch_id"
           FROM "public"."user_roles"
          WHERE ("user_roles"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Dispensers can manage their own emergency assignments" ON "public"."emergency_assignments" USING (("dispenser_id" = "auth"."uid"()));



CREATE POLICY "Dispensers can update their assigned items" ON "public"."stock_items" FOR UPDATE USING (("assigned_to" = "auth"."uid"()));



CREATE POLICY "Dispensers can view their branch" ON "public"."branches" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'dispenser'::"public"."app_role") AND ("ur"."branch_id" = "branches"."id")))));



CREATE POLICY "Non-doctors can delete stock items" ON "public"."stock_items" FOR DELETE TO "authenticated" USING ("public"."can_modify_data"("auth"."uid"(), "branch_id"));



CREATE POLICY "Non-doctors can delete stock movements" ON "public"."stock_movement_history" FOR DELETE TO "authenticated" USING ("public"."can_modify_data"("auth"."uid"()));



CREATE POLICY "Non-doctors can insert stock items" ON "public"."stock_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_modify_data"("auth"."uid"(), "branch_id"));



CREATE POLICY "Non-doctors can insert stock movements" ON "public"."stock_movement_history" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_modify_data"("auth"."uid"()));



CREATE POLICY "Non-doctors can update stock items" ON "public"."stock_items" FOR UPDATE TO "authenticated" USING ("public"."can_modify_data"("auth"."uid"(), "branch_id"));



CREATE POLICY "Non-doctors can update stock movements" ON "public"."stock_movement_history" FOR UPDATE TO "authenticated" USING ("public"."can_modify_data"("auth"."uid"()));



CREATE POLICY "Regional managers can manage all WhatsApp notifications" ON "public"."whatsapp_notifications" USING ("public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role"));



CREATE POLICY "Regional managers can manage all emergency assignments" ON "public"."emergency_assignments" USING ("public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role"));



CREATE POLICY "Regional managers can manage all stock movements" ON "public"."stock_movement_history" USING ("public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role"));



CREATE POLICY "Regional managers can manage all weekly tasks" ON "public"."weekly_tasks" USING ("public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role"));



CREATE POLICY "Regional managers can view all branches" ON "public"."branches" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role"));



CREATE POLICY "System admins can manage all WhatsApp notifications" ON "public"."whatsapp_notifications" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all branches" ON "public"."branches" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all emergency assignments" ON "public"."emergency_assignments" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all stock items" ON "public"."stock_items" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all stock movements" ON "public"."stock_movement_history" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all user roles" ON "public"."user_roles" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all users" ON "public"."users" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "System admins can manage all weekly tasks" ON "public"."weekly_tasks" USING ("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role"));



CREATE POLICY "Users can delete stock items based on role" ON "public"."stock_items" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'branch_system_admin'::"public"."app_role") AND ("branch_id" IN ( SELECT "user_roles"."branch_id"
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = "auth"."uid"())))) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



COMMENT ON POLICY "Users can delete stock items based on role" ON "public"."stock_items" IS 'Allows authorized users (system_admin, regional_manager, branch_system_admin, admin) to delete stock items. Branch system admins can only delete items from their assigned branches.';



CREATE POLICY "Users can delete their own notes" ON "public"."notes" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can read their private messages" ON "public"."notes" FOR SELECT USING ((("auth"."uid"() = "created_by") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can update their own movement records" ON "public"."stock_movement_history" FOR UPDATE TO "authenticated" USING ((("moved_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'system_admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'regional_manager'::"public"."app_role")));



CREATE POLICY "Users can update their own notes" ON "public"."notes" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can view all WhatsApp notifications" ON "public"."whatsapp_notifications" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Users can view and manage their own weekly tasks" ON "public"."weekly_tasks" USING (("assigned_to" = "auth"."uid"()));



CREATE POLICY "Users can view stock movements they're involved in" ON "public"."stock_movement_history" FOR SELECT USING ((("moved_by" = "auth"."uid"()) OR ("for_dispenser" = "auth"."uid"()) OR ("stock_item_id" IN ( SELECT "stock_items"."id"
   FROM "public"."stock_items"
  WHERE ("stock_items"."assigned_to" = "auth"."uid"())))));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view weekly tasks they created" ON "public"."weekly_tasks" FOR SELECT USING (("assigned_by" = "auth"."uid"()));



CREATE POLICY "Users with roles can view items in their branch" ON "public"."stock_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."branch_id" = "stock_items"."branch_id")))));



ALTER TABLE "public"."branch_performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dormant_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dormant_stock_delete" ON "public"."dormant_stock" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "dormant_stock_insert" ON "public"."dormant_stock" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "dormant_stock_read" ON "public"."dormant_stock" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "dormant_stock_update" ON "public"."dormant_stock" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."emergency_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movement_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_insert" ON "public"."user_roles" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "user_roles_select_all" ON "public"."user_roles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "user_roles_select_own" ON "public"."user_roles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_roles_update_own" ON "public"."user_roles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_notifications" ENABLE ROW LEVEL SECURITY;


REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "anon";



GRANT ALL ON FUNCTION "public"."assign_user_role"("p_user_id" "uuid", "p_role" "public"."app_role", "p_branch_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."distribute_tasks_mathematically"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_all_tasks_for_month"("p_year" integer, "p_month" integer, "p_week" integer, "p_dispenser_id" "uuid", "p_task_type" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_dispenser_tasks_for_month"("p_dispenser_id" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_task_type" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role", "_branch_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."sync_auth_user_to_users"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_stock_item_attributes"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."branch_performance" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."branches" TO "authenticated";
GRANT SELECT ON TABLE "public"."branches" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."emergency_assignments" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."stock_items" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."users" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_tasks" TO "authenticated";



GRANT SELECT ON TABLE "public"."complete_dispenser_tasks_view" TO "authenticated";



GRANT SELECT ON TABLE "public"."dispenser_tasks_summary" TO "authenticated";



GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."dispensers_view" TO "authenticated";



GRANT ALL ON TABLE "public"."dormant_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."dormant_stock" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."high_value_items_monthly_summary" TO "authenticated";



GRANT SELECT ON TABLE "public"."mathematical_dispenser_tasks_view" TO "authenticated";



GRANT SELECT ON TABLE "public"."mathematical_dispenser_summary" TO "authenticated";



GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."notifications" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."stock_items_view" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."stock_movement_history" TO "authenticated";



GRANT SELECT ON TABLE "public"."stock_movement_history_view" TO "authenticated";



GRANT SELECT ON TABLE "public"."unified_assignments_view" TO "authenticated";



GRANT SELECT ON TABLE "public"."user_permissions_debug" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."users_with_roles" TO "authenticated";



GRANT SELECT ON TABLE "public"."weekly_assignments_view" TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."whatsapp_notifications" TO "authenticated";



