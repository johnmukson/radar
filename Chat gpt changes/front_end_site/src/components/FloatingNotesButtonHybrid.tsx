import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { MessageSquare, Plus, Edit, Trash2, User, Reply, Globe, Lock, Database, HardDrive } from 'lucide-react'

type Note = {
  id: string
  content: string
  created_by: string | null
  created_at: string
  updated_at: string
  parent_id?: string | null
  is_public: boolean
  recipient_id?: string | null
  replies?: Note[]
}

const FloatingNotesButtonHybrid: React.FC = () => {
  // Check if database is available
  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [selectedRecipient, setSelectedRecipient] = useState<string>('')
  const [users, setUsers] = useState<{id: string, name?: string, email?: string, role?: string, status?: string}[]>([])
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public')
  const [isOpen, setIsOpen] = useState(false)
  const { toast } = useToast()

  // Initialize with localStorage fallback
  const getInitialNotes = (): Note[] => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app-notes')
      if (saved) {
        return JSON.parse(saved)
      }
    }
    return [
      {
        id: '1',
        content: 'Welcome to the Notice Board! Messages are stored locally for now.',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_public: true,
        replies: []
      },
      {
        id: '2',
        content: 'Run the SQL setup to enable shared messaging across all users.',
        created_by: 'system',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date(Date.now() - 3600000).toISOString(),
        is_public: true,
        replies: []
      }
    ]
  }

  // Load users for recipient selection from existing User Management system
  const loadUsers = async () => {
    try {
      if (dbAvailable) {
        // Load users from the existing User Management system
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select(`
            id,
            name,
            email,
            phone,
            status,
            user_roles(role, branch_id, branches(name, code))
          `)
          .order('name') // Show all users (active and inactive)

        if (!usersError && usersData && usersData.length > 0) {
          console.log('✅ Loaded users from User Management system:', usersData.length)
          
          // Transform the data to match the expected format
          const transformedUsers = usersData.map(user => {
            const userRole = user.user_roles?.[0];
            const branch = userRole?.branches?.[0];
            return {
              id: user.id,
              name: user.name || user.email?.split('@')[0] || 'Unknown User',
              email: user.email || '',
              role: userRole?.role || null,
              branch_name: branch?.name || null,
              status: user.status
            };
          }).filter(user => user.id); // Filter out users with null IDs
          
          setUsers(transformedUsers)
          return
        } else {
          console.log('⚠️ No active users found in User Management system')
        }
      }
      
      // If database is not available or no users found, show empty list
      setUsers([])
    } catch (error) {
      console.error('Error loading users from User Management system:', error)
      setUsers([])
    }
  }

  // Check database availability
  const checkDatabase = async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('id')
        .limit(1)

      if (error) {
        console.log('Database not available, using localStorage')
        setDbAvailable(false)
        setNotes(getInitialNotes())
      } else {
        console.log('Database available, loading from SQL')
        setDbAvailable(true)
        await loadNotesFromDB()
      }
    } catch (error) {
      console.log('Database check failed, using localStorage')
      setDbAvailable(false)
      setNotes(getInitialNotes())
    }
  }

  // Load notes from database
  const loadNotesFromDB = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      
      let query = supabase
        .from('notes')
        .select('*')

      if (activeTab === 'public') {
        query = query.eq('is_public', true)
      } else {
        query = query.or(`recipient_id.eq.${user?.id},created_by.eq.${user?.id}`)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      
      // Organize notes into threads
      const parentNotes = (data || []).filter(note => !note.parent_id)
      const replies = (data || []).filter(note => note.parent_id)
      
      const notesWithReplies = parentNotes.map(parent => ({
        ...parent,
        replies: replies
          .filter(reply => reply.parent_id === parent.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }))
      
      setNotes(notesWithReplies)
    } catch (error) {
      console.error('Error loading from database:', error)
      toast({
        title: 'Database Error',
        description: 'Switching to local storage',
        variant: 'destructive',
      })
      setDbAvailable(false)
      setNotes(getInitialNotes())
    } finally {
      setLoading(false)
    }
  }

  // Load notes from localStorage
  const loadNotesFromLocal = () => {
    setNotes(getInitialNotes())
  }

  // Save to localStorage
  const saveToLocal = (newNotes: Note[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app-notes', JSON.stringify(newNotes))
    }
  }

  useEffect(() => {
    if (isOpen) {
      if (dbAvailable === null) {
        checkDatabase()
      } else if (dbAvailable) {
        loadNotesFromDB()
      } else {
        loadNotesFromLocal()
      }
      loadUsers()
    }
  }, [isOpen, activeTab, dbAvailable])

  const addNote = async () => {
    if (!newNote.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message',
        variant: 'destructive',
      })
      return
    }

    if (activeTab === 'private' && !selectedRecipient) {
      toast({
        title: 'Error',
        description: 'Please select a recipient for private messages',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    
    if (dbAvailable) {
      // Save to database
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        const { error } = await supabase
          .from('notes')
          .insert({
            content: newNote.trim(),
            created_by: user?.id,
            is_public: activeTab === 'public',
            recipient_id: activeTab === 'private' ? selectedRecipient : null
          })

        if (error) throw error

    setNewNote('')
    setSelectedRecipient('')
    await loadNotesFromDB()
    
    toast({
      title: 'Success',
      description: activeTab === 'public' ? 'Message posted to notice board!' : 'Private message sent!',
    })
      } catch (error) {
        console.error('Error saving to database:', error)
        toast({
          title: 'Database Error',
          description: 'Saved locally instead',
          variant: 'destructive',
        })
        setDbAvailable(false)
        // Fallback to localStorage
        addNoteToLocal()
      }
    } else {
      // Save to localStorage
      addNoteToLocal()
    }
    
    setLoading(false)
  }

  const addNoteToLocal = () => {
    const newNoteObj: Note = {
      id: Date.now().toString(),
      content: newNote.trim(),
      created_by: 'current-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_public: activeTab === 'public',
      recipient_id: activeTab === 'private' ? selectedRecipient : null,
      replies: []
    }

    const newNotes = [newNoteObj, ...notes]
    setNotes(newNotes)
    saveToLocal(newNotes)
    setNewNote('')
    setSelectedRecipient('')
    
    toast({
      title: 'Success',
      description: activeTab === 'public' ? 'Message posted locally!' : 'Private message saved locally!',
    })
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

    if (dbAvailable) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast({ title: 'Error', description: 'You must be logged in to edit notes.', variant: 'destructive' })
          return
        }

        const { error } = await supabase
          .from('notes')
          .update({ content: editContent.trim(), updated_at: new Date().toISOString() })
          .eq('id', noteId)
          .eq('created_by', user.id)

        if (error) throw error

        await loadNotesFromDB()
        toast({
          title: 'Success',
          description: 'Note updated successfully',
        })
      } catch (error) {
        console.error('Error updating in database:', error)
        toast({
          title: 'Database Error',
          description: 'Updated locally instead',
          variant: 'destructive',
        })
        setDbAvailable(false)
        updateNoteLocal(noteId)
      }
    } else {
      updateNoteLocal(noteId)
    }
  }

  const updateNoteLocal = (noteId: string) => {
    const newNotes = notes.map(note => 
      note.id === noteId 
        ? { ...note, content: editContent.trim(), updated_at: new Date().toISOString() }
        : note
    )
    setNotes(newNotes)
    saveToLocal(newNotes)
    setEditingNote(null)
    setEditContent('')
    
    toast({
      title: 'Success',
      description: 'Note updated locally',
    })
  }

  const deleteNote = async (noteId: string) => {
    if (dbAvailable) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast({ title: 'Error', description: 'You must be logged in to delete notes.', variant: 'destructive' })
          return
        }

        const { error } = await supabase
          .from('notes')
          .delete()
          .eq('id', noteId)
          .eq('created_by', user.id)

        if (error) throw error

        await loadNotesFromDB()
        toast({
          title: 'Success',
          description: 'Note deleted successfully',
        })
      } catch (error) {
        console.error('Error deleting from database:', error)
        toast({
          title: 'Database Error',
          description: 'Deleted locally instead',
          variant: 'destructive',
        })
        setDbAvailable(false)
        deleteNoteLocal(noteId)
      }
    } else {
      deleteNoteLocal(noteId)
    }
  }

  const deleteNoteLocal = (noteId: string) => {
    const newNotes = notes.filter(note => note.id !== noteId)
    setNotes(newNotes)
    saveToLocal(newNotes)
    
    toast({
      title: 'Success',
      description: 'Note deleted locally',
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

    if (dbAvailable) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        const { error } = await supabase
          .from('notes')
          .insert({
            content: replyContent.trim(),
            created_by: user?.id,
            parent_id: parentId,
            is_public: parentNote.is_public,
            recipient_id: parentNote.recipient_id
          })

        if (error) throw error

        setReplyContent('')
        setReplyingTo(null)
        await loadNotesFromDB()
        
        toast({
          title: 'Success',
          description: 'Reply added successfully',
        })
      } catch (error) {
        console.error('Error adding reply to database:', error)
        toast({
          title: 'Database Error',
          description: 'Reply saved locally',
          variant: 'destructive',
        })
        setDbAvailable(false)
        addReplyLocal(parentId, parentNote)
      }
    } else {
      addReplyLocal(parentId, parentNote)
    }
  }

  const addReplyLocal = (parentId: string, parentNote: Note) => {
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

    const newNotes = notes.map(note => 
      note.id === parentId 
        ? { ...note, replies: [...(note.replies || []), newReply] }
        : note
    )
    setNotes(newNotes)
    saveToLocal(newNotes)

    setReplyContent('')
    setReplyingTo(null)
    
    toast({
      title: 'Success',
      description: 'Reply added locally',
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
    if (note.created_by === 'system' && dbAvailable === false) return 'System (Local)'
    
    // Try to find user in the users list from User Management system
    const user = users.find(u => u.id === note.created_by)
    if (user) {
      const roleInfo = user.role ? ` (${user.role})` : ''
      const statusInfo = user.status !== 'active' ? ` [${user.status}]` : ''
      return `${user.name || user.email?.split('@')[0] || 'Unknown User'}${roleInfo}${statusInfo}`
    }
    
    return `User ${note.created_by ? note.created_by.slice(0, 8) : 'Unknown'}`
  }

  const getRecipientDisplayName = (note: Note) => {
    if (!note.recipient_id) return null
    
    const user = users.find(u => u.id === note.recipient_id)
    if (user) {
      const roleInfo = user.role ? ` (${user.role})` : ''
      const statusInfo = user.status !== 'active' ? ` [${user.status}]` : ''
      return `${user.name || user.email?.split('@')[0] || 'Unknown User'}${roleInfo}${statusInfo}`
    }
    
    return `User ${note.recipient_id.slice(0, 8)}`
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
                {notes.length > 99 ? '99+' : notes.length}
              </span>
            )}
          </Button>
        </DialogTrigger>
        
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="border-b p-4 bg-gray-50 dark:bg-gray-900">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquare className="h-5 w-5" />
              Messages
              <div className="flex items-center gap-2 ml-auto">
                {dbAvailable === true && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded-full flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    Database
                  </span>
                )}
                {dbAvailable === false && (
                  <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs rounded-full flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    Local Storage
                  </span>
                )}
                {dbAvailable === null && (
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-xs rounded-full">
                    Checking...
                  </span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(value) => {
              setActiveTab(value as 'public' | 'private')
              setSelectedRecipient('')
            }}>
              <TabsList className="grid w-full grid-cols-2 bg-white dark:bg-gray-800 border-b">
                <TabsTrigger value="public" className="flex items-center gap-2 data-[state=active]:bg-green-500 data-[state=active]:text-white rounded-none">
                  <Globe className="h-4 w-4" />
                  Notice Board
                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full">
                    {notes.filter(n => n.is_public).length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="private" className="flex items-center gap-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white rounded-none">
                  <Lock className="h-4 w-4" />
                  Private
                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded-full">
                    {notes.filter(n => !n.is_public).length}
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
                {/* Add New Message */}
                <div className="bg-white dark:bg-gray-800 border-b p-4">
                  <div className="flex gap-3">
                    <Textarea
                      placeholder={activeTab === 'public' ? "Type a message..." : "Type a message..."}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="flex-1 min-h-[60px] max-h-[120px] text-base resize-none border border-gray-300 dark:border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    
                    <Button 
                      onClick={addNote} 
                      disabled={loading || !newNote.trim() || (activeTab === 'private' && !selectedRecipient)}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg disabled:bg-gray-300"
                    >
                      {loading ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                  
                  {activeTab === 'private' && (
                    <div className="mt-3">
                      <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select recipient..." />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              <div className="flex items-center justify-between w-full">
                                <span>{user.name || user.email?.split('@')[0] || 'Unknown User'}</span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  user.status === 'active' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {user.status}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 max-h-[500px]">
                  <div className="p-4 space-y-3 pb-6">
                    {filteredNotes.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p className="text-lg font-medium">No messages yet</p>
                        <p className="text-sm">Start a conversation!</p>
                      </div>
                    ) : (
                      filteredNotes.map((note, index) => (
                        <div key={note.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                          <div className="p-4">
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
                                <div className="mb-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                      {(getUserDisplayName(note).charAt(0) || 'U').toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="font-medium text-sm">{getUserDisplayName(note)}</div>
                                      <div className="text-xs text-gray-500">{formatDate(note.created_at)}</div>
                                    </div>
                                  </div>
                                  <div className="ml-10">
                                    <div className="bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm border">
                                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                        {note.content}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {note.is_public ? (
                                      <span className="flex items-center gap-1">
                                        <Globe className="h-3 w-3" />
                                        Public
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1">
                                        <Lock className="h-3 w-3" />
                                        Private
                                        {note.recipient_id && (
                                          <span>→ {getRecipientDisplayName(note)}</span>
                                        )}
                                      </span>
                                    )}
                                    {note.replies && note.replies.length > 0 && (
                                      <span className="text-blue-600">{note.replies.length} replies</span>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => startReply(note.id)}
                                      className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600"
                                      title="Reply"
                                    >
                                      <Reply className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => startEditing(note)}
                                      className="h-7 w-7 p-0 text-gray-500 hover:text-amber-600"
                                      title="Edit"
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => deleteNote(note.id)}
                                      className="h-7 w-7 p-0 text-gray-500 hover:text-red-600"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Reply Form */}
                                {replyingTo === note.id && (
                                  <div className="mt-3 ml-10">
                                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                                      <Textarea
                                        placeholder="Type a reply..."
                                        value={replyContent}
                                        onChange={(e) => setReplyContent(e.target.value)}
                                        className="min-h-[60px] text-sm border border-gray-300 dark:border-gray-600 rounded-lg p-2 mb-2"
                                      />
                                      <div className="flex gap-2">
                                        <Button 
                                          size="sm" 
                                          onClick={() => addReply(note.id, note)}
                                          disabled={!replyContent.trim()}
                                          className="bg-green-500 hover:bg-green-600 text-white text-xs px-3"
                                        >
                                          Send
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          variant="outline" 
                                          onClick={cancelReply}
                                          className="text-xs px-3"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Replies */}
                                {note.replies && note.replies.length > 0 && (
                                  <div className="mt-3 ml-10 space-y-2">
                                    {note.replies.map((reply) => (
                                      <div key={reply.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                                            {(getUserDisplayName(reply).charAt(0) || 'U').toUpperCase()}
                                          </div>
                                          <span className="font-medium text-sm">{getUserDisplayName(reply)}</span>
                                          <span className="text-xs text-gray-500">{formatDate(reply.created_at)}</span>
                                        </div>
                                        <div className="ml-8">
                                          <div className="bg-white dark:bg-gray-800 rounded-lg p-2 shadow-sm">
                                            <div className="whitespace-pre-wrap text-sm">
                                              {reply.content}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    
                    {/* Scroll indicator for many messages */}
                    {filteredNotes.length > 5 && (
                      <div className="text-center py-2 text-xs text-gray-400">
                        ↑ Scroll to see more messages
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

export default FloatingNotesButtonHybrid
