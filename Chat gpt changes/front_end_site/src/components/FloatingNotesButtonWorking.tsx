import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { MessageSquare, Plus, Edit, Trash2, User, Reply, Globe, Lock } from 'lucide-react'

type Note = {
  id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string
  parent_id?: string | null
  is_public: boolean
  recipient_id?: string | null
  replies?: Note[]
}

const FloatingNotesButtonWorking: React.FC = () => {
  // Use localStorage to store messages temporarily
  const [notes, setNotes] = useState<Note[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app-notes')
      return saved ? JSON.parse(saved) : [
        {
          id: '1',
          content: 'Welcome to the Notice Board! You can post public messages here.',
          created_by: 'system',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_public: true,
          replies: []
        },
        {
          id: '2',
          content: 'This is a test message. The messaging system is working!',
          created_by: 'system',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          is_public: true,
          replies: []
        },
        {
          id: '3',
          content: 'You can scroll through messages here. Try adding more messages to see the scrolling in action!',
          created_by: 'system',
          created_at: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date(Date.now() - 7200000).toISOString(),
          is_public: true,
          replies: []
        },
        {
          id: '4',
          content: 'This is another sample message to demonstrate the scrolling functionality.',
          created_by: 'system',
          created_at: new Date(Date.now() - 10800000).toISOString(),
          updated_at: new Date(Date.now() - 10800000).toISOString(),
          is_public: true,
          replies: []
        },
        {
          id: '5',
          content: 'The messages list is now fully scrollable! You can scroll up and down to see all messages.',
          created_by: 'system',
          created_at: new Date(Date.now() - 14400000).toISOString(),
          updated_at: new Date(Date.now() - 14400000).toISOString(),
          is_public: true,
          replies: []
        }
      ]
    }
    return []
  })
  
  const [loading, setLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public')
  const [isOpen, setIsOpen] = useState(false)
  const { toast } = useToast()

  // Save to localStorage whenever notes change
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app-notes', JSON.stringify(notes))
    }
  }, [notes])

  const addNote = async () => {
    if (!newNote.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    
    // Simulate API call delay
    setTimeout(() => {
      const newNoteObj: Note = {
        id: Date.now().toString(),
        content: newNote.trim(),
        created_by: 'current-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_public: activeTab === 'public',
        recipient_id: activeTab === 'private' ? 'recipient-user' : null,
        replies: []
      }

      setNotes(prev => [newNoteObj, ...prev])
      setNewNote('')
      setLoading(false)
      
      toast({
        title: 'Success',
        description: activeTab === 'public' ? 'Message posted to notice board!' : 'Private message sent!',
      })
    }, 500)
  }

  const updateNote = async (noteId: string) => {
    if (!editContent.trim()) {
      toast({
        title: 'Error',
        description: 'Note content cannot be empty',
        variant: 'destructive',
      })
      return
    }

    setNotes(prev => prev.map(note => 
      note.id === noteId 
        ? { ...note, content: editContent.trim(), updated_at: new Date().toISOString() }
        : note
    ))

    setEditingNote(null)
    setEditContent('')
    
    toast({
      title: 'Success',
      description: 'Note updated successfully',
    })
  }

  const deleteNote = async (noteId: string) => {
    setNotes(prev => prev.filter(note => note.id !== noteId))
    
    toast({
      title: 'Success',
      description: 'Note deleted successfully',
    })
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

    const newReply: Note = {
      id: Date.now().toString(),
      content: replyContent.trim(),
      created_by: 'current-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parent_id: parentId,
      is_public: parentNote.is_public,
      recipient_id: parentNote.recipient_id,
      replies: []
    }

    setNotes(prev => prev.map(note => 
      note.id === parentId 
        ? { ...note, replies: [...(note.replies || []), newReply] }
        : note
    ))

    setReplyContent('')
    setReplyingTo(null)
    
    toast({
      title: 'Success',
      description: 'Reply added successfully',
    })
  }

  const startEditing = (note: Note) => {
    setEditingNote(note.id)
    setEditContent(note.content)
  }

  const cancelEditing = () => {
    setEditingNote(null)
    setEditContent('')
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
    if (note.created_by === 'system') return 'System'
    if (note.created_by === 'current-user') return 'You'
    return `User ${note.created_by.slice(0, 8)}`
  }

  // Filter notes based on active tab
  const filteredNotes = notes.filter(note => {
    if (activeTab === 'public') {
      return note.is_public
    } else {
      return !note.is_public
    }
  })

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            className="h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white transition-all duration-300 ease-in-out transform hover:scale-110 hover:shadow-xl"
            size="icon"
          >
            <MessageSquare className="h-6 w-6" />
            {notes.length > 0 && (
              <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                {notes.length}
              </span>
            )}
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Messages & Notice Board
              <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm rounded-full">
                Working!
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'public' | 'private')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="public" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Notice Board ({notes.filter(n => n.is_public).length})
                </TabsTrigger>
                <TabsTrigger value="private" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Private Messages ({notes.filter(n => !n.is_public).length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
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

                    <Button 
                      onClick={addNote} 
                      disabled={loading || !newNote.trim()}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {loading ? 'Posting...' : (activeTab === 'public' ? 'Post to Notice Board' : 'Send Message')}
                    </Button>
                  </CardContent>
                </Card>

                {/* Notes List */}
                <div className="flex-1 overflow-y-auto max-h-[400px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                  <div className="space-y-3 pr-2 pb-4">
                    {filteredNotes.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No messages yet</p>
                        <p className="text-sm">Be the first to post a message!</p>
                      </div>
                    ) : (
                      filteredNotes.map((note) => (
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
                    
                    {/* Scroll indicator */}
                    {filteredNotes.length > 3 && (
                      <div className="text-center py-2 text-xs text-muted-foreground border-t pt-2 mt-4">
                        ↑ Scroll up to see more messages
                      </div>
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

export default FloatingNotesButtonWorking
