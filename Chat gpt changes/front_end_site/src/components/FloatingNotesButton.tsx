import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { MessageSquare, Plus, Edit, Trash2, User, X, Reply, ArrowRight, Globe, Lock } from 'lucide-react'

type Note = {
  id: string
  content: string
  created_by: string | null
  created_at: string
  updated_at: string
  parent_id?: string | null
  is_public: boolean
  recipient_id?: string | null
  users?: {
    name?: string
    email?: string
  }
  recipient?: {
    name?: string
    email?: string
  }
  replies?: Note[]
}

const FloatingNotesButton: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [selectedRecipient, setSelectedRecipient] = useState<string>('')
  const [users, setUsers] = useState<{id: string, name?: string, email?: string}[]>([])
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public')
  const [isOpen, setIsOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      loadNotes()
      loadUsers()
    }
  }, [isOpen, activeTab])

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.auth.admin.listUsers()

      if (error) throw error
      
      const userList = (data?.users || []).map(user => ({
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown User',
        email: user.email || ''
      }))
      
      setUsers(userList)
    } catch (error: unknown) {
      console.error('Error loading users:', error)
      // Fallback: try to get users from a users table if it exists
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email')
          .order('name')

        if (!error && data) {
          setUsers(data)
        }
      } catch (fallbackError) {
        console.error('Fallback user loading failed:', fallbackError)
      }
    }
  }

  const loadNotes = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      
      let query = supabase
        .from('notes')
        .select(`
          *
        `)

      if (activeTab === 'public') {
        query = query.eq('is_public', true)
      } else {
        // For private messages, show messages sent to current user or sent by current user
        query = query.or(`recipient_id.eq.${user?.id},created_by.eq.${user?.id}`)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      
      // Organize notes into threads (parent notes with replies)
      const parentNotes = (data || []).filter(note => !note.parent_id)
      const replies = (data || []).filter(note => note.parent_id)
      
      // Attach replies to their parent notes
      const notesWithReplies = parentNotes.map(parent => ({
        ...parent,
        replies: replies
          .filter(reply => reply.parent_id === parent.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }))
      
      setNotes(notesWithReplies)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error loading notes:', message)
      toast({
        title: 'Error',
        description: 'Failed to load notes',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const addNote = async () => {
    if (!newNote.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a note',
        variant: 'destructive',
      })
      return
    }

    if (!isPublic && !selectedRecipient) {
      toast({
        title: 'Error',
        description: 'Please select a recipient for private messages',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { error } = await supabase
        .from('notes')
        .insert({
          content: newNote.trim(),
          created_by: user?.id,
          is_public: isPublic,
          recipient_id: isPublic ? null : selectedRecipient
        })

      if (error) throw error

      setNewNote('')
      setSelectedRecipient('')
      setIsPublic(true)
      loadNotes()
      
      toast({
        title: 'Success',
        description: isPublic ? 'Message posted to notice board' : 'Private message sent',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error adding note:', message)
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      })
    }
  }

  const updateNote = async (noteId: string) => {
    if (!editContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter note content',
        variant: 'destructive',
      })
      return
    }

    try {
      const { error } = await supabase
        .from('notes')
        .update({ content: editContent.trim() })
        .eq('id', noteId)

      if (error) throw error

      setEditingNote(null)
      setEditContent('')
      loadNotes()
      
      toast({
        title: 'Success',
        description: 'Note updated successfully',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error updating note:', message)
      toast({
        title: 'Error',
        description: 'Failed to update note',
        variant: 'destructive',
      })
    }
  }

  const deleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId)

      if (error) throw error

      loadNotes()
      
      toast({
        title: 'Success',
        description: 'Note deleted successfully',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error deleting note:', message)
      toast({
        title: 'Error',
        description: 'Failed to delete note',
        variant: 'destructive',
      })
    }
  }

  const startEditing = (note: Note) => {
    setEditingNote(note.id)
    setEditContent(note.content)
  }

  const cancelEditing = () => {
    setEditingNote(null)
    setEditContent('')
  }

  const addReply = async (parentId: string, parentNote: Note) => {
    if (!replyContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a reply',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { error } = await supabase
        .from('notes')
        .insert({
          content: replyContent.trim(),
          created_by: user?.id,
          parent_id: parentId,
          is_public: parentNote.is_public,
          recipient_id: parentNote.is_public ? null : parentNote.recipient_id
        })

      if (error) throw error

      setReplyContent('')
      setReplyingTo(null)
      loadNotes()
      
      toast({
        title: 'Success',
        description: 'Reply added successfully',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error adding reply:', message)
      toast({
        title: 'Error',
        description: 'Failed to add reply',
        variant: 'destructive',
      })
    }
  }

  const startReply = (noteId: string) => {
    setReplyingTo(noteId)
    setReplyContent('')
  }

  const cancelReply = () => {
    setReplyingTo(null)
    setReplyContent('')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getUserDisplayName = (note: Note) => {
    if (note.users?.name) return note.users.name
    if (note.users?.email) return note.users.email.split('@')[0]
    return 'Anonymous'
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Messages & Notice Board
              {notes.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded-full">
                  {notes.length}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'public' | 'private')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="public" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Notice Board
                </TabsTrigger>
                <TabsTrigger value="private" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Private Messages
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="flex-1 flex flex-col gap-4 overflow-hidden">
                {/* Add New Message */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      {activeTab === 'public' ? 'Post to Notice Board' : 'Send Private Message'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      placeholder={activeTab === 'public' ? "Write your message for the notice board..." : "Write your private message..."}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="min-h-[100px]"
                    />
                    
                    {activeTab === 'private' && (
                      <div className="space-y-2">
                        <Label htmlFor="recipient">Send to:</Label>
                        <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a user..." />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name || user.email?.split('@')[0] || 'Unknown User'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <Button 
                      onClick={addNote} 
                      disabled={loading || !newNote.trim() || (activeTab === 'private' && !selectedRecipient)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {activeTab === 'public' ? 'Post to Notice Board' : 'Send Message'}
                    </Button>
                  </CardContent>
                </Card>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading notes...
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No notes yet</p>
                    <p className="text-sm">Be the first to add a note!</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <Card key={note.id} className="relative">
                      <CardContent className="pt-4">
                        {editingNote === note.id ? (
                          <div className="space-y-3">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="min-h-[100px]"
                            />
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => updateNote(note.id)}
                                disabled={!editContent.trim()}
                              >
                                Save
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={cancelEditing}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap text-sm">
                              {note.content}
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {note.is_public ? (
                                  <Globe className="h-3 w-3 text-green-600" title="Public Notice Board" />
                                ) : (
                                  <Lock className="h-3 w-3 text-orange-600" title="Private Message" />
                                )}
                                <User className="h-3 w-3" />
                                <span>{getUserDisplayName(note)}</span>
                                {!note.is_public && note.recipient && (
                                  <>
                                    <span>→</span>
                                    <span>{getUserDisplayName({users: note.recipient})}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span>{formatDate(note.created_at)}</span>
                                {note.updated_at !== note.created_at && (
                                  <>
                                    <span>•</span>
                                    <span>Edited {formatDate(note.updated_at)}</span>
                                  </>
                                )}
                                {note.replies && note.replies.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-blue-600">{note.replies.length} reply{note.replies.length !== 1 ? 'ies' : ''}</span>
                                  </>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startReply(note.id)}
                                  className="h-6 w-6 p-0"
                                  title="Reply"
                                >
                                  <Reply className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(note)}
                                  className="h-6 w-6 p-0"
                                  title="Edit"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteNote(note.id)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* Reply Form */}
                            {replyingTo === note.id && (
                              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                                  <ArrowRight className="h-3 w-3" />
                                  <span>Replying to {getUserDisplayName(note)}</span>
                                </div>
                                <Textarea
                                  placeholder="Write your reply..."
                                  value={replyContent}
                                  onChange={(e) => setReplyContent(e.target.value)}
                                  className="min-h-[80px] mb-2"
                                />
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    onClick={() => addReply(note.id, note)}
                                    disabled={!replyContent.trim()}
                                  >
                                    Reply
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={cancelReply}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Replies */}
                            {note.replies && note.replies.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {note.replies.map((reply) => (
                                  <div key={reply.id} className="ml-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-l-2 border-blue-200 dark:border-blue-800">
                                    <div className="whitespace-pre-wrap text-sm mb-2">
                                      {reply.content}
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <User className="h-3 w-3" />
                                        <span>{getUserDisplayName(reply)}</span>
                                        <span>•</span>
                                        <span>{formatDate(reply.created_at)}</span>
                                        {reply.updated_at !== reply.created_at && (
                                          <>
                                            <span>•</span>
                                            <span>Edited {formatDate(reply.updated_at)}</span>
                                          </>
                                        )}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => startEditing(reply)}
                                          className="h-5 w-5 p-0"
                                          title="Edit"
                                        >
                                          <Edit className="h-2 w-2" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => deleteNote(reply.id)}
                                          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                                          title="Delete"
                                        >
                                          <Trash2 className="h-2 w-2" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FloatingNotesButton
