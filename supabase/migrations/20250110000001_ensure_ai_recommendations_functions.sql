-- ============================================================================
-- Ensure AI Recommendations Functions Exist
-- Migration: 20250110000001_ensure_ai_recommendations_functions.sql
-- Description: Creates generate_ai_recommendations and update_recommendation_status functions
-- ============================================================================

-- Function to Generate AI Recommendations
CREATE OR REPLACE FUNCTION public.generate_ai_recommendations(
  p_branch_id UUID DEFAULT NULL,
  p_recommendation_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  recommendation_id UUID,
  branch_id UUID,
  recommendation_type TEXT,
  title TEXT,
  recommendation TEXT,
  priority TEXT,
  impact_score DECIMAL,
  metadata JSONB
) AS $$
DECLARE
  v_branch_id UUID;
  v_expiring_count INTEGER;
  v_expiring_value DECIMAL;
  v_low_stock_count INTEGER;
  v_high_value_items_count INTEGER;
  v_total_stock_value DECIMAL;
  v_avg_expiry_days INTEGER;
BEGIN
  -- Loop through branches or use specific branch
  FOR v_branch_id IN
    SELECT DISTINCT id FROM public.branches
    WHERE (p_branch_id IS NULL OR id = p_branch_id)
  LOOP
    -- 1. Expiry Warnings
    IF p_recommendation_type IS NULL OR p_recommendation_type = 'expiry_warning' THEN
      SELECT 
        COUNT(*),
        COALESCE(SUM(quantity * unit_price), 0),
        COALESCE(AVG(EXTRACT(EPOCH FROM (expiry_date - NOW())) / 86400)::INTEGER, 0)
      INTO v_expiring_count, v_expiring_value, v_avg_expiry_days
      FROM public.stock_items
      WHERE branch_id = v_branch_id
        AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        AND status = 'active';

      IF v_expiring_count > 0 THEN
        recommendation_id := gen_random_uuid();
        branch_id := v_branch_id;
        recommendation_type := 'expiry_warning';
        title := 'Items Expiring Soon: ' || v_expiring_count || ' items expiring within 30 days';
        recommendation := 'You have ' || v_expiring_count || ' items expiring within 30 days with a total value of $' || 
                         ROUND(v_expiring_value, 2) || '. Consider prioritizing these items for sale or redistribution. ' ||
                         'Average days until expiry: ' || v_avg_expiry_days || ' days.';
        priority := CASE 
          WHEN v_expiring_count > 50 OR v_expiring_value > 50000 THEN 'critical'
          WHEN v_expiring_count > 20 OR v_expiring_value > 20000 THEN 'high'
          WHEN v_expiring_count > 10 OR v_expiring_value > 10000 THEN 'medium'
          ELSE 'low'
        END;
        impact_score := LEAST(ROUND((v_expiring_value / 1000)::DECIMAL, 2), 100);
        metadata := jsonb_build_object(
          'expiring_count', v_expiring_count,
          'expiring_value', v_expiring_value,
          'avg_expiry_days', v_avg_expiry_days
        );
        RETURN NEXT;
      END IF;
    END IF;

    -- 2. Low Stock Alerts
    IF p_recommendation_type IS NULL OR p_recommendation_type = 'low_stock_alert' THEN
      SELECT COUNT(*)
      INTO v_low_stock_count
      FROM public.stock_items
      WHERE branch_id = v_branch_id
        AND quantity < 10
        AND status = 'active';

      IF v_low_stock_count > 0 THEN
        recommendation_id := gen_random_uuid();
        branch_id := v_branch_id;
        recommendation_type := 'low_stock_alert';
        title := 'Low Stock Alert: ' || v_low_stock_count || ' items running low';
        recommendation := 'You have ' || v_low_stock_count || ' items with quantity below 10 units. ' ||
                         'Consider reordering these items to prevent stockouts.';
        priority := CASE 
          WHEN v_low_stock_count > 30 THEN 'critical'
          WHEN v_low_stock_count > 15 THEN 'high'
          WHEN v_low_stock_count > 5 THEN 'medium'
          ELSE 'low'
        END;
        impact_score := LEAST(ROUND((v_low_stock_count / 2)::DECIMAL, 2), 100);
        metadata := jsonb_build_object('low_stock_count', v_low_stock_count);
        RETURN NEXT;
      END IF;
    END IF;

    -- 3. High Value Items Analysis
    IF p_recommendation_type IS NULL OR p_recommendation_type = 'inventory_analysis' THEN
      SELECT 
        COUNT(*),
        COALESCE(SUM(quantity * unit_price), 0)
      INTO v_high_value_items_count, v_total_stock_value
      FROM public.stock_items
      WHERE branch_id = v_branch_id
        AND (quantity * unit_price) > 10000
        AND status = 'active';

      IF v_high_value_items_count > 0 THEN
        recommendation_id := gen_random_uuid();
        branch_id := v_branch_id;
        recommendation_type := 'inventory_analysis';
        title := 'High Value Inventory: ' || v_high_value_items_count || ' high-value items detected';
        recommendation := 'You have ' || v_high_value_items_count || ' items with individual value exceeding $10,000, ' ||
                         'totaling $' || ROUND(v_total_stock_value, 2) || '. Consider implementing enhanced security ' ||
                         'measures and regular audits for these high-value items.';
        priority := CASE 
          WHEN v_total_stock_value > 500000 THEN 'critical'
          WHEN v_total_stock_value > 200000 THEN 'high'
          ELSE 'medium'
        END;
        impact_score := LEAST(ROUND((v_total_stock_value / 10000)::DECIMAL, 2), 100);
        metadata := jsonb_build_object(
          'high_value_count', v_high_value_items_count,
          'total_value', v_total_stock_value
        );
        RETURN NEXT;
      END IF;
    END IF;

    -- 4. Cost Reduction Opportunities (60-90 days - proactive planning window)
    IF p_recommendation_type IS NULL OR p_recommendation_type = 'cost_reduction' THEN
      SELECT COUNT(*)
      INTO v_expiring_count
      FROM public.stock_items
      WHERE branch_id = v_branch_id
        AND expiry_date BETWEEN NOW() + INTERVAL '60 days' AND NOW() + INTERVAL '90 days'
        AND status = 'active';

      IF v_expiring_count > 0 THEN
        SELECT COALESCE(SUM(quantity * unit_price), 0)
        INTO v_expiring_value
        FROM public.stock_items
        WHERE branch_id = v_branch_id
          AND expiry_date BETWEEN NOW() + INTERVAL '60 days' AND NOW() + INTERVAL '90 days'
          AND status = 'active';

        recommendation_id := gen_random_uuid();
        branch_id := v_branch_id;
        recommendation_type := 'cost_reduction';
        title := 'Cost Reduction Opportunity: ' || v_expiring_count || ' items expiring in 2-3 months';
        recommendation := 'You have ' || v_expiring_count || ' items expiring in 60-90 days with a total value of $' ||
                         ROUND(v_expiring_value, 2) || '. This timeframe provides an opportunity to proactively sell, redistribute, or negotiate with suppliers to minimize losses. Start planning sales campaigns or inter-branch transfers now.';
        priority := CASE 
          WHEN v_expiring_value > 100000 THEN 'high'
          WHEN v_expiring_value > 50000 THEN 'medium'
          ELSE 'low'
        END;
        impact_score := LEAST(ROUND((v_expiring_value / 2000)::DECIMAL, 2), 100);
        metadata := jsonb_build_object(
          'expiring_count', v_expiring_count,
          'potential_loss', v_expiring_value,
          'days_range', '60-90'
        );
        RETURN NEXT;
      END IF;
    END IF;

    -- 5. Stock Optimization
    IF p_recommendation_type IS NULL OR p_recommendation_type = 'stock_optimization' THEN
      SELECT 
        COUNT(*) FILTER (WHERE quantity > 100),
        COUNT(*) FILTER (WHERE quantity < 5)
      INTO v_high_value_items_count, v_low_stock_count
      FROM public.stock_items
      WHERE branch_id = v_branch_id
        AND status = 'active';

      IF v_high_value_items_count > 10 OR v_low_stock_count > 20 THEN
        recommendation_id := gen_random_uuid();
        branch_id := v_branch_id;
        recommendation_type := 'stock_optimization';
        title := 'Stock Optimization Needed';
        recommendation := 'Your inventory shows ' || v_high_value_items_count || ' items with excess stock (>100 units) ' ||
                         'and ' || v_low_stock_count || ' items with very low stock (<5 units). ' ||
                         'Consider redistributing excess inventory and reordering low stock items for better balance.';
        priority := CASE 
          WHEN v_high_value_items_count > 30 OR v_low_stock_count > 50 THEN 'high'
          ELSE 'medium'
        END;
        impact_score := LEAST(ROUND(((v_high_value_items_count + v_low_stock_count) / 5)::DECIMAL, 2), 100);
        metadata := jsonb_build_object(
          'excess_stock_count', v_high_value_items_count,
          'very_low_stock_count', v_low_stock_count
        );
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_ai_recommendations IS 'Generates AI-powered recommendations based on stock data analysis including expiry warnings, low stock alerts, inventory analysis, and cost reduction opportunities';

-- Function to Update Recommendation Status
CREATE OR REPLACE FUNCTION public.update_recommendation_status(
  p_recommendation_id UUID,
  p_status TEXT,
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.ai_recommendations
  SET 
    status = p_status,
    updated_at = NOW(),
    reviewed_at = CASE WHEN p_status IN ('reviewed', 'implemented', 'dismissed') THEN NOW() ELSE reviewed_at END,
    reviewed_by = CASE WHEN p_status IN ('reviewed', 'implemented', 'dismissed') THEN p_user_id ELSE reviewed_by END,
    implemented_at = CASE WHEN p_status = 'implemented' THEN NOW() ELSE implemented_at END,
    implemented_by = CASE WHEN p_status = 'implemented' THEN p_user_id ELSE implemented_by END
  WHERE id = p_recommendation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_recommendation_status IS 'Updates the status of an AI recommendation and tracks who reviewed/implemented it';

