import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

/**
 * Button that requests an AI recommendation from the ai-alert edge function.
 * When clicked, it sends a request and displays the returned recommendation.
 */
export default function AiRecommendationButton() {
  const [recommendation, setRecommendation] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleClick = async () => {
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('ai-alert')
    setLoading(false)
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } else {
      const rec = data?.recommendation || 'No recommendation generated'
      setRecommendation(rec)
      toast({ title: 'AI Recommendation', description: rec })
    }
  }

  return (
    <div className="space-y-2 my-4">
      <Button onClick={handleClick} disabled={loading}>
        {loading ? 'Generating…' : 'Get AI Recommendation'}
      </Button>
      {recommendation && <p className="text-sm text-muted-foreground whitespace-pre-line">{recommendation}</p>}
    </div>
  )
}