import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { MessageSquare, Plus, Edit, Trash2, User } from 'lucide-react'

type Note = {
  id: string
  content: string
  created_by: string | null
  created_at: string
  updated_at: string
  users?: {
    name?: string
    email?: string
  }
}

interface NotesModalProps {
  children?: React.ReactNode
}

const NotesModal: React.FC<NotesModalProps> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      loadNotes()
    }
  }, [isOpen])

  const loadNotes = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('notes')
        .select(`
          *,
          users:created_by (
            name,
            email
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setNotes(data || [])
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

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { error } = await supabase
        .from('notes')
        .insert({
          content: newNote.trim(),
          created_by: user?.id
        })

      if (error) throw error

      setNewNote('')
      loadNotes()
      
      toast({
        title: 'Success',
        description: 'Note added successfully',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error adding note:', message)
      toast({
        title: 'Error',
        description: 'Failed to add note',
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getUserDisplayName = (note: Note) => {
    if (note.users?.name) return note.users.name
    if (note.users?.email) return note.users.email.split('@')[0]
    return 'Anonymous'
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Notes ({notes.length})
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Notes & Comments
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Add New Note */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add New Note
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Write your note or comment here..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="min-h-[100px]"
              />
              <Button onClick={addNote} disabled={loading || !newNote.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Note
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
                  No notes yet. Be the first to add one!
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
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditing(note)}
                                className="h-6 w-6 p-0"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteNote(note.id)}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default NotesModal
