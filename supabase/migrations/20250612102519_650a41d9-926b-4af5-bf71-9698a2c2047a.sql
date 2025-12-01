
-- Create a table for weekly tasks
CREATE TABLE public.weekly_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.dispensers(id) NOT NULL,
  assigned_by UUID NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create a table for WhatsApp notification logs
CREATE TABLE public.whatsapp_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_phone TEXT NOT NULL,
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('weekly_task', 'emergency_assignment', 'general')),
  related_id UUID, -- Can reference weekly_tasks.id or emergency_assignments.id
  twilio_sid TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add phone number field to dispensers table if it doesn't exist
ALTER TABLE public.dispensers 
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- Enable RLS on new tables
ALTER TABLE public.weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for weekly_tasks
CREATE POLICY "Admin can manage all weekly tasks" 
  ON public.weekly_tasks 
  FOR ALL 
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispensers can view their assigned tasks" 
  ON public.weekly_tasks 
  FOR SELECT 
  USING (
    assigned_to IN (
      SELECT id FROM public.dispensers WHERE user_id = auth.uid()
    )
  );

-- Create RLS policies for whatsapp_notifications
CREATE POLICY "Admin can manage all WhatsApp notifications" 
  ON public.whatsapp_notifications 
  FOR ALL 
  USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at on weekly_tasks
CREATE TRIGGER update_weekly_tasks_updated_at
  BEFORE UPDATE ON public.weekly_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
;
