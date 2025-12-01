import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useBranch } from '@/contexts/BranchContext'

/**
 * Compact AI Recommendations button that navigates to the AI Recommendations tab
 * or opens the AI recommendations manager.
 */
export default function AiRecommendationButton() {
  const navigate = useNavigate()
  const { selectedBranch } = useBranch()
  const { toast } = useToast()

  const handleClick = () => {
    if (!selectedBranch) {
      toast({
        title: 'Error',
        description: 'Please select a branch first',
        variant: 'destructive'
      })
      return
    }

    // Navigate to Dashboard with AI tab active
    navigate('/dashboard', { state: { activeTab: 'ai-recommendations' } })
  }

  return (
    <Button
      onClick={handleClick}
      disabled={!selectedBranch}
      variant="outline"
      size="sm"
      className="flex items-center gap-2"
      title="View AI Recommendations"
    >
      <Sparkles className="h-4 w-4" />
      AI Insights
    </Button>
  )
}

