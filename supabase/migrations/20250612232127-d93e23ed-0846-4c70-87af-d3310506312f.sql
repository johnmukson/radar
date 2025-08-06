
-- Update the calculate_stock_metrics function with new expiry logic
-- Critical: 60 days or less, High: 61-90 days, Medium: 91-120 days, Low: 120+ days
CREATE OR REPLACE FUNCTION public.calculate_stock_metrics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Calculate days to expiry
  NEW.days_to_expiry := (NEW.expiry_date - CURRENT_DATE);
  
  -- Calculate risk level based on days to expiry - updated logic for better sales window
  IF NEW.days_to_expiry <= 60 THEN
    NEW.risk_level := 'critical';
  ELSIF NEW.days_to_expiry <= 90 THEN
    NEW.risk_level := 'high';
  ELSIF NEW.days_to_expiry <= 120 THEN
    NEW.risk_level := 'medium';
  ELSE
    NEW.risk_level := 'low';
  END IF;
  
  -- Calculate priority score (higher score = higher priority)
  NEW.priority_score := (NEW.quantity * NEW.unit_price) / GREATEST(NEW.days_to_expiry, 1);
  
  -- Calculate total value
  NEW.value := NEW.quantity * NEW.unit_price;
  
  RETURN NEW;
END;
$function$;
