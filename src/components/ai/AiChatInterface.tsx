import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageCircle, Send, Bot, User, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface AiChatInterfaceProps {
  recommendationContext?: {
    id: string
    title: string
    recommendation: string
    recommendation_type: string
    priority: string
    metadata?: Record<string, any>
  } | null
}

const AiChatInterface: React.FC<AiChatInterfaceProps> = ({ recommendationContext }) => {
  const { selectedBranch } = useBranch()
  const { user } = useAuth()
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize with welcome message if no messages
  useEffect(() => {
    if (messages.length === 0 && selectedBranch) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello! I'm your AI inventory management assistant with full access to your entire multi-branch pharmacy system. I can help you with:

• Understanding recommendations across all branches
• Analyzing stock data and trends system-wide
• Comparing performance across branches
• Suggesting optimization strategies
• Answering questions about any branch or the entire company
• Prioritizing actions based on urgency and impact

I can see all branches in your system and provide insights about any of them. Ask me about:
- Specific branches (e.g., "Tell me about Munyonyo branch")
- System-wide analysis (e.g., "Compare all branches")
- Cross-branch insights (e.g., "Which branch has the most expiring items?")
- Any inventory management question!

${recommendationContext ? `\nYou're currently viewing: **${recommendationContext.title}**\n\nAsk me about this recommendation or anything else in your system!` : `\nAsk me anything about your inventory system - I can see all branches!`}`,
        timestamp: new Date()
      }
      setMessages([welcomeMessage])
    }
  }, [selectedBranch, recommendationContext])

  const sendMessage = async () => {
    if (!input.trim() || !selectedBranch || !user || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Get conversation history (last 10 messages for context, excluding welcome message)
      const conversationHistory = messages
        .filter(msg => msg.id !== 'welcome') // Exclude welcome message
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))

      console.log('=== AI CHAT DEBUG START ===')
      console.log('Calling ai-chat function with:', {
        message: userMessage.content.substring(0, 50) + '...',
        branch_id: selectedBranch.id,
        branch_name: selectedBranch.name,
        hasHistory: conversationHistory.length > 0,
        historyCount: conversationHistory.length,
        hasContext: !!recommendationContext,
        user: user?.email
      })

      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          message: userMessage.content,
          branch_id: selectedBranch.id,
          conversation_history: conversationHistory,
          recommendation_context: recommendationContext || null
        }
      })

      console.log('=== FUNCTION RESPONSE ===')
      console.log('Data:', JSON.stringify(data, null, 2))
      console.log('Error:', JSON.stringify(error, null, 2))
      console.log('Error type:', typeof error)
      console.log('Error keys:', error ? Object.keys(error) : 'no error')
      console.log('=== AI CHAT DEBUG END ===')

      if (error) {
        console.error('Edge function error:', error)
        // If error is an object, extract the message
        if (error && typeof error === 'object') {
          const errorDetails = {
            message: error.message || 'Unknown error',
            error: error.error || error.error_description,
            details: error.details || error.context?.message,
            status: error.status || error.statusCode
          }
          console.error('Error details:', errorDetails)
          throw new Error(errorDetails.details || errorDetails.error || errorDetails.message || 'Edge function error')
        }
        throw error
      }

      if (!data) {
        console.error('No data in response')
        throw new Error('No response from AI function')
      }

      if (data.error) {
        console.error('Error in response data:', data.error)
        
        // Handle quota exceeded errors
        if (data.errorCode === 'insufficient_quota' || data.error?.includes('quota') || data.details?.includes('quota')) {
          throw new Error(
            'OpenAI API quota exceeded. Your API key has reached its usage limit. ' +
            'Please check your OpenAI account billing and upgrade your plan if needed. ' +
            `More info: ${data.helpUrl || 'https://platform.openai.com/docs/guides/error-codes/api-errors'}`
          )
        }
        
        // Handle rate limit errors
        if (data.status === 429 || data.error.includes('rate limit') || data.error.includes('Rate limit')) {
          const retryAfter = data.retryAfter || 60
          throw new Error(`Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`)
        }
        
        throw new Error(data.details || data.error || 'AI function returned an error')
      }

      if (!data.message) {
        console.error('No message in response:', data)
        throw new Error(data.error || 'No response message from AI')
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, aiMessage])
    } catch (error: any) {
      console.error('Error sending message:', error)
      console.error('Error details:', {
        message: error.message,
        error: error.error,
        details: error.details,
        status: error.status
      })
      
      const errorText = error.details || error.message || error.error || 'Failed to send message. Please try again.'
      
      toast({
        title: 'Error',
        description: errorText,
        variant: 'destructive'
      })

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again or rephrase your question.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="flex-shrink-0 border-b">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-purple-500" />
          AI Inventory Assistant
          {recommendationContext && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              • {recommendationContext.title}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-purple-500" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {format(message.timestamp, 'HH:mm')}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-purple-500" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <div className="flex-shrink-0 border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about your inventory, recommendations, or stock management..."
              className="min-h-[60px] resize-none"
              disabled={loading || !selectedBranch}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim() || !selectedBranch}
              size="icon"
              className="self-end"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {!selectedBranch && (
            <p className="text-xs text-muted-foreground mt-2">
              Please select a branch to start chatting
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default AiChatInterface

